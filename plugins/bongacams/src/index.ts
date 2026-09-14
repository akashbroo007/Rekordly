import type {
  AuthStatus,
  CreatorInfo,
  CreatorMetadata,
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

const DEFAULT_BASE = 'https://www.bongacams.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ponytail: cookie jar lives in memory only, reset on app restart
let cookieJar: Record<string, string> = {};

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  baseUrl: {
    type: 'text',
    label: 'Site URL',
    description: 'Base URL of the site (white-label mirrors like de.bongacams.com work here).',
    defaultValue: DEFAULT_BASE,
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

function getCookieString(): string {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
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
  return typeof v === 'string' && v.length > 0 ? v : UA;
}

function getBaseUrl(): string {
  const v = ctx?.settings.get('baseUrl');
  const raw = typeof v === 'string' && v.length > 0 ? v : DEFAULT_BASE;
  return raw.replace(/\/+$/, '');
}

/**
 * ponytail: route through the host's embedded proxy when the user flagged
 * this creator (`creators.use_proxy`) — ISP/DNS blocks are regional, so this
 * is a user decision the host resolves per identifier, never a plugin one.
 */
async function proxyFor(identifier: string): Promise<Agent | null> {
  const network = ctx?.network;
  if (network === undefined) return null;
  try {
    await network.ensureProxy(identifier);
  } catch (err) {
    // ponytail: a proxy that cannot come up must fail loudly — silently
    // going direct against a blocked site would look like "model offline".
    throw new Error(
      `Secure proxy unavailable: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  return network.getProxyAgent(identifier);
}

/** HTTP proxy URL for recording child processes, or null to go direct. */
function proxyHttpUrlFor(identifier: string): string | null {
  return ctx?.network?.getProxyHttpUrl(identifier) ?? null;
}

const DIRECT_TIMEOUT_MS = 8_000;
const PROXY_TIMEOUT_MS = 45_000;

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

// ponytail: simple recursive redirect follower, cap at 5 hops
function request(
  url: string,
  options: { method?: string; body?: string; headers?: Record<string, string>; agent?: Agent | null; timeout?: number } = {},
  hops = 0,
): Promise<HttpResult> {
  if (hops > 5) return Promise.reject(new Error('Too many redirects'));
  ctx?.logger.debug(`bongacams: ${options.method ?? 'GET'} ${url}`);
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
        // by reference (same process) and may be undefined when going direct.
        ...(options.agent !== undefined && options.agent !== null ? { agent: options.agent } : {}),
      },
      (res) => {
        parseCookies(res.headers['set-cookie']);
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          ctx?.logger.debug(`bongacams: ${statusCode} -> redirect to ${next}`);
          res.resume();
          resolve(request(next, options, hops + 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          ctx?.logger.debug(`bongacams: ${statusCode} ${body.length} bytes from ${url}`);
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
      `bongacams: direct request failed (${err instanceof Error ? err.message : err}) — retrying through secure proxy`,
    );
  }
  const agent = await proxyFor(identifier);
  const value = await attempt(agent);
  return { value, usedProxy: true };
}

async function fetchRoomDataSmart(
  identifier: string,
): Promise<{ room: Record<string, unknown>; usedProxy: boolean }> {
  const username = identifier.replace(/^bongacams:/, '');
  const { value: room, usedProxy } = await withSmartRoute(identifier, async (agent) => {
    const result = await request(`${getBaseUrl()}/tools/amf.php`, {
      method: 'POST',
      body: `method=getRoomData&args[]=${encodeURIComponent(username)}&args[]=false`,
      agent,
      timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${getBaseUrl()}/${username}/`,
        Origin: getBaseUrl(),
      },
    });
    if (result.status !== 200) {
      throw new Error(`getRoomData returned HTTP ${result.status}`);
    }
    try {
      return JSON.parse(result.body) as Record<string, unknown>;
    } catch {
      throw new Error('getRoomData returned invalid JSON');
    }
  });
  return { room, usedProxy };
}

