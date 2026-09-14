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

const DEFAULT_BASE = 'https://www.cam4.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ponytail: Cam4 REST endpoints (verified live). search/performer is the
// cheap online flag used for monitoring; streamInfo carries the signed HLS
// master playlist; profile/info carries the rich profile (joined date,
// location, languages, bio). Everything is plain JSON with browser-like
// headers — no browser automation, no local proxies, hence no ProxyRegistry.
const SEARCH_ENDPOINT = (username: string): string =>
  `${DEFAULT_BASE}/rest/v1.0/search/performer/${encodeURIComponent(username)}`;
const STREAM_INFO_ENDPOINT = (username: string): string =>
  `${DEFAULT_BASE}/rest/v1.0/profile/${encodeURIComponent(username)}/streamInfo`;
const PROFILE_INFO_ENDPOINT = (username: string): string =>
  `${DEFAULT_BASE}/rest/v1.0/profile/${encodeURIComponent(username)}/info`;

// ponytail: cookie jar lives in memory only, reset on app restart
let cookieJar: Record<string, string> = {};

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
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

function siteHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'User-Agent': getUserAgent(),
    Referer: `${DEFAULT_BASE}/`,
    Origin: DEFAULT_BASE,
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
  ctx?.logger.debug(`cam4: ${options.method ?? 'GET'} ${url}`);
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
        timeout:
          options.timeout ??
          (options.agent !== undefined && options.agent !== null ? PROXY_TIMEOUT_MS : 15_000),
        // ponytail: routing decisions live in the host — the agent is passed
        // by reference (same process) and may be null when going direct.
        ...(options.agent !== undefined && options.agent !== null ? { agent: options.agent } : {}),
      },
      (res) => {
        parseCookies(res.headers['set-cookie']);
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          ctx?.logger.debug(`cam4: ${statusCode} -> redirect to ${next}`);
          res.resume();
          resolve(request(next, options, hops + 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          ctx?.logger.debug(`cam4: ${statusCode} ${body.length} bytes from ${url}`);
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
      `cam4: direct request failed (${err instanceof Error ? err.message : err}) — retrying through secure proxy`,
    );
  }
  const agent = await proxyFor(identifier);
  const value = await attempt(agent);
  return { value, usedProxy: true };
}

// ---- REST API wrappers -----------------------------------------------------

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
}

function str(v: Json | null, key: string): string | undefined {
  const x = v?.[key];
  return typeof x === 'string' ? x : undefined;
}

function num(v: Json | null, key: string): number | undefined {
  const x = v?.[key];
  return typeof x === 'number' ? x : undefined;
}

function bool(v: Json | null, key: string): boolean | undefined {
  const x = v?.[key];
  return typeof x === 'boolean' ? x : undefined;
}

export interface PerformerInfo {
  username: string;
  online: boolean;
  gender?: string;
  country?: string;
  /** ms epoch the account was created. */
  creationDate?: number;
  /** ms epoch of the last broadcast. */
  lastBroadcast?: number;
  profileImageUrl?: string;
}

export interface StreamInfo {
  /** Signed HLS master playlist minted by the site — valid while live. */
  cdnUrl: string;
  canUseCdn: boolean;
}

export interface ProfileInfo {
  userId?: number;
  age?: number;
  gender?: string;
  countryId?: string;
  city?: string;
  mainLanguage?: string;
  secondaryLanguages?: string[];
  occupation?: string;
  bodyType?: string;
  hairColor?: string;
  eyeColor?: string;
  aboutMe?: string;
}

/**
 * Fetch a JSON endpoint through the smart route.
 * - `missing: true` — definitive site answer that the user does not exist
 *   (404 with a JSON error code; the room page serves /error-no-profile).
 * - `unavailable: true` — the SITE answered but not with a usable payload
 *   (HTML where JSON was expected = likely a block/upsell page). Callers
 *   report an unknown state instead of "offline".
 * Transport failures throw (retryable through the proxy upstream).
 */
