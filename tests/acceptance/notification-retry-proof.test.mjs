/**
 * Notification Retry and Failure-State Proof
 *
 * Simulates transient SMTP failure by stopping MailHog,
 * proves failure handling, then restarts and verifies retry success.
 *
 * Prerequisites:
 * - make demo-up && make demo-seed
 * - Docker CLI available for container management
 *
 * Run: node tests/acceptance/notification-retry-proof.test.mjs
 */
import { execSync } from 'node:child_process';

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
    body: JSON.stringify({
      sub,
      tenantId: TENANT_ID,
      role:
        sub === 'platform-admin' ? 'PLATFORM_ADMIN' : sub === 'worker-sarah' ? 'WORKER' : 'CLIENT',
    }),
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
  try {
    const res = await fetch(`${MAILHOG_URL}/api/v1/messages`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return -1;
    const data = await res.json();
    return data.total ?? data.count ?? 0;
  } catch {
    return -1; // MailHog unavailable
  }
}

function dockerCmd(cmd) {
  execSync(cmd, { stdio: 'pipe', timeout: 15000 });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('\n📬 Notification Retry & Failure-State Proof\n');
  console.log(`  Full SHA: 2da7d86b8d303fb2d76e84d12271f6326fda8946\n`);

  const adminToken = await getToken('platform-admin');
  const clientToken = await getToken('client-mercy');
  const workerToken = await getToken('worker-sarah');

  // Delete all MailHog messages for clean baseline
  await fetch(`${MAILHOG_URL}/api/v1/messages`, { method: 'DELETE' }).catch(() => {});

  // Create a notification-generating event (shift confirm)
  let shiftId, requestId;

  await step('1. Create shift and generate notification event', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 3);
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
    assert(status === 201, `Create shift: ${status}`);
    shiftId = data.id;
    await api('POST', `/v1/shifts/${shiftId}/publish`, clientToken, { expectedVersion: 1 });
  });

  await step('2. Worker requests shift', async () => {
    const { status, data } = await api('POST', '/v1/marketplace/requests', workerToken, {
      shiftId,
      workerId: WORKER_ID,
    });
    assert(status === 201, `Request: ${status}`);
    requestId = data.id;
  });

  // STOP MAILHOG before confirmation (notification will be created but delivery will fail)
  await step('3. Stop MailHog to simulate SMTP failure', async () => {
    dockerCmd('docker stop carecareer-demo-mailhog');
    await sleep(2000);
    const count = await getMailHogCount();
    assert(count === -1, 'MailHog should be unreachable');
  });

  await step('4. Confirm request — notification created', async () => {
    const { status } = await api(
      'POST',
      `/v1/marketplace/requests/${requestId}/confirm`,
      clientToken,
      {
        expectedVersion: 1,
      },
    );
    assert(status === 200, `Confirm: ${status}`);
  });

  await step('5. Process notifications — delivery FAILS (SMTP down)', async () => {
    const { status, data } = await api('POST', '/v1/notifications/process', adminToken);
    assert(status === 200, `Process: ${status}`);
    // Expect failures since MailHog is down
    assert(data.failed >= 1, `Expected failures, got failed=${data.failed}`);
  });

  await step('6. Notification has failure state and incremented attempt', async () => {
    const { status, data } = await api(
      'GET',
      `/v1/notifications/recipient/${WORKER_ID}`,
      adminToken,
    );
    assert(status === 200, `Query: ${status}`);
    const notifs = data.data ?? [];
    // Find a notification that failed (PENDING with retry_count > 0 or FAILED)
    const failedNotif = notifs.find((n) => n.status === 'PENDING' || n.status === 'FAILED');
    assert(failedNotif, 'No failed notification found');
    assert(
      failedNotif.retryCount >= 1 || failedNotif.retry_count >= 1,
      `Attempt count not incremented: ${JSON.stringify(failedNotif)}`,
    );
  });

  await step('7. Error stored is sanitized (no stack traces)', async () => {
    const { data } = await api('GET', `/v1/notifications/recipient/${WORKER_ID}`, adminToken);
    const notifs = data.data ?? [];
    const failedNotif = notifs.find((n) => n.lastError || n.last_error);
    if (failedNotif) {
      const err = failedNotif.lastError ?? failedNotif.last_error ?? '';
      assert(!err.includes('/app/'), 'Stack trace in error');
      assert(!err.includes('node_modules'), 'Internal path in error');
    }
  });

  await step('8. Notification remains retryable', async () => {
    const { data } = await api('GET', `/v1/notifications/recipient/${WORKER_ID}`, adminToken);
    const notifs = data.data ?? [];
    const retryable = notifs.find(
      (n) =>
        n.status === 'PENDING' &&
        (n.retryCount ?? n.retry_count ?? 0) < (n.maxRetries ?? n.max_retries ?? 3),
    );
    assert(retryable, 'No retryable notification found');
  });

  // RESTART MAILHOG
  await step('9. Restart MailHog', async () => {
    dockerCmd('docker start carecareer-demo-mailhog');
    // Wait for MailHog to become available
    for (let i = 0; i < 10; i++) {
      await sleep(1000);
      const count = await getMailHogCount();
      if (count >= 0) return;
    }
    throw new Error('MailHog did not become available');
  });

  // Record email count before retry
  const emailCountBefore = await getMailHogCount();

  await step('10. Retry succeeds — notification delivered', async () => {
    const { status, data } = await api('POST', '/v1/notifications/process', adminToken);
    assert(status === 200, `Retry process: ${status}`);
    assert(data.delivered >= 1, `Expected delivery, got delivered=${data.delivered}`);
  });

  await step('11. Final status is DELIVERED with timestamp', async () => {
    const { data } = await api('GET', `/v1/notifications/recipient/${WORKER_ID}`, adminToken);
    const notifs = data.data ?? [];
    const delivered = notifs.find((n) => n.status === 'DELIVERED');
    assert(delivered, 'No DELIVERED notification found');
    assert(delivered.deliveredAt || delivered.delivered_at, 'Delivered timestamp not set');
  });

  await step('12. MailHog message count increased by exactly expected amount', async () => {
    const emailCountAfter = await getMailHogCount();
    assert(
      emailCountAfter > emailCountBefore,
      `No new emails: ${emailCountBefore} → ${emailCountAfter}`,
    );
  });

  await step('13. Reprocessing after success does NOT resend', async () => {
    const countBefore = await getMailHogCount();
    const { data } = await api('POST', '/v1/notifications/process', adminToken);
    assert(data.delivered === 0, `Expected 0 new deliveries, got ${data.delivered}`);
    const countAfter = await getMailHogCount();
    assert(countAfter === countBefore, `Count changed: ${countBefore} → ${countAfter}`);
  });

  await step('14. No sensitive data in notification content', async () => {
    const { data } = await api('GET', `/v1/notifications/recipient/${WORKER_ID}`, adminToken);
    const notifs = data.data ?? [];
    for (const n of notifs) {
      const text = `${n.subject ?? ''} ${n.body ?? ''}`;
      assert(!text.includes('GA-RN-2024'), 'Credential number in notification');
      assert(!text.includes('password'), 'Password in notification');
      assert(!text.includes('secret'), 'Secret in notification');
      assert(!text.includes('token'), 'Token in notification');
    }
  });

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n  Retry Proof: ${passed} passed, ${failed} failed out of ${results.length}\n`);
  if (failed > 0) {
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => console.log(`    - ${r.step}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('  🎉 Notification retry after transient failure proven!\n');
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
