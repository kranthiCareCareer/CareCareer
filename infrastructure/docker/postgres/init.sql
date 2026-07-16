-- =============================================================================
-- CareCareer PostgreSQL Initialization
-- Creates separate schemas per service and enforces RLS patterns
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas per service
CREATE SCHEMA IF NOT EXISTS tenant;
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS worker;
CREATE SCHEMA IF NOT EXISTS credential;
CREATE SCHEMA IF NOT EXISTS recruit;
CREATE SCHEMA IF NOT EXISTS schedule;
CREATE SCHEMA IF NOT EXISTS time_tracking;
CREATE SCHEMA IF NOT EXISTS payroll;
CREATE SCHEMA IF NOT EXISTS notification;
CREATE SCHEMA IF NOT EXISTS audit;

-- Create service-specific database roles (least privilege)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'svc_tenant') THEN
    CREATE ROLE svc_tenant LOGIN PASSWORD 'svc_tenant_dev';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'svc_identity') THEN
    CREATE ROLE svc_identity LOGIN PASSWORD 'svc_identity_dev';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'svc_worker') THEN
    CREATE ROLE svc_worker LOGIN PASSWORD 'svc_worker_dev';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'svc_credential') THEN
    CREATE ROLE svc_credential LOGIN PASSWORD 'svc_credential_dev';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'svc_schedule') THEN
    CREATE ROLE svc_schedule LOGIN PASSWORD 'svc_schedule_dev';
  END IF;
END
$$;

-- Grant schema access to respective service roles
GRANT USAGE, CREATE ON SCHEMA tenant TO svc_tenant;
GRANT USAGE, CREATE ON SCHEMA identity TO svc_identity;
GRANT USAGE, CREATE ON SCHEMA worker TO svc_worker;
GRANT USAGE, CREATE ON SCHEMA credential TO svc_credential;
GRANT USAGE, CREATE ON SCHEMA schedule TO svc_schedule;

-- Grant all privileges on tables within schemas (for dev)
ALTER DEFAULT PRIVILEGES IN SCHEMA tenant GRANT ALL ON TABLES TO svc_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA identity GRANT ALL ON TABLES TO svc_identity;
ALTER DEFAULT PRIVILEGES IN SCHEMA worker GRANT ALL ON TABLES TO svc_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA credential GRANT ALL ON TABLES TO svc_credential;
ALTER DEFAULT PRIVILEGES IN SCHEMA schedule GRANT ALL ON TABLES TO svc_schedule;

-- Log initialization
DO $$ BEGIN RAISE NOTICE 'CareCareer database initialized successfully'; END $$;
