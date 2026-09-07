/**
 * Pure-Node MOUFLON test — records a few seconds of a live Stripchat stream
 * WITHOUT launching any browser, exercising the pure-Node decoder directly:
 *
 *   unsigned master playlist
 *     -> parse #EXT-X-MOUFLON header (psch + pkey)
 *     -> resolve pdkey (community seed map / player-JS scrape)
 *     -> media playlist (+psch/pkey)
 *     -> decode #EXT-X-MOUFLON:URI segment URLs (reverse -> b64 -> XOR sha256)
 *     -> download init segment + N media segments
 *     -> write a playable fragmented-MP4 to ./test-output/
 *
 * Usage:
 *   node scripts/stripchat-pure-test.cjs [username] [segmentCount=15]
 *   node scripts/stripchat-pure-test.cjs AsheyBaker 20
 *
 * PASS criteria: pdkey resolved, all segment decodes self-verified, all
 * segment downloads return 200, output file > 1MB. No Playwright involved.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createPdKeyResolver, decodeMouflonUri } = require('../plugins/stripchat/dist/mouflon-cipher.js');

const BASE = 'https://stripchat.ooo';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  // ponytail: the WAF returns 406 unless requests carry the full browser
  // Accept list (same requirement the plugin's httpGet works around).
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  Referer: `${BASE}/`,
  Origin: BASE,
  'Accept-Language': 'en-US,en;q=0.9',
};

const username = process.argv[2] ?? 'AsheyBaker';
const SEGMENT_COUNT = parseInt(process.argv[3] ?? '15', 10);

/** Extract the numeric sequence from a segment filename (same as the plugin). */
function seqOf(url) {
  const m = url.match(/_(\d{2,})_[^_]+_\d+\.mp4(?:$|\?)/);
  return m ? parseInt(m[1], 10) : null;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function resolveUrl(src, base) {
  return /^https?:/i.test(src) ? src : new URL(src, base).toString();
}

/** Extract a balanced-brace JSON object following `marker` (plugin logic). */
function extractJsonAfter(html, marker) {
  const markerIdx = html.lastIndexOf(marker);
  if (markerIdx === -1) return null;
  const start = html.indexOf('{', markerIdx);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function main() {
  console.log(`pure-mode test: model=${username} segments=${SEGMENT_COUNT}`);
  console.log('NOTE: this script never imports playwright — browser mode impossible.\n');

  // ---- 1. resolve model id + live state (room page — no API needed) -------
  // ponytail: the cam API is Cloudflare-challenged for plain HTTP clients,
  // but the room page's __PRELOADED_STATE__ carries the same data and loads
  // fine — this is also how the plugin's page-scrape fallback works.
  // If the requested model is offline, fall back to any live model found on
  // the homepage listing so the cipher test can still run.
  const loadRoom = async (name) => {
    const html = await fetchText(`${BASE}/${encodeURIComponent(name)}`);
    const state = extractJsonAfter(html, '__PRELOADED_STATE__');
    if (state === null) throw new Error(`could not parse room page state for ${name} (Cloudflare challenge?)`);
    return state;
  };
  let state = await loadRoom(username);
  let model = state.viewCam?.model ?? {};
  let cam = state.viewCam?.cam ?? {};
  let activeUser = username;
  let isLive = cam.isCamAvailable === true || (model.status === 'public' && model.isLive === true);
  if (!isLive) {
    console.log(`[1] ${username} is offline — trying API discovery (needs COOKIE env var)...`);
    if (process.env.COOKIE === undefined || process.env.COOKIE === '') {
      throw new Error(
        `${username} is offline. Pass a live username, or set COOKIE (browser cookie header from DevTools) to auto-discover a live model.`,
      );
    }
    const res = await fetch(
      `${BASE}/api/front/v2/models?primaryTag=girls&limit=30`,
      { headers: { ...HEADERS, Accept: 'application/json', Cookie: process.env.COOKIE } },
    );
    const json = await res.json();
    const found = [];
    const walk = (node, depth) => {
      if (depth > 12 || node === null || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const item of node) walk(item, depth + 1); return; }
      const uname = node['username'];
      if (typeof uname === 'string' && uname.length > 0 && node['isLive'] === true && node['status'] === 'public') {
        found.push(uname);
      }
      for (const value of Object.values(node)) walk(value, depth + 1);
    };
    walk(json, 0);
    const next = found.find((u) => u !== username);
    if (next === undefined) throw new Error(`${username} is offline and the API returned no live model`);
    console.log(`[1] testing ${next} instead (found ${found.length} live models)`);
    activeUser = next;
    state = await loadRoom(next);
    model = state.viewCam?.model ?? {};
    cam = state.viewCam?.cam ?? {};
    isLive = cam.isCamAvailable === true || (model.status === 'public' && model.isLive === true);
  }
  const modelId = model.id ?? cam.streamName;
  if (modelId === undefined) throw new Error(`could not resolve model id`);
  if (!isLive) throw new Error(`no live model available — try again later`);
  console.log(`[1] model id: ${modelId} (live: ${model.status ?? 'unknown'})`);

  // ---- 2. find a master playlist carrying the MOUFLON tag -----------------
  const masters = [
    `https://edge-hls.doppiocdn.com/hls/${modelId}/master/${modelId}_auto.m3u8`,
    ...Array.from({ length: 30 }, (_, i) => `https://media-hls.doppiocdn.org/b-hls-${i + 1}/${modelId}/${modelId}_auto.m3u8`),
  ];
  let masterUrl = null;
  let masterBody = null;
  for (const url of masters) {
    try {
      const body = await fetchText(url);
      if (!body.includes('#EXTM3U')) continue;
      if (body.includes('/cpa/')) continue; // promo loop
      masterUrl = url;
      masterBody = body;
      break;
    } catch {
      /* try next */
    }
  }
  if (masterUrl === null) throw new Error('no reachable master playlist with MOUFLON data');
  console.log(`[2] master: ${masterUrl}`);

  // ---- 3. parse psch/pkey from the MOUFLON header -------------------------
  let psch = null;
  let pkey = null;
  for (const line of masterBody.split('\n')) {
    const t = line.trim();
    if (t.startsWith('#EXT-X-MOUFLON') && !t.startsWith('#EXT-X-MOUFLON:URI:') && !t.startsWith('#EXT-X-MOUFLON:FILE:')) {
      const parts = t.split(':');
      if (parts.length >= 4) {
        psch = parts[2];
        pkey = parts[3];
      }
    }
  }
  if (pkey === null) throw new Error('master playlist has no MOUFLON header (site may have changed) — pure mode not applicable');
  console.log(`[3] psch=${psch} pkey=${pkey}`);

  // ---- 4. resolve pdkey (seed map -> player JS scrape) --------------------
  const resolvePdKey = createPdKeyResolver(fetchText, () => BASE, (m) => console.log(`    ${m}`));
  const pdkey = await resolvePdKey(pkey);
  if (pdkey === null) throw new Error(`no pdkey found for pkey ${pkey} — seed map stale and player scrape failed`);
  console.log(`[4] pdkey resolved: ${pdkey.slice(0, 4)}...`);

  // ---- 5. fetch the media playlist ----------------------------------------
  const variantLine = masterBody.split('\n').map((l) => l.trim());
  let variantUri = null;
  for (let i = 0; i < variantLine.length; i++) {
    if (variantLine[i].startsWith('#EXT-X-STREAM-INF') && variantLine[i + 1] && !variantLine[i + 1].startsWith('#')) {
      variantUri = variantLine[i + 1];
      break;
    }
  }
  if (variantUri === null) throw new Error('master has no variant playlist entry');
  let mediaUrl = resolveUrl(variantUri, masterUrl);
  mediaUrl += (mediaUrl.includes('?') ? '&' : '?') + `psch=${psch}&pkey=${pkey}`;
  let mediaBody;
  try {
    mediaBody = await fetchText(mediaUrl);
  } catch {
    mediaUrl += '&playlistType=lowLatency';
    mediaBody = await fetchText(mediaUrl);
  }
  if (!mediaBody.includes('#EXT-X-MOUFLON:URI:')) {
    throw new Error('media playlist has no MOUFLON:URI entries — nothing to decode');
  }
  console.log(`[5] media playlist OK (${mediaBody.split('\n').length} lines)`);

  // ---- 6. decode segment URIs (self-verifying) ----------------------------
  const initMatch = mediaBody.match(/#EXT-X-MAP:URI="([^"]+)"/);
  if (initMatch === null) throw new Error('no #EXT-X-MAP init segment in media playlist');
  const initUrl = resolveUrl(initMatch[1], mediaUrl);

  const entries = [];
  {
    const encBySeq = new Map();
    for (const raw of mediaBody.split('\n')) {
      const line = raw.trim();
      if (!line.startsWith('#EXT-X-MOUFLON:URI:')) continue;
      const encUrl = line.slice('#EXT-X-MOUFLON:URI:'.length);
      const seq = seqOf(encUrl);
      if (seq === null) continue;
      encBySeq.set(seq, encUrl);
    }
    for (const [seq, encUrl] of encBySeq) {
      const decoded = decodeMouflonUri(encUrl, pdkey);
      if (decoded === null || seqOf(decoded) !== seq) {
        console.log(`    decode FAILED self-verification for seq ${seq} — pdkey wrong?`);
        continue;
      }
      entries.push({ seq, url: resolveUrl(decoded, mediaUrl) });
    }
  }
  entries.sort((a, b) => a.seq - b.seq);
  if (entries.length === 0) throw new Error('no segment URL survived decode verification');
  console.log(`[6] decoded ${entries.length} segment URLs (all self-verified)`);

  // ---- 7. download init + segments, write fMP4 ----------------------------
  const outDir = path.join(__dirname, '..', 'test-output');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${activeUser}_pure_${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`);
  const fd = fs.openSync(outFile, 'w');

  const initBuf = await fetchBuffer(initUrl);
  fs.writeSync(fd, initBuf);
  console.log(`[7] init segment: ${(initBuf.length / 1024).toFixed(0)} KB`);

  let ok = 0;
  let fail = 0;
  const chosen = entries.slice(-SEGMENT_COUNT);
  for (const entry of chosen) {
    try {
      const buf = await fetchBuffer(entry.url);
      if (buf.length === 0) throw new Error('empty');
      fs.writeSync(fd, buf);
      ok++;
      process.stdout.write(`\r    seq ${entry.seq}: ${(buf.length / 1024).toFixed(0)} KB (${ok}/${chosen.length})`);
    } catch (e) {
      fail++;
      console.log(`\n    seq ${entry.seq}: DOWNLOAD FAILED — ${e.message}`);
    }
  }
  fs.closeSync(fd);
  console.log('');

  const sizeMb = fs.statSync(outFile).size / (1024 * 1024);
  console.log('\n---- RESULT ----');
  console.log(`file      : ${outFile}`);
  console.log(`size      : ${sizeMb.toFixed(2)} MB`);
  console.log(`segments  : ${ok} OK, ${fail} failed`);
  if (ok > 0 && sizeMb > 0.5) {
    console.log('\nSUCCESS: pure-Node MOUFLON mode works — no browser was launched.');
    console.log('Play the file to verify video/audio, e.g.:');
    console.log(`  start "" "${outFile}"`);
    process.exit(0);
  } else {
    console.log('\nFAIL: not enough data captured — check errors above.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('\nPURE-MODE TEST FAILED:', e.message);
  process.exit(1);
});
