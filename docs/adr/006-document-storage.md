# ADR-006: Document Storage

- Status: **Accepted**
- Date: 2026-07-16
- Owners: CTO, Security Lead
- Decision deadline: N/A (accepted)
- Review trigger: Volume or compliance requirement changes storage approach

## Context

CareCareer handles credential documents (license photos, certifications, background
check results), resumes, contracts, and other file uploads. These documents are
sensitive (CONFIDENTIAL or RESTRICTED) and require secure, tenant-isolated storage.

## Decision

**Accepted.** Document storage uses an S3-compatible abstraction.

### Requirements

1. **S3-compatible API** — MinIO locally, Amazon S3 in AWS.
2. **Metadata owned by the business domain** — document metadata (type, owner,
   classification, status) stored in the owning service's PostgreSQL schema.
3. **No generic document microservice in the pilot** — each service manages its
   own documents via a shared storage adapter library.
4. **Tenant-prefixed object keys:** `{tenant_id}/{domain}/{entity_id}/{document_id}/{filename}`
5. **Server-side encryption:** SSE-S3 minimum; SSE-KMS for RESTRICTED documents.
6. **Pre-signed URLs** for download/upload with short expiration (15 min max).
7. **Malware scanning** before a document becomes usable (ClamAV locally; AWS services in prod).
8. **Content type validation** — only allowed MIME types (PDF, JPEG, PNG, TIFF).
9. **File size validation** — max 25MB per document (configurable per type).
10. **Version retention** — S3 versioning enabled; previous versions retained per policy.
11. **Audit records** for upload, access (pre-signed URL generation), replacement, and deletion.
12. **Lifecycle policies** based on data classification and retention schedule.
13. **No direct public access** — all access through pre-signed URLs or service-mediated.

### Object Key Structure

```
{tenant_id}/
  credentials/
    {worker_id}/
      {credential_id}/
        original.pdf
        extracted-data.json
  resumes/
    {worker_id}/
      {document_id}/
        resume.pdf
  contracts/
    {assignment_id}/
      {document_id}/
        contract.pdf
```

### Storage Adapter Interface

```typescript
interface DocumentStoragePort {
  upload(params: UploadParams): Promise<DocumentReference>;
  getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  getSignedUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
  copy(sourceKey: string, destinationKey: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

## Alternatives considered

| Option                          | Pros                                            | Cons                                                      |
| ------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| S3/MinIO (chosen)               | Standard; proven; scalable; same API local/prod | None significant                                          |
| Dedicated document service      | Centralized management                          | Over-engineering for pilot; adds cross-service dependency |
| Database BLOB storage           | Simple                                          | Poor performance; expensive at scale; harder backup       |
| External DMS (SharePoint, etc.) | Rich features                                   | Vendor lock-in; tenant isolation complexity               |

## Consequences

- Documents stored separately from database (cost-effective, scalable).
- Tenant isolation via key prefix (not a separate bucket per tenant).
- Metadata lives with the owning domain's database (queryable, RLS-protected).

## Security implications

- Pre-signed URLs cannot be reused across tenants (URL includes tenant-scoped key).
- Bucket policies deny public access.
- KMS encryption for RESTRICTED documents (credentials with PII).
- Malware scan prevents execution of malicious uploads.
- Audit trail for every access.

## Operational implications

- MinIO in Docker Compose for local development.
- S3 lifecycle policies auto-archive old versions.
- Monitoring: failed uploads, scan failures, storage growth per tenant.

## Migration implications

- Credential documents from Symplr need to be copied to CareCareer S3 namespace.
- Document references in CareCareer point to new S3 keys.
- Original Symplr document store remains accessible during coexistence.

## Validation criteria

- [ ] Upload via pre-signed URL works locally (MinIO) and in AWS (S3)
- [ ] Tenant A cannot access Tenant B's documents (URL includes tenant prefix)
- [ ] Malware-infected file is rejected before becoming usable
- [ ] Content type validation rejects disallowed file types
- [ ] Audit record produced for every upload and download URL generation
- [ ] Pre-signed URLs expire within configured TTL
- [ ] S3 versioning retains previous document versions

## References

- AWS S3 security best practices
- MinIO documentation
- CARECAREER_MASTER_PACKAGE.md Section 8.2 (S3 keys)
