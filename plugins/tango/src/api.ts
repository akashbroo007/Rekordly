/**
 * Tango tenant API wrappers (pure node HTTPS).
 *
 * Endpoints (validated against gateway.tango.me live traffic):
 *   GET  /api/visitors/profilealias/api/alias/convert?alias=<u>  → encryptedAccountId (plain text)
 *   GET  /api/proxycador/api/profiles/v2/single?id=<enc>&...    → profile JSON
 *   GET  /api/showroom-streams/api/public/stream/v1/id?broadcasterId=<enc>
 *        → 200 = LIVE (plain streamId body), 404 = not live (definitive)
 *   POST /showroom-streams/api/public/web/catalog/v1            → live-catalog JSON pages
 *   POST /visitors/stream/client/v2/stream/<sid>/watch          → fresh playback URLs (protobuf)
 *
 * Every call needs the Tango-VT visitor cookie; a 401 "Jwt is missing"
 * (expired/revoked) triggers one session re-mint + retry.
 */
import type { Agent } from 'node:http';
import * as https from 'node:https';
import { request, DIRECT_TIMEOUT_MS, HLS_TIMEOUT_MS, type TangoResponse } from './http';
import type { TangoSession } from './session';

const BASE = 'https://gateway.tango.me';
const WWW_API = 'https://www.tango.me/api';

