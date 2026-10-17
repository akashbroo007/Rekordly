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
  DIRECT_TIMEOUT_MS,
  PROXY_TIMEOUT_MS,
  clearCookies,
  hasCookies,
  loadCookieHeader,
  proxyFor,
  request,
  setHttpPluginContext,
  withSmartRoute,
} from './http';
import {
  alternateChannelUrl,
  channelUrl,
  creatorId,
  handleFromIdentifier,
  parseChannelPage,
  type ChannelPageSignals,
} from './channel';
import {
  buildStreamObject,
  extractHlsStream,
  extractVideoStream,
  resolveChannelLive,
} from './embed';
import manifest from '../manifest.json';

const status: PluginStatus = { state: 'installed' };

let ctx: PluginContext | null = null;

const DEFAULT_BASE = 'https://rumble.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  cookies: {
    type: 'password',
    label: 'Session cookies',
    description:
      'Browser cookies for authentication (paste "cookie" header value from DevTools). Optional — Rumble works anonymously; cookies raise rate limits.',
    defaultValue: '',
  },
  userAgent: {
    type: 'text',
    label: 'User-Agent',
    description: 'Browser User-Agent string sent with requests.',
    defaultValue: UA,
  },
};

// ---- Shared fetchers ---------------------------------------------------------

interface PageFetch {
  status: number;
  body: string;
  usedProxy: boolean;
}

/**
 * Fetch a channel page, direct-first with proxy fallback. HTTP-level
 * statuses are returned as-is (404 = missing channel — definitive); only
 * transport failures / self-redirect throttle loops retry through the
 * secure proxy.
 */
async function fetchChannelPageSmart(identifier: string, url: string): Promise<PageFetch> {
  const { value, usedProxy } = await withSmartRoute(identifier, async (agent) =>
    request(url, {
      headers: { Accept: 'text/html', Referer: `${DEFAULT_BASE}/` },
      timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
      agent,
    }),
  );
  return { ...value, usedProxy };
}

/**
 * Confirm an HLS master playlist is actually up (the definitive live test —
 * the same signal bongacams uses). GET (not HEAD — Rumble's CDN is picky)
 * with a small read budget: the master playlist is a few hundred bytes.
 */
async function confirmPlaylist(identifier: string, url: string, usedProxy: boolean): Promise<boolean> {
  try {
    const agent = usedProxy ? await proxyFor(identifier) : null;
    const res = await request(url, {
      agent,
      headers: { Referer: `${DEFAULT_BASE}/` },
      timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
    });
    return res.status === 200 && res.body.includes('#EXTM3U');
  } catch {
    return false;
  }
}

/**
 * Full channel probe: ONE page fetch + signals + live confirmation.
 * Exported for tests.
 *
 * ponytail: /c/ and /user/ are parallel namespaces — some channels only
 * resolve under one. A 404 under /c/ retries once under /user/ before the
 * channel is declared missing.
 */
async function probeChannel(
  identifier: string,
  handle: string,
): Promise<
  | { kind: 'missing' }
  | {
      kind: 'resolved';
      signals: ChannelPageSignals;
      usedProxy: boolean;
    }
> {
  let page = await fetchChannelPageSmart(identifier, channelUrl(handle));
  if (page.status === 404) {
    page = await fetchChannelPageSmart(identifier, alternateChannelUrl(handle));
    if (page.status === 404) {
      return { kind: 'missing' };
    }
  }
  if (page.status !== 200 || page.body.length < 500) {
    // ponytail: self-redirect throttle loops return an empty body — treat
    // like a transport failure (withSmartRoute already retried via proxy).
    throw new Error(`Channel page returned HTTP ${page.status}`);
  }
  return { kind: 'resolved', signals: parseChannelPage(page.body), usedProxy: page.usedProxy };
}

// ---- Live resolution (page JSON first, embedJS as enrichment) ------------------

/**
 * Resolve the live state for a channel from its page JSON.
 * Exported for tests.
 *
 * ponytail (2026-09 live validation): the channel page's JSON items are the
 * reliable live source (`live: true`, `livestream_status: 2`,
 * `watching_now`, and `videos[].url` pointing at the live HLS master). The
 * embedJS endpoint answers with EMPTY payloads for live ids outside the
 * embedded player, so it cannot carry the live decision; it is only used
 * when the page yields no direct playlist URL.
 */
export async function resolveLiveStatus(
  identifier: string,
  signals: ChannelPageSignals,
  usedProxy: boolean,
): Promise<LiveStatus> {
  const liveEntries = signals.jsonEntries.filter((p) => {
    const e = p.entry;
    return e['live'] === true || e['livestream_status'] === 2;
  });
  const decision = await resolveChannelLive(liveEntries, (url) => confirmPlaylist(identifier, url, usedProxy));
  if (decision.isLive) {
    return {
      isLive: true,
      title: decision.title ?? `${handleFromIdentifier(identifier)} is live`,
      thumbnail: decision.thumbnail,
      viewerCount: decision.viewerCount,
      startedAt: decision.startedAt,
      streamUrl: decision.hlsUrl,
    };
  }
  const upcoming = decision.isUpcoming || signalsLookUpcoming(signals);
  const newest = signals.jsonEntries[0];
  if (upcoming) {
    return {
      isLive: false,
      title: decision.title ?? newest?.title,
      thumbnail: decision.thumbnail ?? (typeof newest?.entry['thumb'] === 'string' ? (newest.entry['thumb'] as string) : undefined),
    };
  }
  return { isLive: false };
}

