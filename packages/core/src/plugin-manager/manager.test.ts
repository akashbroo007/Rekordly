import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from '@rekordly/shared';
import type { LogRepo, NotificationRecord, PluginRecord, PluginRepo } from '@rekordly/database';
import { EventBus } from '../events/event-bus';
import { NotificationService, type CoreEvents } from '../services/notification-service';
import { toPluginInfo } from './dto';
import { PluginManager } from './manager';

/**
 * End-to-end plugin lifecycle test: a copy of the workspace example plugin is
 * placed in a temp dir and driven through the real manager. Requires the
 * example plugin to be built (`pnpm build`).
 */

class InMemoryPluginRepo implements PluginRepo {
  private readonly rows = new Map<string, PluginRecord>();
  private readonly settings = new Map<string, Map<string, unknown>>();
  private readonly data = new Map<string, Map<string, unknown>>();

  upsert(record: PluginRecord): void {
    this.rows.set(record.id, record);
  }
  list(): PluginRecord[] {
    return [...this.rows.values()];
  }
  get(id: string): PluginRecord | undefined {
    return this.rows.get(id);
  }
  remove(id: string): void {
    this.rows.delete(id);
  }
  setEnabled(id: string, enabled: boolean): void {
    const row = this.rows.get(id);
    if (row !== undefined) {
      this.rows.set(id, { ...row, enabled });
    }
  }
  setPermissionsGranted(id: string, permissions: string[]): void {
    const row = this.rows.get(id);
    if (row !== undefined) {
      this.rows.set(id, { ...row, permissionsGranted: permissions });
    }
  }
  private bucket(map: Map<string, Map<string, unknown>>, pluginId: string): Map<string, unknown> {
    const existing = map.get(pluginId);
    if (existing !== undefined) {
      return existing;
    }
    const created = new Map<string, unknown>();
    map.set(pluginId, created);
    return created;
  }
  getData(pluginId: string, key: string): unknown {
    return this.bucket(this.data, pluginId).get(key);
  }
  setData(pluginId: string, key: string, value: unknown): void {
    this.bucket(this.data, pluginId).set(key, value);
  }
  getSettings(pluginId: string): Record<string, unknown> {
    return Object.fromEntries(this.bucket(this.settings, pluginId));
  }
  getSetting(pluginId: string, key: string): unknown {
    return this.bucket(this.settings, pluginId).get(key);
  }
  setSetting(pluginId: string, key: string, value: unknown): void {
    this.bucket(this.settings, pluginId).set(key, value);
  }
  deleteSetting(pluginId: string, key: string): void {
    this.bucket(this.settings, pluginId).delete(key);
  }
}

class InMemoryLogRepo implements LogRepo {
  readonly notifications: NotificationRecord[] = [];
  insert(): void {}
  list(): [] {
    return [];
  }
  insertNotification(entry: Omit<NotificationRecord, 'id' | 'read'>): void {
    this.notifications.push({ ...entry, id: this.notifications.length + 1, read: false });
  }
  listNotifications(): NotificationRecord[] {
    return this.notifications;
  }
  markNotificationRead(): void {}
  markAllNotificationsRead(): void {}
  unreadNotificationCount(): number {
    return 0;
  }
}

let tempRoot: string;
let manager: PluginManager;
let repo: InMemoryPluginRepo;
let logRepo: InMemoryLogRepo;
let events: { type: string; pluginId: string }[] = [];

const EXAMPLE_PLUGIN_DIR = join(process.cwd(), '..', '..', 'plugins', 'example');

beforeAll(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'Rekordly-test-'));
  const searchDir = join(tempRoot, 'search');
  const pluginDir = join(searchDir, 'mock-platform');
  cpSync(EXAMPLE_PLUGIN_DIR, pluginDir, { recursive: true });

  repo = new InMemoryPluginRepo();
  logRepo = new InMemoryLogRepo();
  const logger = await createLogger('test', { level: 'silent' });
  const notifications = new NotificationService({
    logRepo,
    logger,
    bus: new EventBus<CoreEvents>(),
  });

  manager = new PluginManager({
    searchDirs: [searchDir],
    installDir: join(tempRoot, 'installed'),
    dataRootDir: join(tempRoot, 'data'),
    appVersion: '0.1.0',
    repo,
    logger,
    notifications,
  });

  events = [];
  for (const type of ['loaded', 'enabled', 'disabled', 'failed', 'updated', 'removed', 'installed'] as const) {
    manager.on(type, (payload) => {
      events.push({ type, pluginId: payload.pluginId });
    });
  }

  await manager.initialize();
});