const COMMON_HEADERS: Record<string, string> = {
  Origin: 'https://www.tango.me',
  Referer: 'https://www.tango.me/',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface ApiHooks {
  onSetCookie: (values: string[]) => void;
  debug: (message: string) => void;
}

export interface ApiContext {
  session: TangoSession;
  hooks: ApiHooks;
  /**
   * POP-pinned keep-alive agent used for DIRECT (no host proxy) calls so
   * visitor/HLS auth state stays on one Fastly edge node (see sticky-agent).
   */
  stickyAgent?: https.Agent;
}

export function createContext(
  session: TangoSession,
  hooks: ApiHooks,
  stickyAgent?: https.Agent,
): ApiContext {
  return { session, hooks, stickyAgent };
}

async function authedRequest(
  ctx: ApiContext,
  url: string,
  options: { method?: 'GET' | 'POST'; body?: string | Buffer; agent?: Agent | null; timeoutMs?: number; binary?: boolean; extraHeaders?: Record<string, string> },
  retried = false,
): Promise<TangoResponse> {
  await ctx.session.ensure();
  const headers: Record<string, string> = { ...COMMON_HEADERS, ...(options.extraHeaders ?? {}) };
  const cookieHeader = ctx.session.cookieHeader();
  if (cookieHeader) headers.Cookie = cookieHeader;
  if (options.body !== undefined && headers['Content-Type'] === undefined) headers['Content-Type'] = 'application/json';

  const res = await request(url, {
    method: options.method ?? 'GET',
    body: options.body,
    headers,
    agent: options.agent ?? ctx.stickyAgent ?? null,
    timeoutMs: options.timeoutMs ?? DIRECT_TIMEOUT_MS,
    onSetCookie: ctx.hooks.onSetCookie,
    debug: ctx.hooks.debug,
  });
  if (res.status === 401 && !retried) {
    ctx.hooks.debug('tango: API gateway returned 401 — re-minting the visitor session');
    ctx.session.invalidate('gateway 401 during API call');
    return authedRequest(ctx, url, options, true);
  }
  return res;
}

/** Alias → encryptedAccountId (platform-level creator id), null when unknown alias. */
export async function aliasToEncryptedId(ctx: ApiContext, alias: string, agent: Agent | null = null): Promise<string | null> {
  const res = await authedRequest(ctx, `${WWW_API}/visitors/profilealias/api/alias/convert?alias=${encodeURIComponent(alias)}`, { agent });
  if (res.status !== 200) return null;
  const id = res.text().trim();
  if (id === '' || id.length > 64 || /["{\s]/.test(id)) return null;
  return id;
}

/** Profile JSON (name, avatar, followerStats, …) — null for unknown ids/aliases. */
export async function fetchProfile(ctx: ApiContext, encId: string, agent: Agent | null = null): Promise<Record<string, unknown> | null> {
  const res = await authedRequest(
    ctx,
    `${WWW_API}/proxycador/api/profiles/v2/single?id=${encodeURIComponent(encId)}&basicProfile=true&liveStats=true&followStats=true`,
    { agent },
  );
  if (res.status !== 200) return null;
  try {
    const parsed = JSON.parse(res.text()) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface StreamIdResult {
  /** 200 with a body = LIVE; other statuses include 404 (definitively not live). */
  live: boolean;
  streamId: string | null;
  status: number;
}

/**
 * ponytail: the definitive live/offline signal. 200 carries the plain
 * streamId; 404 is the "broadcaster not live" answer (validated against a
 * room that went offline mid-test). Any other status (401 after retry, 5xx)
 * throws so monitoring surfaces it as an unknown/transport problem.
 */
export async function fetchStreamId(ctx: ApiContext, encId: string, agent: Agent | null = null): Promise<StreamIdResult> {
  const res = await authedRequest(
    ctx,
    `${BASE}/showroom-streams/api/public/stream/v1/id?broadcasterId=${encodeURIComponent(encId)}`,
    { agent },
  );
  if (res.status === 200) {
    const id = res.text().trim();
    if (id === '' || id.length > 80 || /\s/.test(id)) return { live: false, streamId: null, status: res.status };
    return { live: true, streamId: id, status: 200 };
  }
  if (res.status === 404) return { live: false, streamId: null, status: 404 };
  throw new Error(`stream lookup returned HTTP ${res.status}`);
}

/**
 * The SPA's token-data call ARMS HLS access for this visitor: the response
 * carries {token, ttlSeconds: 10} and for ~10 s the cinema edge accepts
 * playlist requests authored with `username=<VT username claim>`. The relay
 * re-arms before every playlist cycle (see relay.ts).
 * ponytail: the SPA also sends x-app-client-session-id/interaction-id/
 * foreground-id + username:'null' (anonymous) — verbatim-kept, because a
 * bare GET sometimes 400s ("No acceptable representation").
 */
export async function fetchTokenData(ctx: ApiContext, agent: Agent | null = null): Promise<boolean> {
  const res = await authedRequest(ctx, `${BASE}/stream/token-data/v1/web/visitor`, {
    agent,
    extraHeaders: {
      Accept: 'application/json',
      username: 'null',
      'x-app-client-session-id': crypto.randomUUID(),
      'interaction-id': crypto.randomUUID(),
      'foreground-id': crypto.randomUUID(),
    },
  });
  if (res.status !== 200) {
    ctx.hooks.debug(`tango: token-data arm got ${res.status}`);
    return false;
  }
  try {
    const body = JSON.parse(res.text()) as { username?: string; ttlSeconds?: number };
    ctx.hooks.debug(`tango: armed HLS (token-data username=${body.username?.slice(0, 10) ?? 'none'} ttl=${body.ttlSeconds ?? '?'}s)`);
  } catch { ctx.hooks.debug('tango: armed HLS (token-data body unreadable)'); }
  return true;
}

/**
 * The watch endpoint mints FRESH playback URLs for a streamId (they wrap a
 * short-lived edge token: the same master URL stops working in ~15-30s).
 * The body is protobuf; URLs are contiguous ASCII runs ending in ".m3u8" —
 * a non-greedy slice is a complete, validated extractor.
 */
export async function fetchWatchUrls(ctx: ApiContext, streamId: string, agent: Agent | null = null): Promise<string[]> {
  const res = await authedRequest(
    ctx,
    `${BASE}/visitors/stream/client/v2/stream/${encodeURIComponent(streamId)}/watch?requestId=${encodeURIComponent(crypto.randomUUID())}`,
    { method: 'POST', agent, timeoutMs: HLS_TIMEOUT_MS },
  );
  if (res.status !== 200) throw new Error(`watch returned HTTP ${res.status}`);
  const matches = res.text().match(/https:\/\/[!-~]*?\.m3u8/g) ?? [];
  const unique: string[] = [];
  for (const raw of matches) {
    const url = raw.slice(0, raw.indexOf('.m3u8') + 5);
    if (/^https:\/\/cinema[-\w]*\.tango\.me\//.test(url) && !unique.includes(url)) unique.push(url);
  }
  return unique;
}

export interface CatalogItem {
  encryptedStreamId?: string;
  isPrivateStream?: boolean;
  isNsfw?: boolean;
  viewers?: number;
  thumbnail?: string;
  masterListUrl?: string;
  tags?: unknown;
  broadcaster?: {
    encryptedId?: string;
    name?: string;
    avatarUrl?: string;
    avatarThumbnailUrl?: string;
    iso2CountryCode?: string;
    alias?: string;
  };
}

/**
 * One page of the live catalog (the "Live" grid's own feed). Pages of 100;
 * `offset` page-walks (validated: offset=100 returns the next hundred,
 * size>100 is clamped).
 */
export async function fetchCatalogPage(ctx: ApiContext, offset: number, agent: Agent | null = null): Promise<CatalogItem[]> {
  const res = await authedRequest(
    ctx,
    `${BASE}/showroom-streams/api/public/web/catalog/v1?traceId=${crypto.randomUUID()}`,
    {
      method: 'POST',
      body: JSON.stringify({ size: 100, offset, platform: 'web_desktop', hMarketingCampaign: false }),
      agent,
      extraHeaders: { 'Content-Type': 'application/json' },
    },
  );
  if (res.status !== 200) throw new Error(`catalog returned HTTP ${res.status}`);
  try {
    const parsed = JSON.parse(res.text()) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return [];
    const items = (parsed as Record<string, unknown>)['catalogItems'];
    if (!Array.isArray(items)) return [];
    return items.filter(
      (item): item is CatalogItem => typeof item === 'object' && item !== null,
    );
  } catch {
    throw new Error('catalog returned invalid JSON');
  }
}
