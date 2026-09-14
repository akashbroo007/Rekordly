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
import { setHttpPluginContext, hasCookies, loadCookieHeader, clearCookies, cookieList, getUserAgent, request, withSmartRoute } from './http';
import {
  FcChatSession,
  fetchServerConfig,
  invalidateServerConfig,
  hlsCandidates,
  isWatchableVs,
  VS_STATUS_MESSAGE,
  type MfcModel,
} from './fcserver';
import { resolveBestPlaylist, pickBestVariant } from './hls';
import { queryModelViaPage, avatarUrlFor, type MfcProfile } from './room-page';

const status: PluginStatus = { state: 'installed' };

let ctx: PluginContext | null = null;
let session: FcChatSession | null = null;

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  cookies: {
    type: 'password',
    label: 'Session cookies',
    description:
      'Browser cookies for authentication (paste "cookie" header value from DevTools). Optional — monitoring works as guest; member cookies unlock higher quality caps.',
    defaultValue: '',
  },
  userAgent: {
    type: 'text',
    label: 'User-Agent',
    description: 'Browser User-Agent string sent with requests.',
    defaultValue: getUserAgent(),
  },
};

function logger(): PluginContext['logger'] | undefined {
  return ctx?.logger;
}

function getUsername(identifier: string): string {
  return identifier.replace(/^myfreecams:/, '').trim();
}

/**
 * Query one model: FCServer websocket first (the site's own protocol —
 * always current), then the SSR room page as HTTP fallback when the chat
 * session cannot answer (chat ports blocked, session died mid-connect).
 */
async function resolveModel(
  username: string,
  identifier: string,
): Promise<{ model: MfcModel; profile: MfcProfile | null } | null> {
  const log = logger();
  try {
    const chat = session ?? createSession();
    const model = await chat.queryModel(username, identifier, log);
    if (model !== null) {
      return { model, profile: null };
    }
  } catch (err) {
    // ponytail: chat-transport failures are not "model missing" — log and
    // let the HTTP path answer; if that also fails the error surfaces.
    log?.debug(`myfreecams: chat query failed for ${username}: ${err instanceof Error ? err.message : err}`);
  }
  const profile = await queryModelViaPage(username, identifier, log);
  return profile !== null ? { model: profile.model, profile } : null;
}

function createSession(): FcChatSession {
  if (session === null) {
    session = new FcChatSession(getUserAgent(), (id) => ctx?.network?.getProxyHttpUrl(id) ?? null);
  }
  return session;
}

function creatorInfo(username: string, model: MfcModel, profile: MfcProfile | null): CreatorInfo {
  const live = isWatchableVs(model.vs);
  const uid = model.uid;
  const avatarUrl =
    profile?.avatarUrl ?? (typeof uid === 'number' && uid > 0 ? avatarUrlFor(uid) : undefined);
  return {
    id: `myfreecams:${username}`,
    username,
    displayName: username,
    avatarUrl,
    profileUrl: `https://www.myfreecams.com/#${username}`,
    bio: profile?.headline,
    isLive: live,
    liveUrl: live ? `https://www.myfreecams.com/#${username}` : undefined,
  };
}

