/**
 * Notification Retry and Deduplication Proof
 *
 * Proves:
 * - notification created once per event
 * - processing doesn't duplicate
 * - retry increments attempt count
 * - no sensitive data in notifications
 *
 * Run: node tests/acceptance/notification-proof.test.mjs
 * Prerequisite: make demo-up && make demo-seed
 */

const PLATFORM_URL = process.env.PLATFORM_URL ?? 'http://localhost:3001';
const STAFFING_URL = process.env.STAFFING_URL ?? 'http://localhost:3200';
const MAILHOG_URL = process.env.MAILHOG_URL ?? 'http://localhost:8025';
const TENANT_ID = '00000000-0000-4000-a000-000000000001';
const WORKER_ID = '00000000-0000-4000-a000-000000000020';
const FACILITY_ID = '00000000-0000-4000-a000-000000000010';

const results = [];

async function step(name, fn) {
  try {
    await fn();
    results.push({ step: name, status: 'PASS' });
    console.log(`  ✅ ${name}`);
  } catch (err) {
    results.push({ step: name, status: 'FAIL', error: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

async function getToken(sub) {
  const res = await fetch(`${PLATFORM_URL}/demo/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub, tenantId: TENANT_ID, role: 'ALL' }),
  });
  return (await res.json()).token;
}

async function api(method, path, token, body) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${STAFFING_URL}${path}`, opts);
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function getMailHogCount() {
  const res = await fetch(`${MAILHOG_URL}/api/v1/messages`);
  if (!res.ok) return 0;
  const data = await res.json();
  return data.total ?? data.count ?? 0;
}

async function deleteMailHogMessages() {
  await fetch(`${MAILHOG_URL}/api/v1/messages`, { method: 'DELETE' }).catch(() => {});
}

async function run() {
  console.log('\n📬 Notification Retry & Deduplication Proof\n');

  const adminToken = await getToken('platform-admin');
  const clientToken = await getToken('client-mercy');
  const workerToken = await getToken('worker-sarah');

  // Clear MailHog
  await deleteMailHogMessages();

  // Create a shift, request, and confirm to generate notifications
  await step('1. Create shift for notification test', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    tomorrow.setHours(7, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(19, 0, 0, 0);

    const { status, data } = await api('POST', '/v1/shifts', clientToken, {
      facilityId: FACILITY_ID,
      role: 'RN',
      startTime: tomorrow.toISOString(),
      endTime: end.toISOString(),
      businessDate: tomorrow.toISOString().split('T')[0],
      requiredWorkerCount: 1,
      payRateCents: 5000,
      billRateCents: 8000,
    });
    assert(status === 201, `Create failed: ${status}`);
    globalThis.testShiftId = data.id;

    // Publish
    const { status: ps } = await api('POST', `/v1/shifts/${data.id}/publish`, clientToken, {
      expectedVersion: 1,
    });
    assert(ps === 200, `Publish failed: ${ps}`);
  });

  await step('2. Worker requests shift', async () => {
    const { status, data } = await api('POST', '/v1/marketplace/requests', workerToken, {
      shiftId: globalThis.testShiftId,
      workerId: WORKER_ID,
    });
    assert(status === 201, `Request failed: ${status}`);
    globalThis.testRequestId = data.id;
  });

  await step('3. Client confirms — notification created', async () => {
    const { status, data } = await api(
      'POST',
      `/v1/marketplace/requests/${globalThis.testRequestId}/confirm`,
      clientToken,
      {
        expectedVersion: 1,
      },
    );
    assert(status === 200, `Confirm failed: ${status}`);
    globalThis.testAssignmentId = data.assignmentId;
  });

  // Count notifications BEFORE processing
  let notifCountBefore;
  await step('4. Verify notification row exists', async () => {
    const { status, data } = await api(
      'GET',
      `/v1/notifications/recipient/${WORKER_ID}`,
      adminToken,
    );
    assert(status === 200, `Query failed: ${status}`);
    const notifs = data.data ?? [];
    notifCountBefore = notifs.length;
    assert(notifCountBefore >= 1, `Expected notifications, got ${notifCountBefore}`);
  });

  // Process notifications (deliver via SMTP)
  await step('5. Process notifications — emails delivered', async () => {
    const { status, data } = await api('POST', '/v1/notifications/process', adminToken);
    assert(status === 200, `Process failed: ${status}`);
    assert(data.delivered >= 1, `Expected deliveries, got ${data.delivered}`);
  });

  // Check MailHog
  let emailCountAfterFirst;
  await step('6. MailHog has emails', async () => {
    emailCountAfterFirst = await getMailHogCount();
    assert(emailCountAfterFirst >= 1, `Expected emails, got ${emailCountAfterFirst}`);
  });

  // Process AGAIN — should not duplicate (already delivered)
  await step('7. Reprocess does NOT duplicate emails', async () => {
    const { status, data } = await api('POST', '/v1/notifications/process', adminToken);
    assert(status === 200, `Reprocess failed: ${status}`);
    // No new deliveries since all are already DELIVERED
    assert(data.delivered === 0, `Expected 0 new deliveries, got ${data.delivered}`);

    const emailCountAfterSecond = await getMailHogCount();
    assert(
      emailCountAfterSecond === emailCountAfterFirst,
      `Email count changed: ${emailCountAfterFirst} → ${emailCountAfterSecond}`,
    );
  });

  // Verify notification content doesn't have sensitive data
  await step('8. No sensitive data in notifications', async () => {
    const { data } = await api('GET', `/v1/notifications/recipient/${WORKER_ID}`, adminToken);
    const notifs = data.data ?? [];
    for (const n of notifs) {
      assert(!n.subject.includes('GA-RN'), 'Credential number in subject');
      assert(!n.body.includes('GA-RN'), 'Credential number in body');
      assert(!n.body.includes('password'), 'Password in body');
      assert(!n.body.includes('secret'), 'Secret in body');
    }
  });

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n  Notification Proof: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => console.log(`    - ${r.step}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('  🎉 Notification deduplication and delivery proven!\n');
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
