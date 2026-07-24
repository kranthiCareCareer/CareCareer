/**
 * CareCareer Demo Video Recorder
 *
 * Records the complete three-role workflow using Playwright with video capture.
 * Produces segment videos for each scene that will be composited with voiceover.
 *
 * Prerequisites:
 * - Docker Compose demo running (make demo-up && make demo-seed)
 * - Playwright browsers installed
 *
 * Run: node scripts/demo-video/record_demo.cjs
 */
const {
  chromium,
} = require('C:/Users/Lenovo/Downloads/CareCareer/node_modules/.pnpm/playwright@1.52.0/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const VIDEO_DIR = path.join(__dirname, 'recordings');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// Ensure output dirs exist
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordScene(browser, sceneName, actions) {
  console.log(`  Recording: ${sceneName}...`);
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();

  try {
    await actions(page);
  } catch (err) {
    console.log(`    Warning: ${err.message}`);
  }

  // Take final screenshot
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${sceneName}.png`) });
  await page.close();
  await context.close();

  // Get the video file
  const videoFiles = fs
    .readdirSync(VIDEO_DIR)
    .filter((f) => f.endsWith('.webm'))
    .sort();
  const latestVideo = videoFiles[videoFiles.length - 1];
  if (latestVideo) {
    const newName = `${sceneName}.webm`;
    const oldPath = path.join(VIDEO_DIR, latestVideo);
    const newPath = path.join(VIDEO_DIR, newName);
    if (!fs.existsSync(newPath)) {
      fs.renameSync(oldPath, newPath);
    }
  }
  console.log(`    Done: ${sceneName}`);
}

async function main() {
  console.log('\n  CareCareer Demo Video Recorder\n');
  console.log(`  Output: ${VIDEO_DIR}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--window-size=1920,1080'],
  });

  // ─── SCENE 1: INTRO / PERSONA SELECTOR ──────────────────────────────────
  await recordScene(browser, '01-intro-persona-selector', async (page) => {
    await page.goto(BASE_URL);
    await sleep(2000);
    // Show the persona selector
    await sleep(3000);
  });

  // ─── SCENE 2: ADMIN DASHBOARD ───────────────────────────────────────────
  await recordScene(browser, '02-admin-dashboard', async (page) => {
    await page.goto(BASE_URL);
    await sleep(500);
    await page.getByText('Platform Administrator').click();
    await sleep(3000);
  });

  // ─── SCENE 3: ADMIN FACILITIES ─────────────────────────────────────────
  await recordScene(browser, '03-admin-facilities', async (page) => {
    await page.goto(BASE_URL);
    await sleep(500);
    await page.getByText('Platform Administrator').click();
    await sleep(1000);
    await page.goto(`${BASE_URL}/facilities`);
    await sleep(3000);
  });

  // ─── SCENE 4: ADMIN WORKERS ────────────────────────────────────────────
  await recordScene(browser, '04-admin-workers', async (page) => {
    await page.goto(BASE_URL);
    await sleep(500);
    await page.getByText('Platform Administrator').click();
    await sleep(1000);
    await page.goto(`${BASE_URL}/workers`);
    await sleep(3000);
  });

  // ─── SCENE 5: ADMIN SHIFTS ─────────────────────────────────────────────
  await recordScene(browser, '05-admin-shifts', async (page) => {
    await page.goto(BASE_URL);
    await sleep(500);
    await page.getByText('Platform Administrator').click();
    await sleep(1000);
    await page.goto(`${BASE_URL}/shifts`);
    await sleep(3000);
  });

  // ─── SCENE 6: ADMIN AUDIT ──────────────────────────────────────────────
  await recordScene(browser, '06-admin-audit', async (page) => {
    await page.goto(BASE_URL);
    await sleep(500);
    await page.getByText('Platform Administrator').click();
    await sleep(1000);
    await page.goto(`${BASE_URL}/audit`);
    await sleep(3000);
  });

  // ─── SCENE 7: CLIENT SIGN IN ───────────────────────────────────────────
  await recordScene(browser, '07-client-signin', async (page) => {
    await page.goto(BASE_URL);
    await sleep(1000);
    await page.getByText('Client \u2014 Mercy General').click();
    await sleep(3000);
  });

  // ─── SCENE 8: CLIENT CREATE SHIFT ──────────────────────────────────────
  await recordScene(browser, '08-client-create-shift', async (page) => {
    await page.goto(BASE_URL);
    await sleep(500);
    await page.getByText('Client \u2014 Mercy General').click();
    await sleep(1000);
    await page.goto(`${BASE_URL}/shifts/create`);
    await sleep(3000);
  });

  // ─── SCENE 9: CLIENT SHIFTS LIST ───────────────────────────────────────
  await recordScene(browser, '09-client-shifts', async (page) => {
    await page.goto(BASE_URL);
    await sleep(500);
    await page.getByText('Client \u2014 Mercy General').click();
    await sleep(1000);
    await page.goto(`${BASE_URL}/shifts`);
    await sleep(3000);
  });

  // ─── SCENE 10: CLIENT TIMECARDS ────────────────────────────────────────
  await recordScene(browser, '10-client-timecards', async (page) => {
    await page.goto(BASE_URL);
    await sleep(500);
    await page.getByText('Client \u2014 Mercy General').click();
    await sleep(1000);
    await page.goto(`${BASE_URL}/timecards`);
    await sleep(3000);
  });

  // ─── SCENE 11: WORKER SIGN IN ──────────────────────────────────────────
  await recordScene(browser, '11-worker-signin', async (page) => {
    await page.goto(BASE_URL);
    await sleep(1000);
    await page.getByText('Worker \u2014 Sarah Johnson').click();
    await sleep(3000);
  });

  // ─── SCENE 12: WORKER MARKETPLACE ──────────────────────────────────────
  await recordScene(browser, '12-worker-marketplace', async (page) => {
    await page.goto(BASE_URL);
    await sleep(500);
    await page.getByText('Worker \u2014 Sarah Johnson').click();
    await sleep(1000);
    await page.goto(`${BASE_URL}/marketplace`);
    await sleep(3000);
  });

  // ─── SCENE 13: WORKER ASSIGNMENTS ──────────────────────────────────────
  await recordScene(browser, '13-worker-assignments', async (page) => {
    await page.goto(BASE_URL);
    await sleep(500);
    await page.getByText('Worker \u2014 Sarah Johnson').click();
    await sleep(1000);
    await page.goto(`${BASE_URL}/my-assignments`);
    await sleep(3000);
  });

  // ─── SCENE 14: WORKER NOTIFICATIONS ────────────────────────────────────
  await recordScene(browser, '14-worker-notifications', async (page) => {
    await page.goto(BASE_URL);
    await sleep(500);
    await page.getByText('Worker \u2014 Sarah Johnson').click();
    await sleep(1000);
    await page.goto(`${BASE_URL}/notifications`);
    await sleep(3000);
  });

  // ─── SCENE 15: MAILHOG ─────────────────────────────────────────────────
  await recordScene(browser, '15-mailhog-inbox', async (page) => {
    await page.goto('http://localhost:8025');
    await sleep(3000);
  });

  await browser.close();

  console.log('\n  Recording complete!');
  console.log(`  Videos: ${VIDEO_DIR}`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
  const videos = fs.readdirSync(VIDEO_DIR).filter((f) => f.endsWith('.webm'));
  console.log(`  Total segments: ${videos.length}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
