/**
 * HTTP client for Camsoda.
 *
 * Transport strategy (why not plain node:https?):
 * www.camsoda.com and media.livemediahost.com sit behind Cloudflare bot
 * management that TLS-fingerprints clients. Node's OpenSSL handshake gets a
 * 403 "Just a moment..." challenge, while the OS TLS stack (schannel) passes.
 * So the primary transport shells out to the system `curl` binary — bundled
 * with Windows 10 1803+, macOS and Linux, zero dependencies needed — and only
 * falls back to node https when curl is unavailable (degraded but functional).
 *
 * The cookie jar lives in memory and is shared by every request; cookies are
 * refreshed from Set-Cookie headers of each response. Because each curl
 * invocation is a fresh process, request cookies are passed as `-b` and
 * response Set-Cookie headers are captured via a per-request header dump file
 * (unique name, so concurrent requests never race).
 */
import { execFile } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface HttpResult {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const META_MARK = '__CS_META__';
const REDIRECT_LIMIT = 5;

/** Session cookie storage shared by every request through this module. */
let cookieJar: Record<string, string> = {};

export function getCookieString(): string {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export function setCookieHeader(header: string): void {
  cookieJar = {};
  loadCookieHeader(header);
}

export function clearCookies(): void {
  cookieJar = {};
}

export function loadCookieHeader(header: string): void {
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      cookieJar[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    }
  }
}

/** Cookie list in the shared StreamObject HttpCookie shape. */
export function cookieList(domain: string): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
}> {
  return Object.entries(cookieJar).map(([name, value]) => ({
    name,
    value,
    domain,
    path: '/',
    secure: true,
  }));
}

function parseCookieDump(dump: string): void {
  // ponytail: curl -D writes full response headers; only Set-Cookie matters
  // here (the -b request path carries the jar's current state).
  const lines = dump.split(/\r?\n/);
  for (const line of lines) {
    if (!/^set-cookie:/i.test(line)) continue;
    const first = line.slice(line.indexOf(':') + 1).split(';')[0] ?? '';
    const pair = first.trim();
    const eq = pair.indexOf('=');
    if (eq > 0) {
      cookieJar[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
}

/** Detects the Cloudflare "Just a moment..." interstitial page. */
export function isCloudflareChallenge(body: string): boolean {
  return body.includes('Just a moment...') && body.includes('challenges.cloudflare.com');
}

export interface HttpGetOptions {
  logger?: (message: string) => void;
  timeoutMs?: number;
  /** User-Agent override; defaults to the bundled Chrome UA. */
  userAgent?: string;
}

let curlAvailable: boolean | null = null;

async function detectCurl(): Promise<boolean> {
  if (curlAvailable !== null) return curlAvailable;
  try {
    await new Promise<void>((resolve, reject) => {
      execFile('curl', ['--version'], { windowsHide: true, timeout: 10_000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    curlAvailable = true;
  } catch {
    curlAvailable = false;
  }
  return curlAvailable;
}

interface CurlRun {
  status: number;
  body: string;
  headerDump: string;
}

/** Runs one system-curl request; returns status + body + response header dump. */
async function runCurl(url: string, headers: Record<string, string>, options: HttpGetOptions): Promise<CurlRun> {
  const dumpFile = path.join(
    os.tmpdir(),
    `camsoda-hdr-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  const headerLines = Object.entries(headers).map(([k, v]) => `${k}: ${v}`);
  const cookieStr = getCookieString();
  const args = [
    '-s',
    '--max-time', String(Math.ceil((options.timeoutMs ?? 15_000) / 1000)),
    '--compressed',
    '-D', dumpFile,
    '-o', '-',
    '-w', `\n${META_MARK}%{http_code}`,
    '-A', options.userAgent ?? DEFAULT_USER_AGENT,
  ];
  if (cookieStr) args.push('-b', cookieStr);
  for (const h of headerLines) args.push('-H', h);
  args.push(url);

  const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(
      'curl',
      args,
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: (options.timeoutMs ?? 15_000) + 10_000 },
      (error, result) => {
        const out = typeof result === 'string' ? result : Buffer.from(result ?? Buffer.alloc(0)).toString('utf8');
        // ponytail: curl exits non-zero on connection aborts mid-transfer and
        // on HTTP-level errors (--fail is not set); when the meta marker
        // arrived the response is complete and usable — treat as success.
        if (error !== null && out.includes(META_MARK)) {
          resolve({ stdout: out });
          return;
        }
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout: out });
      },
    );
  });

  const metaIdx = stdout.lastIndexOf(META_MARK);
  if (metaIdx === -1) {
    throw new Error(`curl returned no status (${stdout.length} bytes)`);
  }
  const code = parseInt(stdout.slice(metaIdx + META_MARK.length).trim(), 10);
  let headerDump = '';
  try {
    headerDump = fs.readFileSync(dumpFile, 'utf8');
  } catch {
    /* header dump is best-effort */
  } finally {
    fs.unlink(dumpFile, () => undefined);
  }
  return { status: Number.isNaN(code) ? 0 : code, body: stdout.slice(0, metaIdx), headerDump };
}

/** Simple recursive redirect follower, cap at 5 hops. */
export function httpGet(
  url: string,
  headers: Record<string, string> = {},
  options: HttpGetOptions = {},
  hops = 0,
): Promise<HttpResult> {
  if (hops > REDIRECT_LIMIT) return Promise.reject(new Error('Too many redirects'));
  options.logger?.(`camsoda: GET ${url}`);
  return (async (): Promise<HttpResult> => {
    if (await detectCurl()) {
      const run = await runCurl(url, headers, options);
      parseCookieDump(run.headerDump);
      options.logger?.(`camsoda: ${run.status} ${run.body.length} bytes from ${url}`);
      if (run.status === 403 && isCloudflareChallenge(run.body)) {
        throw new Error('Camsoda is temporarily blocking automated requests (Cloudflare challenge)');
      }
      if (run.status >= 300 && run.status < 400) {
        const location = /location:\s*(\S+)/i.exec(run.headerDump)?.[1];
        if (location) {
          const next = new URL(location, url).toString();
          options.logger?.(`camsoda: ${run.status} -> redirect to ${next}`);
          return httpGet(next, headers, options, hops + 1);
        }
      }
      return { status: run.status, body: run.body, headers: {} };
    }

    // ponytail: node fallback — used only when no system curl exists; its
    // OpenSSL TLS may hit Cloudflare challenges, but it still lets the
    // plugin resolve creators and playlists on networks without bot rules.
    return new Promise<HttpResult>((resolve, reject) => {
      const mod = new URL(url).protocol === 'https:' ? https : http;
      const reqHeaders: Record<string, string> = {
        'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers,
      };
      const cookieStr = getCookieString();
      if (cookieStr) reqHeaders['Cookie'] = cookieStr;
      const req = mod.get(url, { headers: reqHeaders, timeout: options.timeoutMs ?? 15_000 }, (res) => {
        parseHeaderList(res.headers['set-cookie']);
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          resolve(httpGet(next, headers, options, hops + 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          options.logger?.(`camsoda: ${statusCode} ${body.length} bytes from ${url}`);
          if (statusCode === 403 && isCloudflareChallenge(body)) {
            reject(new Error('Camsoda is temporarily blocking automated requests (Cloudflare challenge)'));
            return;
          }
          resolve({ status: statusCode, body, headers: res.headers });
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });
    });
  })();
}

function parseHeaderList(setCookies: string[] | undefined): void {
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
