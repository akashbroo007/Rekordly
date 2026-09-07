import type { AppError } from '@rekordly/shared';

/**
 * Plugin events emitted by the host Plugin Manager and consumed by
 * the UI, monitoring engine and diagnostics tooling.
 */

export const PLUGIN_EVENT_TYPES = [
  'loaded',
  'enabled',
  'disabled',
  'failed',
  'updated',
  'installed',
  'removed',
  'unloaded',
  'health-changed',
] as const;

export type PluginEventType = (typeof PLUGIN_EVENT_TYPES)[number];

export interface PluginEventMap {
  loaded: { pluginId: string; version: string };
  enabled: { pluginId: string };
  disabled: { pluginId: string };
  failed: { pluginId: string; error: AppError };
  updated: { pluginId: string; version: string };
  installed: { pluginId: string; version: string };
  removed: { pluginId: string };
  unloaded: { pluginId: string };
  'health-changed': { pluginId: string; healthy: boolean };
}

export type PluginEvent = {
  [K in PluginEventType]: { type: K } & PluginEventMap[K];
}[PluginEventType];

/** Typed publish/subscribe surface used by the host and plugin tooling. */
export interface PluginEventBus {
  on<K extends PluginEventType>(type: K, listener: (event: PluginEventMap[K]) => void): () => void;
  emit<K extends PluginEventType>(type: K, payload: PluginEventMap[K]): void;
}
