/**
 * Diagnostic: capture m3u8 traffic from a stripchat room page via headless Edge.
 */
const { chromium } = require('../plugins/stripchat/node_modules/playwright-core');

const username = process.argv[2] ?? 'Velvett_vixens';
const base = 'https://stripchat.ooo';

(async () => {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  const all = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('.m3u8') || url.includes('doppiocdn')) {
      all.push(url);
      console.log('[req]', url.slice(0, 150));
    }
  });
  page.on('websocket', (ws) => console.log('[ws]', ws.url().slice(0, 100)));
  page.on('console', (msg) => {
    const t = msg.text();
    if (/m3u8|hls|stream|error/i.test(t)) console.log('[console]', t.slice(0, 150));
  });

  try {
    await page.goto(`${base}/${username}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log('nav warning:', e.message);
  }

  // try clicking the player to kick off playback
  for (const delay of [4000, 12000, 22000]) {
    await page.waitForTimeout(delay === 4000 ? 4000 : 8000);
    try {
      await page.mouse.click(640, 360);
      console.log('[click] at', delay);
    } catch { /* ignore */ }
  }
  await page.waitForTimeout(10000);

  const signed = [...new Set(all.filter((u) => u.includes('pkey=') && /_\d+p/i.test(u)))];
  console.log('total cdn requests:', all.length, '| signed variants:', signed.length);
  for (const u of signed) console.log('  SIGNED:', u.slice(0, 180));

  await browser.close();
})();