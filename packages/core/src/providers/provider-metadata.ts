export interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  requiresAccount: boolean;
  requiresApiKey: boolean;
  maxFileSize: number | null;
  storageQuota: string;
  downloadSpeed: 'unthrottled' | 'throttled';
  fileExpiry: string;
  adsOnDownload: boolean;
  pros: string[];
  cons: string[];
  setupInstructions: string[];
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PROVIDER_METADATA: Record<string, ProviderMeta> = {
  gofile: {
    id: 'gofile',
    name: 'Gofile',
    description: 'Free file hosting with no account required. Uploads are anonymous and fast.',
    requiresAccount: false,
    requiresApiKey: false,
    maxFileSize: null,
    storageQuota: 'Unlimited',
    downloadSpeed: 'throttled',
    fileExpiry: '10 days of inactivity',
    adsOnDownload: true,
    pros: [
      'No account or API key required',
      'Unlimited file size and storage',
      'Simple and fast to use',
    ],
    cons: [
      'Download speeds are throttled for free users',
      'Files expire after 10 days of inactivity',
      'Ads on download pages',
      'Monthly traffic cap (shared IP counts)',
    ],
    setupInstructions: [
      'No setup required — Gofile works out of the box.',
      'Optional: Create a Gofile account for longer file retention.',
    ],
  },

  mixdrop: {
    id: 'mixdrop',
    name: 'MixDrop',
    description: 'Unlimited file hosting with unthrottled downloads. Requires a free account.',
    requiresAccount: true,
    requiresApiKey: true,
    maxFileSize: null,
    storageQuota: 'Unlimited',
    downloadSpeed: 'unthrottled',
    fileExpiry: '60 days of inactivity',
    adsOnDownload: true,
    pros: [
      'Unthrottled download speeds',
      'Unlimited file size and storage',
      'Simple REST API',
      'File management and folder organization',
    ],
    cons: [
      'Requires account with API key',
      'Files expire after 60 days of inactivity',
      'Ads on download pages',
    ],
    setupInstructions: [
      '1. Create a free account at https://mixdrop.ag',
      '2. Log in and go to your Account page',
      '3. Copy your API Email and API Key',
      '4. Paste them below and click Save',
    ],
  },

  'google-drive': {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Reliable cloud storage with 15 GB free. Files never expire and downloads are fast.',
    requiresAccount: true,
    requiresApiKey: true,
    maxFileSize: 5 * 1024 * GB,
    storageQuota: '15 GB free',
    downloadSpeed: 'unthrottled',
    fileExpiry: 'Never',
    adsOnDownload: false,
    pros: [
      '15 GB free storage',
      'Unthrottled download speeds',
      'Files never expire',
      'No ads on downloads',
      'Well-known and trusted service',
    ],
    cons: [
      'Requires Google account and OAuth setup',
      '15 GB storage limit (shared across Google services)',
      'Complex initial setup (Google Cloud Console)',
    ],
    setupInstructions: [
      '1. Go to https://console.cloud.google.com',
      '2. Create a new project (or select existing)',
      '3. Enable the Google Drive API for your project',
      '4. Go to Credentials > Create Credentials > OAuth 2.0 Client ID',
      '5. Application type: Desktop app',
      '6. Copy the Client ID and Client Secret',
      '7. IMPORTANT: While the app is unverified, open "APIs & Services" > "OAuth consent screen" > "Audience" and add YOUR Google account under "Test users" — otherwise Google blocks sign-in with "Access blocked: not completed verification"',
      '8. Paste the Client ID and Client Secret here, then click "Connect Google Account" — your browser opens to approve access',
    ],
  },

  catbox: {
    id: 'catbox',
    name: 'Catbox.moe',
    description: 'Free permanent file hosting with no ads. Simple and reliable for small files.',
    requiresAccount: false,
    requiresApiKey: false,
    maxFileSize: 200 * MB,
    storageQuota: 'Unlimited',
    downloadSpeed: 'unthrottled',
    fileExpiry: 'Never',
    adsOnDownload: false,
    pros: [
      'No account required (anonymous uploads)',
      'Files never expire (permanent storage)',
      'Unthrottled download speeds',
      'No ads on download pages',
      'Simple and reliable',
    ],
    cons: [
      '200 MB max file size per upload',
      'Restricted file types (no .exe, .jar, .doc*)',
      'GIF files limited to 20 MB',
    ],
    setupInstructions: [
      'No setup required — Catbox works out of the box.',
      'Optional: Create a Catbox account for file management.',
    ],
  },
};

export function getProviderMeta(id: string): ProviderMeta | undefined {
  return PROVIDER_METADATA[id];
}

export function getAllProviderMeta(): ProviderMeta[] {
  return Object.values(PROVIDER_METADATA);
}
