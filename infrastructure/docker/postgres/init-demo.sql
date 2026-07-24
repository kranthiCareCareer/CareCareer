-- =============================================================================
-- CareCareer Demo Database Initialization
-- Creates schemas, roles, and prepares for service migrations
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas per service
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS staffing;

-- Create application roles (non-superuser, RLS enforced)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'platform_app') THEN
    CREATE ROLE platform_app LOGIN PASSWORD 'platform_app_demo';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'identity_app') THEN
    CREATE ROLE identity_app LOGIN PASSWORD 'identity_app_demo';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'staffing_app') THEN
    CREATE ROLE staffing_app LOGIN PASSWORD 'staffing_app_demo';
  END IF;
END
$$;

-- Grant schema access
GRANT USAGE, CREATE ON SCHEMA platform TO platform_app;
GRANT USAGE, CREATE ON SCHEMA identity TO identity_app;
GRANT USAGE, CREATE ON SCHEMA staffing TO staffing_app;

-- Grant default table privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA platform GRANT ALL ON TABLES TO platform_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA identity GRANT ALL ON TABLES TO identity_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA staffing GRANT ALL ON TABLES TO staffing_app;

-- Allow admin user to set app.tenant_id (for RLS context)
ALTER DATABASE carecareer_demo SET "app.tenant_id" TO '';

DO $$ BEGIN RAISE NOTICE 'CareCareer demo database initialized'; END $$;
