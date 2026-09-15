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
import { ProxyRegistry } from '@rekordly/plugin-sdk';
import type { Agent } from 'node:http';
import manifest from '../manifest.json';
import {
  DEFAULT_BSS_BASE,
  DEFAULT_PARTNER_ID,
  DEFAULT_SITE_BASE,
  DEFAULT_UA,
  BssApiError,
  getBroadcastByNickname,
  isNetworkFailure,
  isWatchable,
  listLiveBroadcasts,
  resolveStreamUrls,
  type BssClientOptions,
  type Broadcast,
  type LoggerLike,
} from './bss-api';
import { VrBridge } from './vr-bridge';

const status: PluginStatus = { state: 'installed' };

let ctx: PluginContext | null = null;

const PLATFORM_ID = 'dreamcam';

// ponytail: cookie jar lives in memory only, reset on app restart
let cookieJar: Record<string, string> = {};

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  siteUrl: {
    type: 'text',
    label: 'Site URL',
    description: 'Base URL of the Dreamcam site (used for headers and profile links).',
    defaultValue: DEFAULT_SITE_BASE,
  },
  cookies: {
    type: 'password',
    label: 'Session cookies',
    description:
      'Optional. Browser cookies for logged-in access (paste the "cookie" header value from DevTools). Monitoring and recording work without an account.',
    defaultValue: '',
  },
  userAgent: {
    type: 'text',
    label: 'User-Agent',
    description: 'Browser User-Agent string sent with requests.',
    defaultValue: DEFAULT_UA,
  },
  preferVr: {
    type: 'select',
    label: 'Preferred stream type',
    description:
      'VR (3D) records the stereoscopic fisheye feed through a local bridge; 2D records the flat HD HLS stream; Auto picks VR when available.',
    defaultValue: 'auto',
    options: [
      { value: 'auto', label: 'Auto (prefer VR when live)' },
      { value: 'vr', label: 'VR (3D) only' },
      { value: '2d', label: '2D only' },
    ],
  },
};

function getUserAgent(): string {
  const v = ctx?.settings.get('userAgent');
  return typeof v === 'string' && v.trim() !== '' ? v : DEFAULT_UA;
}

function getSiteBase(): string {
  const v = ctx?.settings.get('siteUrl');
  const raw = typeof v === 'string' && v.trim() !== '' ? v : DEFAULT_SITE_BASE;
  return raw.replace(/\/+$/, '');
}