function qualityOptionsFor(
  variants: Array<{ url: string; bandwidth: number; resolution?: string; codecs?: string }>,
  bestUrl: string,
): Array<{
  id: string;
  label: string;
  format: string;
  resolution?: string;
  bitrate?: number;
  isBest?: boolean;
}> {
  if (variants.length === 0) {
    return [{ id: 'best', label: 'Best', format: 'hls', isBest: true }];
  }
  return variants.map((v, idx) => ({
    id: `variant-${idx}`,
    label: v.resolution ?? `${Math.round(v.bandwidth / 1000)} kbps`,
    format: 'hls',
    resolution: v.resolution,
    bitrate: v.bandwidth > 0 ? v.bandwidth : undefined,
    isBest: v.url === bestUrl,
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
        // ponytail: MFC monitoring needs no account — a guest chat session
        // can query any model and watch public rooms. Cookies only upgrade
        // quality caps, so they are reported as-is without a round-trip.
        return { authenticated: hasCookies() };
      },
      async login(credentials?: Record<string, string>): Promise<void> {
        const cookieHeader = credentials?.['cookie'];
        if (!cookieHeader) {
          throw new Error('Provide cookies via the "cookie" field (paste your browser cookie header value).');
        }
        loadCookieHeader(cookieHeader);
        ctx?.logger.info('myfreecams: cookies loaded');
      },
      async logout(): Promise<void> {
        clearCookies();
        ctx?.logger.info('myfreecams: cookies cleared');
      },
    },

    creatorSearch: {
      async search(query): Promise<CreatorSearchResult> {
        const q = query.query.trim().replace(/^myfreecams:/, '');
        if (!q) {
          // ponytail: MFC has no safe bulk discovery endpoint — walking the
          // online-models list is what historically got IPs banned by the
          // site. Creators are added by username; monitoring covers many at
          // once through the shared chat session.
          return { creators: [], total: 0 };
        }
        const creator = await plugin.capabilities.creatorSearch!.getCreator(q);
        return { creators: creator ? [creator] : [], total: creator ? 1 : 0 };
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const username = getUsername(identifier);
        if (!/^[A-Za-z][A-Za-z0-9_]{2,31}$/.test(username)) return null;
        ctx?.logger.debug(`myfreecams: looking up creator ${username}`);
        try {
          const resolved = await resolveModel(username, identifier);
          return resolved !== null ? creatorInfo(username, resolved.model, resolved.profile) : null;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ctx?.logger.debug(`myfreecams: getCreator ${username} failed: ${msg}`);
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const username = getUsername(identifier);
        ctx?.logger.debug(`myfreecams: checking live status for ${username}`);
        // ponytail: definitive vs degraded. Definitive answers (chat video
        // state, playlist 404) report plain offline — the app finalizes
        // recordings on `creator-offline`, which is CORRECT for a broadcast
        // that is genuinely over. Degraded answers (transport failure,
        // unresolvable video server) carry `unknown: true`: neither live
        // nor ended, the host keeps the previous state and retries instead
        // of finalizing a healthy recording mid-capture.
        try {
          const resolved = await resolveModel(username, identifier);
          if (resolved === null) return { isLive: false };
          const { model, profile } = resolved;
          if (!isWatchableVs(model.vs)) {
            const reason =
              model.vs !== undefined
                ? (VS_STATUS_MESSAGE[model.vs] ?? `video state ${model.vs}`)
                : 'unknown state';
            ctx?.logger.debug(`myfreecams: ${username} not watchable (${reason})`);
            return { isLive: false };
          }
          // ponytail: `vs` can be stale — probe the playlist for a definitive
          // answer and a streamUrl the host can record from immediately.
          const cfg = await fetchServerConfig(identifier, ctx?.logger);
          const candidates = hlsCandidates(model, cfg);
          if (candidates.length === 0) {
            // ponytail: watchable per the chat protocol but no video server
            // resolvable — ambiguous state, NOT a definitive end.
            ctx?.logger.debug(
              `myfreecams: ${username} has no resolvable video server (camserv ${model.u?.camserv})`,
            );
            return { isLive: false, unknown: true };
          }
          const playlist = await resolveBestPlaylist(identifier, candidates, ctx?.logger);
          if (playlist === null) {
            ctx?.logger.debug(`myfreecams: ${username} playlist down — offline`);
            return { isLive: false };
          }
          const topic = typeof model.m?.topic === 'string' && model.m.topic !== '' ? model.m.topic : undefined;
          const uid = model.uid;
          return {
            isLive: true,
            title: topic ?? `${username} is live`,
            thumbnail: profile?.avatarUrl ?? (typeof uid === 'number' && uid > 0 ? avatarUrlFor(uid) : undefined),
            viewerCount: typeof model.m?.rc === 'number' ? model.m.rc : undefined,
            streamUrl: playlist.url,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // ponytail: `unknown` — site unreachable, neither live nor ended
          // (a plain offline answer here finalized healthy recordings via
          // the app's creator-offline → stopForCreator wiring).
          ctx?.logger.warn(`myfreecams: ${username} check degraded (site unreachable) — host will retry: ${msg}`);
          return { isLive: false, unknown: true };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const username = getUsername(identifier);
        ctx?.logger.debug(`myfreecams: extracting stream for ${username}`);
        const resolved = await resolveModel(username, identifier);
        if (resolved === null) throw new Error(`Creator ${username} not found`);
        const { model } = resolved;
        if (!isWatchableVs(model.vs)) {
          const reason = model.vs !== undefined ? (VS_STATUS_MESSAGE[model.vs] ?? `video state ${model.vs}`) : 'unknown state';
          throw new Error(`${username} is not recordable (${reason})`);
        }
        const cfg = await fetchServerConfig(identifier, ctx?.logger);
        const candidates = hlsCandidates(model, cfg);
        if (candidates.length === 0) {
          throw new Error(`Could not resolve a video server for ${username} (camserv ${model.u?.camserv})`);
        }
        const playlist = await resolveBestPlaylist(identifier, candidates, ctx?.logger);
        if (playlist === null) throw new Error(`${username} is not live`);
        ctx?.logger.debug(
          `myfreecams: stream extracted for ${username}: ${playlist.url.substring(0, 90)}...`,
        );

        // ponytail: recording children (ffmpeg/yt-dlp) only route through
        // the proxy when THIS fetch cycle actually needed it — with a system
        // VPN (WARP) the direct route works and the embedded proxy never
        // starts.
        const proxyUrl = playlist.usedProxy ? (ctx?.network?.getProxyHttpUrl(identifier) ?? undefined) : undefined;
        if (proxyUrl !== undefined) {
          ctx?.logger.debug('myfreecams: stream will be recorded through the secure proxy');
        }

        return {
          creatorId: identifier,
          creatorName: username,
          platformId: 'myfreecams',
          title: `${username} live on MyFreeCams`,
          thumbnail:
            typeof model.uid === 'number' && model.uid > 0 ? avatarUrlFor(model.uid) : undefined,
          streamUrl: playlist.url,
          headers: {
            'User-Agent': getUserAgent(),
            Referer: 'https://www.myfreecams.com/',
            Origin: 'https://www.myfreecams.com',
          },
          cookies: cookieList('.myfreecams.com'),
          proxyUrl,
          qualityOptions: qualityOptionsFor(playlist.variants, playlist.url),
          metadata: {
            category: 'MyFreeCams',
            tags: ['live'],
            resolution: playlist.variants.length > 0 ? pickBestVariant(playlist.variants).resolution : undefined,
            viewers: typeof model.m?.rc === 'number' ? model.m.rc : undefined,
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
          const res = await withSmartRoute('myfreecams:health', (agent) =>
            request('https://www.myfreecams.com/_js/serverconfig.js', {
              agent,
              timeout: agent !== null ? 45_000 : 8_000,
              headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: 'https://www.myfreecams.com/' },
            }),
          );
          const ok = res.value.status === 200 && res.value.body.includes('chat_servers');
          return {
            healthy: ok,
            message: ok ? 'MyFreeCams reachable' : `HTTP ${res.value.status}`,
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          return { healthy: false, message: e instanceof Error ? e.message : String(e) };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const username = getUsername(identifier);
        try {
          const resolved = await resolveModel(username, identifier);
          if (resolved === null) return { displayName: username };
          const { model, profile } = resolved;
          const uid = model.uid;
          const creation = model.u?.creation;
          return {
            displayName: username,
            avatarUrl:
              profile?.avatarUrl ?? (typeof uid === 'number' && uid > 0 ? avatarUrlFor(uid) : undefined),
            bio: profile?.headline,
            joinedAt:
              typeof creation === 'number' && creation > 0
                ? new Date(creation * 1000).toISOString()
                : undefined,
            website: `https://www.myfreecams.com/#${username}`,
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
    setHttpPluginContext(context);
    context.logger.info('myfreecams: initializing');
    const savedCookies = context.settings.get('cookies');
    if (typeof savedCookies === 'string' && savedCookies.length > 0) {
      loadCookieHeader(savedCookies);
      context.logger.info('myfreecams: loaded saved cookies');
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
    // ponytail: tear the shared chat session and any warm caches so a
    // re-enabled plugin starts clean and dead sockets never linger.
    if (session !== null) {
      await session.close().catch(() => undefined);
      session = null;
    }
    invalidateServerConfig();
    clearCookies();
    setHttpPluginContext(null);
    status.state = 'installed';
    ctx = null;
  },
};

export default plugin;
