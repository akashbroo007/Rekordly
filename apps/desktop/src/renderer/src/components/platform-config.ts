/**
 * ponytail: brand-tinted platform colors for badges and dots across the
 * creators AND recordings pages (cards, filter dropdown, rows). Single
 * config map — add a plugin id here and every platform indicator picks
 * the tint up automatically. Unknown plugins fall back to a neutral grey.
 */
export interface PlatformBadgeConfig {
  /** Brand-tinted hex used for the 6px dot inside the platform badge. */
  color: string;
}

export const PLATFORM_CONFIG: Record<string, PlatformBadgeConfig> = {
  bongacams: { color: '#ff5a3c' },
  cam4: { color: '#fb923c' },
  camsoda: { color: '#f472b6' },
  chaturbate: { color: '#ff5c1f' },
  dreamcam: { color: '#ff4d8d' },
  example: { color: '#9ca3af' },
  jerkmate: { color: '#e0455e' },
  kick: { color: '#53fc18' },
  myfreecams: { color: '#22d3ee' },
  rumble: { color: '#0dbf43' },
  streamate: { color: '#38bdf8' },
  stripchat: { color: '#e7245e' },
  twitch: { color: '#9147ff' },
  youtube: { color: '#ff0033' },
};

export const DEFAULT_PLATFORM_COLOR = '#8b93a1';

/** Brand tint for a plugin id, falling back to neutral grey for unknowns. */
export function platformColor(pluginId: string): string {
  return PLATFORM_CONFIG[pluginId]?.color ?? DEFAULT_PLATFORM_COLOR;
}

// --- Upload provider tiles -----------------------------------------------------

/**
 * Upload-provider brand tints for the Uploads page (picker tiles, info card,
 * row meta chips, provider filter dots). Same single-config pattern as the
 * platform colors above — the Uploads page reads it through providerColor()
 * so every provider indicator shares one hue per provider. Unknown providers
 * fall back to the same neutral grey.
 */
export const UPLOAD_PROVIDER_CONFIG: Record<string, PlatformBadgeConfig> = {
  catbox: { color: '#8a8ff0' },
  'google-drive': { color: '#34a853' },
  gofile: { color: '#2ea3dd' },
  mixdrop: { color: '#fd6a3d' },
};

/** Brand tint for an upload provider id, neutral grey fallback for unknowns. */
export function providerColor(providerId: string): string {
  return UPLOAD_PROVIDER_CONFIG[providerId]?.color ?? DEFAULT_PLATFORM_COLOR;
}
