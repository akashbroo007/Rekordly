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
import {
  apiHeaders,
  clearCookies,
  cookieList,
  DIRECT_TIMEOUT_MS,
  getCookieString,
  getUserAgent,
  hasCookies,
  loadCookieHeader,
  isRetryableThroughProxy,
  proxyHttpUrlFor,
  request,
  setCookie,
  setHttpPluginContext,
} from './http';
import { launchHeadlessBrowser, blockHeavyResources } from './browser';
import { resolveBestVariant } from './hls';
import manifest from '../manifest.json';

const status: PluginStatus = { state: 'installed' };

let ctx: PluginContext | null = null;

const DEFAULT_BASE = 'https://kick.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  cookies: {
    type: 'password',
    label: 'Session cookies',
    description:
      'Browser cookies for authentication (paste "cookie" header value from DevTools). Optional — guest access works, but cookies raise API rate limits.',
    defaultValue: '',
  },
  userAgent: {
    type: 'text',
    label: 'User-Agent',
    description: 'Browser User-Agent string sent with requests.',
    defaultValue: UA,
  },
};

// ---- Kick API data model ---------------------------------------------------

/** ponytail: livestockData carries id, slug, playback_url and the user's
 * livestream title (session_title). Field shape per streamlink's kick plugin
 * (kick.com/api/v2/channels/{slug}/livestream -> data). */
interface LivestreamData {
  id?: number;
  slug?: string;
  playbackUrl?: string;
  sessionTitle?: string;
  startedAt?: string;
  viewerCount?: number;
  isLive?: boolean;
}

interface ChannelInfo {
  /** Numeric Kick channel id. */
  userId?: number;
  /** Channel slug (the URL path element, case-insensitive identity). */
  slug: string;
  /** The site's display name (case matters for display only). */
  username: string;
  avatarUrl?: string;
  bannerUrl?: string;
  bio?: string;
  followers?: number;
  verified?: boolean;
  livestream?: LivestreamData;
  recentCategories?: Array<{ name?: string; slug?: string }>;
}

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
}

function rec(v: unknown, key: string): Json | null {
  return asRecord(asRecord(v)?.[key]);
}

function str(v: unknown, key: string): string | undefined {
  const x = asRecord(v)?.[key];
  return typeof x === 'string' ? x : undefined;
}

function num(v: unknown, key: string): number | undefined {
  const x = asRecord(v)?.[key];
  return typeof x === 'number' ? x : undefined;
}

function bool(v: unknown, key: string): boolean | undefined {
  const x = asRecord(v)?.[key];
  return typeof x === 'boolean' ? x : undefined;
}

function arr(v: unknown, key: string): unknown[] | undefined {
  const x = asRecord(v)?.[key];
  return Array.isArray(x) ? x : undefined;
}

function identifierToSlug(identifier: string): string {
  return identifier.replace(/^kick:/, '');
}

/** Kick slugs are the lowercase URL identity; the API accepts either case. */
function normalizeSlug(slug: string): string {
  return decodeURIComponent(slug.trim()).toLowerCase();
}

// ---- API access ------------------------------------------------------------

function getBase(): string {
  const v = ctx?.settings.get('baseUrl');
  const base = typeof v === 'string' && v.trim() ? v.trim() : DEFAULT_BASE;
  return base.replace(/\/+$/, '');
}

/**
 * Query the Kick API.
 *
 * ponytail: Cloudflare-fronted — a 403 with a challenge page is the most
 * common anonymous failure. Detection returns a definitive answer only on
 * HTTP-level responses; transport failures surface as LiveStatus.unknown
 * (the host retries rather than declaring the creator offline). When the
 * direct API answers 403 and we hold no cookies, the browser bootstrap
 * solves the JS challenge once (see maybeBootstrapChallengeCookies) and we
 * re-attempt a single time before giving up.
 */
