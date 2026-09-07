import type { PluginRepo } from '@rekordly/database';
import type { Logger } from '@rekordly/shared';
import type { PluginLogger, PluginSettingsApi, PluginSettingValues } from '@rekordly/plugin-sdk';
import { AppError } from '@rekordly/shared';

/** Wraps the main logger for a single plugin, scoping all entries. */
export function createPluginLogger(parent: Logger, pluginId: string): PluginLogger {
  const child = parent.child({ plugin: pluginId });
  const bind = (data: unknown): Record<string, unknown> =>
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : { data };
  return {
    debug: (message, data) => child.debug(bind(data), message),
    info: (message, data) => child.info(bind(data), message),
    warn: (message, data) => child.warn(bind(data), message),
    error: (message, data) => child.error(bind(data), message),
  };
}

/** Settings storage handed to plugins; backed by the plugin_settings table. */
export function createPluginSettingsApi(repo: PluginRepo, pluginId: string): PluginSettingsApi {
  return {
    get<T extends string | number | boolean>(key: string): T | undefined {
      return repo.getSetting(pluginId, key) as T | undefined;
    },
    async set(key: string, value: string | number | boolean): Promise<void> {
      repo.setSetting(pluginId, key, value);
    },
    async getAll(): Promise<PluginSettingValues> {
      return repo.getSettings(pluginId) as PluginSettingValues;
    },
    async setAll(values: PluginSettingValues): Promise<void> {
      for (const [key, value] of Object.entries(values)) {
        repo.setSetting(pluginId, key, value);
      }
    },
    async reset(): Promise<void> {
      for (const key of Object.keys(repo.getSettings(pluginId))) {
        repo.deleteSetting(pluginId, key);
      }
    },
  };
}

/** Structured error factory for plugin failures. */
export function pluginError(
  code: string,
  message: string,
  options: { recoverable?: boolean; cause?: unknown } = {},
): AppError {
  return new AppError({ code, message, recoverable: options.recoverable, cause: options.cause });
}

/** Rejects if `promise` does not settle within `ms` (lifecycle guard). */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}