function readLocalData(room: Record<string, unknown>): Record<string, unknown> | undefined {
  const localData = room['localData'];
  return typeof localData === 'object' && localData !== null
    ? (localData as Record<string, unknown>)
    : undefined;
}

function readPerformerData(room: Record<string, unknown>): Record<string, unknown> | undefined {
  const performerData = room['performerData'];
  return typeof performerData === 'object' && performerData !== null
    ? (performerData as Record<string, unknown>)
    : undefined;
}

/** The site's own username for stream_ URLs (case matters). */
function readStreamName(room: Record<string, unknown>): string | undefined {
  const performer = readPerformerData(room);
  const name = performer?.['username'];
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

function readVideoServer(room: Record<string, unknown>): string | undefined {
  const server = readLocalData(room)?.['videoServerUrl'];
  return typeof server === 'string' && server.length > 0 ? server : undefined;
}

function hlsUrl(room: Record<string, unknown>, username: string): string | undefined {
  const server = readVideoServer(room);
  if (server === undefined) return undefined;
  const streamName = readStreamName(room) ?? username;
  // ponytail: the API returns a protocol-relative origin ("//edge...") —
  // normalize to https BEFORE building the playlist URL, otherwise the
  // result is relative and new URL() throws, which isPlaylistLive then
  // swallowed as "offline" even for broadcasting rooms (verified against
  // live-edge73.bcvcdn.com, isOnline=true, playlist 200 over https).
  const origin = server.startsWith('//') ? `https:${server}` : server;
  return `${origin.replace(/\/+$/, '')}/hls/stream_${streamName}/playlist.m3u8`;
}

interface StreamVariant {
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
 * recording: the HLS demuxer opens every variant simultaneously and the
 * copy-muxer drops all packets of the multi-variant stream — recording the
 * single best variant works and is also lighter on the edge.
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
 * URL (with the variant table for the UI). Falls back to the master when it
 * is already a media playlist or no variants can be parsed.
 *
 * ponytail: OFFLINE and TRANSPORT failures are different signals. The HLS
 * edge answers 404 when the broadcast is not up (offline rooms have no
 * playlist) — that is a definitive "offline", NOT an error, so it returns
 * null instead of throwing. Throwing made every offline room spam
 * "Monitoring check failed" and kept the job in retry/backoff forever.
 * Any other HTTP status (403 WAF, 5xx) or a transport error still throws so
 * the smart route / monitoring retry logic can react.
 */
async function resolveBestVariantUrl(
  masterUrl: string,
  agent?: Agent | null,
): Promise<{ url: string; variants: StreamVariant[] } | null> {
  const res = await request(masterUrl, {
    agent,
    timeout: agent !== null && agent !== undefined ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
    headers: { Referer: `${getBaseUrl()}/` },
  });
  if (res.status === 404) {
    return null;
  }
  if (res.status !== 200 || !res.body.includes('#EXTM3U')) {
    throw new Error(`Playlist not playable (HTTP ${res.status})`);
  }
  if (res.body.includes('#EXT-X-PLAYLIST-TYPE:VOD')) {
    throw new Error('Playlist is a VOD, not a live stream');
  }
  const variants = parseVariants(masterUrl, res.body);
  if (variants.length === 0) {
    return { url: masterUrl, variants: [] };
  }
  return { url: pickBestVariant(variants).url, variants };
}

function htmlToCreatorInfo(username: string, room: Record<string, unknown> | null, live: boolean): CreatorInfo {
  const performer = room !== null ? readPerformerData(room) : undefined;
  const displayName = performer?.['displayName'];
  const avatar = performer?.['avatarUrl'];
  const bio = performer?.['description'] ?? performer?.['aboutMe'];
  return {
    id: `bongacams:${username}`,
    username,
    displayName: typeof displayName === 'string' && displayName.length > 0 ? displayName : username,
    avatarUrl: typeof avatar === 'string' ? avatar : undefined,
    profileUrl: `${getBaseUrl()}/${username}/`,
    bio: typeof bio === 'string' ? bio : undefined,
    isLive: live,
    liveUrl: live ? `${getBaseUrl()}/${username}/` : undefined,
  };
}

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
          const res = await request(`${getBaseUrl()}/`);
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
        cookieJar = {};
        for (const part of cookieHeader.split(';')) {
          const eqIdx = part.indexOf('=');
          if (eqIdx > 0) {
            cookieJar[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
          }
        }
        ctx?.logger.info('bongacams: cookies loaded');
      },
      async logout(): Promise<void> {
        cookieJar = {};
        ctx?.logger.info('bongacams: cookies cleared');
      },
    },

    creatorSearch: {
      async search(query): Promise<CreatorSearchResult> {
        const q = query.query.trim().replace(/^bongacams:/, '');
        if (!q) return { creators: [], total: 0 };
        const creator = await plugin.capabilities.creatorSearch!.getCreator(q);
        return { creators: creator ? [creator] : [], total: creator ? 1 : 0 };
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const username = identifier.replace(/^bongacams:/, '');
        try {
          const { room, usedProxy } = await fetchRoomDataSmart(identifier);
          const masterUrl = hlsUrl(room, username);
          let live = false;
          if (masterUrl !== undefined) {
            try {
              // ponytail: stay on the amf route when it already needed the
              // proxy; otherwise direct-first with the same network fallback.
              // null = 404 = offline room (playlist removed), not an error.
              const resolved =
                usedProxy
                  ? await resolveBestVariantUrl(masterUrl, await proxyFor(identifier))
                  : (await withSmartRoute(identifier, (agent) => resolveBestVariantUrl(masterUrl, agent))).value;
              live = resolved !== null;
            } catch {
              live = false; // playlist not up — offline room, not a search miss
            }
          }
          return htmlToCreatorInfo(username, room, live);
        } catch {
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const username = identifier.replace(/^bongacams:/, '');
        ctx?.logger.debug(`bongacams: checking live status for ${username}`);
        // ponytail: a monitoring check must NEVER kill its job. Transport
        // failures (ISP blocks, throttling, site hiccups) are transient —
        // the monitoring engine now re-schedules retrying/failed jobs on its
        // own, so swallowing them here keeps the monitor alive and simply
        // defers detection to the next poll. Throwing made every network
        // blip look like "Monitoring check failed" (and, with the old
        // never-reset attempt counter, permanently killed the job).
        // Definitive answers (room data OK, playlist 404 = broadcast not up)
        // still report plain offline below.
        try {
          const { room, usedProxy } = await fetchRoomDataSmart(identifier);
          const masterUrl = hlsUrl(room, username);
          if (masterUrl === undefined) {
            return { isLive: false };
          }
          // ponytail: stay on the amf route when it already needed the proxy;
          // otherwise direct-first with the same network failure fallback.
          // null = 404 = broadcast not up — a plain offline answer, not an
          // error.
          const resolved =
            usedProxy === true
              ? await resolveBestVariantUrl(masterUrl, await proxyFor(identifier))
              : (await withSmartRoute(identifier, (agent) => resolveBestVariantUrl(masterUrl, agent))).value;
          if (resolved === null) {
            ctx?.logger.debug(`bongacams: ${username} playlist gone (404) — offline`);
            return { isLive: false };
          }
          ctx?.logger.debug(`bongacams: ${username} playlist up (${resolved.variants.length} variants)`);
          const performer = readPerformerData(room);
          const title = performer?.['displayName'];
          // ponytail: BongaCams' AMF room data has no real viewer count —
          // loversCount is the model's fan total, not live viewers, so reporting
          // it would show a wildly wrong number (e.g. 8.5k fans as "viewers").
          // Omit it; the UI only shows the count when the plugin provides one.
          return {
            isLive: true,
            title: typeof title === 'string' && title.length > 0 ? title : `${username} is live`,
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
          ctx?.logger.warn(`bongacams: ${username} check degraded (site unreachable) — host will retry: ${msg}`);
          return { isLive: false, unknown: true };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const username = identifier.replace(/^bongacams:/, '');
        ctx?.logger.debug(`bongacams: extracting stream for ${username}`);
        const { room, usedProxy } = await fetchRoomDataSmart(identifier);
        const masterUrl = hlsUrl(room, username);
        if (masterUrl === undefined) throw new Error(`Could not resolve stream for ${username}`);
        const resolved =
          usedProxy === true
            ? await resolveBestVariantUrl(masterUrl, await proxyFor(identifier))
            : (await withSmartRoute(identifier, (agent) => resolveBestVariantUrl(masterUrl, agent))).value;
        if (resolved === null) {
          // 404 = broadcast not up (see resolveBestVariantUrl).
          throw new Error(`${username} is not live`);
        }
        const routeProxy = usedProxy || undefined;
        const qualityOptions: Array<{
          id: string;
          label: string;
          format: string;
          resolution?: string;
          bitrate?: number;
          isBest?: boolean;
        }> =
          resolved.variants.length > 0
            ? resolved.variants.map((v, idx) => ({
                id: `variant-${idx}`,
                label: v.resolution ?? `${Math.round(v.bandwidth / 1000)} kbps`,
                format: 'hls',
                resolution: v.resolution,
                bitrate: v.bandwidth > 0 ? v.bandwidth : undefined,
                isBest: v.url === resolved.url,
              }))
            : [{ id: 'best', label: 'Best', format: 'hls', isBest: true }];

        const cookies = Object.entries(cookieJar).map(([name, value]) => ({
          name,
          value,
          domain: new URL(getBaseUrl()).hostname.replace(/^www\./, '.'),
          path: '/',
          secure: true,
        }));

        // ponytail: recording children (ffmpeg/yt-dlp) only route through
        // the proxy when THIS fetch cycle actually needed it — with a system
        // VPN (WARP) the direct route works and Tor is never touched.
        const proxyUrl = routeProxy === true ? proxyHttpUrlFor(identifier) : null;
        if (proxyUrl !== null) {
          ctx?.logger.debug(`bongacams: stream will be recorded through the secure proxy`);
        }
        const performer = readPerformerData(room);
        const performerName = performer?.['displayName'];

        return {
          creatorId: identifier,
          creatorName: typeof performerName === 'string' && performerName.length > 0 ? performerName : username,
          platformId: 'bongacams',
          title: `${username} live on BongaCams`,
          streamUrl: resolved.url,
          headers: {
            'User-Agent': getUserAgent(),
            Referer: `${getBaseUrl()}/`,
            Origin: getBaseUrl(),
          },
          cookies,
          proxyUrl: proxyUrl ?? undefined,
          qualityOptions,
          metadata: {
            category: 'BongaCams',
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
      async validate(_values: PluginSettingValues) {
        return { valid: true, errors: {} };
      },
    },

    healthCheck: {
      async check(): Promise<HealthStatus> {
        const start = Date.now();
        try {
          const res = await request(`${getBaseUrl()}/`);
          return {
            healthy: res.status === 200,
            message: res.status === 200 ? 'BongaCams reachable' : `HTTP ${res.status}`,
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          return { healthy: false, message: String(e) };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const username = identifier.replace(/^bongacams:/, '');
        try {
          const { room } = await fetchRoomDataSmart(identifier);
          const performer = readPerformerData(room);
          const displayName = performer?.['displayName'];
          const avatar = performer?.['avatarUrl'];
          const lovers = performer?.['loversCount'];
          return {
            displayName:
              typeof displayName === 'string' && displayName.length > 0 ? displayName : username,
            avatarUrl: typeof avatar === 'string' ? avatar : undefined,
            followerCount: typeof lovers === 'number' ? lovers : undefined,
            website: `${getBaseUrl()}/${username}/`,
          };
        } catch {
          return { displayName: username };
        }
      },
    },
  },

  async initialize(context: PluginContext): Promise<void> {
    status.state = 'initializing';
    ctx = context;
    context.logger.info('bongacams: initializing');
    const savedCookies = context.settings.get('cookies');
    if (typeof savedCookies === 'string' && savedCookies.length > 0) {
      for (const part of savedCookies.split(';')) {
        const eqIdx = part.indexOf('=');
        if (eqIdx > 0) {
          cookieJar[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
        }
      }
      context.logger.info('bongacams: loaded saved cookies');
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
