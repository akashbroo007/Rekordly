import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { Logger } from '@rekordly/shared';
import type { Plugin, PluginManifest } from '@rekordly/plugin-sdk';
import { parsePluginManifest } from '@rekordly/plugin-sdk';
import { pluginError } from './helpers';

export interface DiscoveredPlugin {
  /** Directory containing manifest.json. */
  dir: string;
  manifest: PluginManifest;
}

const MANIFEST_FILE = 'manifest.json';

/**
 * Node require, available in both CJS builds and ESM test runners.
 * The anchor path only matters for specifier resolution; plugins are always
 * loaded by absolute path.
 */
const pluginRequire = createRequire(join(process.cwd(), 'plugin-loader.js'));

/** Compares semver strings; returns <0, 0, >0 (missing parts default to 0). */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v.split('.').map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isNaN(n) ? 0 : n;
    });
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function isVersionCompatible(minAppVersion: string, appVersion: string): boolean {
  return compareSemver(minAppVersion, appVersion) <= 0;
}

/**
 * Plugin discovery and loading.
 * Discovery scans directories for folders containing a valid manifest.json;
 * loading requires the entry module (CJS build, per repo convention) with the
 * require cache busted so reloads pick up new builds (hot reload).
 */
export class PluginLoader {
  constructor(private readonly logger: Logger) {}

  discover(scanDir: string): DiscoveredPlugin[] {
    if (!existsSync(scanDir)) {
      return [];
    }
    const result: DiscoveredPlugin[] = [];
    for (const entry of readdirSync(scanDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }
      const dir = join(scanDir, entry.name);
      if (!existsSync(join(dir, MANIFEST_FILE))) {
        continue;
      }
      try {
        result.push({ dir, manifest: this.readManifest(dir) });
      } catch (error) {
        this.logger.error({ dir, error }, 'skipping plugin with invalid manifest');
      }
    }
    return result;
  }

  readManifest(dir: string): PluginManifest {
    const file = join(dir, MANIFEST_FILE);
    try {
      return parsePluginManifest(JSON.parse(readFileSync(file, 'utf8')) as unknown);
    } catch (error) {
      throw pluginError('PLUGIN_MANIFEST_INVALID', `Invalid manifest at ${file}`, { cause: error });
    }
  }

  /** Loads (or reloads) the plugin entry, always from disk. */
  load(discovered: DiscoveredPlugin): Plugin {
    const entry = join(discovered.dir, discovered.manifest.entry);
    if (!existsSync(entry)) {
      throw pluginError('PLUGIN_ENTRY_NOT_FOUND', `Plugin entry not found: ${entry}`);
    }

    let loaded: unknown;
    try {
      const resolved = pluginRequire.resolve(entry);
      delete pluginRequire.cache[resolved];
      loaded = pluginRequire(resolved);
    } catch (error) {
      throw pluginError('PLUGIN_LOAD_FAILED', `Failed to load plugin entry: ${entry}`, {
        cause: error,
      });
    }

    const candidate = (loaded as { default?: unknown }).default ?? loaded;
    if (!isPlugin(candidate)) {
      throw pluginError(
        'PLUGIN_INVALID_EXPORT',
        'Plugin entry must export a valid Plugin (use definePlugin).',
      );
    }
    return candidate;
  }
}

function isPlugin(value: unknown): value is Plugin {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Plugin>;
  return (
    typeof candidate.initialize === 'function' &&
    typeof candidate.start === 'function' &&
    typeof candidate.stop === 'function' &&
    typeof candidate.cleanup === 'function' &&
    typeof candidate.capabilities === 'object' &&
    candidate.capabilities !== null
  );
}
