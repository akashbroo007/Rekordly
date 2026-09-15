/**
 * ponytail: BSS API client for dreamcam.com.
 *
 * The site is a Next.js SPA whose client talks to
 * `https://bss.dreamcamtrue.com/api/clients/v1` (BSS_URL shipped in the page
 * environment, partnerId `dreamcam_oauth2`). Both endpoints this module uses
 * answer WITHOUT authentication for anonymous visitors:
 *
 *   GET broadcasts/models/{nickname}?partnerId=...&stream-types=video2D,video3D&include-favorites=false
 *   GET broadcasts?partnerId=...&limit=..&offset=..&show-offline=false
 *
 * Broadcast shape (verified live):
 *   broadcastStatus: 'public' | 'offline' | 'private' | ...  (online === 'public')
 *   broadcastMembersCount, broadcastDurationSec, modelProfilePhotoUrl,
 *   modelLivePhotoUrl, broadcastTextStatus, roomChatId,
 *   streams: [{ streamType: 'video2D'|'video3D', url, status, isPrivate,
 *               resolutionInfo: { width, height, resolutionType } }]
 *
 * Stream URLs per type:
 *   video2D -> https://stream.dreamcamtrue.com/hls/{uuid}/index.m3u8 (flat
 *              LL-HLS fMP4 media playlist, recordable by ffmpeg directly)
 *   video3D -> fmp4s://stream.dreamcamtrue.com/fmp4/{uuid}?...  (fragmented
 *              MP4 over WebSocket — the VR feed; bridged by vr-proxy.ts)
 */
import type { Agent } from 'node:http';
import * as http from 'http';
import * as https from 'https';

export const DEFAULT_BSS_BASE = 'https://bss.dreamcamtrue.com/api/clients/v1';
export const DEFAULT_SITE_BASE = 'https://dreamcam.com';
/** Public partner id shipped with the dreamcam.com page environment. */
export const DEFAULT_PARTNER_ID = 'dreamcam_oauth2';
export const STREAM_TYPES = 'video2D,video3D';

export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export interface LoggerLike {
  debug(message: string): void;
  warn(message: string): void;
}

export interface ResolutionInfo {
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolutionType?: string;
}

export interface BroadcastStream {
  streamType: string;
  url: string | null;
  status: string;
  isPrivate: boolean;
  useLowLatency?: boolean;
  hasMask?: boolean;
  resolutionInfo?: ResolutionInfo | null;
}

export interface Broadcast {
  id?: string;
  modelId?: string;
  modelNickname?: string;
  modelAge?: number;
  modelSex?: string;
  modelProfilePhotoUrl?: string | null;
  modelLivePhotoUrl?: string | null;
  broadcastTextStatus?: string;
  /** 'public' means watchable; 'offline' etc. means not recordable. */
  broadcastStatus?: string;
  broadcastMembersCount?: number;
  broadcastDurationSec?: number;
  lastBroadcast?: number;
  roomChatId?: string;
  streamUrl?: string;
  streams?: BroadcastStream[];
  modelLanguages?: string[];
}

export interface BroadcastPage {
  totalCount: number;
  pageItems: Broadcast[];
}

export interface BssClientOptions {
  bssBase: string;
  siteBase: string;
  partnerId: string;
  userAgent: string;
  cookies: Record<string, string>;
  logger: LoggerLike | null;
  /** Request timeout in ms (direct route uses a short one, proxy a long one). */
  timeoutMs?: number;
  proxyAgent?: Agent | null;
}

/** Transport-level failure signatures that justify a proxy retry. */
export function isNetworkFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timed out|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|getaddrinfo|socket hang up|invalid JSON/i.test(
    msg,
  );
}

export class BssApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BssApiError';
  }
}

function cookieHeader(cookies: Record<string, string>): string | null {
  const pairs = Object.entries(cookies).map(([k, v]) => `${k}=${v}`);
  return pairs.length > 0 ? pairs.join('; ') : null;
}

