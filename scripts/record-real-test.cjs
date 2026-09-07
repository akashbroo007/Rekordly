/** Extract via plugin + record 10s with ffmpeg, printing all output. */
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileP = promisify(execFile);
const fs = require('fs');
const plugin = require('../plugins/stripchat/dist/index.js').default;

const logger = {
  debug: (m) => console.log('[dbg]', m),
  info: (m) => console.log('[info]', m),
  warn: (m) => console.log('[warn]', m),
  error: (m) => console.log('[error]', m),
};
const ctx = {
  manifest: plugin.manifest,
  logger,
  dataDir: '.',
  manifestDir: '.',
  settings: { get: () => undefined, set: () => {}, getAll: () => ({}) },
};

(async () => {
  await plugin.initialize(ctx);
  const search = await plugin.capabilities.creatorSearch.search({ query: '', limit: 30 });
  const live = search.creators.filter((c) => c.isLive);
  if (!live.length) throw new Error('no live models');
  const username = process.argv[2] ?? live[0].username;
  console.log('model:', username);
  const stream = await plugin.capabilities.streamExtraction.extractStream(`stripchat:${username}`);
  console.log('url:', stream.streamUrl.slice(0, 120));

  // sanity: playlist must be live, not VOD demo
  const res = await fetch(stream.streamUrl, { headers: stream.headers });
  const body = await res.text();
  console.log('playlist status:', res.status);
  console.log(body.split('\n').slice(0, 6).join('\n'));
  if (body.includes('PLAYLIST-TYPE:VOD') || body.includes('/cpa/')) {
    throw new Error('DEMO LOOP detected — aborting');
  }

  fs.mkdirSync('recordings', { recursive: true });
  const out = 'recordings/stripchat-real-test.mp4';
  try {
    await execFileP(
      'ffmpeg',
      [
        '-y', '-loglevel', 'warning', '-stats',
        '-user_agent', stream.headers['User-Agent'],
        '-headers', `Referer: ${stream.headers.Referer}\r\nOrigin: ${stream.headers.Origin}\r\n`,
        '-reconnect', '1', '-reconnect_delay_max', '2', '-rw_timeout', '10000000',
        '-i', stream.streamUrl,
        '-t', '10', '-c', 'copy', '-movflags', '+faststart', out,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 },
    );
  } catch (e) {
    console.log('ffmpeg stderr:', String(e.stderr ?? e.message).split('\n').slice(-8).join('\n'));
    throw e;
  }
  console.log('saved:', out, fs.statSync(out).size, 'bytes');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});