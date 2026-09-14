import type {
  AuthStatus,
  CreatorInfo,
  CreatorMetadata,
  CreatorSearchQuery,
  CreatorSearchResult,
  HealthStatus,
  LiveStatus,
  Plugin,
  PluginContext,
  PluginSettingValues,
  PluginStatus,
  SettingDef,
  StreamObject,
} from '@rekordly/plugin-sdk';
import type { Agent } from 'node:http';
import * as https from 'https';
import * as http from 'http';
import manifest from '../manifest.json';

const status: PluginStatus = { state: 'installed' };

let ctx: PluginContext | null = null;

const DEFAULT_BASE = 'https://streamate.com';
/**
 * Streamate's stream manifest is served by Naiad Systems' edge, independent
 * of the website origin. `format=mp4-hls` returns HLS variant tables;
 * HTTP 200 with a `formats` object means the broadcast is up.
 */
const DEFAULT_MANIFEST_BASE = 'https://manifest-server.naiadsystems.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ponytail: cookie jar lives in memory only, reset on app restart
let cookieJar: Record<string, string> = {};

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  baseUrl: {
    type: 'text',
    label: 'Site URL',
    description: 'Base URL of the site (used for profile pages, search and referers).',
    defaultValue: DEFAULT_BASE,
  },
  manifestBaseUrl: {
    type: 'text',
    label: 'Manifest server URL',
    description: 'Naiad Systems manifest server that serves the live stream playlists.',
    defaultValue: DEFAULT_MANIFEST_BASE,
  },
  cookies: {
    type: 'password',
    label: 'Session cookies',
    description: 'Browser cookies for authentication (paste "cookie" header value from DevTools).',
    defaultValue: '',
  },
  userAgent: {
    type: 'text',
    label: 'User-Agent',
    description: 'Browser User-Agent string sent with requests.',
    defaultValue: UA,
  },
};

// ---- settings / cookies ----------------------------------------------------

function getCookieString(): string {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function loadCookieHeader(header: string): void {
  cookieJar = {};
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      cookieJar[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    }
  }
}

