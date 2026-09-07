import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { PluginRepo, PluginRecord } from '@rekordly/database';
import type { Logger } from '@rekordly/shared';
import { AppError } from '@rekordly/shared';
import type {
  HealthStatus,
  Plugin,
  PluginContext,
  PluginEventMap,
  PluginLifecycleState,
  PluginManifest,
  PluginSettingValues,
  PluginStatus,
  SettingDef,
} from '@rekordly/plugin-sdk';
import { getCapabilityDef, parsePluginManifest } from '@rekordly/plugin-sdk';
import { EventBus } from '../events/event-bus';
import { pluginDataDir } from '../fs/paths';
import type { NotificationService } from '../services/notification-service';
import { PluginLoader, isVersionCompatible, type DiscoveredPlugin } from './loader';
import { createPluginLogger, createPluginSettingsApi, pluginError, withTimeout } from './helpers';

const LIFECYCLE_TIMEOUT_MS = 10_000;

export interface ManagedPlugin {
  discovered: DiscoveredPlugin;
  record: PluginRecord & { manifest: PluginManifest };
  instance: Plugin | null;
  status: PluginStatus;
  health?: HealthStatus;
  lastError?: AppError;
}

export interface PluginManagerOptions {
  /** Directories scanned for plugins (installed dir first, then dev dirs). */
  searchDirs: string[];
  /** Where `install()` copies plugin folders. */
  installDir: string;
  /** Root of per-plugin writable data directories. */
  dataRootDir: string;
  appVersion: string;
  repo: PluginRepo;
  logger: Logger;
  notifications: NotificationService;
}

/**
 * Plugin Manager: owns discovery, lifecycle (load/start/stop/cleanup),
 * enable/disable/install/remove/update, permission enforcement, health
 * checks and diagnostics. Emits PluginEventBus events for the UI.
 */
export class PluginManager {
  private readonly loader: PluginLoader;
  private readonly bus = new EventBus<PluginEventMap>();
  private readonly plugins = new Map<string, ManagedPlugin>();
  private initialized = false;

  constructor(private readonly options: PluginManagerOptions) {
    this.loader = new PluginLoader(options.logger);
  }

  // --- PluginEventBus -------------------------------------------------------

  on<K extends keyof PluginEventMap>(type: K, listener: (payload: PluginEventMap[K]) => void): () => void {
    return this.bus.on(type, listener);
  }

  emit<K extends keyof PluginEventMap>(type: K, payload: PluginEventMap[K]): void {
    this.bus.emit(type, payload);
  }

