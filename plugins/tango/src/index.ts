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
import { ProxyRegistry, extractViewerCount } from '@rekordly/plugin-sdk';
import type { Agent } from 'node:http';
import manifest from '../manifest.json';
import { DEFAULT_USER_AGENT, withSmartRoute } from './http';
import { createStickyAgent, type StickyAgent } from './sticky-agent';
import { createContext, aliasToEncryptedId, fetchProfile, fetchStreamId, fetchTokenData, fetchWatchUrls, type ApiContext, type CatalogItem } from './api';
import { ensureCatalogCache, catalogItemForAlias, catalogItemForStream, cachedItems, invalidateCatalogCache, tagsFromItem } from './catalog';
import { TangoSession } from './session';
import { RoomRelay, DEFAULT_IDLE_TIMEOUT_MS } from './relay';
import { pickBestVariant, type StreamVariant } from './hls';

const PLATFORM_ID = 'tango';
const SITE = 'https://www.tango.me';

const status: PluginStatus = { state: 'installed' };

let ctx: PluginContext | null = null;
let session: TangoSession | null = null;
let api: ApiContext | null = null;
let sticky: StickyAgent | null = null;

/** ponytail: recording children consume these AFTER extractStream returned.
 * Keyed by the stable lowercased alias (registry rule), evaluator-present
 * in the SDK, never stopped by the registry itself. */
const relays = new ProxyRegistry<RoomRelay>(8);

/** alias (lowercased) → encrypted id, resolved once per plugin run. */
const encIdCache = new Map<string, string>();

/** last definitive live answers, for the `unknown` degraded-check hint. */
const lastSeenLive = new Map<string, boolean>();

const relayIdleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS;

const SETTINGS_SCHEMA: Record<string, SettingDef> = {
  userAgent: {
    type: 'text',
    label: 'User-Agent',
    description: 'Browser User-Agent string sent with requests.',
    defaultValue: DEFAULT_USER_AGENT,
  },
  cookies: {
    type: 'password',
    label: 'Tango cookies (optional)',
    description: 'Paste your logged-in Tango "Cookie" header to reuse an account session. Anonymous visitor sessions work without this.',
    defaultValue: '',
  },
};

function prefixStrip(identifier: string): string {
  return identifier.replace(/^tango:/, '').trim();
}

function logger(): ((m: string) => void) | undefined {
  return ctx ? (m: string) => ctx?.logger.debug(m) : undefined;
}

function warnOnce(m: string): void {
  ctx?.logger.warn(`tango: ${m}`);
}

/** Host proxy routing (or undefined when no network surface is provided). */
function netApi(): { ensureProxy(id: string): Promise<void>; getProxyAgent(id: string): Agent | null } | undefined {
  const network = ctx?.network;
  if (network === undefined) return undefined;
  return { ensureProxy: network.ensureProxy, getProxyAgent: network.getProxyAgent };
}

/** ponytail: agent the relay uses for its EDGE leg (proxy only when the host
 * configured one for this creator — otherwise direct). */
async function relayAgent(identifier: string): Promise<Agent | null> {
  const network = ctx?.network;
  if (network === undefined) return null;
  try {
    await network.ensureProxy(identifier);
  } catch {
    return null;
  }
  return network.getProxyAgent(identifier);
}

async function resolveEncId(alias: string): Promise<string | null> {
  const key = alias.toLowerCase();
  const cachedId = encIdCache.get(key);
  if (cachedId !== undefined) return cachedId;
  const resolved = await withSmartRoute(
    PLATFORM_ID,
    (agent) => aliasToEncryptedId(api!, alias, agent),
    netApi(),
    logger(),
  );
  if (resolved === null) return null;
  encIdCache.set(key, resolved);
  return resolved;
}

function pNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function pString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function profileRecord(profile: Record<string, unknown> | null, key: string): Record<string, unknown> | undefined {
  const value = profile?.[key];
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function basicsOf(profile: Record<string, unknown> | null): Record<string, unknown> | undefined {
  return profileRecord(profile, 'basicProfile');
}

/** Prefer the small `profileThumbnailUrl` (512px CDN crop) over the raw CDN link. */
function avatarOf(profile: Record<string, unknown> | null): string | undefined {
  return pString(basicsOf(profile)?.profileThumbnailUrl) ?? pString(basicsOf(profile)?.profilePictureUrl);
}

function nameOf(profile: Record<string, unknown> | null, alias: string): string {
  return pString(basicsOf(profile)?.firstName) ?? alias;
}

function followerCountOf(profile: Record<string, unknown> | null): number | undefined {
  return pNumber(profileRecord(profile, 'followStats')?.followersCount);
}

/**
 * Fetch the alias→id mapping + profile JSON in ONE shared resolution so
 * getCreator/getLiveStatus/extractStream don't re-query it per capability
 * use (polling hits this a lot).
 */
async function resolveCreator(alias: string): Promise<{ encId: string; profile: Record<string, unknown> | null } | null> {
  const encId = await resolveEncId(alias);
  if (encId === null) return null;
  let profile: Record<string, unknown> | null = null;
  try {
    profile = await withSmartRoute(
      PLATFORM_ID,
      (agent) => fetchProfile(api!, encId, agent),
      netApi(),
      logger(),
    );
  } catch (e) {
    logger()?.(`tango: profile fetch for ${alias} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { encId, profile };
}

function creatorFrom(alias: string, profile: Record<string, unknown> | null, isLive: boolean): CreatorInfo {
  return {
    id: `tango:${alias}`,
    username: alias,
    displayName: nameOf(profile, alias),
    avatarUrl: avatarOf(profile),
    profileUrl: `${SITE}/${alias}`,
    followerCount: followerCountOf(profile),
    isLive,
    liveUrl: isLive ? `${SITE}/${alias}` : undefined,
  };
}

function qualityOptionsFrom(variants: StreamVariant[], bestUrl: string): Array<{
  id: string;
  label: string;
  format: string;
  resolution?: string;
  bitrate?: number;
  isBest?: boolean;
}> {
  // ponytail: isBest is stamped on the variant the relay actually resolved.
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
        if (session === null) return { authenticated: false };
        try {
          await session.ensure();
          const jwt = session.cookieHeader().includes('Tango-VT=');
          return {
            authenticated: jwt,
            expiresAt: session.expiresAt,
            username: session.username === undefined ? undefined : 'visitor',
          };
        } catch (e) {
          return { authenticated: false };
        }
      },
      async login(credentials?: Record<string, string>): Promise<void> {
        const cookieHeader = credentials?.['cookie'];
        if (!cookieHeader) {
          throw new Error('Provide cookies via the "cookie" field (paste your browser cookie header value). Optional — anonymous sessions are used by default.');
        }
        session?.loadCookieHeader(cookieHeader);
        ctx?.logger.info('tango: cookies loaded');
      },
      async logout(): Promise<void> {
        session?.invalidate('logout');
        ctx?.logger.info('tango: session cleared');
      },
    },

    creatorSearch: {
      async search(query): Promise<CreatorSearchResult> {
        const q = prefixStrip(query.query).toLowerCase();
        const limit = query.limit ?? 10;
        try {
          await withSmartRoute(
            PLATFORM_ID,
            (agent) => ensureCatalogCache(api!, agent),
            netApi(),
            logger(),
          );
        } catch (e) {
          logger()?.(`tango: catalog walk failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (q === '') {
          const creators = cachedItems()
            .slice(0, limit)
            .map((item): CreatorInfo | null => {
              const alias = item.broadcaster?.alias ?? '';
              if (alias === '') return null;
              return {
                id: `tango:${alias}`,
                username: alias,
                displayName: pString(item.broadcaster?.name) ?? alias,
                avatarUrl: pString(item.broadcaster?.avatarThumbnailUrl) ?? pString(item.broadcaster?.avatarUrl),
                profileUrl: `${SITE}/${alias}`,
                isLive: true,
                liveUrl: `${SITE}/${alias}`,
              };
            })
            .filter((v): v is CreatorInfo => v !== null);
          return { creators, total: creators.length };
        }
        const creator = await plugin.capabilities.creatorSearch!.getCreator(q);
        if (creator !== null) return { creators: [creator], total: 1 };
        // Closest catalog aliases (starts-with before substring, like the site's own grid).
        const low = q;
        const creators: CreatorInfo[] = [];
        for (const item of cachedItems()) {
          const alias = (item.broadcaster?.alias ?? '').toLowerCase();
          if (alias === '' || !alias.includes(low)) continue;
          creators.push({
            id: `tango:${alias}`,
            username: alias,
            displayName: pString(item.broadcaster?.name) ?? alias,
            avatarUrl: pString(item.broadcaster?.avatarThumbnailUrl) ?? pString(item.broadcaster?.avatarUrl),
            profileUrl: `${SITE}/${alias}`,
            isLive: true,
            liveUrl: `${SITE}/${alias}`,
          });
          if (creators.length >= limit) break;
        }
        return { creators, total: creators.length };
      },
      async getCreator(identifier): Promise<CreatorInfo | null> {
        const alias = prefixStrip(identifier);
        if (alias === '') return null;
        try {
          const resolved = await resolveCreator(alias);
          if (resolved === null) return null;
          const stream = await withSmartRoute(
            PLATFORM_ID,
            (agent) => fetchStreamId(api!, resolved.encId, agent),
            netApi(),
            logger(),
          );
          lastSeenLive.set(alias.toLowerCase(), stream.live);
          return creatorFrom(alias, resolved.profile, stream.live);
        } catch (e) {
          logger()?.(`tango: getCreator ${alias} failed: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        }
      },
    },

    liveDetection: {
      async getLiveStatus(identifier): Promise<LiveStatus> {
        const alias = prefixStrip(identifier);
        ctx?.logger.debug(`tango: checking live status for ${alias}`);
        try {
          const resolved = await resolveCreator(alias);
          if (resolved === null) return { isLive: false };
          const stream = await withSmartRoute(
            PLATFORM_ID,
            (agent) => fetchStreamId(api!, resolved.encId, agent),
            netApi(),
            logger(),
          );
          if (!stream.live) {
            lastSeenLive.set(alias.toLowerCase(), false);
            ctx?.logger.debug(`tango: ${alias} offline (stream lookup ${stream.status})`);
            return { isLive: false };
          }
          lastSeenLive.set(alias.toLowerCase(), true);
          // ponytail: viewer counts / titles come from the SHARED catalog
          // walk (all live creators per request), never per-creator scans.
          let item: CatalogItem | undefined;
          try {
            await withSmartRoute(
              PLATFORM_ID,
              (agent) => ensureCatalogCache(api!, agent),
              netApi(),
              logger(),
            );
            item = catalogItemForStream(stream.streamId!) ?? catalogItemForAlias(alias);
          } catch {
            /* catalog is enrichment only */
          }
          const viewerCount = item !== undefined ? extractViewerCount(item) : undefined;
          const title = pString(item?.broadcaster?.name) ?? nameOf(resolved.profile, alias);
          return {
            isLive: true,
            title,
            thumbnail: pString(item?.thumbnail) ?? avatarOf(resolved.profile),
            viewerCount,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ctx?.logger.warn(`tango: ${alias} check degraded (site unreachable) — host will retry: ${msg}`);
          const wasLive = lastSeenLive.get(alias.toLowerCase());
          return { isLive: false, unknown: true, ...(wasLive === true ? { lastKnownLive: true } : {}) };
        }
      },
    },

    streamExtraction: {
      async extractStream(identifier): Promise<StreamObject> {
        const alias = prefixStrip(identifier);
        ctx?.logger.debug(`tango: extracting stream for ${alias}`);
        const resolved = await resolveCreator(alias);
        if (resolved === null) throw new Error(`Unknown Tango creator: ${alias}`);
        const stream = await fetchStreamId(api!, resolved.encId);
        if (!stream.live || stream.streamId === null) {
          throw new Error(`${alias} is not live`);
        }

        // ponytail: mint playback URLs through the SAME smart route as the
        // checks so an ISP-blocked network records too; the relay applies
        // its own proxy agent afterwards (recorders only talk localhost).
        const masterUrls = await withSmartRoute(
          PLATFORM_ID,
          (agent) => fetchWatchUrls(api!, stream.streamId!, agent),
          netApi(),
          logger(),
        );
        const masterCandidate =
          masterUrls.find((u) => u.includes('/master.m3u8') && u.length <= 140) ?? masterUrls[0];
        if (masterCandidate === undefined) throw new Error(`No playback URL minted for ${alias}`);

        const relayKey = alias.toLowerCase();
        // ponytail (POP pinning): fall back to the sticky agent so the relay
        // edge leg rides the same Fastly node the visitor seat was minted on.
        const agent = (await relayAgent(PLATFORM_ID)) ?? sticky?.agent ?? null;
        // ponytail: the FIRST mint reuses the URL set extraction just
        // fetched (a second watch back-to-back adds nothing); later relay
        // refreshes genuinely re-watch for a young token.
        let firstMint = true;
        let lastRecoveryAt = 0;
        const relay = new RoomRelay({
          alias,
          streamId: stream.streamId,
          api: {
            mintMasterUrls: async (): Promise<string[]> => {
              if (firstMint) {
                firstMint = false;
                return masterUrls;
              }
              // ponytail (pillow probe parity): a fresh-minted jar must see
              // the gateway stamp (stream/id → gatewayApiSeen/x-location-type)
              // BEFORE the watch enrols the seat — remint chains that watch
              // as the very first gateway call mint a reduced grant that the
              // edge 401s. Mirror the browser chain: alias → id → watch.
              try {
                const enc = await aliasToEncryptedId(api!, alias);
                if (enc !== null) await fetchStreamId(api!, enc);
              } catch (e) {
                logger()?.(`tango: pre-watch re-establish skipped: ${e instanceof Error ? e.message : String(e)}`);
              }
              try {
                const urls = await fetchWatchUrls(api!, stream.streamId!);
                if (urls.length === 0) logger()?.(`tango: mint for ${alias} returned no URLs`);
                return urls;
              } catch (e) {
                logger()?.(`tango: mint for ${alias} failed: ${e instanceof Error ? e.message : String(e)}`);
                return [];
              }
            },
            cookieHeader: () => session?.cookieHeader() ?? '',
            onSetCookie: (values) => session?.recordSetCookies(values),
            hlsUsername: () => session?.username,
            armHls: async (): Promise<boolean> => {
              try {
                return await fetchTokenData(api!);
              } catch (e) {
                logger()?.(`tango: token-data arm failed: ${e instanceof Error ? e.message : String(e)}`);
                return false;
              }
            },
            recoverSession: async (): Promise<void> => {
              // throttled: the visitor seat is lost when a newer check-in
              // (another plugin instance or manual test) superseded it —
              // re-mint once, at most every 30 s.
              if (session === null || Date.now() - lastRecoveryAt < 30_000) return;
              lastRecoveryAt = Date.now();
              sticky?.invalidate(); // force a fresh POP on the next lookup too
              session.invalidate('HLS edge 401 — re-acquiring visitor seat');
              await session.ensure().catch((e) => {
                logger()?.(`tango: seat recovery failed: ${e instanceof Error ? e.message : String(e)}`);
              });
            },
            agent,
          },
          debug: logger() ?? ((): void => undefined),
          idleTimeoutMs: relayIdleTimeoutMs,
          onIdleStop: () => {
            relays.delete(relayKey);
          },
        });
        try {
          await relay.start();
        } catch (e) {
          void relay.stop().catch(() => undefined);
          throw new Error(`Tango relay failed to start: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
        }
        for (const displaced of relays.set(relayKey, relay)) {
          ctx?.logger.debug(`tango: stopping replaced/evicted relay for ${displaced.key}`);
          void displaced.proxy.stop().catch(() => undefined);
        }

        const variants = relay.getVariantTable();
        const best = variants.length > 0 ? pickBestVariant(variants) : null;
        const qualityOptions: Array<{ id: string; label: string; format: string; resolution?: string; bitrate?: number; isBest?: boolean }> =
          best !== null
            ? qualityOptionsFrom(variants, best.url)
            : [{ id: 'best', label: 'Best', format: 'hls', isBest: true }];

        // Metadata from the (possibly stale) catalog copy — enrichment only.
        let tags: string[] = ['live'];
        let thumbnail: string | undefined;
        let catViewers: number | undefined;
        try {
          await ensureCatalogCache(api!);
          const item = catalogItemForStream(stream.streamId!) ?? catalogItemForAlias(alias);
          if (item) {
            const itemTags = tagsFromItem(item);
            if (itemTags.length > 0) tags = itemTags;
            thumbnail = pString(item.thumbnail) ?? undefined;
            catViewers = extractViewerCount(item);
          }
        } catch {
          /* enrichment only */
        }

        ctx?.logger.info(`tango: stream extracted for ${alias} via local relay (${relay.url})`);
        return {
          creatorId: `tango:${alias}`,
          creatorName: nameOf(resolved.profile, alias),
          platformId: PLATFORM_ID,
          title: `${nameOf(resolved.profile, alias)} live on Tango`,
          streamUrl: relay.url,
          thumbnail,
          headers: {
            'User-Agent': getUserAgent(),
            Referer: `${SITE}/`,
          },
          qualityOptions,
          metadata: {
            category: 'Tango Live',
            tags,
            resolution: best?.resolution,
            viewers: catViewers,
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
        const started = Date.now();
        try {
          if (session === null) return { healthy: false, message: 'plugin not initialized' };
          await session.ensure();
          const jwt = session.cookieHeader().includes('Tango-VT=');
          return {
            healthy: jwt,
            message: jwt ? 'Tango reachable (visitor session live)' : 'visitor session could not be minted',
            latencyMs: Date.now() - started,
          };
        } catch (e) {
          return { healthy: false, message: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - started };
        }
      },
    },

    metadata: {
      async getCreatorMetadata(identifier): Promise<CreatorMetadata> {
        const alias = prefixStrip(identifier);
        try {
          const resolved = await resolveCreator(alias);
          if (resolved === null) return { displayName: alias };
          return {
            displayName: nameOf(resolved.profile, alias),
            avatarUrl: avatarOf(resolved.profile),
            followerCount: followerCountOf(resolved.profile),
            website: `${SITE}/${alias}`,
          };
        } catch {
          return { displayName: alias };
        }
      },
    },
  },

  async initialize(context: PluginContext): Promise<void> {
    status.state = 'initializing';
    ctx = context;
    context.logger.info('tango: initializing');
    session = new TangoSession(context.dataDir, (m) => context.logger.debug(m), (m) => context.logger.warn(m));
    // POP-pinned agent: keep gateway + HLS edge traffic on one Fastly edge
    // node so visitor/HLS auth state stays consistent per-POP (sticky-agent).
    sticky = createStickyAgent();
    api = createContext(
      session,
      {
        onSetCookie: (values) => session?.recordSetCookies(values),
        debug: (m) => context.logger.debug(m),
      },
      sticky.agent,
    );
    const savedCookies = context.settings.get('cookies');
    if (typeof savedCookies === 'string' && savedCookies.length > 0) {
      session.loadCookieHeader(savedCookies);
      context.logger.info('tango: cookies loaded from settings');
    }
    session.load();
    invalidateCatalogCache();
    encIdCache.clear();
    lastSeenLive.clear();
    status.state = 'ready';
  },

  async start(): Promise<void> {
    status.state = 'ready';
    // prewarm the visitor session off the critical path
    void session?.ensure().catch((e) => warnOnce(e instanceof Error ? e.message : String(e)));
  },

  async stop(): Promise<void> {
    // ponytail: the owner stops its own long-lived resources — the registry
    // never stops entries itself, so clear() hands every key back here.
    for (const entry of relays.clear()) {
      void entry.proxy.stop().catch(() => undefined);
    }
    invalidateCatalogCache();
    status.state = 'disabled';
  },

  async cleanup(): Promise<void> {
    for (const entry of relays.clear()) {
      void entry.proxy.stop().catch(() => undefined);
    }
    encIdCache.clear();
    lastSeenLive.clear();
    sticky?.agent.destroy();
    sticky = null;
    status.state = 'installed';
    ctx = null;
    api = null;
    session = null;
  },
};

function getUserAgent(): string {
  const v = ctx?.settings.get('userAgent');
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : DEFAULT_USER_AGENT;
}

export default plugin;
