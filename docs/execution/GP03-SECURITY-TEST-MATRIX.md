# GP-03 Identity Service — Security Test Matrix

## Test Categories

- **Unit**: Pure logic, no I/O
- **HTTP**: Controller/guard contract tests
- **Integration**: Real PostgreSQL (Testcontainers)
- **Crypto**: Token signing/verification
- **Browser**: Chromium E2E
- **Config**: Startup validation
- **Manual**: Penetration testing considerations

---

## Threat-to-Test Mapping

| Threat                       | Unit | HTTP | Integration | Crypto | Browser | Config |
| ---------------------------- | :--: | :--: | :---------: | :----: | :-----: | :----: |
| T01 Forged token             |      |      |             |   ✓    |         |        |
| T02 Wrong issuer             |      |      |             |   ✓    |         |   ✓    |
| T03 Wrong audience           |      |      |             |   ✓    |         |   ✓    |
| T04 Algorithm confusion      |      |      |             |   ✓    |         |        |
| T05 Unknown signing key      |      |      |             |   ✓    |         |        |
| T06 Key compromise/rotation  |      |      |             |   ✓    |         |        |
| T07 Stolen access token      |      |  ✓   |             |   ✓    |         |        |
| T08 Stolen refresh token     |      |  ✓   |      ✓      |        |         |        |
| T09 Refresh-token replay     |      |  ✓   |      ✓      |        |         |        |
| T10 Session fixation         |      |  ✓   |             |        |         |        |
| T11 CSRF callback            |      |  ✓   |             |        |         |        |
| T12 Missing state            |      |  ✓   |             |        |         |        |
| T13 Missing nonce            |      |      |             |   ✓    |         |        |
| T14 PKCE downgrade           |      |  ✓   |             |        |         |        |
| T15 Account enumeration      |      |  ✓   |             |        |         |        |
| T16 Email auto-linking       |  ✓   |      |      ✓      |        |         |        |
| T17 Invitation token leakage |  ✓   |      |      ✓      |        |         |        |
| T18 Invitation replay        |      |  ✓   |      ✓      |        |         |        |
| T19 Cross-tenant membership  |      |  ✓   |      ✓      |        |         |        |
| T20 Tenant-admin escalation  |  ✓   |  ✓   |             |        |         |        |
| T21 Platform-admin via JWT   |      |  ✓   |      ✓      |        |         |        |
| T22 RLS context spoofing     |      |      |      ✓      |        |         |        |
| T23 Database-role misuse     |      |      |      ✓      |        |         |        |
| T24 Stale authorization      |  ✓   |  ✓   |      ✓      |        |         |        |
| T25 Suspended membership     |      |  ✓   |      ✓      |        |    ✓    |        |
| T26 Deactivated user         |      |  ✓   |      ✓      |        |         |        |
| T27 Tenant deactivation      |      |  ✓   |      ✓      |        |         |        |
| T28 Demo in production       |      |      |             |        |         |   ✓    |
| T29 Mock OIDC in production  |      |      |             |        |         |   ✓    |
| T30 Secrets in logs          |  ✓   |  ✓   |      ✓      |        |         |        |
| T31 Audit tampering          |      |      |      ✓      |        |         |        |
| T32 Session concurrency      |      |  ✓   |      ✓      |        |         |        |
| T33 Identity takeover        |      |      |             |        |         |        |
| T34 Admin linking abuse      |      |  ✓   |      ✓      |        |         |        |
| T35 JWKS cache poisoning     |      |      |             |   ✓    |         |        |
| T36 DoS token exchange       |      |  ✓   |             |        |         |        |
| T37 Expired invitation       |      |  ✓   |      ✓      |        |         |        |
| T38 Direct JWT→app.is_admin  |      |  ✓   |      ✓      |        |         |        |
| T39 Removed role access      |  ✓   |  ✓   |      ✓      |        |         |        |
| T40 Secrets in outbox        |  ✓   |      |      ✓      |        |         |        |

---

## Mandatory Automated Security Tests (62 tests planned)

