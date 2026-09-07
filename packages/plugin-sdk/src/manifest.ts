import { z } from 'zod';

const SEMVER = /^\d+\.\d+\.\d+$/;

export const PLUGIN_MANIFEST_SCHEMA = z.object({
  /** Unique stable identifier, lowercase alphanumeric with dashes. */
  id: z.string().regex(/^[a-z0-9-]+$/, 'plugin id must be lowercase alphanumeric with dashes'),
  name: z.string().min(1),
  version: z.string().regex(SEMVER, 'version must be semver (x.y.z)'),
  description: z.string().optional(),
  author: z.string().min(1),
  license: z.string().optional(),
  homepage: z.string().url().optional(),
  /** Short setup hint shown on the plugin card in the Plugins page. */
  setupHint: z.string().optional(),
  /** Path to the plugin entry module, relative to the plugin directory. */
  entry: z.string().min(1),
  /** Minimum app version the plugin is compatible with. */
  minAppVersion: z.string().regex(SEMVER, 'minAppVersion must be semver (x.y.z)'),
  capabilities: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
});

export type PluginManifest = z.infer<typeof PLUGIN_MANIFEST_SCHEMA>;

export function parsePluginManifest(input: unknown): PluginManifest {
  return PLUGIN_MANIFEST_SCHEMA.parse(input);
}
