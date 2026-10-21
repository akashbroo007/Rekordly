/**
 * Plugins page — the single source of truth for derived plugin state.
 *
 * Every status the UI shows (Active / Needs setup / Disabled / Error /
 * Update available) is computed HERE from existing IPC data — no plugin
 * loading, enabling, updating or diagnostics logic is touched, and no data
 * models changed. Row/card/drawer/badge components consume the resulting
 * `PluginViewModel` so they stay presentational.
 *
 * Reuses the shared platform color config map (components/platform-config)
 * so the plugin tiles tint exactly like the platform dots on the Creators
 * and Recordings pages.
 */
import { useEffect, useState } from 'react';
import { platformColor } from '../../components/platform-config';
import type { PluginInfoDto } from '@rekordly/shared/contracts';

// --- derived status ----------------------------------------------------------

/**
 * The five UI states plus the transient warm-up state. `needs-setup`,
 * `error` and `update-available` are attention states → they render a
 * badge; `active` renders a small green dot only; `disabled` renders a
 * clearly greyed card + grey chip; `starting` pulses while loading.
 */
export type PluginAttention =
  | 'active'
  | 'needs-setup'
  | 'disabled'
  | 'error'
  | 'update-available'
  | 'starting';

export type PluginPrimaryAction = 'finish-setup' | 'update' | 'settings';

export interface PluginStatusContext {
  /**
   * Required plugin settings still unconfigured (labels, e.g. "Client-ID").
   * Drives the amber "Needs setup" state — required keys with a stored
   * value mean the plugin is set up.
   */
  missingRequired?: string[];
  /**
   * Newest known version for the plugin, when an update source provides
   * one. The current plugin IPC exposes no upstream version feed, so this
   * stays undefined in practice and plugins read "Up to date" — the
   * derivation is fully wired for when a source exists.
   */
  latestVersion?: string;
}

export interface PluginStatusInfo {
  attention: PluginAttention;
  /** Attention states render a labelled badge; healthy shows a dot only. */
  needsAttention: boolean;
  primaryAction: PluginPrimaryAction;
  missingRequired: string[];
  latestVersion?: string;
}

