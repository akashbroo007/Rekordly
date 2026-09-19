/**
 * Temporary registration probe: loads the built Streamate plugin through the
 * REAL PluginManager (discovery -> load -> initialize -> start), then runs a
 * live detection + search round-trip through manager APIs. Deleted after
 * validation. Requires packages/core and packages/shared to be built.
 */
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const core = require(join(repoRoot, 'packages/core/dist/index.js'));
const shared = require(join(repoRoot, 'packages/shared/dist/index.js'));
const database = require(join(repoRoot, 'packages/database/dist/index.js'));

const USERNAME = process.argv[2] ?? 'mahimagicdool';

// In-memory PluginRepo (same shape as manager.test.ts).
class InMemoryPluginRepo {
  rows = new Map();
  get(id) { return this.rows.get(id); }
  list() { return [...this.rows.values()]; }
  upsert(r) { this.rows.set(r.id, r); }
  remove(id) { this.rows.delete(id); }
  setEnabled(id, enabled) { const row = this.rows.get(id); if (row) this.rows.set(id, { ...row, enabled }); }
  setPermissionsGranted(id, p) { const row = this.rows.get(id); if (row) this.rows.set(id, { ...row, permissionsGranted: p }); }
  getData() { return undefined; }
  setData() {}
  getSettings() { return {}; }
  getSetting() { return undefined; }
  async setSetting() {}
  deleteSetting() {}
}

class InMemoryLogRepo {
  notifications = [];
  insert() {}
  list() { return []; }
  insertNotification(e) { this.notifications.push({ ...e, id: this.notifications.length + 1, read: false }); }
  listNotifications() { return this.notifications; }
  markNotificationRead() {}
  markAllNotificationsRead() {}
  unreadNotificationCount() { return 0; }
}

const tempRoot = mkdtempSync(join(tmpdir(), 'rekordly-sm-probe-'));
const searchDir = join(tempRoot, 'search');
const pluginDir = join(searchDir, 'streamate');
cpSync(join(repoRoot, 'plugins', 'streamate'), pluginDir, { recursive: true });

const logger = await shared.createLogger('probe', { level: 'debug', console: false });
const pluginLogger = {
  debug: () => {},
  info: (m) => console.log('  [info]', m),
  warn: (m) => console.log('  [warn]', m),
  error: (m) => console.log('  [error]', m),
};
// The manager's createPluginLogger calls parent.child({...}) — provide a
// pino-like child() so the probe logger satisfies the Logger shape.
const managerLogger = {
  level: 'silent',
  child: () => managerLogger,
  debug: () => {},
  info: pluginLogger.info,
  warn: pluginLogger.warn,
  error: pluginLogger.error,
};

try {
  const manager = new core.PluginManager({
    searchDirs: [searchDir],
    installDir: join(tempRoot, 'installed'),
    dataRootDir: join(tempRoot, 'data'),
    appVersion: '0.1.0',
    repo: new InMemoryPluginRepo(),
    logger: managerLogger,
    notifications: new core.NotificationService({ logRepo: new InMemoryLogRepo(), logger, bus: new core.EventBus() }),
  });

  await manager.initialize();
  const managed = manager.get('streamate');
  if (!managed) throw new Error('streamate plugin was NOT discovered/registered');
  console.log('registered. state:', managed.status.state);
  console.log('capabilities:', managed.record.manifest.capabilities.join(', '));

  const health = await manager.checkHealth('streamate');
  console.log('manager health check:', JSON.stringify({ healthy: health.healthy, message: health.message }));

  const instance = managed.instance;
  const search = await instance.capabilities.creatorSearch.search({ query: USERNAME, limit: 5 });
  console.log('manager search:', JSON.stringify({ total: search.total, isLive: search.creators[0]?.isLive }));

  const live = await instance.capabilities.liveDetection.getLiveStatus(`streamate:${USERNAME}`);
  console.log('manager liveStatus:', JSON.stringify({ isLive: live.isLive, unknown: live.unknown ?? false }));

  const schema = manager.getSettingsSchema('streamate');
  console.log('settings schema keys:', Object.keys(schema).join(', '));

  console.log('REGISTRATION PROBE OK');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
process.exit(0);
