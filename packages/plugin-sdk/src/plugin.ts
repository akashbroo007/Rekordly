import type { StreamObject } from '@rekordly/shared';
import type { Agent } from 'node:http';
import type { PluginManifest } from './manifest';
import type { PluginStatus } from './lifecycle';
import type { PluginSettingsApi, PluginSettingsCapability } from './settings';
import type {
  AuthStatus,
  CreatorInfo,
  CreatorMetadata,
  CreatorSearchQuery,
  CreatorSearchResult,
  HealthStatus,
  LiveStatus,
} from './types';

/** Logger surface handed to plugins; the host wires it to centralized pino logging. */
export interface PluginLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

/**
 * ponytail: host-owned outbound proxy surface. Some sites are unreachable
 * from certain networks (ISP/DNS blocks are regional — never a property of
 * the plugin itself). When the user enables the secure proxy for a creator,
 * the host runs an embedded proxy and hands plugins an http.Agent (same
 * process, by reference) so their HTTP calls route through it; `null` means
 * "go direct". `getProxyHttpUrl` returns a URL string for CHILD processes
 * (ffmpeg/yt-dlp cannot consume an agent object).
 */
export interface PluginNetworkApi {
  /**
   * Make sure the host proxy is available for this creator identifier
   * (may download and bootstrap the proxy on first use — await before
   * building requests). Safe to call when no proxy is configured.
   */
  ensureProxy(identifier: string): Promise<void>;
  /** Agent for Node http/https requests, or null to go direct. */
  getProxyAgent(identifier: string): Agent | null;
  /** HTTP proxy URL for child processes, or null to go direct. */
  getProxyHttpUrl(identifier: string): string | null;
}

export interface PluginContext {
  manifest: PluginManifest;
  logger: PluginLogger;
  /** Writable directory owned by this plugin (persistent settings, caches). */
  dataDir: string;
  /** Read-only directory containing the installed plugin files. */
  manifestDir: string;
  /** Persisted per-plugin settings storage. */
  settings: PluginSettingsApi;
  /** Host-provided outbound proxy routing (optional — may be absent in tests). */
  network?: PluginNetworkApi;
}

/**
 * Optional capability implementations. A plugin declares which of these it
 * supports in its manifest `capabilities` array and implements the matching
 * member here. The host core never knows anything beyond these shapes.
 */
export interface PluginCapabilities {
  auth?: {
    getStatus(): Promise<AuthStatus>;
    login?(credentials?: Record<string, string>): Promise<void>;
    logout?(): Promise<void>;
  };
  creatorSearch?: {
    search(query: CreatorSearchQuery): Promise<CreatorSearchResult>;
    getCreator(identifier: string): Promise<CreatorInfo | null>;
  };
  liveDetection?: {
    /** `identifier` is the creator id previously returned by creatorSearch. */
    getLiveStatus(identifier: string): Promise<LiveStatus>;
  };
  streamExtraction?: {
    /** `identifier` is the creator id previously returned by creatorSearch. */
    extractStream(identifier: string): Promise<StreamObject>;
  };
  settings?: PluginSettingsCapability;
  healthCheck?: {
    check(): Promise<HealthStatus>;
  };
  metadata?: {
    getCreatorMetadata(identifier: string): Promise<CreatorMetadata>;
  };
}

/**
 * The contract every plugin implements.
 * Lifecycle order: initialize -> start -> stop -> cleanup.
 */
export interface Plugin {
  readonly manifest: PluginManifest;
  readonly status: PluginStatus;
  readonly capabilities: PluginCapabilities;
  initialize(context: PluginContext): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
}

/** Type-safe authoring helper: `export default definePlugin({ ... })`. */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}
