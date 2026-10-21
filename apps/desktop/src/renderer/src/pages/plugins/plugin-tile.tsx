/**
 * PluginTile — the 40px platform tile that replaces the generic puzzle
 * icon, now with the platform's REAL site icon. Resolution order:
 *
 *   1. a bundled icon the plugin itself ships (iconUrl — local only),
 *   2. the site favicon, fetched automatically from public favicon
 *      services (DuckDuckGo, then Google's s2 mirror) — no per-plugin
 *      wiring: known platform ids map to their site domain directly, and
 *      any NEWLY ADDED plugin falls back to the web origin inside its
 *      manifest `homepage`, so third-party plugins get an icon for free
 *      (the bundled manifests all carry the generic Rekordly GitHub
 *      placeholder, so the id map answers for those),
 *   3. the brand-tinted initial tile (same PLATFORM_CONFIG color that
 *      drives the Creators/Recordings platform dots) when nothing
 *      resolves — unsupported id ("mock-platform"), offline, 404s.
 *
 * `dimmed` greys any state out for disabled plugins.
 */
import { useEffect, useState } from 'react';
import { pluginBrandColor } from './plugin-status';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** "Mock Platform" → "MP", "Twitch" → "T" — platform initial(s). */
export function pluginInitials(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return '';
  const first = words[0]!;
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}

/** Known plugin id → the platform's site domain (favicon source). */
const PLUGIN_SITES: Record<string, string> = {
  twitch: 'twitch.tv',
  youtube: 'youtube.com',
  kick: 'kick.com',
  rumble: 'rumble.com',
  chaturbate: 'chaturbate.com',
  bongacams: 'bongacams.com',
  cam4: 'cam4.com',
  camsoda: 'camsoda.com',
  dreamcam: 'dreamcam.com',
  streamate: 'streamate.com',
  jerkmate: 'jerkmate.com',
  stripchat: 'stripchat.com',
  myfreecams: 'myfreecams.com',
  tango: 'tango.me',
};

/**
 * Site domain whose icon a plugin displays. The id map answers for every
 * bundled platform; anything else derives its domain automatically from
 * the manifest `homepage`'s origin — a freshly added plugin with a real
 * homepage gets its favicon fetched with zero code changes. Deliberately
 * refuses to guess domains FROM THE NAME (typosquat-fetching a favicon
 * from a lookalike domain is not a mistake this tile will make).
 */
export function pluginIconDomain(pluginId: string, homepage?: string): string | undefined {
  const known = PLUGIN_SITES[pluginId];
  if (known !== undefined) return known;
  if (typeof homepage !== 'string' || homepage === '') return undefined;
  try {
    const url = new URL(homepage);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    const host = url.hostname.replace(/^www\./i, '');
    if (host.includes('.') && !host.endsWith('github.com')) return host;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Icon candidates in order: bundled first (local path/data URL), then the
 * two favicon mirrors. DuckDuckGo 404s for domains it can't resolve,
 * which is what drives the onError chain; Google's s2 answers with a
 * 64px asset for nearly everything else. Exhausting the list falls back
 * to the brand-tinted initial tile.
 */
function faviconSources(iconUrl: string | undefined, domain: string | undefined): string[] {
  const sources: string[] = [];
  if (iconUrl !== undefined && iconUrl !== '') sources.push(iconUrl);
  if (domain !== undefined) {
    sources.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
    sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`);
  }
  return sources;
}

export interface PluginTileProps {
  pluginId: string;
  name: string;
  /** Manifest homepage — enables automatic favicon resolution for new plugins. */
  homepage?: string;
  /**
   * Bundled icon shipped inside the plugin files, if any; always a local
   * path/data URL and always tried before the web favicon.
   */
  iconUrl?: string;
  size?: 20 | 40 | 48;
  dimmed?: boolean;
}

export function PluginTile({ pluginId, name, homepage, iconUrl, size = 40, dimmed = false }: PluginTileProps) {
  const color = pluginBrandColor(pluginId);
  const [sourceAt, setSourceAt] = useState(0);

  const domain = pluginIconDomain(pluginId, homepage);
  const sources = faviconSources(iconUrl, domain);
  const src = sources[sourceAt]; // out of candidates → brand-tinted initial

  // A plugin changing identity (reinstall/updating its homepage) restarts the chain.
  useEffect(() => setSourceAt(0), [domain, iconUrl]);

  const initial = pluginInitials(name) || '?';
  const px = `${size}px`;
  const font = size === 40 ? 'text-[15px]' : size === 20 ? 'text-[9px]' : 'text-base';
  // Dropdown option rows pin tiles to the 20px spec regardless of size.
  const frame = {
    width: px,
    height: px,
    backgroundColor: hexToRgba(color, 0.16),
    borderColor: hexToRgba(color, 0.45),
    color,
  };
  const dim = dimmed ? 'opacity-60 grayscale' : '';

  if (src !== undefined) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-sm border p-[3px] font-semibold leading-none ${dim}`}
        style={frame}
      >
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setSourceAt((at) => at + 1)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-sm border font-semibold leading-none ${font} ${
        dimmed ? 'opacity-60 grayscale' : ''
      }`}
      style={frame}
    >
      {initial}
    </span>
  );
}
