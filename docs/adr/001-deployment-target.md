# ADR-001: Deployment Target

- Status: **Deferred**
- Date: 2026-07-16
- Owners: CTO, Platform Engineering Lead
- Decision deadline: Before first shared AWS non-production deployment
- Review trigger: Team ready to deploy CareCareer services to shared AWS environment

## Context

CareCareer services must run in a shared AWS environment alongside existing Maestra
services. The existing Maestra platform operates on EKS with Terraform, Helm, GitHub
Actions, ECR, health probes, NLB-based blue-green switching, and controlled promotion.

## Decision

**Deferred.** The following constraints are locked now:

1. All applications ship as OCI-compliant containers.
2. Application code MUST NOT depend directly on Kubernetes APIs.
3. Configuration comes from environment variables or mounted secrets.
4. Standard health (`/health`), readiness (`/health/ready`), and metrics (`/metrics`)
   endpoints are mandatory for every service.
5. Dockerfiles use multi-stage builds with minimal runtime images.
6. Services are stateless; all state in external stores.
7. Deployment target must be selected before shared AWS deployment.

**Default if no contrary evidence:** Deploy to existing EKS environment.

EKS is the low-migration default because:

- Existing operational knowledge, tooling, and runbooks
- Terraform modules already manage the cluster
- Helm charts are the established deployment unit
- GitHub Actions → ECR → Helm → EKS pipeline exists
- Monitoring, alerting, and blue-green patterns are proven
- No migration of infrastructure required

ECS Fargate would only be chosen if it demonstrates meaningful operational
or cost advantages that offset the infrastructure migration effort.

## Alternatives considered

| Option          | Pros                                  | Cons                                                                                  |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| Existing EKS    | Zero infra migration; proven patterns | Higher operational floor (cluster management)                                         |
| ECS Fargate     | Lower ops; pay-per-task               | Requires new Terraform, new CI/CD, new monitoring; loses existing Helm/EKS investment |
| New EKS cluster | Clean separation from Maestra         | Doubles cluster cost; splits operational knowledge                                    |

## Consequences

- CareCareer services can develop locally with Docker Compose and deploy to AWS
  via the existing pipeline once the decision is made.
- No application code depends on the deployment target choice.
- The decision can be revisited with real cost and operational data.

## Security implications

- Services run in private subnets regardless of target.
- mTLS between services recommended regardless of target.
- Secrets via AWS Secrets Manager, not environment variables at build time.

## Operational implications

- Docker Compose for local development (already working).
- CI environment uses containerized services for integration tests.
- Shared AWS dev environment deploys via existing pipeline patterns.

## Migration implications

- No Maestra service is disturbed by this decision.
- CareCareer services deploy to a separate namespace or node group.

## Validation criteria

- [ ] All services pass container build in CI
- [ ] All services expose standard health/readiness/metrics endpoints
- [ ] No Kubernetes-specific imports in application code
- [ ] Helm chart or equivalent deployment manifest exists per service
- [ ] Decision revisited with cost/ops comparison before production

## References

- Existing Maestra EKS Terraform modules
- TP-1 architecture overview (deployment section)
- CARECAREER_MASTER_PACKAGE.md Section 6 (Approved Technology Baseline)
