# CareCareer AWS Migration Plan

## Prerequisites (Must Pass Before Starting)

- [ ] Local MVP acceptance gate passes completely
- [ ] All 20 acceptance test steps verified
- [ ] Docker images build and run cleanly
- [ ] No P0/P1 defects open

## Phase 1: Terraform Infrastructure

### VPC and Networking
- VPC with public and private subnets (3 AZs)
- NAT Gateway for controlled egress
- Security groups: ALB → ECS (port-specific), ECS → RDS (5432)
- No direct internet access to services

### Database
- RDS PostgreSQL 16 Multi-AZ
- Private subnet only
- Encrypted at rest (KMS)
- Automated backups with 7-day PITR
- Parameter group matching local configuration

### Container Infrastructure
- ECR repositories for each service image
- ECS Fargate cluster (serverless containers)
- Task definitions matching Docker Compose config
- Service auto-scaling (target tracking: CPU 70%)

### Load Balancing and CDN
- ALB in public subnet
- HTTPS termination (ACM certificate)
- Path-based routing to ECS services
- CloudFront + S3 for static frontend assets

### Security
- Secrets Manager for all credentials
- KMS for encryption key management
- IAM roles (least privilege per service)
- WAF baseline ruleset on ALB

### Observability
- CloudWatch Logs (structured JSON)
- CloudWatch Metrics and Alarms
- X-Ray tracing (optional Phase 2)

## Phase 2: Staging Deployment

1. Push exact locally-accepted images to ECR
2. Apply Terraform for staging environment
3. Run migration ECS task
4. Deploy services
5. Run acceptance test against staging
6. Configure HTTPS, WAF, alarms
7. Document rollback procedure

## Phase 3: Production Readiness (Post-Staging Validation)

- Secret rotation automation
- Backup verification (restore test)
- Penetration test (external)
- Compliance documentation
- Runbook for on-call
- DR procedure documented

## Cost Estimate (Staging)

| Resource | Monthly Cost (est.) |
| -------- | ------------------- |
| RDS db.t3.medium Multi-AZ | ~$100 |
| ECS Fargate (3 services) | ~$80 |
| ALB | ~$25 |
| CloudFront | ~$5 |
| NAT Gateway | ~$35 |
| Secrets Manager | ~$5 |
| CloudWatch | ~$20 |
| **Total** | **~$270/month** |

## Timeline

| Week | Milestone |
| ---- | --------- |
| 1 | Terraform modules, VPC, RDS |
| 2 | ECR, ECS, ALB, deployment pipeline |
| 3 | Staging deployment, acceptance test |
| 4 | Security hardening, documentation |
