/**
 * Rumble embed API access.
 *
 * `https://rumble.com/embedJS/u3/?request=video&ver=2&v=<id>` is the public
 * endpoint that powers every embedded Rumble player. It answers JSON with
 * the full playback picture: `live` state (0/1/2), `ua` — a per-format,
 * per-height tree of playable URLs — thumbnails, author, publish date and
 * viewer counts for live streams. yt-dlp's Rumble extractor documents the
 * same response contract; the live-state and `ua` handling below mirrors it.
 */
import type {
  AuthStatus,
  HealthStatus,
  StreamObject,
} from '@rekordly/plugin-sdk';
import type { Agent } from 'node:http';
import type { HttpResult } from './http';
import {
  DIRECT_TIMEOUT_MS,
  PROXY_TIMEOUT_MS,
  cookieList as getJarCookieList,
  getCookieString,
  getUserAgent,
  hasCookies,
  proxyFor,
  proxyHttpUrlFor,
  request,
  withSmartRoute,
} from './http';
import { DEFAULT_BASE, videoIdFromEmbedUrl, videoIdFromWatchUrl } from './channel';

/** ponytail: JSON body type of the embedJS `request=video` endpoint. */
export interface EmbedVideoResponse {
  /** Live state: 0 = not live / was live, 1 = upcoming (or post-live), 2 = live. */
  live?: number;
  livestream_has_dvr?: boolean | null;
  title?: string;
  /** Flat default-quality URL. */
  u?: EmbedFormatEntry;
  /** Per-format, per-height playable URL tree. */
  ua?: Record<string, Record<string, EmbedFormatEntry>>;
  /** Author block: name + channel URL. */
  author?: { name?: string; url?: string };
  /** Thumbnail URL. */
  i?: string;
  /** Watch-page path (`/vXXXX-slug.html`). */
  l?: string;
  /** Watch page id (`vXXXX`). */
  v?: string;
  /** Numeric video id. */
  vid?: number;
  /** ISO publish date. */
  pubDate?: string;
  duration?: number;
  fps?: number;
  /** Source video dimensions. */
  w?: number;
  h?: number;
  /** Live viewer count (present on live streams). */
  watching_now?: number;
  /** Total views. */
  views?: number;
  /** System message ("Video is unavailable…") — presence means no playback. */
  sys?: { msg?: string };
  [key: string]: unknown;
}

export interface EmbedFormatEntry {
  url?: string;
  meta?: {
    bitrate?: number;
    size?: number;
    w?: number;
    h?: number;
    /** True on the HLS entry of a live stream. */
    live?: boolean;
  };
  [key: string]: unknown;
}

/**
 * ponytail: Rumble answers HTTP 200 with a message instead of data when a
 * video is gone/private — the body, not the status, carries the truth.
 * Also treats non-JSON bodies (block pages) as an error so the smart route
 * can retry them through the proxy.
 */
