import { PLUGIN_PERMISSIONS, type PluginPermissionId } from './permissions';

export const PLUGIN_CAPABILITIES = {
  AUTH: 'auth',
  CREATOR_SEARCH: 'creator-search',
  LIVE_DETECTION: 'live-detection',
  STREAM_EXTRACTION: 'stream-extraction',
  SETTINGS: 'settings',
  HEALTH_CHECK: 'health-check',
  METADATA: 'metadata',
} as const;

export type PluginCapabilityId = (typeof PLUGIN_CAPABILITIES)[keyof typeof PLUGIN_CAPABILITIES];

export interface PluginCapabilityDef {
  id: PluginCapabilityId;
  label: string;
  description: string;
  /** Permissions the plugin must hold to use this capability. */
  requiredPermissions: readonly PluginPermissionId[];
}

export const PLUGIN_CAPABILITY_DEFS: readonly PluginCapabilityDef[] = [
  {
    id: PLUGIN_CAPABILITIES.AUTH,
    label: 'Authentication',
    description: 'Log in and manage session cookies.',
    requiredPermissions: [PLUGIN_PERMISSIONS.NETWORK, PLUGIN_PERMISSIONS.COOKIES],
  },
  {
    id: PLUGIN_CAPABILITIES.CREATOR_SEARCH,
    label: 'Creator Search',
    description: 'Search for creators on the platform.',
    requiredPermissions: [PLUGIN_PERMISSIONS.NETWORK],
  },
  {
    id: PLUGIN_CAPABILITIES.LIVE_DETECTION,
    label: 'Live Detection',
    description: 'Detect whether a creator is live.',
    requiredPermissions: [PLUGIN_PERMISSIONS.NETWORK],
  },
  {
    id: PLUGIN_CAPABILITIES.STREAM_EXTRACTION,
    label: 'Stream Extraction',
    description: 'Extract playable stream URLs.',
    requiredPermissions: [PLUGIN_PERMISSIONS.NETWORK, PLUGIN_PERMISSIONS.COOKIES],
  },
  {
    id: PLUGIN_CAPABILITIES.SETTINGS,
    label: 'Plugin Settings',
    description: 'Provide platform-specific settings.',
    requiredPermissions: [],
  },
  {
    id: PLUGIN_CAPABILITIES.HEALTH_CHECK,
    label: 'Health Check',
    description: 'Report platform reachability and session state.',
    requiredPermissions: [PLUGIN_PERMISSIONS.NETWORK],
  },
  {
    id: PLUGIN_CAPABILITIES.METADATA,
    label: 'Metadata',
    description: 'Provide rich metadata for creators.',
    requiredPermissions: [PLUGIN_PERMISSIONS.NETWORK],
  },
];

export function getCapabilityDef(id: PluginCapabilityId): PluginCapabilityDef | undefined {
  return PLUGIN_CAPABILITY_DEFS.find((def) => def.id === id);
}