/** True when `latestVersion` is strictly newer than the installed version. */
export function isNewerVersion(installed: string, latest: string | undefined): boolean {
  if (latest === undefined) return false;
  const parse = (version: string): number[] =>
    version.split('.').map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isNaN(n) ? 0 : n;
    });
  const left = parse(installed);
  const right = parse(latest);
  for (let i = 0; i < 3; i += 1) {
    const diff = (right[i] ?? 0) - (left[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/**
 * THE status derivation. Priority (top wins):
 *   disabled → error → starting → needs setup → update available → active.
 */
export function derivePluginStatus(
  plugin: PluginInfoDto,
  context: PluginStatusContext = {},
): PluginStatusInfo {
  const missingRequired = context.missingRequired ?? [];
  const newer = isNewerVersion(plugin.version, context.latestVersion);

  if (!plugin.enabled) {
    return { attention: 'disabled', needsAttention: false, primaryAction: 'settings', missingRequired, latestVersion: context.latestVersion };
  }
  if (plugin.state === 'error' || plugin.lastError !== undefined) {
    return { attention: 'error', needsAttention: true, primaryAction: 'settings', missingRequired, latestVersion: context.latestVersion };
  }
  if (plugin.state === 'loading' || plugin.state === 'initializing' || plugin.state === 'installed' || plugin.state === 'loaded') {
    // Warm-up: entry loaded but start not finished — a pulsing info badge.
    return { attention: 'starting', needsAttention: false, primaryAction: 'settings', missingRequired, latestVersion: context.latestVersion };
  }
  if (missingRequired.length > 0) {
    // Required credentials/keys are not configured — never show green "ready".
    return { attention: 'needs-setup', needsAttention: true, primaryAction: 'finish-setup', missingRequired, latestVersion: context.latestVersion };
  }
  if (newer) {
    return { attention: 'update-available', needsAttention: true, primaryAction: 'update', missingRequired, latestVersion: context.latestVersion };
  }
  return { attention: 'active', needsAttention: false, primaryAction: 'settings', missingRequired, latestVersion: context.latestVersion };
}

/** Sort rank so plugins needing attention float to the top. */
const ATTENTION_RANK: Record<PluginAttention, number> = {
  error: 0,
  'needs-setup': 1,
  'update-available': 2,
  disabled: 3,
  starting: 3,
  active: 4,
};

export function attentionRank(attention: PluginAttention): number {
  return ATTENTION_RANK[attention];
}

// --- view model ---------------------------------------------------------------

export interface PluginViewModel {
  plugin: PluginInfoDto;
  status: PluginStatusInfo;
  /** Creators on this platform (the Creators page list is the source of truth). */
  monitoredCount: number;
  /** Newest monitoring check across the platform's jobs (epoch ms, null = never). */
  lastCheckedAt: number | null;
  isDeveloper: boolean;
  /** Capability gaps worth surfacing on the row (see CAPABILITY_EXCEPTIONS). */
  exceptions: string[];
}

export interface PluginViewModelContext {
  monitoredCount?: number;
  lastCheckedAt?: number | null;
  missingRequired?: string[];
  latestVersion?: string;
}

/** Builds the full presentational model for one plugin row/card/drawer. */
export function buildPluginViewModel(
  plugin: PluginInfoDto,
  context: PluginViewModelContext = {},
): PluginViewModel {
  const status = derivePluginStatus(plugin, context);
  return {
    plugin,
    status,
    monitoredCount: context.monitoredCount ?? 0,
    lastCheckedAt: context.lastCheckedAt ?? null,
    isDeveloper: isDeveloperPlugin(plugin.id),
    exceptions: capabilityExceptions(plugin.capabilities),
  };
}

// --- developer (example) plugins ---------------------------------------------

/**
 * ponytail: dev/example platforms ids — mirrors the platform color config
 * map pattern. These show a "Developer" chip and hide behind the toolbar's
 * "Show developer plugins" toggle.
 */
export const DEVELOPER_PLUGIN_IDS: readonly string[] = ['mock-platform'];

export function isDeveloperPlugin(pluginId: string): boolean {
  return DEVELOPER_PLUGIN_IDS.includes(pluginId);
}

// --- capabilities -------------------------------------------------------------

export interface CapabilityInfo {
  capability: string;
  label: string;
  /** Tooltip text used across rows and the details drawer. */
  description: string;
}

/** Full capability catalog — the details drawer renders this as a checklist. */
export const CAPABILITY_INFO: readonly CapabilityInfo[] = [
  { capability: 'auth', label: 'Login', description: 'Can use platform accounts or sessions for logged-in access.' },
  { capability: 'creator-search', label: 'Creator search', description: 'Search the platform and add creators from inside Rekordly.' },
  { capability: 'live-detection', label: 'Live status', description: 'Detects when a monitored creator goes live.' },
  { capability: 'stream-extraction', label: 'Stream recording', description: 'Resolves the live stream so Rekordly can record it.' },
  { capability: 'metadata', label: 'Metadata', description: 'Enriches creators and recordings with platform metadata.' },
  { capability: 'settings', label: 'Settings', description: 'Exposes configurable settings on this page.' },
  { capability: 'health-check', label: 'Health check', description: 'Reports plugin health in Diagnostics.' },
];

export function capabilityLabel(capability: string): string {
  return CAPABILITY_INFO.find((info) => info.capability === capability)?.label ?? capability;
}

export function capabilityDescription(capability: string): string {
  return CAPABILITY_INFO.find((info) => info.capability === capability)?.description ?? 'Plugin-declared capability.';
}

/**
 * Capabilities most plugins (and every recording-capable platform) provide;
 * gaps between this baseline and the manifest surface as compact exception
 * chips on the row (e.g. "No login support") instead of 10 wall-of-tags.
 */
const CAPABILITY_EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  ['auth', 'No login support'],
  ['creator-search', 'No creator search'],
  ['live-detection', 'No live detection'],
  ['stream-extraction', 'No stream recording'],
]);

export function capabilityExceptions(capabilities: readonly string[]): string[] {
  const declared = new Set(capabilities);
  const exceptions: string[] = [];
  for (const [capability, label] of CAPABILITY_EXCEPTIONS) {
    if (!declared.has(capability)) exceptions.push(label);
  }
  return exceptions;
}

// --- permissions --------------------------------------------------------------

export interface PermissionInfo {
  permission: string;
  label: string;
  description: string;
}

export const PERMISSION_INFO: readonly PermissionInfo[] = [
  { permission: 'network', label: 'Network', description: 'Makes outbound requests to the platform.' },
  { permission: 'storage', label: 'Storage', description: 'Writes files (caches, settings, data).' },
  { permission: 'cookies', label: 'Cookies', description: 'Accesses platform cookies for sessions.' },
  { permission: 'notifications', label: 'Notifications', description: 'Emits app notifications.' },
  { permission: 'recording', label: 'Recording', description: 'Feeds live streams to the recorder.' },
];

export function permissionLabel(permission: string): string {
  return PERMISSION_INFO.find((info) => info.permission === permission)?.label ?? permission;
}

export function permissionDescription(permission: string): string {
  return PERMISSION_INFO.find((info) => info.permission === permission)?.description ?? 'Permission granted at install.';
}

// --- formatting ---------------------------------------------------------------

/** "2m ago" / "3h ago" / "5d ago" / "just now" — fresh via useTicker. */
export function formatRelativeAgo(timestamp: number | null | undefined, now: number): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) {
    return 'Never checked';
  }
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/**
 * ponytail: computed-required-settings info per plugin — the renderer
 * aggregates existing read-only IPC (settings schema + stored values) into
 * one cache entry keyed by the plugin id list.
 */
