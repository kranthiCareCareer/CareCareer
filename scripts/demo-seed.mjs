/**
 * CareCareer Demo Seed Script
 * Seeds the demo database with synthetic data for all three roles.
 * Uses only deterministic UUIDs for reproducible demos.
 *
 * Run after migrations: node scripts/demo-seed.mjs
 */
import pg from 'pg';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://carecareer_admin:demo_password_not_for_production@localhost:5432/carecareer_demo';

const TENANT_ID = '00000000-0000-4000-a000-000000000001';
const FACILITY_ID = '00000000-0000-4000-a000-000000000010';
const DEPARTMENT_ID = '00000000-0000-4000-a000-000000000011';
const WORKER_ID = '00000000-0000-4000-a000-000000000020';
const CLIENT_USER_ID = '00000000-0000-4000-a000-000000000030';
const ADMIN_USER_ID = '00000000-0000-4000-a000-000000000040';

async function main() {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    console.log('Seeding demo data...');

    // Set tenant context for RLS
    const setTenant = `SELECT set_config('app.tenant_id', '${TENANT_ID}', false)`;

    // Seed facility
    await pool.query(setTenant);
    await pool.query(
      `
      INSERT INTO staffing.facilities (
        id, tenant_id, client_id, name, status, timezone, country,
        address_line1, city, state, zip, latitude, longitude,
        geofence_radius_meters, geofence_version, version
      ) VALUES (
        $1, $2, $2, 'Mercy General Hospital', 'ACTIVE', 'America/New_York', 'US',
        '1000 Healthcare Blvd', 'Atlanta', 'GA', '30301',
        33.7490, -84.3880, 200, 1, 1
      ) ON CONFLICT (id) DO NOTHING
    `,
      [FACILITY_ID, TENANT_ID],
    );

    // Seed department
    await pool.query(setTenant);
    await pool.query(
      `
      INSERT INTO staffing.departments (
        id, tenant_id, facility_id, name, status, version
      ) VALUES (
        $1, $2, $3, 'Emergency Department', 'ACTIVE', 1
      ) ON CONFLICT (id) DO NOTHING
    `,
      [DEPARTMENT_ID, TENANT_ID, FACILITY_ID],
    );

    // Seed worker
    await pool.query(setTenant);
    await pool.query(
      `
      INSERT INTO staffing.workers (
        id, tenant_id, user_id, first_name, last_name, email, phone,
        status, profession, specialty, home_city, home_state, version
      ) VALUES (
        $1, $2, $1, 'Sarah', 'Johnson', 'sarah.johnson@example.com', '555-0101',
        'ACTIVE', 'RN', 'Emergency', 'Atlanta', 'GA', 1
      ) ON CONFLICT (id) DO NOTHING
    `,
      [WORKER_ID, TENANT_ID],
    );

    // Seed credential for worker
    const credentialId = '00000000-0000-4000-a000-000000000021';
    await pool.query(setTenant);
    await pool.query(
      `
      INSERT INTO staffing.worker_credentials (
        id, tenant_id, worker_id, credential_type, status,
        issuing_authority, credential_number, issued_at, expires_at,
        verified_at, verified_by, version
      ) VALUES (
        $1, $2, $3, 'RN_LICENSE', 'VERIFIED',
        'Georgia Board of Nursing', 'GA-RN-2024-001',
        '2024-01-01'::timestamptz, '2027-01-01'::timestamptz,
        '2024-01-15'::timestamptz, 'admin-verifier', 1
      ) ON CONFLICT (id) DO NOTHING
    `,
      [credentialId, TENANT_ID, WORKER_ID],
    );

    // Seed a published shift (tomorrow)
    const shiftId = '00000000-0000-4000-a000-000000000050';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(7, 0, 0, 0);
    const shiftEnd = new Date(tomorrow);
    shiftEnd.setHours(19, 0, 0, 0);
    const businessDate = tomorrow.toISOString().split('T')[0];

    await pool.query(setTenant);
    await pool.query(
      `
      INSERT INTO staffing.shifts (
        id, tenant_id, facility_id, department_id, status, role,
        start_time, end_time, business_date, required_worker_count,
        filled_worker_count, pay_rate_cents, bill_rate_cents,
        published_at, version, created_by
      ) VALUES (
        $1, $2, $3, $4, 'PUBLISHED', 'RN',
        $5::timestamptz, $6::timestamptz, $7::date, 2,
        0, 4500, 7500,
        NOW(), 1, $8
      ) ON CONFLICT (id) DO NOTHING
    `,
      [
        shiftId,
        TENANT_ID,
        FACILITY_ID,
        DEPARTMENT_ID,
        tomorrow.toISOString(),
        shiftEnd.toISOString(),
        businessDate,
        CLIENT_USER_ID,
      ],
    );

    // Seed a second shift for variety
    const shiftId2 = '00000000-0000-4000-a000-000000000051';
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const dayAfterEnd = new Date(dayAfter);
    dayAfterEnd.setHours(19, 0, 0, 0);
    const businessDate2 = dayAfter.toISOString().split('T')[0];

    await pool.query(setTenant);
    await pool.query(
      `
      INSERT INTO staffing.shifts (
        id, tenant_id, facility_id, department_id, status, role,
        start_time, end_time, business_date, required_worker_count,
        filled_worker_count, pay_rate_cents, bill_rate_cents,
        published_at, version, created_by
      ) VALUES (
        $1, $2, $3, $4, 'PUBLISHED', 'CNA',
        $5::timestamptz, $6::timestamptz, $7::date, 1,
        0, 2800, 4500,
        NOW(), 1, $8
      ) ON CONFLICT (id) DO NOTHING
    `,
      [
        shiftId2,
        TENANT_ID,
        FACILITY_ID,
        DEPARTMENT_ID,
        dayAfter.toISOString(),
        dayAfterEnd.toISOString(),
        businessDate2,
        CLIENT_USER_ID,
      ],
    );

    console.log('');
    console.log('Demo seed complete!');
    console.log('');
    console.log('Seeded entities:');
    console.log(`  Tenant:     ${TENANT_ID}`);
    console.log(`  Facility:   Mercy General Hospital (${FACILITY_ID})`);
    console.log(`  Department: Emergency Department (${DEPARTMENT_ID})`);
    console.log(`  Worker:     Sarah Johnson, RN (${WORKER_ID})`);
    console.log(`  Credential: GA RN License (VERIFIED)`);
    console.log(`  Shifts:     2 published shifts (tomorrow + day after)`);
    console.log('');
    console.log('Demo accounts:');
    console.log('  - Platform Admin (platform-admin)');
    console.log('  - Tenant Admin (mas-admin)');
    console.log('  - Worker: Sarah Johnson (worker-sarah)');
    console.log('  - Client: Mercy General (client-mercy)');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