async function apiGet(
  identifier: string,
  path: string,
  expectJson: true,
): Promise<{ status: number; data: unknown; usedProxy: boolean }>;
async function apiGet(
  identifier: string,
  path: string,
  expectJson: false,
): Promise<{ status: number; data: string; usedProxy: boolean }>;
async function apiGet(
  identifier: string,
  path: string,
  expectJson: boolean,
): Promise<{ status: number; data: unknown; usedProxy: boolean }> {
  const url = `${getBase()}${path}`;
  const attempt = async (): Promise<{ status: number; body: string }> =>
    request(url, {
      headers: apiHeaders(`${getBase()}/`),
      timeout: DIRECT_TIMEOUT_MS,
    });
  const { value, usedProxy } = await (async () => {
    try {
      const res = await attempt();
      return { value: res, usedProxy: false };
    } catch (err) {
      if (!isRetryableThroughProxy(err)) throw err;
      ctx?.logger.debug(
        `kick: direct request failed (${err instanceof Error ? err.message : err}) — retrying through secure proxy`,
      );
    }
    const agent = await proxyFor(identifier);
    const res = await request(url, {
      headers: apiHeaders(`${getBase()}/`),
      agent,
    });
    return { value: res, usedProxy: true };
  })();

  if (!expectJson) {
    return { status: value.status, data: value.body, usedProxy };
  }
  const trimmed = value.body.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    // ponytail: challenge/block page or rate-limit HTML — surface as an
    // invalid-JSON network-ish failure so callers can distinguish it from
    // real API answers.
    throw new Error('kick: API returned non-JSON body (possible block page)');
  }
  try {
    return { status: value.status, data: JSON.parse(trimmed) as unknown, usedProxy };
  } catch {
    throw new Error('kick: API returned invalid JSON');
  }
}

