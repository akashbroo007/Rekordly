/** Hold a MouflonProxy open for N seconds; write local URL to %TEMP%/proxy-url.txt */
const fs = require('fs');
const plugin = require('../plugins/stripchat/dist/index.js').default;

const logger = {
  debug: () => {},
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
  const stream = await plugin.capabilities.streamExtraction.extractStream(`stripchat:${live[0].username}`);
  fs.writeFileSync(process.env.TEMP + '/proxy-url.txt', stream.streamUrl);
  console.log('URL:', stream.streamUrl);
  await new Promise((r) => setTimeout(r, parseInt(process.argv[2] ?? '90', 10) * 1000));
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});