function getPreferVr(): 'auto' | 'vr' | '2d' {
  const v = ctx?.settings.get('preferVr');
  return v === 'vr' || v === '2d' ? v : 'auto';
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

function getCookieString(): string {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function loggerLike(): LoggerLike | null {
  if (ctx === null) return null;
  return {
    debug: (m: string) => ctx?.logger.debug(m),
    warn: (m: string) => ctx?.logger.warn(m),
  };
}

function bssOptions(agent?: Agent | null, timeoutMs?: number): BssClientOptions {
  return {
    // ponytail: the BSS host is fixed by the site's own environment config;
    // a future white-label only needs one edit in bss-api.ts.
    bssBase: DEFAULT_BSS_BASE,
    siteBase: getSiteBase(),
    partnerId: DEFAULT_PARTNER_ID,
    userAgent: getUserAgent(),
    cookies: cookieJar,
    logger: loggerLike(),
    timeoutMs,
    proxyAgent: agent ?? null,
  };
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

function proxyHttpUrlFor(identifier: string): string | null {
  return ctx?.network?.getProxyHttpUrl(identifier) ?? null;
}

const DIRECT_TIMEOUT_MS = 8_000;
const PROXY_TIMEOUT_MS = 45_000;

/**
 * ponytail: SMART routing — attempt DIRECT first with a short timeout; only
 * retry through the host's secure proxy when the network itself fails.
 * HTTP-level answers (404/403, API errors) are the site talking — those never
 * retry through the proxy. (Reference: plugins/bongacams `withSmartRoute`.)
 */
async function withSmartRoute<T>(
  identifier: string,
  attempt: (agent: Agent | null, timeoutMs: number) => Promise<T>,
): Promise<{ value: T; usedProxy: boolean }> {
  try {
    const value = await attempt(null, DIRECT_TIMEOUT_MS);
    return { value, usedProxy: false };
  } catch (err) {
    if (!isNetworkFailure(err)) throw err;
    ctx?.logger.debug(
      `dreamcam: direct request failed (${err instanceof Error ? err.message : err}) — retrying through secure proxy`,
    );
  }
  const agent = await proxyFor(identifier);
  const value = await attempt(agent, PROXY_TIMEOUT_MS);
  return { value, usedProxy: true };
}

/** Fetch one model's broadcast with the direct-first/proxy-fallback pattern. */
async function fetchBroadcastSmart(
  identifier: string,
  nickname: string,
): Promise<{ broadcast: Broadcast | null; usedProxy: boolean }> {
  const { value, usedProxy } = await withSmartRoute(identifier, (agent, timeoutMs) =>
    getBroadcastByNickname(nickname, bssOptions(agent, timeoutMs)),
  );
  return { broadcast: value, usedProxy };
}

function creatorFromBroadcast(broadcast: Broadcast | null, nickname: string): CreatorInfo {
  const base = getSiteBase();
  const live = broadcast !== null && isWatchable(broadcast);
  return {
    id: `${PLATFORM_ID}:${nickname}`,
    username: nickname,
    displayName: broadcast?.modelNickname ?? nickname,
    avatarUrl: broadcast?.modelProfilePhotoUrl ?? undefined,
    profileUrl: `${base}/live/${nickname}`,
    bio: broadcast?.broadcastTextStatus ?? undefined,
    isLive: live,
    liveUrl: live ? `${base}/live/${nickname}` : undefined,
  };
}

// ponytail: VR bridges must outlive extractStream() — the host starts
// recording right after we return. Keyed by STABLE model identity (lowercased
// nickname): every extraction mints a fresh fmp4s URL, and same-model
// re-extract MUST replace its own entry, never a neighbor's live bridge.
// The bridge holds no browser (holdsBrowser() = false), so the registry cap
// never evicts live recordings to make room — bridges are cheap local servers.
const vrBridges = new ProxyRegistry<VrBridge>(4);

/** Extract the nickname from a `dreamcam:<nick>` creator id. */
function nicknameOf(identifier: string): string {
  return identifier.replace(/^dreamcam:/, '');
}

async function buildStreamObject(
  identifier: string,
  broadcast: Broadcast,
  usedProxy: boolean,
): Promise<StreamObject> {
  const nickname = broadcast.modelNickname ?? nicknameOf(identifier);
  const streams = resolveStreamUrls(broadcast);
  const prefer = getPreferVr();
  const displayName = broadcast.modelNickname ?? nickname;

  let streamUrl: string | undefined;
  let streamKind: 'hls' | 'vr-hls' | undefined;
  let resolution: string | undefined;

  const wantVr = prefer !== '2d' && streams.vr3d !== undefined;
  const want2d = prefer !== 'vr' && streams.hls2d !== undefined;
  if (wantVr === true && (prefer === 'vr' || prefer === 'auto' || !want2d)) {
    streamKind = 'vr-hls';
  } else if (want2d) {
    streamKind = 'hls';
  }

  if (streamKind === 'vr-hls') {
    // ponytail: bridge the fmp4s WebSocket into a local live HLS playlist.
    // Re-extract of the same model replaces its own bridge (fresh URL).
    const bridgeKey = nickname.toLowerCase();
    const bridge = new VrBridge({
      streamUrl: streams.vr3d!,
      siteOrigin: getSiteBase(),
      userAgent: getUserAgent(),
      logger: loggerLike(),
      onDead: () => {
        vrBridges.delete(bridgeKey);
      },
      // ponytail: the feed socket follows the route the fetch cycle chose —
      // detection and extraction must agree. ensureProxy already ran during
      // fetchBroadcastSmart, so this only hands back the existing agent.
      agent: usedProxy ? await proxyFor(identifier) : null,
    });
    try {
      await bridge.start();
    } catch (err) {
      void bridge.stop().catch(() => undefined);
      throw new Error(
        `Dreamcam VR feed failed to start: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
    for (const evicted of vrBridges.set(bridgeKey, bridge)) {
      ctx?.logger.debug(`dreamcam: stopping replaced/evicted VR bridge for ${evicted.key}`);
      void evicted.proxy.stop().catch(() => undefined);
    }
    streamUrl = bridge.url;
    resolution =
      streams.vr3dResolution !== undefined && streams.vr3dResolution !== null
        ? (streams.vr3dResolution.resolutionType ??
          `${streams.vr3dResolution.width}x${streams.vr3dResolution.height}`)
        : 'VR';
  } else if (streamKind === 'hls') {
    streamUrl = streams.hls2d;
    resolution =
      streams.hls2dResolution !== undefined && streams.hls2dResolution !== null
        ? (streams.hls2dResolution.resolutionType ??
          `${streams.hls2dResolution.width}x${streams.hls2dResolution.height}`)
        : undefined;
  } else {
    throw new Error(`${nickname} has no recordable stream right now`);
  }
  if (streamUrl === undefined) {
    throw new Error(`${nickname} has no recordable stream right now`);
  }

  // ponytail: recording children (ffmpeg/yt-dlp) only route through the
  // proxy when THIS fetch cycle actually needed it — with a system VPN the
  // direct route works and the embedded proxy never starts. VR is excluded:
  // the recorder fetches the bridge's LOOPBACK playlist, and -http_proxy
  // would push 127.0.0.1 through Tor ("Connection refused" from the exit
  // node). The bridge's own feed socket carries the proxy agent instead.
  const proxyUrl = streamKind === 'hls' && usedProxy ? proxyHttpUrlFor(identifier) : null;
  if (proxyUrl !== null) {
    ctx?.logger.debug('dreamcam: stream will be recorded through the secure proxy');
  }

  const cookies = Object.entries(cookieJar).map(([name, value]) => ({
    name,
    value,
    domain: new URL(getSiteBase()).hostname.replace(/^www\./, '.'),
    path: '/',
    secure: true,
  }));

  const isVr = streamKind === 'vr-hls';
  return {
    creatorId: `${PLATFORM_ID}:${nickname}`,
    creatorName: displayName,
    platformId: PLATFORM_ID,
    title:
      broadcast.broadcastTextStatus !== undefined && broadcast.broadcastTextStatus !== ''
        ? (broadcast.broadcastTextStatus as string)
        : `${nickname} live on Dreamcam${isVr ? ' (VR)' : ''}`,
    thumbnail: broadcast.modelLivePhotoUrl ?? broadcast.modelProfilePhotoUrl ?? undefined,
    streamUrl,
    headers: {
      'User-Agent': getUserAgent(),
      Referer: `${getSiteBase()}/`,
      Origin: getSiteBase(),
    },
    cookies,
    proxyUrl: proxyUrl ?? undefined,
    qualityOptions: [
      {
        id: 'best',
        label: resolution ?? 'Best',
        format: 'hls',
        resolution,
        isBest: true,
      },
    ],
    metadata: {
      category: isVr ? 'Dreamcam VR' : 'Dreamcam',
      tags: isVr ? ['live', 'vr', '3d'] : ['live'],
      resolution,
      streamType: isVr ? 'video3D' : 'video2D',
      viewers: broadcast.broadcastMembersCount,
      durationSeconds: broadcast.broadcastDurationSec,
    },
    startedAt: new Date().toISOString(),
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
        if (getCookieString() === '') return { authenticated: false };
        // The BSS API answers without auth; cookies are a quality nicety.
        // Their validity is verified by asking for any live broadcast while
        // carrying them — a dead session still yields public data, so treat
        // "cookies present" as authenticated and let requests degrade.
        return { authenticated: true };
      },
      async login(credentials?: Record<string, string>): Promise<void> {
        const cookieHeader = credentials?.['cookie'];
        if (!cookieHeader) {
          throw new Error('Provide cookies via the "cookie" field (paste your browser cookie header value).');
        }
        loadCookieHeader(cookieHeader);
        ctx?.logger.info('dreamcam: cookies loaded');
      },
      async logout(): Promise<void> {
        cookieJar = {};
        ctx?.logger.info('dreamcam: cookies cleared');
      },
    },

    creatorSearch: {
      async search(query): Promise<CreatorSearchResult> {
        const q = query.query.trim().replace(/^dreamcam:/, '');
        const limit = query.limit ?? 10;
        if (!q) {
          // Empty query: list currently live broadcasts (efficient discovery).
          try {
            const { value } = await withSmartRoute('dreamcam:list', (agent, timeoutMs) =>
              listLiveBroadcasts(Math.min(limit, 30), 0, bssOptions(agent, timeoutMs)),
            );
            const creators = value.pageItems
              .filter((b) => typeof b.modelNickname === 'string')
              .map((b) => creatorFromBroadcast(b, b.modelNickname!));
            return { creators, total: value.totalCount };
          } catch (e) {
            ctx?.logger.warn(`dreamcam: live list failed: ${e instanceof Error ? e.message : e}`);
            return { creators: [], total: 0 };
          }
        }
        const creator = await plugin.capabilities.creatorSearch!.getCreator(q);
        return { creators: creator ? [creator] : [], total: creator ? 1 : 0 };
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const nickname = nicknameOf(identifier);
        try {
          const { broadcast } = await fetchBroadcastSmart(identifier, nickname);
          return creatorFromBroadcast(broadcast, nickname);
        } catch (e) {
          ctx?.logger.debug(
            `dreamcam: lookup failed for ${nickname}: ${e instanceof Error ? e.message : e}`,
          );
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const nickname = nicknameOf(identifier);
        ctx?.logger.debug(`dreamcam: checking live status for ${nickname}`);
        // ponytail: transport failures are `unknown` — neither live nor
        // ended. A plain offline answer here would emit `creator-offline`
        // and finalize healthy recordings mid-capture on network blips.
        try {
          const { broadcast } = await fetchBroadcastSmart(identifier, nickname);
          if (broadcast === null) {
            return { isLive: false };
          }
          if (!isWatchable(broadcast)) {
            return { isLive: false };
          }
          const streams = resolveStreamUrls(broadcast);
          const hasStream = streams.hls2d !== undefined || streams.vr3d !== undefined;
          return {
            isLive: hasStream,
            title:
              broadcast.broadcastTextStatus !== '' && broadcast.broadcastTextStatus !== undefined
                ? broadcast.broadcastTextStatus
                : `${nickname} is live`,
            thumbnail: broadcast.modelLivePhotoUrl ?? broadcast.modelProfilePhotoUrl ?? undefined,
            viewerCount:
              typeof broadcast.broadcastMembersCount === 'number'
                ? broadcast.broadcastMembersCount
                : undefined,
            startedAt:
              typeof broadcast.broadcastDurationSec === 'number' && broadcast.broadcastDurationSec > 0
                ? new Date(Date.now() - broadcast.broadcastDurationSec * 1_000).toISOString()
                : undefined,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ctx?.logger.warn(
            `dreamcam: ${nickname} check degraded (site unreachable) — host will retry: ${msg}`,
          );
          return { isLive: false, unknown: true };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const nickname = nicknameOf(identifier);
        ctx?.logger.debug(`dreamcam: extracting stream for ${nickname}`);
        const { broadcast, usedProxy } = await fetchBroadcastSmart(identifier, nickname);
        if (broadcast === null) {
          throw new Error(`Creator ${nickname} not found on Dreamcam`);
        }
        if (!isWatchable(broadcast)) {
          throw new Error(`${nickname} is not live`);
        }
        return buildStreamObject(identifier, broadcast, usedProxy);
      },
    },

    settings: {
      getSchema(): Record<string, SettingDef> {
        return SETTINGS_SCHEMA;
      },
      async validate(values: PluginSettingValues) {
        const errors: Record<string, string> = {};
        const base = values['siteUrl'];
        if (typeof base === 'string' && base.trim() !== '') {
          try {
            const u = new URL(base.trim());
            if (u.protocol !== 'https:' && u.protocol !== 'http:') {
              errors['siteUrl'] = 'Must be an http(s) URL';
            }
          } catch {
            errors['siteUrl'] = 'Invalid URL';
          }
        }
        return { valid: Object.keys(errors).length === 0, errors };
      },
    },

    healthCheck: {
      async check(): Promise<HealthStatus> {
        const start = Date.now();
        try {
          // The cheapest authenticated-free probe: one page of live broadcasts.
          const { value } = await withSmartRoute('dreamcam:health', (agent, timeoutMs) =>
            listLiveBroadcasts(1, 0, bssOptions(agent, timeoutMs)),
          );
          return {
            healthy: true,
            message: `Dreamcam reachable (${value.totalCount} live)`,
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          const msg = e instanceof BssApiError ? e.message : String(e);
          return { healthy: false, message: msg, latencyMs: Date.now() - start };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const nickname = nicknameOf(identifier);
        try {
          const { broadcast } = await fetchBroadcastSmart(identifier, nickname);
          if (broadcast === null) return { displayName: nickname };
          return {
            displayName: broadcast.modelNickname ?? nickname,
            avatarUrl: broadcast.modelProfilePhotoUrl ?? undefined,
            bio: broadcast.broadcastTextStatus ?? undefined,
            location: Array.isArray(broadcast.modelLanguages)
              ? broadcast.modelLanguages.join(', ')
              : undefined,
            website: `${getSiteBase()}/live/${nickname}`,
          };
        } catch {
          return { displayName: nickname };
        }
      },
    },
  },

  async initialize(context: PluginContext): Promise<void> {
    status.state = 'initializing';
    ctx = context;
    context.logger.info('dreamcam: initializing');
    const savedCookies = context.settings.get('cookies');
    if (typeof savedCookies === 'string' && savedCookies.length > 0) {
      loadCookieHeader(savedCookies);
      context.logger.info('dreamcam: loaded saved cookies');
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
    for (const { proxy } of vrBridges.clear()) {
      await proxy.stop().catch(() => undefined);
    }
    status.state = 'installed';
    ctx = null;
  },
};

export default plugin;