afterAll(() => {
  manager.emit('unloaded', { pluginId: 'mock-platform' });
});

describe('Plugin Manager', () => {
  it('discovers and starts the example plugin', () => {
    const plugins = manager.list();
    expect(plugins).toHaveLength(1);
    const plugin = plugins[0]!;
    expect(plugin.record.id).toBe('mock-platform');
    expect(plugin.status.state).toBe('ready');
    expect(plugin.instance).not.toBeNull();
    expect(events.some((event) => event.type === 'loaded')).toBe(true);
  });

  it('exposes manifest, capabilities and permissions as DTOs', () => {
    const info = toPluginInfo(manager.get('mock-platform')!);
    expect(info.name).toBe('Mock Platform');
    expect(info.author).toBe('Rekordly');
    expect(info.version).toBe('0.1.0');
    expect(info.capabilities).toContain('creator-search');
    expect(info.capabilities).toContain('live-detection');
    expect(info.capabilities).toContain('stream-extraction');
    expect(info.permissionsRequested).toContain('recording');
    expect(info.permissionsGranted).toContain('network');
  });

  it('returns mock creators through creator-search', async () => {
    const instance = manager.get('mock-platform')!.instance!;
    const result = await instance.capabilities.creatorSearch!.search({ query: 'nord', limit: 5 });
    expect(result.creators).toHaveLength(1);
    expect(result.creators[0]!.username).toBe('nordstar');
  });

  it('detects live status', async () => {
    const instance = manager.get('mock-platform')!.instance!;
    const live = await instance.capabilities.liveDetection!.getLiveStatus('mock:nordstar');
    const offline = await instance.capabilities.liveDetection!.getLiveStatus('mock:helvetika');
    expect(live.isLive).toBe(true);
    expect(offline.isLive).toBe(false);
  });

  it('extracts a standard stream object', async () => {
    const instance = manager.get('mock-platform')!.instance!;
    const stream = await instance.capabilities.streamExtraction!.extractStream('mock:nordstar');
    expect(stream.streamUrl).toMatch(/\.m3u8$/);
    expect(stream.creatorName).toBe('nordstar');
    expect(stream.platformId).toBe('mock-platform');
    expect(stream.qualityOptions?.length).toBeGreaterThan(0);
  });

  it('runs health checks', async () => {
    const health = await manager.checkHealth('mock-platform');
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('validates and persists plugin settings', async () => {
    const schema = manager.getSettingsSchema('mock-platform');
    expect(Object.keys(schema)).toContain('defaultQuality');

    const defaults = manager.getPluginSettings('mock-platform');
    expect(defaults['defaultQuality']).toBe('best');

    await manager.setPluginSettings('mock-platform', {
      defaultQuality: '720p',
      notifyWhenLive: false,
      refreshRateMinutes: 10,
    });
    expect(manager.getPluginSettings('mock-platform')['defaultQuality']).toBe('720p');

    await expect(
      manager.setPluginSettings('mock-platform', { refreshRateMinutes: 999 }),
    ).rejects.toThrow();
  });

  it('disables and re-enables the plugin', async () => {
    await manager.disable('mock-platform');
    expect(manager.get('mock-platform')!.status.state).toBe('disabled');
    expect(manager.get('mock-platform')!.instance).toBeNull();

    await manager.enable('mock-platform');
    expect(manager.get('mock-platform')!.status.state).toBe('ready');
    expect(manager.get('mock-platform')!.instance).not.toBeNull();
  });

  it('removes the plugin', async () => {
    await manager.remove('mock-platform');
    expect(manager.list()).toHaveLength(0);
    expect(events.some((event) => event.type === 'removed')).toBe(true);
  });
});