  // --- Discovery / startup --------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    for (const dir of this.options.searchDirs) {
      for (const discovered of this.loader.discover(dir)) {
        this.registerDiscovered(discovered);
      }
    }
  }

  private registerDiscovered(discovered: DiscoveredPlugin): void {
    const existing = this.options.repo.get(discovered.manifest.id);
    const record: PluginRecord & { manifest: PluginManifest } =
      existing !== undefined
        ? { ...existing, manifest: parsePluginManifest(existing.manifest) }
        : {
            id: discovered.manifest.id,
            name: discovered.manifest.name,
            version: discovered.manifest.version,
            manifest: discovered.manifest,
            entry: discovered.manifest.entry,
            installPath: discovered.dir,
            enabled: true,
            // First run: bundled plugins start with their requested
            // permissions granted. Granular review arrives with the UI.
            permissionsGranted: [...discovered.manifest.permissions],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

    this.options.repo.upsert(record);
    const managed: ManagedPlugin = {
      discovered,
      record,
      instance: null,
      status: { state: record.enabled ? 'loading' : 'disabled' },
    };
    this.plugins.set(discovered.manifest.id, managed);

    if (record.enabled) {
      void this.startPlugin(managed);
    } else {
      this.options.logger.info({ pluginId: managed.record.id }, 'plugin registered (disabled)');
    }
  }

  // --- Lifecycle ------------------------------------------------------------

  private async loadPlugin(managed: ManagedPlugin): Promise<void> {
    if (!isVersionCompatible(managed.record.manifest.minAppVersion, this.options.appVersion)) {
      throw pluginError(
        'PLUGIN_VERSION_INCOMPATIBLE',
        `Requires app ${managed.record.manifest.minAppVersion}; running ${this.options.appVersion}`,
      );
    }

    this.assertPermissions(managed);
    managed.status = { state: 'loading' };

    const instance = this.loader.load(managed.discovered);
    managed.instance = instance;
    managed.status = { state: 'initializing' };

    const dataDir = join(pluginDataDir(this.options.dataRootDir, managed.record.id));
    mkdirSync(dataDir, { recursive: true });
    const context: PluginContext = {
      manifest: managed.record.manifest,
      logger: createPluginLogger(this.options.logger, managed.record.id),
      dataDir,
      manifestDir: managed.discovered.dir,
      settings: createPluginSettingsApi(this.options.repo, managed.record.id),
    };

    await withTimeout(instance.initialize(context), LIFECYCLE_TIMEOUT_MS, `initialize ${managed.record.id}`);
    managed.status = { state: 'loaded' };
    await withTimeout(instance.start(), LIFECYCLE_TIMEOUT_MS, `start ${managed.record.id}`);
    managed.status = { state: 'ready' };
  }

  private async startPlugin(managed: ManagedPlugin): Promise<void> {
    try {
      await this.loadPlugin(managed);
      this.options.logger.info({ pluginId: managed.record.id }, 'plugin started');
      this.emit('loaded', { pluginId: managed.record.id, version: managed.record.version });
    } catch (error) {
      managed.status = { state: 'error' };
      managed.lastError = toAppError(error);
      managed.instance = null;
      this.options.logger.error({ pluginId: managed.record.id, error }, 'plugin failed to start');
      this.emit('failed', { pluginId: managed.record.id, error: managed.lastError });
      this.options.notifications.send({
        level: 'error',
        title: `Plugin failed: ${managed.record.name}`,
        message: managed.lastError.message,
        data: { pluginId: managed.record.id },
      });
    }
  }

  private async stopPlugin(managed: ManagedPlugin): Promise<void> {
    const instance = managed.instance;
    managed.instance = null;
    if (instance === null) {
      return;
    }
    try {
      await withTimeout(instance.stop(), LIFECYCLE_TIMEOUT_MS, `stop ${managed.record.id}`);
      await withTimeout(instance.cleanup(), LIFECYCLE_TIMEOUT_MS, `cleanup ${managed.record.id}`);
    } catch (error) {
      this.options.logger.error({ pluginId: managed.record.id, error }, 'plugin cleanup failed');
    }
  }

  /** Stop + unload + fresh load from disk (hot reload preparation). */
  async reload(id: string): Promise<ManagedPlugin> {
    const managed = this.requireManaged(id);
    await this.stopPlugin(managed);
    managed.lastError = undefined;
    if (managed.record.enabled) {
      await this.startPlugin(managed);
    } else {
      managed.status = { state: 'disabled' };
    }
    return managed;
  }

  // --- Enable / disable -----------------------------------------------------

  async enable(id: string): Promise<ManagedPlugin> {
    const managed = this.requireManaged(id);
    this.grantRequestedPermissions(id);
    this.options.repo.setEnabled(id, true);
    managed.record.enabled = true;
    await this.startPlugin(managed);
    this.emit('enabled', { pluginId: id });
    return managed;
  }

  async disable(id: string): Promise<ManagedPlugin> {
    const managed = this.requireManaged(id);
    await this.stopPlugin(managed);
    managed.status = { state: 'disabled' };
    managed.lastError = undefined;
    this.options.repo.setEnabled(id, false);
    managed.record.enabled = false;
    this.emit('disabled', { pluginId: id });
    return managed;
  }

  // --- Install / remove / update -------------------------------------------

  /** Copies a plugin folder into the install dir and registers it. */
  async install(sourceDir: string): Promise<ManagedPlugin> {
    const manifest = this.loader.readManifest(sourceDir);
    const target = join(this.options.installDir, manifest.id);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
    }
    cpSync(sourceDir, target, { recursive: true, filter: (src) => !src.includes(`${sep}node_modules`) });
    const discovered = { dir: target, manifest };
    const managed: ManagedPlugin = {
      discovered,
      record: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        manifest,
        entry: manifest.entry,
        installPath: target,
        enabled: true,
        permissionsGranted: [...manifest.permissions],
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      instance: null,
      status: { state: 'loading' },
    };
    this.options.repo.upsert(managed.record);
    this.plugins.set(manifest.id, managed);
    this.emit('installed', { pluginId: manifest.id, version: manifest.version });
    this.options.notifications.send({
      level: 'info',
      title: `Plugin installed: ${manifest.name}`,
      message: `${manifest.name} v${manifest.version} is ready to use.`,
      data: { pluginId: manifest.id },
    });
    await this.startPlugin(managed);
    return managed;
  }

  async remove(id: string): Promise<void> {
    const managed = this.requireManaged(id);
    await this.stopPlugin(managed);
    rmSync(managed.record.installPath, { recursive: true, force: true });
    this.options.repo.remove(id);
    this.plugins.delete(id);
    this.emit('removed', { pluginId: id });
    this.options.notifications.send({
      level: 'info',
      title: 'Plugin removed',
      message: `${managed.record.name} was removed.`,
      data: { pluginId: id },
    });
  }

  /** Reloads the plugin from disk; emits `updated` when the version changed. */
  async update(id: string): Promise<ManagedPlugin> {
    const managed = this.requireManaged(id);
    const previous = managed.record.version;
    await this.reload(id);
    if (managed.record.version !== previous) {
      this.emit('updated', { pluginId: id, version: managed.record.version });
      this.options.notifications.send({
        level: 'info',
        title: `Plugin updated: ${managed.record.name}`,
        message: `${previous} → ${managed.record.version}`,
        data: { pluginId: id },
      });
    }
    return managed;
  }

  // --- Queries --------------------------------------------------------------

  list(): ManagedPlugin[] {
    return [...this.plugins.values()];
  }

  get(id: string): ManagedPlugin | undefined {
    return this.plugins.get(id);
  }

  // --- Permissions ----------------------------------------------------------

  /** Grants the requested permissions (review flow is a later feature). */
  grantRequestedPermissions(id: string): void {
    const managed = this.requireManaged(id);
    const granted = new Set(managed.record.permissionsGranted);
    for (const permission of managed.record.manifest.permissions) {
      granted.add(permission);
    }
    const next = [...granted];
    managed.record.permissionsGranted = next;
    this.options.repo.setPermissionsGranted(id, next);
  }

  /** Enforces that declared capabilities are covered by granted permissions. */
  private assertPermissions(managed: ManagedPlugin): void {
    const granted = new Set(managed.record.permissionsGranted);
    const missing = new Set<string>();
    for (const capability of managed.record.manifest.capabilities) {
      const def = getCapabilityDef(capability as Parameters<typeof getCapabilityDef>[0]);
      if (def === undefined) {
        continue;
      }
      for (const permission of def.requiredPermissions) {
        if (!granted.has(permission)) {
          missing.add(permission);
        }
      }
    }
    if (missing.size > 0) {
      throw pluginError(
        'PLUGIN_PERMISSIONS_DENIED',
        `Missing permissions: ${[...missing].join(', ')}. Enable the plugin to grant them.`,
      );
    }
  }

  // --- Health / diagnostics -------------------------------------------------

  async checkHealth(id: string): Promise<HealthStatus> {
    const managed = this.requireManaged(id);
    const instance = managed.instance;
    if (instance === null || instance.capabilities.healthCheck === undefined) {
      throw pluginError('PLUGIN_NO_HEALTH_CHECK', 'This plugin does not implement health checks.');
    }
    const started = Date.now();
    const result = await withTimeout(
      instance.capabilities.healthCheck.check(),
      LIFECYCLE_TIMEOUT_MS,
      `health ${id}`,
    );
    const health: HealthStatus = {
      ...result,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    };
    const changed = managed.health?.healthy !== health.healthy;
    managed.health = health;
    if (changed) {
      this.emit('health-changed', { pluginId: id, healthy: health.healthy });
    }
    return health;
  }

  getDiagnostics(id: string): {
    id: string;
    state: PluginLifecycleState;
    version: string;
    entry: string;
    installPath: string;
    dataDir: string;
    healthy: boolean;
    lastError?: AppError;
    lastHealthCheck?: string;
  } {
    const managed = this.requireManaged(id);
    return {
      id,
      state: managed.status.state,
      version: managed.record.version,
      entry: join(managed.discovered.dir, managed.record.entry),
      installPath: managed.record.installPath,
      dataDir: join(pluginDataDir(this.options.dataRootDir, id)),
      healthy: managed.health?.healthy ?? false,
      lastError: managed.lastError,
      lastHealthCheck: managed.health?.checkedAt,
    };
  }

  // --- Plugin settings ------------------------------------------------------

  getSettingsSchema(id: string): Record<string, SettingDef> {
    const managed = this.requireManaged(id);
    const capability = managed.instance?.capabilities.settings;
    if (capability === undefined) {
      throw pluginError('PLUGIN_NO_SETTINGS', 'This plugin does not expose settings.');
    }
    return capability.getSchema();
  }

  getPluginSettings(id: string): Record<string, unknown> {
    const schema = this.getSettingsSchema(id);
    const stored = this.options.repo.getSettings(id);
    const merged: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(schema)) {
      merged[key] = stored[key] ?? def.defaultValue;
    }
    return merged;
  }

  async setPluginSettings(id: string, values: PluginSettingValues): Promise<void> {
    const managed = this.requireManaged(id);
    const schema = this.getSettingsSchema(id);
    const capability = managed.instance?.capabilities.settings;
    const sanitized: PluginSettingValues = {};
    for (const key of Object.keys(schema)) {
      if (key in values && values[key] !== undefined) {
        sanitized[key] = values[key];
      }
    }
    if (capability !== undefined) {
      const validation = await capability.validate(sanitized);
      if (!validation.valid) {
        throw pluginError(
          'PLUGIN_SETTINGS_INVALID',
          Object.entries(validation.errors ?? {}).map(([k, v]) => `${k}: ${v}`).join('; '),
        );
      }
    }
    await createPluginSettingsApi(this.options.repo, id).setAll(sanitized);
    this.options.logger.info({ pluginId: id }, 'plugin settings updated');
  }

  // --- Internals ------------------------------------------------------------

  private requireManaged(id: string): ManagedPlugin {
    const managed = this.plugins.get(id);
    if (managed === undefined) {
      throw pluginError('PLUGIN_NOT_FOUND', `Unknown plugin: ${id}`);
    }
    return managed;
  }
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return pluginError('PLUGIN_UNKNOWN_ERROR', error instanceof Error ? error.message : String(error), {
    cause: error,
  });
}