async function fetchJsonSmart(
  identifier: string,
  url: string,
): Promise<{ json: Json; usedProxy: boolean } | { missing: true } | { unavailable: true }> {
  const { value: result, usedProxy } = await withSmartRoute(identifier, async (agent) => {
    const res = await request(url, {
      agent,
      timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
      headers: siteHeaders({ Accept: 'application/json' }),
    });
    if (res.status === 404) {
      return { kind: 'not-found' as const };
    }
    if (res.status === 200) {
      const trimmed = res.body.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        // ponytail: HTML where JSON was expected is the classic ISP
        // block-page injection — retryable through the proxy.
        throw new Error('endpoint returned invalid JSON');
      }
      return { kind: 'ok' as const, body: trimmed };
    }
    return { kind: 'http' as const, status: res.status };
  });

  if ('kind' in result) {
    if (result.kind === 'not-found') return { missing: true };
    if (result.kind === 'ok') {
      try {
        const parsed: unknown = JSON.parse(result.body);
        const json = asRecord(parsed);
        if (json !== null) return { json, usedProxy };
      } catch {
        throw new Error('endpoint returned invalid JSON');
      }
      return { unavailable: true };
    }
    throw new Error(`endpoint returned HTTP ${result.status}`);
  }
  return { unavailable: true };
}

export async function fetchPerformerSmart(
  identifier: string,
  username: string,
): Promise<{ info: PerformerInfo | null; unavailable: boolean }> {
  const result = await fetchJsonSmart(identifier, SEARCH_ENDPOINT(username));
  if ('json' in result) {
    const json = result.json;
    const name = str(json, 'username');
    if (name === undefined) return { info: null, unavailable: false };
    return {
      info: {
        username: name,
        online: bool(json, 'online') === true,
        gender: str(json, 'gender'),
        country: str(json, 'country'),
        creationDate: num(json, 'creationDate'),
        lastBroadcast: num(json, 'lastBroadcast'),
        profileImageUrl: str(json, 'profileImageUrl'),
      },
      unavailable: false,
    };
  }
  if ('missing' in result) return { info: null, unavailable: false };
  return { info: null, unavailable: true };
}

/**
 * Fetch the signed HLS master playlist URL for a broadcaster.
 * - 200 JSON with a usable cdnURL -> `{ ok: true }`.
 * - 204 empty body or `canUseCDN: false` -> `{ ok: false, offline: true }`
 *   (204 = broadcast not up — the definitive offline answer).
 * - HTML body / other unexpected payloads -> `{ ok: false, offline: false }`
 *   (site answered but unusable — callers report unknown, not offline).
 * - 404 -> the performer does not exist -> `{ missing: true }`.
 */
export async function fetchStreamInfoSmart(
  identifier: string,
  username: string,
): Promise<
  | { ok: true; stream: StreamInfo; usedProxy: boolean }
  | { ok: false; offline: boolean }
  | { missing: true }
> {
  const { value: result, usedProxy } = await withSmartRoute(identifier, async (agent) => {
    const res = await request(STREAM_INFO_ENDPOINT(username), {
      agent,
      timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
      headers: siteHeaders({ Accept: 'application/json' }),
    });
    return { status: res.status, body: res.body.trim() };
  });

  if (result.status === 404) return { missing: true };
  if (result.status === 204) return { ok: false, offline: true };
  if (result.status !== 200) {
    throw new Error(`streamInfo returned HTTP ${result.status}`);
  }
  if (!result.body.startsWith('{')) {
    throw new Error('streamInfo returned invalid JSON');
  }
  let json: Json;
  try {
    const parsed: unknown = JSON.parse(result.body);
    const rec = asRecord(parsed);
    if (rec === null) throw new Error('streamInfo returned invalid JSON');
    json = rec;
  } catch (e) {
    throw e instanceof Error ? e : new Error('streamInfo returned invalid JSON');
  }
  const canUseCdn = bool(json, 'canUseCDN') === true;
  const cdnUrl = str(json, 'cdnURL');
  if (!canUseCdn || cdnUrl === undefined || cdnUrl === '') {
    // ponytail: canUseCDN=false is the site's own "private show" signal
    // (same reading as the streamlink Cam4 plugin).
    return { ok: false, offline: true };
  }
  return { ok: true, stream: { cdnUrl, canUseCdn }, usedProxy };
}

