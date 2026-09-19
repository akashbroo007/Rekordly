/**
 * ponytail: smoke validation for the Kick plugin — loads the built entry
 * exactly like PluginLoader does (require of dist/index.js), drives it
 * through initialize -> capabilities -> cleanup with a stub host context.
 *
 * Usage: node scripts/smoke.cjs [channelSlug]
 * Network calls hit kick.com — run sparingly.
 */
const { createRequire } = require('node:module');
const path = require('node:path');

const req = createRequire(path.join(__dirname, 'anchor.js'));
const pluginDir = path.join(__dirname, '..');

async function main() {
  const slug = process.argv[2] || 'xqc';

  const loaded = req(path.join(pluginDir, 'dist', 'index.js'));
  const plugin = loaded.default ?? loaded;
  if (
    typeof plugin.initialize !== 'function' ||
    typeof plugin.start !== 'function' ||
    typeof plugin.stop !== 'function' ||
    typeof plugin.cleanup !== 'function' ||
    typeof plugin.capabilities !== 'object'
  ) {
    throw new Error('entry does not export a valid Plugin');
  }
  console.log('[smoke] plugin shape OK — manifest id:', plugin.manifest.id);

  const logger = {
    debug: (m) => console.log('[plugin:debug]', m),
    info: (m) => console.log('[plugin:info]', m),
    warn: (m) => console.log('[plugin:warn]', m),
    error: (m) => console.log('[plugin:error]', m),
  };
  const context = {
    manifest: plugin.manifest,
    logger,
    dataDir: pluginDir,
    manifestDir: pluginDir,
    settings: {
      get: () => undefined,
      set: async () => undefined,
      getAll: async () => ({}),
      setAll: async () => undefined,
      reset: async () => undefined,
    },
  };

  await plugin.initialize(context);
  await plugin.start();
  console.log('[smoke] state after start:', plugin.status.state);

  // health check
  const health = await plugin.capabilities.healthCheck.check();
  console.log('[smoke] health:', JSON.stringify(health));

  // creator lookup
  const creator = await plugin.capabilities.creatorSearch.getCreator(`kick:${slug}`);
  console.log('[smoke] creator:', JSON.stringify(creator));

  // live detection
  const live = await plugin.capabilities.liveDetection.getLiveStatus(`kick:${slug}`);
  console.log('[smoke] live status:', JSON.stringify({ ...live, streamUrl: live.streamUrl ? '<redacted>' : undefined }));

  // extraction — only meaningful when live
  if (live.isLive) {
    const stream = await plugin.capabilities.streamExtraction.extractStream(`kick:${slug}`);
    console.log(
      '[smoke] extracted:',
      JSON.stringify({
        creatorId: stream.creatorId,
        creatorName: stream.creatorName,
        platformId: stream.platformId,
        title: stream.title,
        streamUrl: stream.streamUrl.substring(0, 60) + '...',
        qualities: stream.qualityOptions?.length,
        hasHeaders: !!stream.headers,
        hasProxyUrl: !!stream.proxyUrl,
      }),
    );
  } else {
    console.log('[smoke] channel not live — skipping extraction');
  }

  await plugin.stop();
  await plugin.cleanup();
  console.log('[smoke] DONE — state:', plugin.status.state);
}

main().catch((e) => {
  console.error('[smoke] FAILED:', e);
  process.exit(1);
});
