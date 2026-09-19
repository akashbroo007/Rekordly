/**
 * Temporary live-validation probe for the Streamate plugin (not shipped,
 * deleted after validation). Boots the built plugin exactly like the host's
 * PluginManager would (initialize -> start) and exercises the capabilities
 * against the real platform.
 */
import * as path from 'node:path';
import * as https from 'node:https';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pluginRoot = path.resolve(process.cwd(), 'plugins', 'streamate');
const plugin = require(path.join(pluginRoot, 'dist', 'index.js')).default;

const shared = require(path.resolve(process.cwd(), 'packages', 'shared', 'dist', 'index.js'));

const USERNAME = process.argv[2] ?? 'Ashe_Maree';

const quiet = (level) => (msg) => {
  if (level !== 'debug') console.log(`  [${level}] ${msg}`);
};

const settings = {
  get: () => undefined,
  set: async () => {},
  getAll: async () => ({}),
  setAll: async () => {},
  reset: async () => {},
};

try {
  const logger = await shared.createLogger('probe', { level: 'debug', console: false });
  const pluginLogger = {
    debug: quiet('debug'),
    info: quiet('info'),
    warn: quiet('warn'),
    error: quiet('error'),
  };
  void logger;

  await plugin.initialize({
    manifest: plugin.manifest,
    logger: pluginLogger,
    dataDir: pluginRoot,
    manifestDir: pluginRoot,
    settings,
  });
  await plugin.start();
  console.log('state:', plugin.status.state);

  const health = await plugin.capabilities.healthCheck.check();
  console.log('health:', JSON.stringify(health));

  const identifier = `streamate:${USERNAME}`;
  const status = await plugin.capabilities.liveDetection.getLiveStatus(identifier);
  console.log('liveStatus:', JSON.stringify({ ...status, streamUrl: status.streamUrl ? status.streamUrl.slice(0, 90) + '…' : undefined }));

  const creator = await plugin.capabilities.creatorSearch.getCreator(identifier);
  console.log('creator:', JSON.stringify(creator));

  const metadata = await plugin.capabilities.metadata.getCreatorMetadata(identifier);
  console.log('metadata:', JSON.stringify(metadata));

  const search = await plugin.capabilities.creatorSearch.search({ query: USERNAME, limit: 5 });
  console.log('search:', JSON.stringify({ total: search.total, first: search.creators[0]?.username }));

  if (status.isLive === true) {
    const stream = await plugin.capabilities.streamExtraction.extractStream(identifier);
    console.log('extract: url=', stream.streamUrl.slice(0, 90) + '…');
    console.log('extract: creatorName=', stream.creatorName, '| platformId=', stream.platformId, '| title=', stream.title);
    console.log('extract: qualityOptions=', JSON.stringify(stream.qualityOptions));
    console.log('extract: metadata=', JSON.stringify(stream.metadata));
    console.log('extract: headers=', JSON.stringify(stream.headers));
    console.log('extract: proxyUrl=', stream.proxyUrl, '| cookies=', stream.cookies?.length ?? 0);

    // The recorder only gets the StreamObject: verify the playlist is fetchable with just url+headers.
    const res = await new Promise((resolve) => {
      const mod = stream.streamUrl.startsWith('https:') ? https : require('node:http');
      const req = mod.get(stream.streamUrl, { headers: stream.headers }, (r) => {
        let body = '';
        r.on('data', (c) => (body += c));
        r.on('end', () => resolve({ status: r.statusCode, head: body.slice(0, 160) }));
      });
      req.on('error', (e) => resolve({ status: 0, head: String(e) }));
      req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, head: 'timeout' }); });
    });
    console.log('recorder fetch of streamUrl:', res.status, JSON.stringify(res.head));
  } else {
    console.log('creator offline during probe — extraction not exercised (deterministic site answer, not a failure)');
  }

  await plugin.cleanup();
  console.log('DONE');
  process.exit(0);
} catch (err) {
  console.error('PROBE FAILED:', err);
  process.exit(1);
}
