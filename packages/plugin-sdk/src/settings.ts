import type { PluginSettingValues, SettingDef } from './types';

/**
 * Settings storage handed to every plugin through its context.
 * Backed by the plugin_settings table; keyed per plugin.
 */
export interface PluginSettingsApi {
  get<T extends string | number | boolean>(key: string): T | undefined;
  get(key: string): string | number | boolean | undefined;
  set(key: string, value: string | number | boolean): Promise<void>;
  getAll(): Promise<PluginSettingValues>;
  setAll(values: PluginSettingValues): Promise<void>;
  reset(): Promise<void>;
}

/** Optional capability: declare the settings this plugin exposes to users. */
export interface PluginSettingsCapability {
  /** Static definitions rendered as a form in the Plugin Manager UI. */
  getSchema(): Record<string, SettingDef>;
  /** Validate user input before it is persisted. */
  validate(values: PluginSettingValues): Promise<{ valid: boolean; errors?: Record<string, string> }>;
}