### Crypto/Token Tests (12)

1. Token signed by unknown key → rejected
2. Token with alg=none → rejected
3. Token with wrong algorithm → rejected
4. Token from non-allowlisted issuer → rejected
5. Token with wrong audience → rejected
6. Expired token → rejected
7. Token with future iat (beyond skew) → rejected
8. Token with wrong nonce → rejected
9. Key rotation: current key accepted
10. Key rotation: overlap key accepted
11. Key rotation: revoked key rejected
12. JWKS endpoint returns only active + overlap keys

### HTTP Contract Tests (18)

13. Missing Authorization header → 401
14. Malformed token → 401
15. Stale user_authorization_version → 401
16. Stale membership_authorization_version → 401
17. Suspended membership refresh → rejected
18. Deactivated user refresh → rejected
19. Refresh-token replay → family revoked
20. Switch to non-member tenant → 403
21. Switch to suspended membership → 403
22. Switch to deactivated tenant → 403
23. Tenant admin assigns platform role → 403
24. Cross-tenant member list → 404
25. Session limit (6th session) → rejected
26. Rate limit exceeded → 429
27. Callback without state → 400
28. Exchange without code_verifier → 400
29. Invitation accept with invalid token → generic error
30. Invitation accept (expired) → rejected

### PostgreSQL Integration Tests (15)

31. RLS: Tenant A cannot read Tenant B memberships
32. RLS: Tenant A cannot update Tenant B memberships
33. RLS: Tenant A cannot delete Tenant B memberships
34. Runtime role cannot SET app.is_admin
35. Runtime role cannot UPDATE audit_records
36. Runtime role cannot DELETE audit_records
37. Runtime role cannot TRUNCATE audit_records
38. Administrative path sets app.is_admin (server-side only)
39. Administrative operation produces audit with admin indicator
40. External identity UNIQUE(issuer, subject) enforced
41. Membership UNIQUE(user_id, tenant_id) enforced
42. Same email different issuer → separate users
43. Invitation token stored as hash only
44. Refresh token stored as hash only
45. Deactivated user's sessions revoked in DB

### Configuration/Startup Tests (5)

46. Production + DEMO_MODE=true → startup crash
47. Production + mock OIDC issuer → rejected
48. Production without OIDC config → startup crash
49. Development + DEMO_MODE + missing secret → crash
50. Test mode requires explicit test provider

### Unit Tests (5)

51. Permission derivation: role → correct permissions
52. Tenant admin cannot derive platform permissions
53. Authorization version increments on role change
54. Invitation token never appears in event payload
55. Secrets never included in structured log output

### Browser Tests (3)

56. Suspended membership → UI shows access denied
57. Persona switch in demo → correct tenant context
58. DEMO-01 flows remain operational after identity migration
59. Expired invitation token → rejected with stable error (T37)
60. Tenant controller cannot set app.is_admin even with platform JWT (T38)
61. Removed role → token with stale membership_authorization_version rejected (T39)
62. Outbox event after invitation/session contains no raw token or secret (T40)

---

## Manual Penetration Test Considerations

These cannot be fully automated but should be reviewed:

- Timing attacks on invitation acceptance (account enumeration)
- Token extraction via browser developer tools
- CORS misconfiguration allowing token theft
- Cookie scope issues (subdomain leakage)
- IdP account takeover (T33 — out of platform scope)
- Rate-limit bypass via distributed IPs
- JWKS endpoint availability under load

---

## Test-to-Slice Mapping

| Slice   | Security Tests              |
| ------- | --------------------------- |
| GP-03.1 | 34–45, 46–50, 54–55         |
| GP-03.2 | 19–24, 31–33, 38–39, 51–53  |
| GP-03.3 | 1–12, 13–18, 20, 25–26, 45  |
| GP-03.4 | 1–5, 8, 10–14, 27–29, 46–47 |
| GP-03.5 | 15, 17–18, 29–30, 43        |
| GP-03.6 | 56–57                       |
| GP-03.7 | 46, 48–50, 58               |
