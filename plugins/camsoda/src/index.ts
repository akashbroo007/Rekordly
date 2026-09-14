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
import manifest from '../manifest.json';
import {
  clearCookies,
  cookieList,
  getCookieString,
  httpGet,
  loadCookieHeader,
  setCookieHeader,
  DEFAULT_USER_AGENT,
} from './http';
import {
  fetchBrowseModels,
  fetchRoomData,
  fetchVtoken,
  isRecordableStream,
  setRequestUserAgent,
  type RoomData,
  type StreamInfo,
} from './api';
import { pickBestVariant, resolvePlayableStream, type StreamVariant } from './hls';

// ponytail: Camsoda streams are plain token-authed HLS — no browser
// automation, no local proxies, hence no ProxyRegistry. Every extracted URL
// carries a signed token minted at extraction time and stays valid for the
// whole broadcast; the recorder consumes it directly.
const BASE = 'https://www.camsoda.com';

const status: PluginStatus = { state: 'installed' };

let ctx: PluginContext | null = null;

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
    defaultValue: DEFAULT_USER_AGENT,
  },
};

function logger(): ((m: string) => void) | undefined {
  return ctx ? (m: string) => ctx?.logger.debug(m) : undefined;
}

/**
 * ponytail: short-lived room cache. getLiveStatus polls vtoken (cheap) but
 * still reports title/thumbnail from the most recent room-page fetch, so
 * monitoring rows stay informative without re-scraping 190KB HTML per tick.
 */
const ROOM_CACHE_TTL_MS = 10 * 60_000;
const roomCache = new Map<string, { room: RoomData; fetchedAt: number }>();

function cacheRoom(room: RoomData): void {
  roomCache.set(room.username.toLowerCase(), { room, fetchedAt: Date.now() });
}

function cachedRoom(username: string): RoomData | null {
  const entry = roomCache.get(username.toLowerCase());
  if (entry === undefined) return null;
  if (Date.now() - entry.fetchedAt > ROOM_CACHE_TTL_MS) {
    roomCache.delete(username.toLowerCase());
    return null;
  }
  return entry.room;
}

function getUserAgent(): string {
  const v = ctx?.settings.get('userAgent');
  return typeof v === 'string' && v.trim() ? v : DEFAULT_USER_AGENT;
}

function creatorFromUsername(username: string, info?: Partial<RoomData>): CreatorInfo {
  const live =
    (info?.stream !== undefined && isRecordableStream(info.stream)) ||
    (info?.stream === undefined && info?.chatStatus === 'online');
  return {
    id: `camsoda:${username}`,
    username,
    displayName: info?.displayName ?? username,
    avatarUrl: info?.thumbnailUrl ?? info?.avatarUrl,
    profileUrl: `${BASE}/${username}`,
    bio: info?.title,
    followerCount: info?.followerCount,
    isLive: live,
    liveUrl: live ? `${BASE}/${username}` : undefined,
  };
}

function qualityOptionsFrom(variants: StreamVariant[]): Array<{
  id: string;
  label: string;
  format: string;
  resolution?: string;
  bitrate?: number;
  isBest?: boolean;
}> {
  // ponytail: isBest is stamped by the caller on the actually-picked variant
  // (playlist order does not imply best quality).
  return variants.map((v, idx) => ({
    id: `variant-${idx}`,
    label: v.resolution ?? `${Math.round(v.bandwidth / 1000)} kbps`,
    format: 'hls',
    resolution: v.resolution,
    bitrate: v.bandwidth > 0 ? v.bandwidth : undefined,
  }));
}

