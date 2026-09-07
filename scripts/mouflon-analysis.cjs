/**
 * Capture raw playlist bodies + the segment URLs the player actually
 * requests, so we can derive the Mouflon obfuscation mapping.
 */
const fs = require('fs');
const { chromium } = require('../plugins/stripchat/node_modules/playwright-core');

const username = process.argv[2];
if (!username) { console.error('usage: node mouflon-analysis.cjs <username>'); process.exit(1); }
const base = 'https://stripchat.ooo';

(async () => {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  const playlistBodies = [];
  const segRequests = [];
  page.on('response', async (res) => {
    const url = res.url();
    try {
      if (url.includes('.m3u8') && url.includes('pkey=') && res.status() === 200) {
        const body = await res.text();
        if (!body.includes('PLAYLIST-TYPE:VOD')) {
          playlistBodies.push({ url, body });
          console.log('[playlist]', url.slice(0, 110));
        }
      }
      if (/\.mp4$/.test(url.split('?')[0]) && url.includes('doppiocdn')) {
        segRequests.push(url);
      }
    } catch { /* ignore */ }
  });

  await page.goto(`${base}/${encodeURIComponent(username)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(15000);

  console.log('playlists captured:', playlistBodies.length, '| segment requests:', segRequests.length);
  if (playlistBodies.length && segRequests.length) {
    fs.writeFileSync(process.env.TEMP + '/mouflon-data.json', JSON.stringify({
      playlists: playlistBodies.slice(0, 3),
      segments: [...new Set(segRequests)].slice(0, 30),
    }, null, 2));
    console.log('saved to %TEMP%/mouflon-data.json');
    // show first playlist tail vs first segment requests
    const p = playlistBodies[0];
    console.log('--- playlist lines ---');
    console.log(p.body.split('\n').slice(0, 14).join('\n'));
    console.log('--- browser segment requests ---');
    for (const s of [...new Set(segRequests)].slice(0, 6)) console.log(s);
  }
  await browser.close();
})();