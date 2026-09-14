/**
 * HTTP client for MyFreeCams with secure-proxy routing.
 *
 * MyFreeCams answers plain Node https requests (no Cloudflare bot management
 * on the endpoints we use), so the transport is node:https directly.
 *
 * Transport strategy (direct-first with proxy fallback): site reachability is
 * a property of the USER'S network — ISP/DNS blocks are regional. Every
 * outbound request runs DIRECT first with a short timeout; only transport-level
 * failures (and block-page signatures) retry through the host's embedded
 * proxy (`context.network`). HTTP-level answers (404/403) are the SITE talking
 * and never trigger a proxy retry.
 */
import type {
  HttpCookie,
  PluginContext,
  PluginLogger,
} from '@rekordly/plugin-sdk';
import type { Agent } from 'node:http';
import * as https from 'https';
import * as http from 'http';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export const DIRECT_TIMEOUT_MS = 8_000;
export const PROXY_TIMEOUT_MS = 45_000;

export interface HttpResult {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

let ctx: PluginContext | null = null;

export function setHttpPluginContext(context: PluginContext | null): void {
  ctx = context;
}

function logger(): PluginLogger | undefined {
  return ctx?.logger;
}

/** The host-owned writable data directory for this plugin, or null in tests. */
export function pluginDataDir(): string | null {
  const dir = ctx?.dataDir;
  return typeof dir === 'string' && dir.length > 0 ? dir : null;
}

/** Optional User-Agent override from plugin settings. */
export function getUserAgent(): string {
  const v = ctx?.settings.get('userAgent');
  return typeof v === 'string' && v.trim() ? v : DEFAULT_USER_AGENT;
}

// ponytail: cookie jar lives in memory only, reset on app restart. MFC guest
// monitoring needs no cookies at all; member cookies only raise quality caps.
let cookieJar: Record<string, string> = {};

export function getCookieString(): string {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export function hasCookies(): boolean {
  return Object.keys(cookieJar).length > 0;
}

export function loadCookieHeader(header: string): void {
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      cookieJar[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    }
  }
}

export function clearCookies(): void {
  cookieJar = {};
}

/** Cookie list in the shared StreamObject HttpCookie shape. */
export function cookieList(domain: string): HttpCookie[] {
  return Object.entries(cookieJar).map(([name, value]) => ({
    name,
    value,
    domain,
    path: '/',
    secure: true,
  }));
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

/**
 * ponytail: route through the host's embedded proxy when the user flagged
 * this creator (`creators.use_proxy`) — ISP/DNS blocks are regional, so this
 * is a user decision the host resolves per identifier, never a plugin one.
 */
export async function proxyFor(identifier: string): Promise<Agent | null> {
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
export function proxyHttpUrlFor(identifier: string): string | null {
  return ctx?.network?.getProxyHttpUrl(identifier) ?? null;
}

/**
 * ponytail: what a NETWORK failure looks like — these are the signatures of
 * an ISP/DNS block (or any unreachable route). HTTP-level answers (404, 403,
 * non-JSON API bodies) are the SITE talking and must NOT trigger a proxy
 * retry… with one exception: a 200 page of non-JSON where JSON was expected
 * is the classic ISP block-page injection, so it IS retryable.
 */
export function isRetryableThroughProxy(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timed out|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|getaddrinfo|socket hang up|invalid JSON/i.test(
    msg,
  );
}

/** Simple recursive redirect follower, cap at 5 hops. */
export function request(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    agent?: Agent | null;
    timeout?: number;
  } = {},
  hops = 0,
): Promise<HttpResult> {
  if (hops > 5) return Promise.reject(new Error('Too many redirects'));
  logger()?.debug(`myfreecams: GET ${url}`);
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
          (options.agent !== undefined && options.agent !== null
            ? PROXY_TIMEOUT_MS
            : 15_000),
        ...(options.agent !== undefined && options.agent !== null
          ? { agent: options.agent }
          : {}),
      },
      (res) => {
        parseCookies(res.headers['set-cookie']);
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          logger()?.debug(`myfreecams: ${statusCode} -> redirect to ${next}`);
          res.resume();
          resolve(request(next, options, hops + 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          logger()?.debug(
            `myfreecams: ${statusCode} ${body.length} bytes from ${url}`,
          );
          resolve({ status: statusCode, body, headers: res.headers });
        });
      },
    );
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
export async function withSmartRoute<T>(
  identifier: string,
  attempt: (agent: Agent | null) => Promise<T>,
): Promise<{ value: T; usedProxy: boolean }> {
  try {
    const value = await attempt(null);
    return { value, usedProxy: false };
  } catch (err) {
    if (!isRetryableThroughProxy(err)) throw err;
    logger()?.debug(
      `myfreecams: direct request failed (${err instanceof Error ? err.message : err}) — retrying through secure proxy`,
    );
  }
  const agent = await proxyFor(identifier);
  const value = await attempt(agent);
  return { value, usedProxy: true };
}
