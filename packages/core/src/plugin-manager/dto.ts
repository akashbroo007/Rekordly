import type { PluginInfoDto, PluginDiagnosticsDto } from '@rekordly/shared';
import type { ManagedPlugin } from './manager';

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
    minAppVersion: manifest.minAppVersion,
    state: managed.status.state,
    enabled: managed.record.enabled,
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
