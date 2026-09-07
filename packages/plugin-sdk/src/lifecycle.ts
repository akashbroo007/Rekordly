import type { AppError } from '@rekordly/shared';

export const PLUGIN_LIFECYCLE_STATES = [
  'installed',
  'loading',
  'loaded',
  'initializing',
  'ready',
  'error',
  'disabled',
  'uninstalled',
] as const;

export type PluginLifecycleState = (typeof PLUGIN_LIFECYCLE_STATES)[number];

export interface PluginStatus {
  state: PluginLifecycleState;
  error?: AppError;
  lastErrorAt?: string;
}
