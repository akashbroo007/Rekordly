/**
 * HTTP client for Tango (www.tango.me + gateway.tango.me + cinema-*.tango.me).
 *
 * ponytail: every gateway tenant API call needs the visitor JWT (Tango-VT
 * cookie) — the session module owns the jar and hooks in via
 * `onSetCookie`. Transport failures (ISP/DNS blocks are regional) fall
 * back through the host's secure proxy via the smart route pattern used by
 * the BongaCams plugin — HTTP-level answers (401 "Jwt is missing", 404)
 * are the SITE talking and never trigger a proxy retry.
 */
import type { Agent } from 'node:http';
import * as http from 'node:http';
import * as https from 'node:https';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export interface TangoRequestOptions {
  method?: 'GET' | 'POST';
  body?: string | Buffer;
  headers?: Record<string, string>;
  /** Host-provided proxy agent; null/undefined = direct. */
  agent?: Agent | null;
  timeoutMs?: number;
  /** Called with every raw Set-Cookie header value (session jar feed). */
  onSetCookie?: (values: string[]) => void;
  debug?: (message: string) => void;
}

export interface TangoResponse {
  status: number;
  body: Buffer;
  headers: http.IncomingHttpHeaders;
  text(): string;
}

const REDIRECT_LIMIT = 5;

export const DIRECT_TIMEOUT_MS = 10_000;
export const PROXY_TIMEOUT_MS = 45_000;

/** Edge/HLS requests get a longer leash than catalog lookups. */
export const HLS_TIMEOUT_MS = 20_000;

/** Signs of a network-level failure worth retrying through the proxy. */
export function isRetryableThroughProxy(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timed out|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|getaddrinfo|socket hang up|aborted/i.test(msg);
}

/** Simple recursive redirect follower, cap at 5 hops. */
export function request(
  url: string,
  options: TangoRequestOptions = {},
  hops = 0,
): Promise<TangoResponse> {
  if (hops > REDIRECT_LIMIT) return Promise.reject(new Error('Too many redirects'));
  const log = options.debug ?? ((): void => undefined);
  log(`GET ${options.method ?? ''} ${url}`);
  return new Promise((resolve, reject) => {
    const mod = new URL(url).protocol === 'https:' ? https : http;
    const reqHeaders: Record<string, string> = {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      ...options.headers,
    };
    const req = mod.request(url, {
      method: options.method ?? 'GET',
      headers: reqHeaders,
      timeout: options.timeoutMs ?? DIRECT_TIMEOUT_MS,
      ...(options.agent !== undefined && options.agent !== null ? { agent: options.agent } : {}),
    }, (res) => {
      const setCookie = res.headers['set-cookie'];
      if (setCookie !== undefined && options.onSetCookie) options.onSetCookie(setCookie);
      const statusCode = res.statusCode ?? 0;
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        resolve(request(next, options, hops + 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        log(`${statusCode} ${body.length} bytes from ${new URL(url).host}`);
        resolve({
          status: statusCode,
          body,
          headers: res.headers,
          text: (): string => body.toString('utf8'),
        });
      });
    });
    if (options.body !== undefined) req.write(options.body);
    req.end();
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

/**
 * ponytail: SMART routing — run `attempt` DIRECT first (fast ~10s failure on
 * ISP blocks); only when the network itself fails do we retry through the
 * host's secure proxy (booted on demand by ensureProxy). HTTP-level answers
 * (401/404/… sites talking) never trigger the proxy fallback.
 */
export async function withSmartRoute<T>(
  identifier: string,
  attempt: (agent: Agent | null) => Promise<T>,
  proxyApi: { ensureProxy(id: string): Promise<void>; getProxyAgent(id: string): Agent | null } | undefined,
  debug?: (message: string) => void,
): Promise<T> {
  try {
    return await attempt(null);
  } catch (err) {
    if (!isRetryableThroughProxy(err) || proxyApi === undefined) throw err;
    debug?.(`direct request failed (${err instanceof Error ? err.message : err}) — retrying through secure proxy`);
  }
  try {
    await proxyApi.ensureProxy(identifier);
  } catch (err) {
    throw new Error(
      `Secure proxy unavailable: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  return attempt(proxyApi.getProxyAgent(identifier));
}
