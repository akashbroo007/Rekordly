/**
 * Smoke test for the Stripchat plugin (run from repo root):
 *   node scripts/stripchat-smoke.js [username]
 * Discovers a live model from the homepage (or uses the given username),
 * then runs getCreator -> getLiveStatus -> extractStream and probes the
 * resulting playlist URL.
 */
const plugin = require('../plugins/stripchat/dist/index.js').default;

const logger = {
  debug: (m) => console.log('  [debug]', m),
  info: (m) => console.log('  [info] ', m),
  warn: (m) => console.log('  [warn] ', m),
  error: (m) => console.log('  [error]', m),
};

const ctx = {
  manifest: plugin.manifest,
  logger,
  dataDir: '.',
  manifestDir: '.',
  settings: { get: () => undefined, set: () => {}, getAll: () => ({}) },
};

async function main() {
  await plugin.initialize(ctx);
  console.log('plugin initialized, state =', plugin.status.state);

  const health = await plugin.capabilities.healthCheck.check();
  console.log('healthCheck:', JSON.stringify(health));

  let username = process.argv[2];
  if (!username) {
    console.log('searching for live public models...');
    const search = await plugin.capabilities.creatorSearch.search({ query: '', limit: 30 });
    const liveOnes = search.creators.filter((c) => c.isLive);
    console.log('found', search.creators.length, 'models,', liveOnes.length, 'publicly live');
    if (liveOnes.length === 0) {
      console.error('FAIL: no publicly-live models discovered');
      process.exit(1);
    }
    username = liveOnes[0].username;
  }
  console.log('testing model:', username);

  const creator = await plugin.capabilities.creatorSearch.getCreator(username);
  console.log('getCreator:', JSON.stringify(creator));

  const live = await plugin.capabilities.liveDetection.getLiveStatus(`stripchat:${username}`);
  console.log('getLiveStatus:', JSON.stringify({ ...live, streamUrl: live.streamUrl ? live.streamUrl.slice(0, 90) + '...' : undefined }));

  if (!live.isLive) {
    console.log('model is offline — extraction test skipped (try another model)');
    process.exit(0);
  }

  const stream = await plugin.capabilities.streamExtraction.extractStream(`stripchat:${username}`);
  console.log('extractStream OK');
  console.log('  title   :', stream.title);
  console.log('  url     :', stream.streamUrl.slice(0, 110) + '...');
  console.log('  headers :', JSON.stringify(stream.headers));
  console.log('  qualities:', stream.qualityOptions.map((q) => q.label).join(', '));

  // Probe the final playlist URL the way the recorder would (with headers).
  const res = await fetch(stream.streamUrl, { headers: stream.headers });
  const body = await res.text();
  console.log('playlist probe:', res.status, body.includes('#EXTM3U') ? 'valid HLS' : 'NOT HLS');
  if (res.status === 200 && body.includes('#EXTM3U')) {
    console.log('SUCCESS: extraction produced a working playlist');
  } else {
    console.error('FAIL: playlist probe returned', res.status);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('SMOKE TEST FAILED:', e.message);
  process.exit(1);
});