export async function fetchProfileInfoSmart(
  identifier: string,
  username: string,
): Promise<ProfileInfo | null> {
  const result = await fetchJsonSmart(identifier, PROFILE_INFO_ENDPOINT(username));
  if (!('json' in result)) return null;
  const json = result.json;
  return {
    userId: num(json, 'userId'),
    age: num(json, 'age'),
    gender: str(json, 'gender'),
    countryId: str(json, 'countryId'),
    city: str(json, 'city'),
    mainLanguage: str(json, 'mainLanguage'),
    secondaryLanguages: Array.isArray(json['secondaryLanguages'])
      ? (json['secondaryLanguages'] as unknown[]).filter((l): l is string => typeof l === 'string')
      : undefined,
    occupation: str(json, 'occupation'),
    bodyType: str(json, 'femaleBodyType') ?? str(json, 'maleBodyType') ?? str(json, 'bodyType'),
    hairColor: str(json, 'hairColor'),
    eyeColor: str(json, 'eyeColor'),
  };
}

// ---- HLS resolution --------------------------------------------------------

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
 * Resolve the master playlist into the best single-variant media playlist
 * URL, staying on ONE route (direct or proxy) for the whole fetch cycle so
 * detection and extraction agree (see withSmartRoute).
 */
async function resolveBestVariantUrl(
  masterUrl: string,
  agent: Agent | null,
): Promise<{ url: string; variants: StreamVariant[] }> {
  const res = await request(masterUrl, {
    agent,
    timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
    headers: siteHeaders({ Referer: `${DEFAULT_BASE}/` }),
  });
  if (res.status !== 200 || !res.body.includes('#EXTM3U')) {
    throw new Error(`Playlist not playable (HTTP ${res.status})`);
  }
  if (res.body.includes('#EXT-X-PLAYLIST-TYPE:VOD')) {
    throw new Error('Playlist is a VOD, not a live stream');
  }
  const variants = parseVariants(masterUrl, res.body);
  if (variants.length === 0) {
    // Already a media playlist — use as-is.
    return { url: masterUrl, variants: [] };
  }
  return { url: pickBestVariant(variants).url, variants };
}

/**
 * Full resolve: streamInfo -> master playlist -> best variant, keeping the
 * SAME route the streamInfo fetch used when it needed the proxy.
 */
async function resolveStreamSmart(
  identifier: string,
  username: string,
): Promise<{
  url: string;
  variants: StreamVariant[];
  usedProxy: boolean;
  stream: StreamInfo;
} | null> {
  const info = await fetchStreamInfoSmart(identifier, username);
  if ('missing' in info) {
    // ponytail: the performer does not exist — treat as offline rather than
    // throwing so monitoring rows deactivate cleanly when a creator is
    // deleted on the platform.
    return null;
  }
  if (!info.ok) {
    if (info.offline) {
      // ponytail: OFFLINE is a definitive site answer (204 / canUseCDN=false
      // = broadcast not up or private) — a null result, NOT an error, so
      // offline rooms do not spam "Monitoring check failed" and the job
      // does not sit in retry/backoff forever.
      return null;
    }
    throw new Error('streamInfo unavailable');
  }
  const resolved = await resolveBestVariantUrl(
    info.stream.cdnUrl,
    info.usedProxy ? await proxyFor(identifier) : null,
  );
  return { ...resolved, usedProxy: info.usedProxy, stream: info.stream };
}

