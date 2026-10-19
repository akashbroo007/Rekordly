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
  /**
   * ponytail: icon file bundled with the plugin (relative to the plugin
   * directory, e.g. "icon.png"). Served to the renderer through the local
   * sf-media:// protocol so marketplace-installed plugins show their real
   * logo without web favicon lookups. Absent = generic fallback chain.
   */
  icon: z.string().min(1).optional(),
  /** Path to the plugin entry module, relative to the plugin directory. */
  entry: z.string().min(1),
  /** Minimum app version the plugin is compatible with. */
  minAppVersion: z.string().regex(SEMVER, 'minAppVersion must be semver (x.y.z)'),
  capabilities: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  /**
   * ponytail: stream variants the site can broadcast, e.g. ["2d", "vr"] for
   * Dreamcam. Declaring more than one lets the Record dialog offer a stream
   * type dropdown; the host passes the user's pick to extractStream as a
   * hint. Absent = the plugin always yields one implicit stream type.
   */
  streamTypes: z.array(z.string().min(1)).optional(),
});

export type PluginManifest = z.infer<typeof PLUGIN_MANIFEST_SCHEMA>;

export function parsePluginManifest(input: unknown): PluginManifest {
  return PLUGIN_MANIFEST_SCHEMA.parse(input);
}
