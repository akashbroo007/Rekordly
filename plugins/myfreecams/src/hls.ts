/**
 * HLS master playlist handling for MyFreeCams video edges
 * ({server}.myfreecams.com/NxServer/...).
 *
 * Master playlists list plain avc1 variants (up to 1080p on the `.f4v_mobile`
 * ngroups) whose chunklist URLs are relative. Returning the MASTER playlist
 * itself breaks recording (multi-variant streams confuse the copy muxer), so
 * extraction resolves the single best variant — same policy as the BongaCams
 * and Camsoda plugins.
 */
import type { Agent } from 'node:http';
import type { PluginLogger } from '@rekordly/plugin-sdk';
import {
  request,
  withSmartRoute,
  proxyFor,
  DIRECT_TIMEOUT_MS,
  PROXY_TIMEOUT_MS,
} from './http';

const SITE_BASE = 'https://www.myfreecams.com';

export interface StreamVariant {
  url: string;
  bandwidth: number;
  resolution?: string;
  codecs?: string;
}

/** Parse #EXT-X-STREAM-INF variants out of a master playlist. */
export function parseVariants(masterUrl: string, body: string): StreamVariant[] {
  const lines = body.split('\n').map((l) => l.trim());
  const variants: StreamVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]?.startsWith('#EXT-X-STREAM-INF:')) continue;
    const rawUrl = lines[i + 1];
    if (!rawUrl || rawUrl.startsWith('#')) continue;
    const attrs = lines[i]!.slice('#EXT-X-STREAM-INF:'.length);
    const bandwidth = parseInt(attrs.match(/BANDWIDTH=(\d+)/)?.[1] ?? '0', 10);
    const codecs = attrs.match(/CODECS="([^"]*)"/)?.[1];
    const resolution = attrs.match(/RESOLUTION=([0-9]+x[0-9]+)/)?.[1];
    const url = /^https?:/i.test(rawUrl) ? rawUrl : new URL(rawUrl, masterUrl).toString();
    variants.push({ url, bandwidth, resolution, codecs });
  }
  return variants;
}

/**
 * ponytail: prefer the highest-bandwidth H.264 variant (avc1 over av01/hevc
 * via a large score bonus) — AV1/hevc segments break recording and playback
 * on many systems. A slightly lower-bandwidth avc1 variant still wins.
 */
export function pickBestVariant(variants: StreamVariant[]): StreamVariant {
  const score = (v: StreamVariant): number => {
    let s = v.bandwidth;
    if (/avc1/i.test(v.codecs ?? '')) s += 5_000_000;
    else if (/av01|hvc1|hev1/i.test(v.codecs ?? '')) s -= 5_000_000;
    return s;
  };
  return [...variants].sort((a, b) => score(b) - score(a))[0]!;
}

type MasterResult =
  | { kind: 'offline' }
  | { kind: 'live'; body: string; usedProxy: boolean };

/**
 * Fetch a master playlist and classify it.
 * ponytail: OFFLINE and TRANSPORT failures are different signals. The HLS
 * edge answers 404 when the broadcast is not up (offline rooms have no
 * playlist) — that is a definitive "offline", NOT an error, so it reports
 * kind 'offline' instead of throwing. Throwing made every offline room spam
 * "Monitoring check failed" and kept the job in retry/backoff forever.
 * Any other HTTP status (403 WAF, 5xx) or a transport error still throws so
 * the smart route / monitoring retry logic can react.
 */
export async function fetchMasterPlaylist(
  identifier: string,
  masterUrl: string,
  logger?: PluginLogger,
  agent?: Agent | null,
): Promise<MasterResult> {
  const attempt = async (a: Agent | null): Promise<MasterResult> => {
    const res = await request(masterUrl, {
      agent: a,
      timeout: a !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
      headers: { Referer: `${SITE_BASE}/` },
    });
    if (res.status === 404) {
      logger?.debug(`myfreecams: playlist gone (404) — ${masterUrl}`);
      return { kind: 'offline' };
    }
    if (res.status !== 200 || !res.body.includes('#EXTM3U')) {
      throw new Error(`Playlist not playable (HTTP ${res.status})`);
    }
    return { kind: 'live', body: res.body, usedProxy: a !== null };
  };
  if (agent !== undefined && agent !== null) {
    return attempt(agent);
  }
  const routed = await withSmartRoute(identifier, attempt);
  return routed.value;
}

export interface ResolvedPlaylist {
  /** Best single-variant media playlist URL (recorder-ready). */
  url: string;
  variants: StreamVariant[];
  usedProxy: boolean;
}

/**
 * Probe candidate master playlists until one answers with a live playlist,
 * then resolve the best variant. Stays on one route for the whole cycle: as
 * soon as a candidate needed the proxy, the remaining candidates reuse the
 * same proxied agent.
 * Returns null when every candidate is definitively offline (404).
 */
export async function resolveBestPlaylist(
  identifier: string,
  candidates: string[],
  logger?: PluginLogger,
): Promise<ResolvedPlaylist | null> {
  let agent: Agent | null = null;
  let usedProxy = false;
  let offlineSeen = false;
  for (const masterUrl of candidates) {
    const result = await fetchMasterPlaylist(
      identifier,
      masterUrl,
      logger,
      usedProxy ? agent : undefined,
    );
    if (result.kind === 'offline') {
      offlineSeen = true;
      continue;
    }
    usedProxy = usedProxy || result.usedProxy;
    if (usedProxy && agent === null) {
      // ponytail: keep the same route for the rest of the fetch cycle so
      // detection and extraction agree.
      agent = await proxyFor(identifier);
    }
    const variants = parseVariants(masterUrl, result.body);
    const url = variants.length === 0 ? masterUrl : pickBestVariant(variants).url;
    logger?.debug(
      `myfreecams: resolved playlist via ${masterUrl} (${variants.length} variants)`,
    );
    return { url, variants, usedProxy };
  }
  if (offlineSeen) {
    logger?.debug(`myfreecams: all playlist candidates offline`);
  }
  return null;
}