function parseCookies(setCookies: string[] | undefined): void {
  if (!setCookies) return;
  for (const raw of setCookies) {
    const first = raw.split(';')[0];
    if (!first) continue;
    const pair = first.trim();
    const eq = pair.indexOf('=');
    if (eq > 0) {
      cookieJar[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
}

function getUserAgent(): string {
  const v = ctx?.settings.get('userAgent');
  return typeof v === 'string' && v.trim() ? v : UA;
}

function getBase(): string {
  const v = ctx?.settings.get('baseUrl');
  const base = typeof v === 'string' && v.trim() ? v.trim() : DEFAULT_BASE;
  return base.replace(/\/+$/, '');
}

function getManifestBase(): string {
  const v = ctx?.settings.get('manifestBaseUrl');
  const base = typeof v === 'string' && v.trim() ? v.trim() : DEFAULT_MANIFEST_BASE;
  return base.replace(/\/+$/, '');
}

function siteHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'User-Agent': getUserAgent(),
    Referer: `${getBase()}/`,
    Origin: getBase(),
    ...extra,
  };
}

// ---- HTTP client with smart direct/proxy routing ---------------------------

interface HttpResult {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

/**
 * ponytail: what a NETWORK failure looks like — these are the signatures of
 * an ISP/DNS block (or any unreachable route). HTTP-level answers (404, 403,
 * non-JSON API bodies) are the SITE talking and must NOT trigger a proxy
 * retry… with one exception: a 200 page of non-JSON where JSON was expected
 * is the classic ISP block-page injection, so it IS retryable.
 */
function isRetryableThroughProxy(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timed out|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|getaddrinfo|socket hang up|invalid JSON/i.test(
    msg,
  );
}

/** HTTP proxy URL for recording child processes, or null to go direct. */
function proxyHttpUrlFor(identifier: string): string | null {
  return ctx?.network?.getProxyHttpUrl(identifier) ?? null;
}

const DIRECT_TIMEOUT_MS = 8_000;
const PROXY_TIMEOUT_MS = 45_000;

/**
 * ponytail: route through the host's embedded proxy when the user flagged
 * this creator (`creators.use_proxy`) — ISP/DNS blocks are regional, so this
 * is a user decision the host resolves per identifier, never a plugin one.
 * A proxy that cannot come up must fail loudly — silently going direct
 * against a blocked site would look like "model offline".
 */
async function proxyFor(identifier: string): Promise<Agent | null> {
  const network = ctx?.network;
  if (network === undefined) return null;
  try {
    await network.ensureProxy(identifier);
  } catch (err) {
    throw new Error(
      `Secure proxy unavailable: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  return network.getProxyAgent(identifier);
}

// ponytail: simple recursive redirect follower, cap at 5 hops
function request(
  url: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    agent?: Agent | null;
    timeout?: number;
  } = {},
  hops = 0,
): Promise<HttpResult> {
  if (hops > 5) return Promise.reject(new Error('Too many redirects'));
  ctx?.logger.debug(`streamate: ${options.method ?? 'GET'} ${url}`);
  return new Promise((resolve, reject) => {
    const mod = new URL(url).protocol === 'https:' ? https : http;
    const reqHeaders: Record<string, string> = {
      'User-Agent': getUserAgent(),
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      ...options.headers,
    };
    const cookieStr = getCookieString();
    if (cookieStr) reqHeaders['Cookie'] = cookieStr;

    const req = mod.request(
      url,
      {
        method: options.method ?? 'GET',
        headers: reqHeaders,
        // ponytail: proxied requests get a longer leash — on constrained
        // networks the first circuits through the secure route can take
        // tens of seconds even after the proxy reports active.
        timeout: options.timeout ?? (options.agent !== undefined && options.agent !== null ? PROXY_TIMEOUT_MS : 15_000),
        // ponytail: routing decisions live in the host — the agent is passed
        // by reference (same process) and may be null when going direct.
        ...(options.agent !== undefined && options.agent !== null ? { agent: options.agent } : {}),
      },
      (res) => {
        parseCookies(res.headers['set-cookie']);
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          ctx?.logger.debug(`streamate: ${statusCode} -> redirect to ${next}`);
          res.resume();
          resolve(request(next, options, hops + 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          ctx?.logger.debug(`streamate: ${statusCode} ${body.length} bytes from ${url}`);
          resolve({ status: statusCode, body, headers: res.headers });
        });
      },
    );
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

/**
 * ponytail: SMART routing — run `attempt` DIRECT first (fast ~8s fail on ISP
 * blocks); only when the network itself fails do we retry through the host's
 * secure proxy. With a system VPN like Cloudflare WARP the direct attempt
 * succeeds instantly and the embedded proxy never even starts; without one,
 * the fallback keeps the site reachable. The proxy only boots when needed.
 * HTTP-level answers (404/403) are the SITE talking and never trigger a
 * retry — with one exception: a 200 body of non-JSON where JSON was expected
 * is the classic ISP block-page injection, so it IS retryable.
 */
async function withSmartRoute<T>(
  identifier: string,
  attempt: (agent: Agent | null) => Promise<T>,
): Promise<{ value: T; usedProxy: boolean }> {
  try {
    const value = await attempt(null);
    return { value, usedProxy: false };
  } catch (err) {
    if (!isRetryableThroughProxy(err)) throw err;
    ctx?.logger.debug(
      `streamate: direct request failed (${err instanceof Error ? err.message : err}) — retrying through secure proxy`,
    );
  }
  const agent = await proxyFor(identifier);
  const value = await attempt(agent);
  return { value, usedProxy: true };
}

// ---- manifest API (stream state + HLS variants) ----------------------------

/** One HLS encoding advertised by the manifest server. */
interface ManifestEncoding {
  location?: string;
  videoWidth?: number;
  videoHeight?: number;
  /** ponytail: the manifest server reports bitrate as `videoKbps` (e.g. 700). */
  videoKbps?: number;
}

interface ManifestFormats {
  'mp4-hls'?: { encodings?: ManifestEncoding[] };
  [key: string]: unknown;
}

interface ManifestInfo {
  formats?: ManifestFormats;
  [key: string]: unknown;
}

/**
 * Fetch the live manifest for a performer through the smart route.
 * Returns:
 * - `{ ok: true, info, usedProxy }` — HTTP 200 with a `formats` object:
 *   the broadcast is LIVE.
 * - `{ ok: false, notFound: true }` — a definitive site answer that the
 *   broadcast is not up (404/410; the edge serves 404 for offline rooms).
 * - `{ ok: false, notFound: false, error }` — an HTTP-level error the SITE
 *   produced but that is not a definitive offline answer (403 WAF, 5xx…);
 *   callers report an unknown state instead of "offline".
 * Transport failures throw (they are retryable through the proxy upstream).
 */
async function fetchLiveManifestSmart(
  identifier: string,
  username: string,
): Promise<
  | { ok: true; info: ManifestInfo; usedProxy: boolean }
  | { ok: false; notFound: boolean; error?: string }
> {
  const url =
    `${getManifestBase()}/live/s:${encodeURIComponent(username)}.json` +
    `?last=load&format=mp4-hls`;
  const { value: result, usedProxy } = await withSmartRoute(identifier, async (agent) => {
    const res = await request(url, {
      agent,
      timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
      headers: siteHeaders({ Referer: `${getBase()}/` }),
    });
    if (res.status === 200) {
      try {
        return { status: res.status, info: JSON.parse(res.body) as ManifestInfo };
      } catch {
        // ponytail: a 200 page that is not JSON is the classic ISP
        // block-page injection — retryable through the proxy.
        throw new Error('manifest returned invalid JSON');
      }
    }
    return { status: res.status, info: null };
  });

  if (result.info !== null) {
    return { ok: true, info: result.info, usedProxy };
  }
  const notFound = result.status === 404 || result.status === 410;
  return { ok: false, notFound, error: `manifest returned HTTP ${result.status}` };
}

/** True when the manifest advertises a recordable mp4-hls encoding table. */
function hasHlsEncodings(info: ManifestInfo): boolean {
  const encodings = info.formats?.['mp4-hls']?.encodings;
  return Array.isArray(encodings) && encodings.length > 0;
}

interface StreamVariant {
  url: string;
  bandwidth: number;
  resolution?: string;
  codecs?: string;
}

/**
 * Build the variant table from the manifest's mp4-hls encodings. The manifest
 * server hands out absolute playlist locations; entries without one are
 * skipped — they cannot be recorded. The location URLs embed the bitrate and
 * resolution (…_700_768x432_128/index.m3u8), used when the encoding entry
 * does not carry explicit fields.
 */
function variantsFromManifest(info: ManifestInfo): StreamVariant[] {
  const encodings = info.formats?.['mp4-hls']?.encodings ?? [];
  const variants: StreamVariant[] = [];
  for (const enc of encodings) {
    const location = typeof enc.location === 'string' ? enc.location : undefined;
    if (location === undefined || location === '') continue;
    const width = typeof enc.videoWidth === 'number' ? enc.videoWidth : undefined;
    const height = typeof enc.videoHeight === 'number' ? enc.videoHeight : undefined;
    const fromUrl = parseEncodingUrl(location);
    variants.push({
      url: location,
      bandwidth:
        typeof enc.videoKbps === 'number' && enc.videoKbps > 0
          ? enc.videoKbps * 1000
          : (fromUrl?.bandwidth ?? 0),
      resolution:
        width !== undefined && height !== undefined
          ? `${width}x${height}`
          : fromUrl?.resolution,
    });
  }
  return variants;
}

/**
 * Pull bitrate + resolution out of a manifest location URL
 * (`..._<kbps>_<WxH>_<akbps>/index.m3u8`).
 */
function parseEncodingUrl(url: string): { bandwidth: number; resolution?: string } | null {
  const m = url.match(/_(\d{2,5})_(\d{2,5})x(\d{2,5})_\d+\/index\.m3u8/i);
  if (m === null) return null;
  return { bandwidth: parseInt(m[1]!, 10) * 1000, resolution: `${m[2]}x${m[3]}` };
}

/**
 * ponytail: prefer the highest-bitrate H.264 variant (avc1 over av01/hevc
 * via a large score bonus). Returning the MASTER playlist itself broke
 * recording on other plugins: the HLS demuxer opens every variant
 * simultaneously and the copy-muxer drops all packets of the multi-variant
 * stream — recording the single best variant works and is also lighter on
 * the edge.
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

/**
 * Resolve the manifest into the best single-variant media playlist URL.
 *
 * ponytail: the mp4-hls location is usually ALREADY a media playlist (one
 * encoding per entry in the manifest, no master). When it is a master we
 * still resolve it to the best #EXT-X-STREAM-INF variant — handing ffmpeg a
 * multi-variant master breaks the copy muxer (see pickBestVariant).
 * Returns the picked URL plus the variant table for the UI.
 */
async function resolveBestVariantUrl(
  masterUrl: string,
  agent: Agent | null,
): Promise<{ url: string; variants: StreamVariant[] }> {
  const res = await request(masterUrl, {
    agent,
    timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
    headers: siteHeaders({ Referer: `${getBase()}/` }),
  });
  if (res.status !== 200 || !res.body.includes('#EXTM3U')) {
    throw new Error(`Playlist not playable (HTTP ${res.status})`);
  }
  if (res.body.includes('#EXT-X-PLAYLIST-TYPE:VOD')) {
    throw new Error('Playlist is a VOD, not a live stream');
  }

  const lines = res.body.split('\n').map((l) => l.trim());
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
  if (variants.length === 0) {
    // Already a media playlist — use as-is.
    return { url: masterUrl, variants: [] };
  }
  return { url: pickBestVariant(variants).url, variants };
}

/**
 * Full resolve: manifest -> playlist -> best variant, staying on ONE route
 * (direct or proxy) for the whole fetch cycle so detection and extraction
 * agree (see withSmartRoute).
 */
async function resolveStreamSmart(
  identifier: string,
  username: string,
): Promise<{ url: string; variants: StreamVariant[]; usedProxy: boolean } | null> {
  const manifest = await fetchLiveManifestSmart(identifier, username);
  if (!manifest.ok) {
    if (manifest.notFound) {
      // ponytail: OFFLINE is a definitive site answer (the edge serves 404
      // when the broadcast is not up) — a null result, NOT an error, so
      // offline rooms do not spam "Monitoring check failed" and the job
      // does not sit in retry/backoff forever.
      return null;
    }
    throw new Error(manifest.error ?? 'manifest unavailable');
  }
  if (!hasHlsEncodings(manifest.info)) {
    // ponytail: a live-looking manifest without any recordable HLS encoding
    // (e.g. a private/gold show) is effectively not recordable — same policy
    // as the Chaturbate/Stripchat plugins for private rooms.
    return null;
  }
  const variants = variantsFromManifest(manifest.info);
  if (variants.length === 0) {
    return null;
  }
  const best = pickBestVariant(variants);
  const resolved = await resolveBestVariantUrl(best.url, manifest.usedProxy ? await proxyFor(identifier) : null);
  // ponytail: the playlist itself usually has no #EXT-X-STREAM-INF table
  // (each manifest encoding is its own media playlist) — surface the
  // MANIFEST's encoding table as the quality options instead of collapsing
  // to a single "Best" entry, so the UI can show real resolutions/bitrates.
  const finalVariants = resolved.variants.length > 0 ? resolved.variants : variants;
  const bestUrl = resolved.variants.length > 0 ? resolved.url : best.url;
  return { url: bestUrl, variants: finalVariants, usedProxy: manifest.usedProxy };
}

// ---- creator helpers -------------------------------------------------------

function creatorFromUsername(username: string, live: boolean): CreatorInfo {
  const base = getBase();
  return {
    id: `streamate:${username}`,
    username,
    displayName: username,
    profileUrl: `${base}/cam/${username}/`,
    isLive: live,
    liveUrl: live ? `${base}/cam/${username}/` : undefined,
  };
}

// ---- plugin ----------------------------------------------------------------

const plugin: Plugin = {
  manifest,

  get status(): PluginStatus {
    return status;
  },

  capabilities: {
    auth: {
      async getStatus(): Promise<AuthStatus> {
        const cookieStr = getCookieString();
        if (!cookieStr) return { authenticated: false };
        try {
          const res = await request(`${getBase()}/`, { headers: siteHeaders() });
          const hasSession = res.body.includes('Logout') || res.body.includes('logout');
          let username: string | undefined;
          if (hasSession) {
            const m = res.body.match(/"username"\s*:\s*"([^"]+)"/);
            username = m?.[1];
          }
          return { authenticated: hasSession, username };
        } catch {
          return { authenticated: false };
        }
      },
      async login(credentials?: Record<string, string>): Promise<void> {
        const cookieHeader = credentials?.['cookie'];
        if (!cookieHeader) {
          throw new Error('Provide cookies via the "cookie" field (paste your browser cookie header value).');
        }
        loadCookieHeader(cookieHeader);
        ctx?.logger.info('streamate: cookies loaded');
      },
      async logout(): Promise<void> {
        cookieJar = {};
        ctx?.logger.info('streamate: cookies cleared');
      },
    },

    creatorSearch: {
      async search(query: CreatorSearchQuery): Promise<CreatorSearchResult> {
        const q = query.query.trim().replace(/^streamate:/, '');
        if (!q) return { creators: [], total: 0 };
        // ponytail: Streamate exposes no usable public search API — resolve
        // the username directly (the site treats /cam/<name> as the room),
        // like the BongaCams plugin treats search as a username lookup.
        const creator = await plugin.capabilities.creatorSearch!.getCreator(q);
        return { creators: creator ? [creator] : [], total: creator ? 1 : 0 };
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const username = identifier.replace(/^streamate:/, '');
        if (!username) return null;
        try {
          // ponytail: live state comes from the manifest edge (a definitive
          // answer). The public room pages are client-rendered with no
          // server-side performer data, so the username doubles as the
          // display name — same as the Chaturbate plugin's fallback.
          const manifestResult = await fetchLiveManifestSmart(identifier, username);
          const live = manifestResult.ok && hasHlsEncodings(manifestResult.info);
          return creatorFromUsername(username, live);
        } catch {
          // Transport failure on both routes — not a search miss, but the
          // SDK shape forces null here; the host treats lookups as best
          // effort and monitoring re-checks independently.
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const username = identifier.replace(/^streamate:/, '');
        ctx?.logger.debug(`streamate: checking live status for ${username}`);
        // ponytail: a monitoring check must NEVER kill its job. Transport
        // failures (ISP blocks, throttling, site hiccups) are transient —
        // swallowing them here keeps the monitor alive and simply defers
        // detection to the next poll. Definitive answers (manifest 404 =
        // broadcast not up) still report plain offline below.
        try {
          const resolved = await resolveStreamSmart(identifier, username);
          if (resolved === null) {
            ctx?.logger.debug(`streamate: ${username} manifest gone (404/no encodings) — offline`);
            return { isLive: false };
          }
          ctx?.logger.debug(
            `streamate: ${username} live (${resolved.variants.length + 1} encodings)`,
          );
          return {
            isLive: true,
            title: `${username} is live`,
            // ponytail: Streamate's manifest payload carries no live viewer
            // count or room title — omit rather than show a wrong number
            // (the UI only shows the count when the plugin provides one).
            viewerCount: undefined,
            streamUrl: resolved.url,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // ponytail: `unknown` — the site could not be reached, which is
          // neither "live" nor "ended". A plain offline answer here emitted
          // `creator-offline`, which the app translates into
          // stopForCreator: healthy recordings were finalized mid-capture
          // by a network blip. The host keeps the previous state and
          // retries instead.
          ctx?.logger.warn(`streamate: ${username} check degraded (site unreachable) — host will retry: ${msg}`);
          return { isLive: false, unknown: true };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const username = identifier.replace(/^streamate:/, '');
        ctx?.logger.debug(`streamate: extracting stream for ${username}`);
        const resolved = await resolveStreamSmart(identifier, username);
        if (resolved === null) {
          // 404 / no encodings = broadcast not up (see resolveStreamSmart).
          throw new Error(`${username} is not live`);
        }

        const allVariants: Array<{
          id: string;
          label: string;
          format: string;
          resolution?: string;
          bitrate?: number;
          isBest?: boolean;
        }> = resolved.variants.map((v, idx) => ({
          id: `variant-${idx}`,
          label: v.resolution ?? `${Math.round(v.bandwidth / 1000)} kbps`,
          format: 'hls',
          resolution: v.resolution,
          bitrate: v.bandwidth > 0 ? v.bandwidth : undefined,
          isBest: v.url === resolved.url,
        }));
        // The manifest-level best variant is the resolved URL itself; when
        // the playlist had no #EXT-X-STREAM-INF variants it is the only one.
        const qualityOptions =
          allVariants.length > 0
            ? allVariants
            : [{ id: 'best', label: 'Best', format: 'hls', isBest: true }];

        const cookies = Object.entries(cookieJar).map(([name, value]) => ({
          name,
          value,
          domain: `.${new URL(getBase()).hostname.replace(/^www\./, '')}`,
          path: '/',
          secure: true,
        }));

        // ponytail: recording children (ffmpeg/yt-dlp) only route through
        // the proxy when THIS fetch cycle actually needed it — with a system
        // VPN (WARP) the direct route works and Tor is never touched.
        const proxyUrl = resolved.usedProxy ? proxyHttpUrlFor(identifier) : null;
        if (proxyUrl !== null) {
          ctx?.logger.debug('streamate: stream will be recorded through the secure proxy');
        }

        return {
          creatorId: `streamate:${username}`,
          creatorName: username,
          platformId: 'streamate',
          title: `${username} live on Streamate`,
          streamUrl: resolved.url,
          headers: siteHeaders({ Referer: `${getBase()}/` }),
          cookies,
          proxyUrl: proxyUrl ?? undefined,
          qualityOptions,
          metadata: {
            category: 'Streamate',
            tags: ['live'],
          },
          startedAt: new Date().toISOString(),
        };
      },
    },

    settings: {
      getSchema(): Record<string, SettingDef> {
        return SETTINGS_SCHEMA;
      },
      async validate(values: PluginSettingValues) {
        const errors: Record<string, string> = {};
        for (const key of ['baseUrl', 'manifestBaseUrl']) {
          const value = values[key];
          if (typeof value === 'string' && value.trim() !== '') {
            try {
              const u = new URL(value.trim());
              if (u.protocol !== 'https:' && u.protocol !== 'http:') {
                errors[key] = 'Must be an http(s) URL';
              }
            } catch {
              errors[key] = 'Invalid URL';
            }
          }
        }
        return { valid: Object.keys(errors).length === 0, errors };
      },
    },

    healthCheck: {
      async check(): Promise<HealthStatus> {
        const start = Date.now();
        try {
          const res = await request(`${getBase()}/`, { headers: siteHeaders() });
          return {
            healthy: res.status === 200,
            message: res.status === 200 ? 'Streamate reachable' : `HTTP ${res.status}`,
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          return { healthy: false, message: String(e) };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const username = identifier.replace(/^streamate:/, '');
        // ponytail: Streamate room pages are client-rendered (no SSR
        // performer data), so metadata is limited to what the platform
        // exposes without an authenticated session.
        return {
          displayName: username,
          website: `${getBase()}/cam/${username}/`,
        };
      },
    },
  },

  async initialize(context: PluginContext): Promise<void> {
    status.state = 'initializing';
    ctx = context;
    context.logger.info('streamate: initializing');
    const savedCookies = context.settings.get('cookies');
    if (typeof savedCookies === 'string' && savedCookies.length > 0) {
      loadCookieHeader(savedCookies);
      context.logger.info('streamate: loaded saved cookies');
    }
    status.state = 'ready';
  },

  async start(): Promise<void> {
    status.state = 'ready';
  },

  async stop(): Promise<void> {
    status.state = 'disabled';
  },

  async cleanup(): Promise<void> {
    status.state = 'installed';
    ctx = null;
  },
};

export default plugin;