/** Single JSON GET with redirect following (5 hops max). */
export function bssGetJson(
  url: string,
  options: BssClientOptions,
  hops = 0,
): Promise<unknown> {
  if (hops > 5) return Promise.reject(new Error('Too many redirects'));
  options.logger?.debug(`dreamcam: GET ${url}`);
  return new Promise((resolve, reject) => {
    const mod = new URL(url).protocol === 'https:' ? https : http;
    const headers: Record<string, string> = {
      'User-Agent': options.userAgent,
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: options.siteBase,
      Referer: `${options.siteBase}/`,
    };
    const cookie = cookieHeader(options.cookies);
    if (cookie !== null) headers['Cookie'] = cookie;

    const req = mod.get(url, {
      headers,
      timeout: options.timeoutMs ?? 15_000,
      ...(options.proxyAgent !== undefined && options.proxyAgent !== null
        ? { agent: options.proxyAgent }
        : {}),
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        resolve(bssGetJson(new URL(res.headers.location, url).toString(), options, hops + 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (status !== 200) {
          reject(new BssApiError(`BSS returned HTTP ${status}`, status));
          return;
        }
        try {
          resolve(JSON.parse(body) as unknown);
        } catch {
          // A 200 page of non-JSON is the classic ISP block-page injection.
          reject(new Error('BSS returned invalid JSON'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

function asBroadcast(value: unknown): Broadcast | null {
  return typeof value === 'object' && value !== null ? (value as Broadcast) : null;
}

/** GET broadcasts/models/{nickname} — one model's broadcast (or 404-ish error). */
export async function getBroadcastByNickname(
  nickname: string,
  options: BssClientOptions,
): Promise<Broadcast | null> {
  const url =
    `${options.bssBase}/broadcasts/models/${encodeURIComponent(nickname)}` +
    `?partnerId=${options.partnerId}&stream-types=${STREAM_TYPES}&include-favorites=false`;
  try {
    return asBroadcast(await bssGetJson(url, options));
  } catch (err) {
    // 404 = unknown model — the site talking, NOT a network failure.
    if (err instanceof BssApiError && err.status === 404) return null;
    throw err;
  }
}

/** GET broadcasts — paginated list of currently live broadcasts. */
export async function listLiveBroadcasts(
  limit: number,
  offset: number,
  options: BssClientOptions,
): Promise<BroadcastPage> {
  const url =
    `${options.bssBase}/broadcasts?partnerId=${options.partnerId}` +
    `&limit=${limit}&offset=${offset}&show-offline=false`;
  const raw = await bssGetJson(url, options);
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const items = Array.isArray(obj['pageItems']) ? (obj['pageItems'] as Broadcast[]) : [];
  const total = typeof obj['totalCount'] === 'number' ? obj['totalCount'] : items.length;
  return { totalCount: total, pageItems: items };
}

/** The model's canonical public status — 'public' is the recordable one. */
export function isWatchable(broadcast: Broadcast): boolean {
  return broadcast.broadcastStatus === 'public';
}

export interface ResolvedStreams {
  hls2d?: string;
  vr3d?: string;
  vr3dResolution?: ResolutionInfo;
  hls2dResolution?: ResolutionInfo;
}

/**
 * Pick the playable stream URLs out of a broadcast.
 * `isPrivate` streams are paywalled shows — their playlists are not publicly
 * served, so they must never be offered for recording.
 */
export function resolveStreamUrls(broadcast: Broadcast): ResolvedStreams {
  const out: ResolvedStreams = {};
  for (const stream of broadcast.streams ?? []) {
    if (stream.isPrivate || stream.status !== 'online' || typeof stream.url !== 'string' || stream.url === '') {
      continue;
    }
    if (stream.streamType === 'video2D' && out.hls2d === undefined) {
      out.hls2d = stream.url;
      out.hls2dResolution = stream.resolutionInfo ?? undefined;
    } else if (stream.streamType === 'video3D' && out.vr3d === undefined) {
      out.vr3d = stream.url;
      out.vr3dResolution = stream.resolutionInfo ?? undefined;
    }
  }
  return out;
}
