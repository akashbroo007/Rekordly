/** Start the MouflonProxy standalone, dump its playlist + one segment status. */
const plugin = require('../plugins/stripchat/dist/index.js').default;
const { MouflonProxy } = require('../plugins/stripchat/dist/mouflon-proxy.js');

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
  console.log('local url:', stream.streamUrl);

  const res = await fetch(stream.streamUrl);
  const body = await res.text();
  console.log('--- local playlist ---');
  console.log(body.split('\
').slice(0, 16).join('\
'));

  const segLine = body.split('\
').find((l) => l.startsWith('/seg/'));
  if (segLine) {
    const base = stream.streamUrl.replace('/index.m3u8', '');
    const r2 = await fetch(base + segLine);
    console.log('segment', segLine, '->', r2.status, r2.headers.get('content-length'), 'bytes');
  }
  const r3 = await fetch(stream.streamUrl.replace('/index.m3u8', '/init.mp4'));
  console.log('init ->', r3.status, r3.headers.get('content-length'), 'bytes');

  // keep alive briefly so ffmpeg could attach
  await new Promise((r) => setTimeout(r, 5000));
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});