async function proxyFor(identifier: string): Promise<import('node:http').Agent | null> {
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

/**
 * ponytail: Kick's API frequently answers anonymous GETs with a Cloudflare
 * challenge (403 + JS challenge page). The reliable path is a one-shot
 * headless-browser visit to the site root: real Chromium executes the JS
 * challenge, Cloudflare issues `cf_clearance` (and refreshed `XSRF-TOKEN`)
 * cookies tied to our User-Agent, and we store them in the in-memory jar.
 * Fresh cookies keep working for plain Node requests for hours; the plugin
 * re-bootstraps lazily whenever a 403-challenge appears and cookies are older
 * than CHALLENGE_REFRESH_MS.
 */
const CHALLENGE_REFRESH_MS = 30 * 60 * 1000;
let lastChallengeAt = 0;

function looksLikeChallenge(status: number, body: string): boolean {
  return (
    status === 403 ||
    status === 429 ||
    (status === 200 && body.includes('challenge-platform') && !body.trim().startsWith('{'))
  );
}

async function maybeBootstrapChallengeCookies(): Promise<boolean> {
  if (Date.now() - lastChallengeAt < CHALLENGE_REFRESH_MS) {
    ctx?.logger.debug('kick: challenge cookies are fresh — skipping browser bootstrap');
    return false;
  }
  ctx?.logger.info('kick: Cloudflare challenge encountered — bootstrapping cookies via headless browser');
  let browser: import('playwright-core').Browser | null = null;
  try {
    browser = await launchHeadlessBrowser();
    const context = await browser.newContext({
      userAgent: getUserAgent(),
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await blockHeavyResources(page);
    await page.goto(`${getBase()}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    // ponytail: the JS challenge runs a few seconds after load; the cookies
    // are set either immediately (managed challenge auto-pass) or after the
    // interstitial completes. Poll the cookie jar until cf_clearance shows up.
    const deadline = Date.now() + 30_000;
    let cleared = false;
    while (Date.now() < deadline) {
      const cookies = await context.cookies();
      const clearance = cookies.find((c) => c.name === 'cf_clearance');
      if (clearance !== undefined) {
        cleared = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    const cookies = await context.cookies();
    for (const cookie of cookies) {
      setCookie(cookie.name, cookie.value);
    }
    lastChallengeAt = Date.now();
    ctx?.logger.info(
      `kick: browser bootstrap ${cleared ? 'solved the challenge' : 'finished'} — ${cookies.length} cookies captured`,
    );
    return cookies.length > 0;
  } catch (e) {
    ctx?.logger.warn(`kick: browser cookie bootstrap failed: ${e}`);
    return false;
  } finally {
    if (browser !== null) {
      try {
        await browser.close();
      } catch {
        /* already closed */
      }
    }
  }
}

/** True when the jar already carries a Cloudflare clearance cookie. */
function hasClearanceCookie(): boolean {
  return getCookieString().includes('cf_clearance=');
}

/**
 * Query the livestream API with one automatic challenge-cookie refresh.
 * Returns the parsed envelope ({ data: … } | { message: … }) or null when
 * the channel/API says the resource does not exist (404).
 */
async function queryChannelApi(
  identifier: string,
  slug: string,
): Promise<{ data: unknown; usedProxy: boolean } | null> {
  for (let attemptNo = 0; attemptNo < 2; attemptNo++) {
    let result: { status: number; data: unknown; usedProxy: boolean };
    try {
      result = await apiGet(identifier, `/api/v2/channels/${encodeURIComponent(slug)}`, true);
    } catch (e) {
      // ponytail: non-JSON block page — refresh challenge cookies (once) and
      // retry, same policy as a 403 envelope below.
      if (attemptNo === 0 && String(e).includes('non-JSON')) {
        await maybeBootstrapChallengeCookies();
        continue;
      }
      throw e;
    }
    if (result.status === 404) return null;
    if (looksLikeChallenge(result.status, '')) {
      if (attemptNo === 0 && !hasClearanceCookie()) {
        await maybeBootstrapChallengeCookies();
        continue;
      }
      throw new Error(`Kick API blocked the request (HTTP ${result.status})`);
    }
    if (result.status !== 200) {
      throw new Error(`Kick API returned HTTP ${result.status} for channel ${slug}`);
    }
    return { data: result.data, usedProxy: result.usedProxy };
  }
  throw new Error(`Kick API unreachable for channel ${slug}`);
}

function parseLivestream(json: unknown): LivestreamData | undefined {
  const data = channelEnvelope(json);
  // ponytail: `livestream` is null when the channel is offline — its
  // PRESENCE is the only reliable liveness signal. A playback URL may live
  // on the livestream object (string or [url, url] array) or ONLY on the
  // channel level (the static IVS endpoint, always present); the channel
  // fallback is therefore used solely when a livestream object exists.
  const livestream = rec(data, 'livestream');
  if (livestream === null) return undefined;
  const playbackUrl = str(livestream, 'playback_url');
  // ponytail: playback_url may be a ["url","url2"] array or a plain string —
  // normalize both to the first playable https URL. Fall back to the
  // channel-level IVS endpoint (what streamlink's kick plugin uses).
  const rawPlayback = asRecord(livestream)?.['playback_url'] ?? data?.['playback_url'];
  const url =
    typeof playbackUrl === 'string'
      ? playbackUrl
      : Array.isArray(rawPlayback)
        ? rawPlayback.find((u): u is string => typeof u === 'string' && u.endsWith('.m3u8'))
        : typeof rawPlayback === 'string'
          ? rawPlayback
          : undefined;
  if (url === undefined) return undefined;
  return {
    id: num(livestream, 'id'),
    slug: str(livestream, 'slug'),
    playbackUrl: url,
    sessionTitle: str(livestream, 'session_title'),
    startedAt: str(livestream, 'created_at'),
    viewerCount: num(livestream, 'viewer_count') ?? num(livestream, 'viewers'),
    isLive: bool(livestream, 'is_live'),
  };
}

/**
 * ponytail: the v2 channels endpoint returns the channel object at the TOP
 * LEVEL (no { data: … } wrapper) — older responses / other endpoints wrapped
 * it, so accept both and normalize to the channel object.
 */
function channelEnvelope(json: unknown): Json {
  return rec(json, 'data') ?? asRecord(json) ?? {};
}

/** ponytail: banner_image is either a plain URL string or { url: "…" }. */
function bannerUrlOf(data: Json): string | undefined {
  const raw = data['banner_image'] ?? data['banner_image_v2'];
  if (typeof raw === 'string') return raw;
  return str(raw, 'url');
}

function parseChannel(json: unknown): ChannelInfo | null {
  const data = channelEnvelope(json);
  if (Object.keys(data).length === 0) return null;
  const user = rec(data, 'user');
  const slug = str(data, 'slug') ?? str(user, 'username');
  if (slug === undefined) return null;
  const livestream = parseLivestream(json);
  const recent = arr(data, 'recent_categories');
  const categories =
    recent !== undefined
      ? recent
          .map((c) => asRecord(c))
          .filter((c): c is Json => c !== null)
          .map((c) => ({ name: str(c, 'name'), slug: str(c, 'slug') }))
          .slice(0, 5)
      : undefined;
  return {
    userId: num(data, 'user_id') ?? num(user, 'id'),
    slug,
    username: str(user, 'username') ?? slug,
    avatarUrl: str(user, 'profile_pic'),
    bannerUrl: bannerUrlOf(data),
    // ponytail: bio lives on the embedded user object, not on the channel.
    bio: str(data, 'bio') ?? str(user, 'bio'),
    followers: num(data, 'followers_count'),
    verified: bool(data, 'verified'),
    livestream,
    recentCategories: categories,
  };
}

/** Fetch one channel (with livestream) by slug. */
async function fetchChannel(identifier: string, slug: string): Promise<ChannelInfo | null> {
  const result = await queryChannelApi(identifier, slug);
  if (result === null) return null;
  const channel = parseChannel(result.data);
  if (channel === null) {
    throw new Error(`Kick: unexpected channel payload for ${slug}`);
  }
  return channel;
}

// ---- playlist helpers ------------------------------------------------------

/** Headers Kick's CDN expects; without them playback requests can 403. */
function cdnHeaders(): Record<string, string> {
  return {
    'User-Agent': getUserAgent(),
    Referer: `${getBase()}/`,
    Origin: getBase(),
    Accept: '*/*',
  };
}

/**
 * ponytail: is the channel genuinely broadcasting? The livestream envelope
 * only counts when a playback URL exists — channels in "replay/VOD-only"
 * states can carry a livestream object without a live playlist.
 */
function livestreamIsLive(channel: ChannelInfo): boolean {
  const ls = channel.livestream;
  // ponytail: a present livestream object IS the live signal (it is null
  // when offline); is_live is not always echoed back, so only trust an
  // explicit false. playback_url is validated when extracting.
  if (ls === undefined) return false;
  if (ls.isLive === false) return false;
  return typeof ls.playbackUrl === 'string' && ls.playbackUrl.length > 0;
}

// ---- plugin ----------------------------------------------------------------

function creatorFromChannel(channel: ChannelInfo): CreatorInfo {
  const base = getBase();
  const live = livestreamIsLive(channel);
  return {
    id: `kick:${channel.slug.toLowerCase()}`,
    username: channel.username,
    displayName: channel.username,
    avatarUrl: channel.avatarUrl,
    profileUrl: `${base}/${channel.slug}`,
    bio: channel.bio,
    followerCount: channel.followers,
    isLive: live,
    liveUrl: live ? `${base}/${channel.slug}` : undefined,
  };
}

/**
 * Build the final StreamObject.
 * ponytail: `usedProxy` is the flag from THIS fetch cycle — only when the
 * extraction actually routed through the host proxy do recording children
 * (ffmpeg -proxy / yt-dlp --proxy) follow the same route. With a system VPN
 * (Cloudflare WARP) the direct route works and proxyUrl stays unset.
 */
function finalizeStreamObject(
  channel: ChannelInfo,
  slug: string,
  streamUrl: string,
  qualityOptions: Array<{
    id: string;
    label: string;
    format: string;
    resolution?: string;
    bitrate?: number;
    isBest?: boolean;
  }>,
  usedProxy: boolean,
): StreamObject {
  const base = getBase();
  return {
    creatorId: `kick:${channel.slug.toLowerCase()}`,
    creatorName: channel.username,
    platformId: 'kick',
    title: channel.livestream?.sessionTitle ?? `${channel.username} live on Kick`,
    thumbnail: channel.bannerUrl,
    streamUrl,
    headers: cdnHeaders(),
    cookies: cookieList(new URL(base).hostname.replace(/^www\./, '')),
    proxyUrl: usedProxy ? (proxyHttpUrlFor(`kick:${slug.toLowerCase()}`) ?? undefined) : undefined,
    qualityOptions,
    metadata: {
      category: channel.recentCategories?.[0]?.name ?? 'Kick',
      tags: ['live'],
      viewerCount: channel.livestream?.viewerCount,
      followers: channel.followers,
      verified: channel.verified,
      categories: channel.recentCategories?.map((c) => c.name).filter((n): n is string => n !== undefined),
      streamStartedAt: channel.livestream?.startedAt,
    },
    startedAt: channel.livestream?.startedAt ?? new Date().toISOString(),
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
        // ponytail: Kick browsing needs no login; session cookies only
        // raise rate limits. "Authenticated" simply means a jar is loaded
        // and — when the API can confirm it — a user is attached.
        if (!hasCookies()) return { authenticated: false };
        try {
          const res = await apiGet('kick:auth', '/api/v1/users/me', true);
          if (res.status !== 200) return { authenticated: false };
          const data = rec(res.data, 'data');
          const username = str(data, 'username');
          return { authenticated: true, username };
        } catch {
          // ponytail: cookies exist but the API is challenge-blocked —
          // report authenticated so the user's setup is not "lost" in the UI
          // during transient blocks; refreshSession re-validates later.
          return { authenticated: true };
        }
      },
      async login(credentials?: Record<string, string>): Promise<void> {
        const cookieHeader = credentials?.['cookie'];
        if (!cookieHeader) {
          throw new Error('Provide cookies via the "cookie" field (paste your browser cookie header value).');
        }
        loadCookieHeader(cookieHeader);
        ctx?.logger.info('kick: cookies loaded');
      },
      async logout(): Promise<void> {
        clearCookies();
        lastChallengeAt = 0;
        ctx?.logger.info('kick: cookies cleared');
      },
    },

    creatorSearch: {
      async search(query): Promise<CreatorSearchResult> {
        const q = query.query.trim();
        if (!q) return { creators: [], total: 0 };
        const slug = normalizeSlug(q);
        // ponytail: Kick has no public search API — resolve the channel
        // directly (slug == identity) via the v2 channels endpoint.
        const creator = await plugin.capabilities.creatorSearch!.getCreator(slug);
        return { creators: creator ? [creator] : [], total: creator ? 1 : 0 };
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const slug = normalizeSlug(identifierToSlug(identifier));
        try {
          const channel = await fetchChannel(`kick:${slug}`, slug);
          if (channel === null) return null;
          return creatorFromChannel(channel);
        } catch (e) {
          ctx?.logger.debug(`kick: getCreator(${slug}) failed: ${e}`);
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const slug = normalizeSlug(identifierToSlug(identifier));
        ctx?.logger.debug(`kick: checking live status for ${slug}`);
        try {
          const channel = await fetchChannel(identifier, slug);
          if (channel === null) {
            // ponytail: definitive missing-creator answer — the host stops
            // retrying instead of looping on a deleted channel.
            return { isLive: false };
          }
          if (!livestreamIsLive(channel)) return { isLive: false };
          return {
            isLive: true,
            title: channel.livestream?.sessionTitle ?? `${channel.username} is live`,
            thumbnail: channel.bannerUrl,
            viewerCount: channel.livestream?.viewerCount,
            startedAt: channel.livestream?.startedAt,
            // ponytail: playback_url is immediately playable — hand it to
            // the host so "record now" never needs a second round-trip.
            streamUrl: channel.livestream?.playbackUrl,
          };
        } catch (e) {
          // ponytail: transport failure / block page — neither live nor
          // ended. The host must retry, not finalize a recording.
          ctx?.logger.debug(`kick: ${slug} check failed: ${e}`);
          return { isLive: false, unknown: true };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const slug = normalizeSlug(identifierToSlug(identifier));
        ctx?.logger.debug(`kick: extracting stream for ${slug}`);
        const channel = await fetchChannel(identifier, slug);
        if (channel === null) throw new Error(`Channel ${slug} not found on Kick`);
        if (!livestreamIsLive(channel)) throw new Error(`${slug} is not live`);
        const playbackUrl = channel.livestream?.playbackUrl;
        if (playbackUrl === undefined) throw new Error(`${slug} is live but has no playback URL`);

        // ponytail: stay on the chosen route for the whole fetch cycle —
        // variant resolution follows whatever route served detection.
        const fetchPlaylist = async (url: string): Promise<{ status: number; body: string }> => {
          try {
            const direct = await request(url, {
              headers: cdnHeaders(),
              timeout: DIRECT_TIMEOUT_MS,
            });
            return direct;
          } catch (err) {
            if (!isRetryableThroughProxy(err)) throw err;
            const agent = await proxyFor(identifier);
            return request(url, { headers: cdnHeaders(), agent });
          }
        };
        const { url: variantUrl, qualityOptions } = await resolveBestVariant(playbackUrl, fetchPlaylist);
        ctx?.logger.debug(`kick: extracted stream for ${slug}: ${variantUrl.substring(0, 80)}...`);

        // ponytail: the master playback_url already returns the best live
        // experience for ffmpeg (LL-HLS media playlist); we still hand the
        // recorder the resolved best variant URL for deterministic quality.
        return finalizeStreamObject(
          channel,
          slug,
          variantUrl,
          qualityOptions,
          false,
        );
      },
    },

    settings: {
      getSchema(): Record<string, SettingDef> {
        return SETTINGS_SCHEMA;
      },
      async validate(values: PluginSettingValues) {
        const errors: Record<string, string> = {};
        const ua = values['userAgent'];
        if (typeof ua === 'string' && ua.trim() !== '' && !ua.includes('Chrome/')) {
          errors['userAgent'] = 'Kick requires a Chrome-like User-Agent (must contain "Chrome/").';
        }
        return { valid: Object.keys(errors).length === 0, errors };
      },
    },

    healthCheck: {
      async check(): Promise<HealthStatus> {
        const start = Date.now();
        try {
          const res = await request(`${getBase()}/`, {
            headers: apiHeaders(`${getBase()}/`),
            timeout: DIRECT_TIMEOUT_MS,
          });
          return {
            healthy: res.status === 200 || res.status === 403,
            message:
              res.status === 200
                ? 'Kick reachable'
                : res.status === 403
                  ? 'Kick reachable (challenge-protected API)'
                  : `HTTP ${res.status}`,
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          return { healthy: false, message: String(e) };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const slug = normalizeSlug(identifierToSlug(identifier));
        try {
          const channel = await fetchChannel(identifier, slug);
          if (channel === null) return { displayName: slug };
          return {
            displayName: channel.username,
            avatarUrl: channel.avatarUrl,
            bio: channel.bio,
            followerCount: channel.followers,
            website: `${getBase()}/${channel.slug}`,
          };
        } catch {
          return { displayName: slug };
        }
      },
    },
  },

  async initialize(context: PluginContext): Promise<void> {
    status.state = 'initializing';
    ctx = context;
    setHttpPluginContext(context);
    context.logger.info('kick: initializing');
    const savedCookies = context.settings.get('cookies');
    if (typeof savedCookies === 'string' && savedCookies.length > 0) {
      loadCookieHeader(savedCookies);
      context.logger.info('kick: loaded saved cookies');
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
    clearCookies();
    lastChallengeAt = 0;
    setHttpPluginContext(null);
    status.state = 'installed';
    ctx = null;
  },
};

export default plugin;
