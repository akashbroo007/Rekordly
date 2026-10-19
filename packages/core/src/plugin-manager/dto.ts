import type { PluginInfoDto, PluginDiagnosticsDto } from '@rekordly/shared';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ManagedPlugin } from './manager';

/**
 * Local plugin icon (manifest.icon) as a renderer-loadable URL through the
 * app's sf-media:// file protocol — plugins live on disk (resources/plugins
 * or userData/plugins), the sandboxed renderer cannot use file:// URLs.
 * Undefined when the manifest declares none or the file is missing: the
 * plugin tile then falls back to the usual favicon chain.
 */
function pluginIconUrl(managed: ManagedPlugin): string | undefined {
  const iconPath = managed.record.manifest.icon;
  if (iconPath === undefined || iconPath === '') return undefined;
  const absolute = join(managed.discovered.dir, iconPath);
  if (!existsSync(absolute)) return undefined;
  // Same shaping the media dialog uses for local recordings.
  return `sf-media:///${absolute.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

/** Maps managed plugins to the IPC DTO consumed by the renderer. */
export function toPluginInfo(managed: ManagedPlugin): PluginInfoDto {
  const manifest = managed.record.manifest;
  return {
    id: managed.record.id,
    name: managed.record.name,
    version: managed.record.version,
    description: manifest.description,
    author: manifest.author,
    license: manifest.license,
    homepage: manifest.homepage,
    setupHint: manifest.setupHint,
    iconUrl: pluginIconUrl(managed),
    minAppVersion: manifest.minAppVersion,
    state: managed.status.state,
    enabled: managed.record.enabled,
    streamTypes: manifest.streamTypes,
    capabilities: manifest.capabilities,
    permissionsRequested: manifest.permissions,
    permissionsGranted: managed.record.permissionsGranted,
    health:
      managed.health === undefined
        ? undefined
        : {
            healthy: managed.health.healthy,
            message: managed.health.message,
            latencyMs: managed.health.latencyMs,
            checkedAt: managed.health.checkedAt,
          },
    lastError:
      managed.lastError === undefined
        ? undefined
        : { code: managed.lastError.code, message: managed.lastError.message },
    installedAt: managed.record.installedAt,
    updatedAt: managed.record.updatedAt,
  };
}

export interface PluginDiagnosticsResult {
  id: string;
  state: string;
  version: string;
  entry: string;
  installPath: string;
  dataDir: string;
  healthy: boolean;
  lastError?: { code: string; message: string };
  lastHealthCheck?: string;
}

export function toPluginDiagnostics(result: PluginDiagnosticsResult): PluginDiagnosticsDto {
  return {
    id: result.id,
    state: result.state as PluginDiagnosticsDto['state'],
    version: result.version,
    entry: result.entry,
    installPath: result.installPath,
    dataDir: result.dataDir,
    healthy: result.healthy,
    lastError: result.lastError,
    lastHealthCheck: result.lastHealthCheck,
  };
}