/** Whether the page signals an upcoming (scheduled) broadcast. */
export function signalsLookUpcoming(signals: ChannelPageSignals): boolean {
  return signals.htmlUpcoming;
}

/**
 * Resolve the video id of the channel's newest item from ONE channel-page
 * fetch. Exported for tests.
 */
export function resolveCurrentVideoId(signals: ChannelPageSignals): string | null {
  const first = signals.jsonEntries[0];
  if (first !== undefined) {
    const rel = typeof first.entry['relative_url'] === 'string' ? (first.entry['relative_url'] as string) : undefined;
    if (rel !== undefined) {
      const m = /\b(v[0-9a-z]+)/i.exec(rel);
      if (m !== null) return m[1]!;
    }
  }
  if (signals.pinnedVideoId !== undefined) return signals.pinnedVideoId;
  if (signals.firstLinkVideoId !== undefined) return signals.firstLinkVideoId;
  return null;
}

const plugin: Plugin = {
  manifest,

  get status(): PluginStatus {
    return status;
  },

  capabilities: {
    auth: {
      async getStatus(): Promise<AuthStatus> {
        const saved = ctx?.settings.get('cookies');
        const cookieHeader = typeof saved === 'string' ? saved : '';
        if (!cookieHeader && !hasCookies()) return { authenticated: false };
        try {
          const res = await request(`${DEFAULT_BASE}/`, {
            headers: { Accept: 'text/html', Referer: `${DEFAULT_BASE}/` },
            timeout: DIRECT_TIMEOUT_MS,
          });
          if (res.status !== 200) {
            // ponytail: self-redirect throttle loops must not flip a
            // configured session to "logged out" — revalidate later.
            return { authenticated: true };
          }
          // ponytail: guest pages carry /login and /signup links; the
          // logged-in chrome does not (account menu instead). Verified
          // against anonymous page loads — logout anchors never appear there.
          const hasLoginUi = /href=["']?[./]*login/i.test(res.body) || /href=["']?[./]*signup/i.test(res.body);
          return { authenticated: !hasLoginUi };
        } catch {
          return { authenticated: true };
        }
      },
      async login(credentials?: Record<string, string>): Promise<void> {
        const cookieHeader = credentials?.['cookie'];
        if (!cookieHeader) {
          throw new Error('Provide cookies via the "cookie" field (paste your browser cookie header value).');
        }
        loadCookieHeader(cookieHeader);
        await ctx?.settings.set('cookies', cookieHeader);
        ctx?.logger.info('rumble: cookies loaded');
      },
      async logout(): Promise<void> {
        clearCookies();
        await ctx?.settings.set('cookies', '');
        ctx?.logger.info('rumble: cookies cleared');
      },
    },

    creatorSearch: {
      async search(query): Promise<CreatorSearchResult> {
        const q = query.query.trim();
        if (!q) return { creators: [], total: 0 };
        // ponytail: Rumble's channel search is HTML-only and unstable —
        // resolve the channel directly (handle == identity), which also
        // accepts pasted profile URLs.
        const creator = await plugin.capabilities.creatorSearch!.getCreator(q);
        return { creators: creator ? [creator] : [], total: creator ? 1 : 0 };
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const handle = handleFromIdentifier(identifier);
        if (!handle) return null;
        try {
          const probe = await probeChannel(`rumble:${handle}`, handle);
          if (probe.kind === 'missing') return null;
          const identity = probe.signals.identity;
          const liveEntries = probe.signals.jsonEntries.filter((p) => {
            const e = p.entry;
            return e['live'] === true || e['livestream_status'] === 2;
          });
          const decision = await resolveChannelLive(liveEntries, (url) =>
            confirmPlaylist(`rumble:${handle}`, url, probe.usedProxy),
          );
          const isLive = decision.isLive;
          const byName = identity.displayName;
          return {
            id: creatorId(handle),
            username: handle,
            displayName: byName ?? handle,
            avatarUrl: identity.avatarUrl,
            profileUrl: channelUrl(handle),
            bio: identity.bio,
            followerCount: identity.followerCount,
            isLive,
            liveUrl: isLive ? channelUrl(handle) : undefined,
          };
        } catch (e) {
          ctx?.logger.debug(`rumble: getCreator(${handle}) failed: ${e instanceof Error ? e.message : e}`);
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const handle = handleFromIdentifier(identifier);
        ctx?.logger.debug(`rumble: checking live status for ${handle}`);
        // ponytail: a monitoring check must NEVER kill its job. Transport
        // failures (ISP blocks, throttling, site hiccups) are transient —
        // returning `unknown` keeps the monitor alive and defers detection
        // to the next poll. Definitive answers (page resolved, playlist
        // 404 = broadcast not up) report plain states below.
        try {
          const probe = await probeChannel(identifier, handle);
          if (probe.kind === 'missing') {
            // ponytail: definitive missing-creator answer — the host stops
            // retrying instead of looping on a deleted channel.
            return { isLive: false };
          }
          return await resolveLiveStatus(identifier, probe.signals, probe.usedProxy);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // ponytail: `unknown` — the site could not be reached, which is
          // neither "live" nor "ended". The host keeps the previous state
          // and retries instead of finalizing a healthy recording.
          ctx?.logger.warn(
            `rumble: ${handle} check degraded (site unreachable) — host will retry: ${msg}`,
          );
          return { isLive: false, unknown: true };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const handle = handleFromIdentifier(identifier);
        ctx?.logger.debug(`rumble: extracting stream for ${handle}`);
        const probe = await probeChannel(identifier, handle);
        if (probe.kind === 'missing') {
          throw new Error(`Channel ${handle} not found on Rumble`);
        }
        const { signals, usedProxy } = probe;
        const liveEntries = signals.jsonEntries.filter((p) => {
          const e = p.entry;
          return e['live'] === true || e['livestream_status'] === 2;
        });

        // ponytail: stay on the chosen route for the whole fetch cycle —
        // extractHlsStream follows whatever route served detection.

        // Primary path: the live item's direct HLS master from the page JSON.
        const liveHls = liveEntries.find((p) => p.hlsUrl !== undefined)?.hlsUrl;
        if (liveHls !== undefined) {
          const extracted = await extractHlsStream(identifier, liveHls, { usedProxy });
          const decision = await resolveChannelLive(liveEntries, fetchPlaylistConfirmOnly);
          return buildStreamObject(
            {
              handle,
              videoId: decision.videoId,
              title: decision.title,
              thumbnail: decision.thumbnail,
              viewerCount: decision.viewerCount,
              startedAt: decision.startedAt,
              usedProxy,
              creatorName: signals.identity.displayName,
            },
            extracted,
          );
        }

        // Secondary path: embedJS (VOD-shaped layouts, legacy pages).
        const videoId = resolveCurrentVideoId(signals);
        if (videoId === null) {
          throw new Error(`${handle} is not live`);
        }
        const extracted = await extractVideoStream(identifier, videoId);
        return buildStreamObject(
          { handle, videoId, usedProxy, creatorName: signals.identity.displayName },
          extracted,
        );
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
          const res = await request(`${DEFAULT_BASE}/`, {
            headers: { Accept: 'text/html', Referer: `${DEFAULT_BASE}/` },
            timeout: DIRECT_TIMEOUT_MS,
          });
          // ponytail: the edge's self-redirect 307 throttle still proves the
          // site is REACHABLE (DNS+TLS+HTTP all answered) — an unhealthy
          // verdict here would nag the user while detection works fine.
          const healthy = (res.status === 200 && res.body.length > 0) || res.status === 307;
          return {
            healthy,
            message: healthy
              ? res.status === 200
                ? 'Rumble reachable'
                : 'Rumble reachable (edge throttling anonymous requests)'
              : `HTTP ${res.status}`,
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          return { healthy: false, message: e instanceof Error ? e.message : String(e) };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const handle = handleFromIdentifier(identifier);
        try {
          const probe = await probeChannel(identifier, handle);
          if (probe.kind === 'missing') return { displayName: handle };
          return {
            displayName: probe.signals.identity.displayName ?? handle,
            avatarUrl: probe.signals.identity.avatarUrl,
            bio: probe.signals.identity.bio,
            followerCount: probe.signals.identity.followerCount,
            website: channelUrl(handle),
          };
        } catch {
          return { displayName: handle };
        }
      },
    },
  },

  async initialize(context: PluginContext): Promise<void> {
    status.state = 'initializing';
    ctx = context;
    setHttpPluginContext(context);
    context.logger.info('rumble: initializing');
    const savedCookies = context.settings.get('cookies');
    if (typeof savedCookies === 'string' && savedCookies.length > 0) {
      loadCookieHeader(savedCookies);
      context.logger.info('rumble: loaded saved cookies');
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
    setHttpPluginContext(null);
  },
};

/**
 * Playlist-only confirm for extraction (the playlist is verified by
 * extractHlsStream itself; this keeps resolveChannelLive from skipping
 * items without a direct URL).
 */
async function fetchPlaylistConfirmOnly(url: string): Promise<boolean> {
  try {
    const res = await request(url, { headers: { Referer: `${DEFAULT_BASE}/` } });
    return res.status === 200 && res.body.includes('#EXTM3U');
  } catch {
    return false;
  }
}

export default plugin;