// ---- creator helpers -------------------------------------------------------

function roomUrl(username: string): string {
  return `${DEFAULT_BASE}/${encodeURIComponent(username)}`;
}

function creatorFromPerformer(info: PerformerInfo): CreatorInfo {
  const live = info.online;
  return {
    id: `cam4:${info.username}`,
    username: info.username,
    displayName: info.username,
    avatarUrl: info.profileImageUrl,
    profileUrl: roomUrl(info.username),
    bio: info.country !== undefined ? `Country: ${info.country}` : undefined,
    isLive: live,
    liveUrl: live ? roomUrl(info.username) : undefined,
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
        // ponytail: Cam4 has no stable public /me endpoint; cookies are
        // accepted as provided and their real effect is verified by use.
        return { authenticated: true };
      },
      async login(credentials?: Record<string, string>): Promise<void> {
        const cookieHeader = credentials?.['cookie'];
        if (!cookieHeader) {
          throw new Error(
            'Provide cookies via the "cookie" field (paste your browser cookie header value).',
          );
        }
        loadCookieHeader(cookieHeader);
        ctx?.logger.info('cam4: cookies loaded');
      },
      async logout(): Promise<void> {
        cookieJar = {};
        ctx?.logger.info('cam4: cookies cleared');
      },
    },

    creatorSearch: {
      async search(query: CreatorSearchQuery): Promise<CreatorSearchResult> {
        const q = query.query.trim().replace(/^cam4:/, '');
        if (!q) {
          // ponytail: Cam4 exposes no public search API — discovery would
          // need the directory pages; return empty rather than scrape HTML.
          return { creators: [], total: 0 };
        }
        const creator = await plugin.capabilities.creatorSearch!.getCreator(q);
        return { creators: creator ? [creator] : [], total: creator ? 1 : 0 };
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const username = identifier.replace(/^cam4:/, '');
        if (!username) return null;
        try {
          const { info, unavailable } = await fetchPerformerSmart(identifier, username);
          if (info !== null) return creatorFromPerformer(info);
          if (unavailable) {
            ctx?.logger.debug(`cam4: ${username} lookup degraded (site unreachable)`);
          }
          return null;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ctx?.logger.debug(`cam4: getCreator ${username} failed: ${msg}`);
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const username = identifier.replace(/^cam4:/, '');
        ctx?.logger.debug(`cam4: checking live status for ${username}`);
        // ponytail: a monitoring check must NEVER kill its job. Transport
        // failures (ISP blocks, throttling, site hiccups) are transient —
        // swallowing them here keeps the monitor alive and simply defers
        // detection to the next poll. Definitive answers (204/no CDN =
        // broadcast not up) still report plain offline below.
        try {
          const resolved = await resolveStreamSmart(identifier, username);
          if (resolved === null) {
            ctx?.logger.debug(`cam4: ${username} broadcast down (204/no CDN) — offline`);
            return { isLive: false };
          }
          ctx?.logger.debug(`cam4: ${username} live (${resolved.variants.length + 1} encodings)`);
          return {
            isLive: true,
            title: `${username} is live`,
            // ponytail: the REST payloads carry no live viewer count or room
            // title — omit rather than show a wrong number (the UI only
            // shows the count when the plugin provides one).
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
          ctx?.logger.warn(
            `cam4: ${username} check degraded (site unreachable) — host will retry: ${msg}`,
          );
          return { isLive: false, unknown: true };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const username = identifier.replace(/^cam4:/, '');
        ctx?.logger.debug(`cam4: extracting stream for ${username}`);
        const resolved = await resolveStreamSmart(identifier, username);
        if (resolved === null) {
          // 204 / canUseCDN=false = broadcast not up (see resolveStreamSmart).
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
        // When the master had no #EXT-X-STREAM-INF table the master URL
        // itself is the only (media) playlist.
        const qualityOptions =
          allVariants.length > 0
            ? allVariants
            : [{ id: 'best', label: 'Best', format: 'hls', isBest: true }];

        const cookies = Object.entries(cookieJar).map(([name, value]) => ({
          name,
          value,
          domain: '.cam4.com',
          path: '/',
          secure: true,
        }));

        // ponytail: recording children (ffmpeg/yt-dlp) only route through
        // the proxy when THIS fetch cycle actually needed it — with a system
        // VPN (WARP) the direct route works and Tor is never touched.
        const proxyUrl = resolved.usedProxy ? proxyHttpUrlFor(identifier) : null;
        if (proxyUrl !== null) {
          ctx?.logger.debug('cam4: stream will be recorded through the secure proxy');
        }

        // ponytail: metadata is best-effort — the stream must not fail just
        // because the profile endpoint hiccuped.
        const profile = await fetchProfileInfoSmart(identifier, username).catch(() => null);

        return {
          creatorId: `cam4:${username}`,
          creatorName: username,
          platformId: 'cam4',
          title: `${username} live on Cam4`,
          thumbnail: undefined,
          streamUrl: resolved.url,
          headers: siteHeaders({ Referer: `${DEFAULT_BASE}/` }),
          cookies,
          proxyUrl: proxyUrl ?? undefined,
          qualityOptions,
          metadata: {
            category: 'Cam4',
            tags: ['live'],
            profileUrl: roomUrl(username),
            gender: profile?.gender,
            country: profile?.countryId,
            city: profile?.city,
            languages:
              profile?.mainLanguage !== undefined
                ? [profile.mainLanguage, ...(profile.secondaryLanguages ?? [])]
                : undefined,
            age: profile?.age,
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
        const ua = values['userAgent'];
        if (typeof ua === 'string' && ua.trim() === '') {
          errors['userAgent'] = 'User-Agent must not be empty';
        }
        return { valid: Object.keys(errors).length === 0, errors };
      },
    },

    healthCheck: {
      async check(): Promise<HealthStatus> {
        const start = Date.now();
        try {
          const res = await request(`${DEFAULT_BASE}/`, { headers: siteHeaders() });
          return {
            healthy: res.status === 200,
            message: res.status === 200 ? 'Cam4 reachable' : `HTTP ${res.status}`,
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          return { healthy: false, message: e instanceof Error ? e.message : String(e) };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const username = identifier.replace(/^cam4:/, '');
        try {
          const [{ info }, profile] = await Promise.all([
            fetchPerformerSmart(identifier, username),
            fetchProfileInfoSmart(identifier, username).catch(() => null),
          ]);
          const website = roomUrl(username);
          if (info === null && profile === null) {
            return { displayName: username, website };
          }
          // ponytail: lastBroadcast/creationDate are ms epochs.
          const joinedAt =
            info?.creationDate !== undefined
              ? new Date(info.creationDate).toISOString()
              : undefined;
          const languages =
            profile?.mainLanguage !== undefined
              ? [profile.mainLanguage, ...(profile.secondaryLanguages ?? [])]
              : undefined;
          return {
            displayName: info?.username ?? username,
            avatarUrl: info?.profileImageUrl,
            location:
              profile?.city !== undefined || profile?.countryId !== undefined
                ? [profile?.city, profile?.countryId?.toUpperCase()].filter(Boolean).join(', ') ||
                  undefined
                : undefined,
            joinedAt,
            links: languages,
            website,
          };
        } catch {
          return { displayName: username, website: roomUrl(username) };
        }
      },
    },
  },

  async initialize(context: PluginContext): Promise<void> {
    status.state = 'initializing';
    ctx = context;
    context.logger.info('cam4: initializing');
    const savedCookies = context.settings.get('cookies');
    if (typeof savedCookies === 'string' && savedCookies.length > 0) {
      loadCookieHeader(savedCookies);
      context.logger.info('cam4: loaded saved cookies');
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