export interface PluginSetupCheck {
  /** Labels of required settings that have no stored value yet. */
  missing: string[];
}

export function setupCheckKey(plugins: readonly PluginInfoDto[]): string {
  return plugins.map((plugin) => plugin.id).join('|');
}

/** Re-renders its owner every `intervalMs` — used for relative timestamps. */
export function useTicker(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Brand tint for a plugin id — the shared config map, exported for tiles. */
export function pluginBrandColor(pluginId: string): string {
  return platformColor(pluginId);
}

// --- required-setting probes (shared picker/setup surfaces) -------------------

/** A required setting counts as configured when any stored value exists. */
export function hasSettingValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  // Booleans/select values are explicit choices — they count as configured.
  return true;
}

/** "clientSecret" → "Client Secret" for the Needs-setup surface. */
export function prettySettingKey(key: string): string {
  return key
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
}

/**
 * ponytail: shared read-only aggregate over the existing per-plugin IPC
 * (settings schema + stored values) — keyed by the plugin id list. Used by
 * the Plugins page and any dropdown that lists plugins (Add Creator), so a
 * needs-setup plugin can carry its reason + "Set up" action into pickers.
 */
export function usePluginSetupChecks(
  plugins: readonly PluginInfoDto[] | undefined,
): Record<string, PluginSetupCheck> {
  const [checks, setChecks] = useState<Record<string, PluginSetupCheck>>({});
  const idsKey = setupCheckKey(plugins ?? []);

  useEffect(() => {
    const list = plugins ?? [];
    if (list.length === 0) return;
    let cancelled = false;
    void (async () => {
      const relevant = list.filter(
        (plugin) => plugin.enabled && plugin.state !== 'error' && plugin.lastError === undefined,
      );
      const entries = await Promise.all(
        relevant.map(async (plugin): Promise<[string, PluginSetupCheck]> => {
          try {
            const [schema, values] = await Promise.all([
              window.desktop.plugins.getSettingsSchema(plugin.id).catch(() => []),
              window.desktop.plugins.getSettings(plugin.id).catch(() => ({})),
            ]);
            const missing = (schema as { key: string; required?: boolean; type?: string }[])
              .filter((def) => def.required === true && !hasSettingValue((values as Record<string, unknown>)[def.key]))
              .map((def) => prettySettingKey(def.key));
            return [plugin.id, { missing } satisfies PluginSetupCheck];
          } catch {
            // A broken schema fetch must never break the picker/page.
            return [plugin.id, { missing: [] } satisfies PluginSetupCheck] as [string, PluginSetupCheck];
          }
        }),
      );
      if (!cancelled) setChecks(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return checks;
}