export function parseEmbedResponse(result: HttpResult): EmbedVideoResponse {
  if (result.status === 404) {
    throw new Error('Video not found (404)');
  }
  if (result.status !== 200) {
    throw new Error(`embedJS returned HTTP ${result.status}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.body);
  } catch {
    throw new Error('embedJS returned invalid JSON (possible block page)');
  }
  const rec = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const sysMsg = typeof rec['sys'] === 'object' && rec['sys'] !== null
    ? (rec['sys'] as { msg?: unknown }).msg
    : undefined;
  if (typeof sysMsg === 'string' && sysMsg.length > 0) {
    throw new Error(`Rumble says: ${sysMsg}`);
  }
  return parsed as EmbedVideoResponse;
}

/** Fetch the embedJS video payload, direct-first with proxy fallback. */
export async function fetchEmbedVideo(
  identifier: string,
  videoId: string,
): Promise<{ video: EmbedVideoResponse; usedProxy: boolean }> {
  const url = `${DEFAULT_BASE}/embedJS/u3/?request=video&ver=2&v=${encodeURIComponent(videoId)}`;
  const { value: result, usedProxy } = await withSmartRoute(identifier, async (agent) => {
    const res = await request(url, {
      headers: {
        Accept: 'application/json',
        Referer: `${DEFAULT_BASE}/`,
      },
      timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
      agent,
    });
    // parseEmbedResponse throws on 200-block-pages/invalid JSON, which the
    // smart route classifies as retryable — exactly what we want here.
    parseEmbedResponse(res);
    return res;
  });
  return { video: parseEmbedResponse(result), usedProxy };
}

/** Classification result of one embed payload. Exported for tests. */
export interface EmbedLiveState {
  isLive: boolean;
  isUpcoming: boolean;
  hasPlayback: boolean;
}

/**
 * Map the embed `live` flag onto Rekordly's live/upcoming/offline model.
 * Exported for tests.
 *
 * ponytail: live === 1 has two opposite meanings. `livestream_has_dvr`
 * (truthy) marks a scheduled stream that has NOT started yet — "upcoming".
 * Without DVR it is a recording of a finished live stream ("was live") —
 * kept as offline with leftover HLS still up; yt-dlp reads it the same way.
 * `ua` presence is the final arbiter: no playable entry means nothing to
 * record regardless of the flag.
 *
 * ponytail (2026-09 live validation): embedJS answers with EMPTY payloads
 * (200, `{}` — no `live`, no `ua`) for live video ids when the request does
 * not look like the embedded player (no player session). It stays reliable
 * for VODs. Therefore this classification is only a SECONDARY signal — the
 * plugin's live decision comes from the channel page JSON first (see
 * resolveChannelLive in index.ts).
 */
export function classifyEmbedLive(video: EmbedVideoResponse): EmbedLiveState {
  const hasPlayback = pickPlayableEntries(video).length > 0;
  const liveFlag = video.live;
  if (liveFlag === 2) {
    return { isLive: true, isUpcoming: false, hasPlayback };
  }
  const upcoming = liveFlag === 1 && video.livestream_has_dvr === true;
  return { isLive: false, isUpcoming: upcoming, hasPlayback };
}

/**
 * Live decision from the channel page JSON — the PRIMARY signal.
 * Exported for tests.
 *
 * ponytail: the page `items` carry the same fields Rumble's own front-end
 * renders from (`live: true`, `livestream_status: 2`, `watching_now: 1069`
 * on a running broadcast — verified against a live channel). The decisive
 * confirmation is whether an HLS playlist URL is reachable: live items
 * carry `videos[].url` pointing at `rumble.com/live-hls-dvr/…/playlist.m3u8`
 * and the CDN answers it to anonymous clients. Page flags alone can lie
 * (a crashed stream keeps its entry briefly), so `confirmPlaylist` — a
 * HEAD-ish GET of the master playlist — closes the loop, mirroring how
 * bongacams treats the playlist 404 as the definitive offline answer.
 */
export interface ChannelLiveDecision {
  isLive: boolean;
  isUpcoming: boolean;
  /** Newest-live item's stream title. */
  title?: string;
  /** Live viewer count of the running broadcast. */
  viewerCount?: number;
  /** Direct HLS master URL from the page item, when present. */
  hlsUrl?: string;
  /** ISO date the broadcast started, when the page provides one. */
  startedAt?: string;
  /** Thumbnail of the live item. */
  thumbnail?: string;
  /** Video id of the live/newest item. */
  videoId?: string;
}

export async function resolveChannelLive(
  entries: Array<{ entry: Record<string, unknown>; watchingNow?: number; hlsUrl?: string; title?: string }>,
  confirmPlaylist: (url: string) => Promise<boolean>,
): Promise<ChannelLiveDecision> {
  // ponytail: entries arrive in page order (newest first). The FIRST live
  // item wins — Rumble pins the running broadcast to the front when one is
  // active. classifyVideoEntry also handles the classify filter, but the
  // plugin passes pre-filtered live entries here; keep this tolerant.
  for (const item of entries) {
    const live = item.entry['live'] === true || item.entry['livestream_status'] === 2;
    if (!live) continue;
    const decision: ChannelLiveDecision = {
      isLive: false,
      isUpcoming: item.entry['livestream_status'] === 1,
      title: item.title,
      viewerCount: item.watchingNow,
      hlsUrl: item.hlsUrl,
      startedAt:
        typeof item.entry['live_streamed_on'] === 'string'
          ? (item.entry['live_streamed_on'] as string)
          : typeof item.entry['live_datetime'] === 'string'
            ? (item.entry['live_datetime'] as string)
            : undefined,
      thumbnail: typeof item.entry['thumb'] === 'string' ? (item.entry['thumb'] as string) : undefined,
      videoId: typeof item.entry['eid'] === 'string' ? (item.entry['eid'] as string) : undefined,
    };
    if (decision.isUpcoming) continue;
    // Confirm the broadcast is actually up: the playlist must answer.
    if (item.hlsUrl !== undefined) {
      decision.isLive = await confirmPlaylist(item.hlsUrl);
    } else {
      // No direct URL on the item — page flags are all we have; trust them
      // (the extraction path re-verifies the playlist anyway).
      decision.isLive = true;
    }
    if (decision.isLive) return decision;
  }
  return { isLive: false, isUpcoming: false };
}

/** One playable entry flattened out of the `ua` tree. */
export interface PlayableEntry {
  format: string;
  height: number;
  url: string;
  bitrate?: number;
  width?: number;
  isLive: boolean;
}

function entryIsLive(entry: EmbedFormatEntry): boolean {
  return entry.meta?.live === true;
}

/**
 * Flatten the `ua` tree into playable entries. Exported for tests.
 *
 * ponytail: the tree is normally `{ "mp4" | "webm" | "hls" | …: { "<height>":
 * { url, meta } } }`, but Rumble sometimes nests one level deeper — the
 * height key maps to a wrapper object holding the real entry under the
 * height again (yt-dlp handles the same shape by re-reading `meta.h`).
 * Also accept flat `{ url, meta }` leaves that carry no height info.
 */
export function pickPlayableEntries(video: EmbedVideoResponse): PlayableEntry[] {
  const out: PlayableEntry[] = [];
  for (const [formatType, byHeight] of Object.entries(video.ua ?? {})) {
    if (formatType === 'tar') continue; // ponytail: tar entries are duplicates, not playable
    if (typeof byHeight !== 'object' || byHeight === null) continue;
    for (const [heightKey, value] of Object.entries(byHeight)) {
      if (typeof value !== 'object' || value === null) continue;
      const entries: EmbedFormatEntry[] = [];
      const direct = value as EmbedFormatEntry;
      if (typeof direct.url === 'string' && direct.url.length > 0) {
        entries.push(direct);
      }
      const metaHeight = Number.parseInt(heightKey, 10);
      for (const entry of entries) {
        const meta = entry.meta ?? {};
        const h = meta.h ?? (Number.isNaN(metaHeight) ? undefined : metaHeight);
        out.push({
          format: formatType,
          height: h ?? 0,
          url: entry.url!,
          bitrate: typeof meta.bitrate === 'number' ? meta.bitrate : undefined,
          width: meta.w,
          isLive: entryIsLive(entry),
        });
      }
      // ponytail: nested shape — { "<height>": { "<height>": entry } }
      for (const [nestedKey, nested] of Object.entries(value as Record<string, unknown>)) {
        if (nestedKey === 'meta' || nestedKey === 'url') continue;
        if (typeof nested !== 'object' || nested === null) continue;
        const nestedEntry = nested as EmbedFormatEntry;
        if (typeof nestedEntry.url !== 'string' || nestedEntry.url.length === 0) continue;
        const nestedMeta = nestedEntry.meta ?? {};
        const h =
          nestedMeta.h ??
          (Number.isNaN(Number.parseInt(nestedKey, 10))
            ? undefined
            : Number.parseInt(nestedKey, 10));
        out.push({
          format: formatType,
          height: h ?? 0,
          url: nestedEntry.url,
          bitrate: typeof nestedMeta.bitrate === 'number' ? nestedMeta.bitrate : undefined,
          width: nestedMeta.w,
          isLive: entryIsLive(nestedEntry),
        });
      }
    }
  }
  return out;
}

/** Highest resolution first; mp4 entries win ties (most compatible). */
export function sortPlayable(entries: PlayableEntry[]): PlayableEntry[] {
  return [...entries].sort((a, b) => {
    const formatScore = (e: PlayableEntry): number => (e.format === 'mp4' ? 1 : 0);
    if (b.height !== a.height) return b.height - a.height;
    return formatScore(b) - formatScore(a);
  });
}

interface StreamVariant {
  url: string;
  bandwidth: number;
  resolution?: string;
  codecs?: string;
}

/**
 * Pure playlist-body decision, split out for tests. Exported.
 *
 * ponytail: playlist 404 (broadcast not up) is the definitive offline
 * answer — `url: null`, not a throw. Any other non-200 throws (WAF/5xx).
 * Returns the variant table alongside the resolved URL so quality options
 * in the StreamObject can list real qualities.
 */
export function resolveBestVariantFromBody(
  masterUrl: string,
  status: number,
  body: string,
): { url: string | null; variants: StreamVariant[] } {
  if (status === 404) return { url: null, variants: [] };
  if (status !== 200 || !body.includes('#EXTM3U')) {
    throw new Error(`Playlist not playable (HTTP ${status})`);
  }
  if (body.includes('#EXT-X-PLAYLIST-TYPE:VOD')) {
    throw new Error('Playlist is a VOD, not a live stream');
  }
  const variants = parseVariants(masterUrl, body);
  if (variants.length === 0) return { url: masterUrl, variants: [] };
  return { url: pickBestVariant(variants).url, variants };
}

/**
 * Resolve an HLS master playlist into the best single-variant media
 * playlist so ffmpeg records deterministic quality — the multi-variant
 * master made the HLS demuxer open every variant at once and drop packets.
 */
async function resolveBestVariantUrl(
  masterUrl: string,
  agent: Agent | null,
): Promise<{ url: string | null; variants: StreamVariant[] }> {
  const res = await request(masterUrl, {
    agent,
    timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
    headers: { Referer: `${DEFAULT_BASE}/` },
  });
  return resolveBestVariantFromBody(masterUrl, res.status, res.body);
}

function parseVariants(masterUrl: string, body: string): StreamVariant[] {
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
 * via a large score bonus) — same rule as the other plugins.
 */
function pickBestVariant(variants: StreamVariant[]): StreamVariant {
  const score = (v: StreamVariant): number => {
    let s = v.bandwidth;
    if (/avc1/i.test(v.codecs ?? '')) s += 5_000_000;
    else if (/av01|hvc1|hev1/i.test(v.codecs ?? '')) s -= 5_000_000;
    return s;
  };
  return [...variants].sort((a, b) => score(b) - score(a))[0]!;
}

/** Result of a full extraction: ready to become a StreamObject. */
export interface ExtractedStream {
  video: EmbedVideoResponse;
  streamUrl: string;
  usedProxy: boolean;
  qualityOptions: Array<{
    id: string;
    label: string;
    format: string;
    resolution?: string;
    bitrate?: number;
    isBest?: boolean;
  }>;
}

/**
 * Full extraction pipeline: HLS master -> best variant. Stays on the route
 * (direct/proxy) chosen by the discovery call for the whole fetch cycle so
 * detection and extraction agree.
 *
 * ponytail (2026-09 live validation): the channel page JSON carries the
 * live master playlist URL directly (`videos[].url`, e.g.
 * `https://rumble.com/live-hls-dvr/<eid>/playlist.m3u8`), and the CDN
 * answers it to anonymous clients — that makes it the primary extraction
 * source. embedJS is the fallback for layouts without the direct URL.
 */
export async function extractHlsStream(
  identifier: string,
  masterUrl: string,
  options: { video?: Partial<EmbedVideoResponse>; usedProxy?: boolean } = {},
): Promise<ExtractedStream> {
  const agent = options.usedProxy === true ? await proxyFor(identifier) : null;
  const resolved = await resolveBestVariantUrl(masterUrl, agent);
  if (resolved.url === null) {
    throw new Error(`HLS playlist is gone (404)`);
  }
  const video = options.video ?? {};
  // ponytail: list the REAL variants (1080p/720p/360p on Rumble's live
  // ladder) with the best one flagged; fall back to a single entry when the
  // master is already a media playlist.
  const qualityOptions: ExtractedStream['qualityOptions'] =
    resolved.variants.length > 0
      ? resolved.variants.map((v, idx) => ({
          id: `variant-${idx}`,
          label: v.resolution ?? `${Math.round(v.bandwidth / 1000)} kbps`,
          format: 'hls',
          resolution: v.resolution,
          bitrate: v.bandwidth > 0 ? v.bandwidth : undefined,
          isBest: v.url === resolved.url,
        }))
      : [
          {
            id: 'fmt-best',
            label: video.h !== undefined && video.w !== undefined ? `${video.h}p` : 'Best',
            format: 'hls',
            resolution:
              video.w !== undefined && video.h !== undefined ? `${video.w}x${video.h}` : undefined,
            bitrate: undefined,
            isBest: true,
          },
        ];
  return { video: video as EmbedVideoResponse, streamUrl: resolved.url, usedProxy: options.usedProxy === true, qualityOptions };
}

/**
 * Extraction via embedJS (secondary path — see extractHlsStream).
 * Full pipeline for one video id: embedJS -> HLS master -> best variant.
 */
export async function extractVideoStream(
  identifier: string,
  videoId: string,
): Promise<ExtractedStream> {
  const { video, usedProxy } = await fetchEmbedVideo(identifier, videoId);
  const playable = sortPlayable(pickPlayableEntries(video));
  const hlsEntry = playable.find((e) => e.format === 'hls') ?? playable[0];
  if (hlsEntry === undefined) {
    throw new Error(`No playable formats for ${videoId} (Rumble says: ${video.sys?.msg ?? 'nothing'})`);
  }

  const agent = usedProxy ? await proxyFor(identifier) : null;
  let streamUrl: string | null = hlsEntry.url;
  if (hlsEntry.format === 'hls') {
    const resolved = await resolveBestVariantUrl(hlsEntry.url, agent);
    streamUrl = resolved.url;
    if (streamUrl === null) {
      throw new Error(`HLS playlist for ${videoId} is gone (404)`);
    }
  }

  const qualityOptions = playable.map((e, idx) => ({
    id: `fmt-${idx}`,
    label: e.height > 0 ? `${e.height}p` : e.format,
    format: e.format,
    resolution: e.height > 0 ? `${e.width ?? ''}${e.width !== undefined ? 'x' : ''}${e.height}` : undefined,
    bitrate: e.bitrate,
    isBest: e === hlsEntry,
  }));

  return { video, streamUrl, usedProxy, qualityOptions };
}

/**
 * Build the standardized StreamObject the recorder consumes.
 *
 * `context` carries what the discovery phase already learned (page identity
 * block, live decision) so extraction needs no extra round-trip.
 */
export interface StreamBuildContext {
  handle: string;
  videoId?: string;
  title?: string;
  thumbnail?: string;
  viewerCount?: number;
  startedAt?: string;
  usedProxy: boolean;
  creatorName?: string;
}

export function buildStreamObject(
  context: StreamBuildContext,
  extracted: ExtractedStream,
): StreamObject {
  const authorName = extracted.video.author?.name ?? context.creatorName;
  const title = context.title ?? extracted.video.title ?? `${context.handle} live on Rumble`;
  // ponytail: Rumble works fully anonymously — cookies ride along only when
  // the user configured them, so the recorder's segment fetches look the
  // same as the detection requests that found the stream.
  const cookies = hasCookies()
    ? getJarCookieList(new URL(DEFAULT_BASE).hostname.replace(/^www\./, '.'))
    : [];
  // ponytail: recording children (ffmpeg/yt-dlp) only route through the
  // proxy when THIS fetch cycle actually needed it — with a system VPN
  // (WARP) the direct route works and the embedded proxy never starts.
  const proxyUrl = context.usedProxy ? proxyHttpUrlFor(`rumble:${context.handle}`) : null;
  return {
    creatorId: `rumble:${context.handle}`,
    creatorName: typeof authorName === 'string' && authorName.length > 0 ? authorName : context.handle,
    platformId: 'rumble',
    title,
    streamUrl: extracted.streamUrl,
    thumbnail: context.thumbnail ?? extracted.video.i,
    headers: {
      'User-Agent': getUserAgent(),
      Referer: `${DEFAULT_BASE}/`,
      Origin: DEFAULT_BASE,
    },
    cookies,
    proxyUrl: proxyUrl ?? undefined,
    qualityOptions: extracted.qualityOptions,
    metadata: {
      category: 'Rumble',
      tags: ['live'],
      videoId: context.videoId,
      pubDate: extracted.video.pubDate,
      watchingNow: context.viewerCount ?? extracted.video.watching_now,
      dvr: extracted.video.livestream_has_dvr ?? undefined,
    },
    startedAt: context.startedAt ?? extracted.video.pubDate ?? new Date().toISOString(),
  };
}

/** Session check for the auth capability. */
export async function checkSession(baseUrl: string): Promise<AuthStatus> {
  const cookieStr = getCookieString();
  if (!cookieStr) return { authenticated: false };
  try {
    const res = await request(`${baseUrl}/`, {
      headers: { Accept: 'text/html', Referer: `${DEFAULT_BASE}/` },
    });
    if (res.status !== 200) {
      // ponytail: self-redirect 307s (edge throttling) must not flip a
      // configured session to "logged out" in the UI — report the cookies
      // as present; the next successful page load re-validates.
      return { authenticated: true };
    }
    // ponytail: guest pages carry /login (and /signup) links; the logged-in
    // chrome does not (it renders the account menu instead). Verified
    // against anonymous page loads — logout anchors never appear there.
    const hasLoginUi = /href=["']?[.\/]*login/i.test(res.body) || /href=["']?[.\/]*signup/i.test(res.body);
    return { authenticated: !hasLoginUi };
  } catch {
    return { authenticated: true };
  }
}

/** Platform reachability probe for the health-check capability. */
export async function probeHealth(baseUrl: string): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const res = await request(`${baseUrl}/`, {
      headers: { Accept: 'text/html' },
      timeout: DIRECT_TIMEOUT_MS,
    });
    return {
      healthy: res.status === 200,
      message: res.status === 200 ? 'Rumble reachable' : `HTTP ${res.status}`,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return { healthy: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Resolve a video id out of an embed or watch URL. */
export function videoIdFromUrl(url: string): string | undefined {
  return videoIdFromEmbedUrl(url) ?? videoIdFromWatchUrl(url);
}