const plugin: Plugin = {
  manifest,

  get status(): PluginStatus {
    return status;
  },

  capabilities: {
    auth: {
      async getStatus(): Promise<AuthStatus> {
        if (getCookieString() === '') return { authenticated: false };
        // No stable /me endpoint exists; cookies are accepted as provided
        // and their real effect (higher quality variants) is verified by use.
        return { authenticated: true };
      },
      async login(credentials?: Record<string, string>): Promise<void> {
        const cookieHeader = credentials?.['cookie'];
        if (!cookieHeader) {
          throw new Error('Provide cookies via the "cookie" field (paste your browser cookie header value).');
        }
        setCookieHeader(cookieHeader);
        ctx?.logger.info('camsoda: cookies loaded');
      },
      async logout(): Promise<void> {
        clearCookies();
        ctx?.logger.info('camsoda: cookies cleared');
      },
    },

    creatorSearch: {
      async search(query): Promise<CreatorSearchResult> {
        const q = query.query.trim().toLowerCase();
        const limit = query.limit ?? 10;
        if (!q) {
          // Discovery: SSR browse listing, pages of ~98 models each.
          const creators: CreatorInfo[] = [];
          let totalCount: number | undefined;
          for (let page = 1; creators.length < limit && page <= 5; page++) {
            const { models, totalCount: total } = await fetchBrowseModels(page, logger());
            totalCount = total ?? totalCount;
            if (models.length === 0) break;
            for (const model of models) {
              if (model.username !== undefined && creators.length < limit) {
                // ponytail: browse entries with status 'online' are publicly
                // watchable rooms; private/connected are not recordable.
                const chatStatus = model.status === 'online' ? 'online' : undefined;
                creators.push(creatorFromUsername(model.username, { displayName: model.displayName, chatStatus }));
              }
            }
          }
          return { creators, total: totalCount ?? creators.length };
        }
        const creator = await plugin.capabilities.creatorSearch!.getCreator(q);
        return { creators: creator ? [creator] : [], total: creator ? 1 : 0 };
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const username = identifier.replace(/^camsoda:/, '');
        try {
          const room = await fetchRoomData(username, logger());
          if (room !== null) cacheRoom(room);
          return room !== null ? creatorFromUsername(room.username ?? username, room) : null;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ctx?.logger.debug(`camsoda: getCreator ${username} failed: ${msg}`);
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const username = identifier.replace(/^camsoda:/, '');
        ctx?.logger.debug(`camsoda: checking live status for ${username}`);
        try {
          const vtoken = await fetchVtoken(username, logger());
          switch (vtoken.kind) {
            case 'live': {
              ctx?.logger.debug(`camsoda: ${username} is live (${vtoken.stream?.height ?? '?'}p)`);
              const cached = cachedRoom(username);
              // ponytail: resolve a fresh playable URL so the host can start
              // recording immediately from the check result (recording:start-
              // for-creator keys off lastResult.streamUrl — same contract the
              // Stripchat/Chaturbate plugins fulfill). A transient playlist
              // outage leaves streamUrl undefined; the next poll or
              // extractStream recovers.
              let streamUrl: string | undefined;
              try {
                const resolved = await resolvePlayableStream(vtoken.stream!, logger());
                streamUrl = pickBestVariant(resolved.variants).url;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                ctx?.logger.debug(`camsoda: ${username} live but playlist not ready: ${msg}`);
              }
              return {
                isLive: true,
                title: cached?.title ?? `${username} is live`,
                thumbnail: cached?.thumbnailUrl ?? cached?.avatarUrl,
                streamUrl,
              };
            }
            case 'private':
              // ponytail: private/connected rooms have no publicly
              // accessible playlist — reporting them live would make the
              // app show "Live" while every recording attempt failed
              // (same policy as the Chaturbate plugin).
              ctx?.logger.debug(`camsoda: ${username} is in a private show`);
              return { isLive: false };
            case 'not-found':
              ctx?.logger.debug(`camsoda: ${username} does not exist`);
              return { isLive: false };
            default:
              ctx?.logger.debug(
                `camsoda: ${username} offline (status ${vtoken.stream?.status ?? 'unknown'})`,
              );
              return { isLive: false };
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ctx?.logger.debug(`camsoda: ${username} check failed: ${msg}`);
          return { isLive: false };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const username = identifier.replace(/^camsoda:/, '');
        ctx?.logger.debug(`camsoda: extracting stream for ${username}`);
        // ponytail: the room page carries both metadata and the stream
        // descriptor; vtoken is only hit when the room state is missing or
        // its token is unusable, so extraction costs 1-3 requests total.
        let room: RoomData | null = cachedRoom(username);
        if (room === null) {
          try {
            room = await fetchRoomData(username, logger());
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            ctx?.logger.warn(`camsoda: room page for ${username} unavailable: ${msg}`);
          }
        }
        if (room !== null) cacheRoom(room);
        let stream: StreamInfo | undefined = room?.stream;
        if (stream === undefined || !isRecordableStream(stream)) {
          const vtoken = await fetchVtoken(username, logger());
          if (vtoken.kind === 'not-found') throw new Error(`Creator ${username} not found`);
          if (vtoken.kind === 'private') {
            throw new Error(`${username} is in a private show (not recordable)`);
          }
          if (vtoken.stream === undefined || !isRecordableStream(vtoken.stream)) {
            throw new Error(`${username} is not live`);
          }
          stream = vtoken.stream;
        }

        const resolved = await resolvePlayableStream(stream, logger());
        const best = pickBestVariant(resolved.variants);
        ctx?.logger.debug(
          `camsoda: stream extracted for ${username}: ${best.resolution ?? ''} ${best.bandwidth}bps ${best.url.substring(0, 80)}...`,
        );

        const qualityOptions = qualityOptionsFrom(resolved.variants);
        const bestIdx = resolved.variants.indexOf(best);
        if (qualityOptions[bestIdx] !== undefined) qualityOptions[bestIdx]!.isBest = true;

        return {
          creatorId: `camsoda:${room?.username ?? username}`,
          creatorName: room?.displayName ?? username,
          platformId: 'camsoda',
          title: room?.title ?? `${username} live on Camsoda`,
          thumbnail: room?.thumbnailUrl ?? room?.profilePictureUrl ?? room?.avatarUrl,
          streamUrl: best.url,
          // ponytail: NO User-Agent here. The recorder forwards headers to
          // ffmpeg, and the HLS edges 403 the Chrome UA when the TLS
          // fingerprint is not a real browser (ffmpeg's schannel). ffmpeg's
          // default UA + Referer passes and carries through multi-hour
          // recordings — verified against the live edge.
          headers: {
            Referer: `${BASE}/`,
            Origin: BASE,
          },
          cookies: cookieList('camsoda.com'),
          qualityOptions,
          metadata: {
            category: 'Camsoda',
            tags: room?.tags.slice(0, 20),
            resolution: best.resolution,
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
          const res = await httpGet(`${BASE}/`, {}, { logger: logger() });
          return {
            healthy: res.status === 200,
            message: res.status === 200 ? 'Camsoda reachable' : `HTTP ${res.status}`,
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          return { healthy: false, message: e instanceof Error ? e.message : String(e) };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const username = identifier.replace(/^camsoda:/, '');
        try {
          const room = await fetchRoomData(username, logger());
          if (room === null) return { displayName: username };
          return {
            displayName: room.displayName ?? username,
            avatarUrl: room.profilePictureUrl ?? room.thumbnailUrl ?? room.avatarUrl,
            bio: room.title,
            followerCount: room.followerCount,
            joinedAt: room.createdAt,
            website: `${BASE}/${username}`,
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
    context.logger.info('camsoda: initializing');
    const savedCookies = context.settings.get('cookies');
    if (typeof savedCookies === 'string' && savedCookies.length > 0) {
      loadCookieHeader(savedCookies);
      context.logger.info('camsoda: loaded saved cookies');
    }
    setRequestUserAgent(getUserAgent());
    status.state = 'ready';
  },

  async start(): Promise<void> {
    status.state = 'ready';
  },

  async stop(): Promise<void> {
    status.state = 'disabled';
  },

  async cleanup(): Promise<void> {
    roomCache.clear();
    status.state = 'installed';
    ctx = null;
  },
};

export default plugin;
