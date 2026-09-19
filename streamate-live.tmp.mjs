/**
 * Temporary helper: opens streamate.com headlessly and prints nicknames of
 * performers currently shown in the live grid. Deleted after validation.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('./plugins/stripchat/node_modules/playwright-core');

const channels = ['msedge', 'chrome', undefined];
let browser = null;
let lastError = null;
for (const channel of channels) {
  try {
    browser = await chromium.launch({
      ...(channel !== undefined ? { channel } : {}),
      headless: true,
      args: ['--no-sandbox', '--mute-audio', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    break;
  } catch (e) {
    lastError = e;
  }
}
if (browser === null) {
  console.error('no browser:', lastError);
  process.exit(1);
}
try {
  const page = await browser.newPage();
  await page.goto('https://streamate.com/cams/female', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  const text = await page.content();
  const nicks = new Set();
  for (const m of text.matchAll(/\/cam\/([A-Za-z0-9_.-]{3,30})/g)) nicks.add(m[1]);
  console.log([...nicks].slice(0, 20).join('\n'));
} finally {
  await browser.close().catch(() => {});
}
