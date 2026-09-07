export const PLUGIN_PERMISSIONS = {
  NETWORK: 'network',
  STORAGE: 'storage',
  COOKIES: 'cookies',
  NOTIFICATIONS: 'notifications',
  RECORDING: 'recording',
} as const;

export type PluginPermissionId = (typeof PLUGIN_PERMISSIONS)[keyof typeof PLUGIN_PERMISSIONS];

export interface PluginPermissionDef {
  id: PluginPermissionId;
  label: string;
  description: string;
}

export const PLUGIN_PERMISSION_DEFS: readonly PluginPermissionDef[] = [
  {
    id: PLUGIN_PERMISSIONS.NETWORK,
    label: 'Network',
    description: 'Make requests to the platform and its APIs.',
  },
  {
    id: PLUGIN_PERMISSIONS.STORAGE,
    label: 'Storage',
    description: 'Read and write files inside the plugin data directory.',
  },
  {
    id: PLUGIN_PERMISSIONS.COOKIES,
    label: 'Cookies',
    description: 'Store and send session cookies.',
  },
  {
    id: PLUGIN_PERMISSIONS.NOTIFICATIONS,
    label: 'Notifications',
    description: 'Show desktop notifications.',
  },
  {
    id: PLUGIN_PERMISSIONS.RECORDING,
    label: 'Recording',
    description: 'Request recordings of extracted streams.',
  },
];
