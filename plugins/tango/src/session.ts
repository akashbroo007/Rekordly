/**
 * Tango visitor session.
 *
 * ponytail: every gateway tenant API (alias/convert, profiles, stream ids,
 * web catalog) and the HLS edge both REQUIRE the visitor JWT (Tango-VT
 * cookie). Gaming it out over real browser traffic: the desktop SPA itself
 * just POSTs check-in — a browser is only ever needed on www-level pages.
 * The token carries `exp` ~6 months out, so minting is a rare event; the
 * whole jar still persists to the plugin's dataDir across app restarts.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { request, DEFAULT_USER_AGENT } from './http';

const SESSION_FILE = 'tango-session.json';

/** Reload the stored session if not older than this (safety margin vs. `exp`). */
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

/** vendor tracking cookies that only add noise to the jar. NOTE: 'tt', 'ttu'
 * and 'tte' are TANGO's own cookies (visitor tokens / edge ticket) and must
 * travel — they are NOT the TikTok trackers '_tt'/'_ttp'. */
const IGNORED_COOKIES = new Set(['_ga', '_ga_S2ECDFJP9V', '_gcl_au', '_scid', '_ttp', '_tt', '_dcid', 'uet_vid', 'FPID', 'FPLC', 'OptanonConsent']);

interface StoredSession {
  cookies: Record<string, string>;
  analyticsKey?: string;
  username?: string;
  jwtExpiresAt?: string;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class TangoSession {
  private cookies: Record<string, string> = {};
  private inflight: Promise<void> | null = null;

  loaded = false;
  expiresAt?: string;
  analyticsKey?: string;
  username?: string;

  constructor(
    private readonly dataDir: string,
    private readonly debug: (message: string) => void,
    private readonly warn: (message: string) => void,
  ) {}

  /** Cookie header for gateway + HLS edge requests; '' when no session yet. */
  cookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  get jwt(): string | undefined {
    return this.cookies['Tango-VT'];
  }

  /** Copy of jar entries (for the StreamObject cookie list / diagnostics). */
  list(): Array<{ name: string; value: string }> {
    return Object.entries(this.cookies).map(([name, value]) => ({ name, value }));
  }

  /** Feed Set-Cookie values from any request.
   * ponytail: we keep EVERY cookie Tango hosts hand us, not just the JWT —
   * the cinema edge 401s playlist fetches unless the whole gateway jar
   * (Tango-RT, gatewayApiSeen, x-location-type, …) travels with the
   * Tango-VT identity likewise. Only short-lived tracking cookies from
   * ad vendors are skipped via the ignored-name list below. */
  recordSetCookies(values: string[]): void {
    let changed = false;
    for (const raw of values) {
      const first = raw.split(';')[0];
      if (!first) continue;
      const pair = first.trim();
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq);
      if (IGNORED_COOKIES.has(name)) continue;
      const value = pair.slice(eq + 1);
      if (this.cookies[name] !== value) {
        this.cookies[name] = value;
        changed = true;
        if (name === 'Tango-VT') {
          const payload = decodeJwtPayload(value);
          const exp = payload?.['exp'];
          if (typeof exp === 'number') this.expiresAt = new Date(exp * 1000).toISOString();
          this.analyticsKey = typeof payload?.['analyticsKey'] === 'string' ? payload['analyticsKey'] : undefined;
          this.username = typeof payload?.['username'] === 'string' ? payload['username'] : undefined;
        }
      }
    }
    if (changed) this.persist();
  }

  /** Is a currently-stored visitor JWT still fresh enough? */
  private isFresh(): boolean {
    const jwt = this.cookies['Tango-VT'];
    if (!jwt) return false;
    const payload = decodeJwtPayload(jwt);
    const exp = payload?.['exp'];
    if (typeof exp !== 'number') return false;
    return Date.now() < exp * 1000 - REFRESH_MARGIN_MS;
  }

  /** Make sure there IS a molten-visitor session; single-flight. */
  async ensure(): Promise<void> {
    if (this.isFresh()) return;
    if (this.inflight !== null) return this.inflight;
    this.inflight = (async () => {
      await this.mint();
    })().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Drop the session (logout / hard refresh). */
  invalidate(reason: string): void {
    this.debug(`tango: session invalidated — ${reason}`);
    this.cookies = {};
    this.expiresAt = undefined;
    this.persist();
  }

  /** Manual login through pasted browser cookies (optional; not required). */
  loadCookieHeader(header: string): void {
    this.cookies = {};
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0) {
        const name = part.slice(0, eq).trim();
        if (!IGNORED_COOKIES.has(name)) {
          this.cookies[name] = part.slice(eq + 1).trim();
        }
      }
    }
    if (this.cookies['Tango-VT'] !== undefined) {
      const payload = decodeJwtPayload(this.cookies['Tango-VT']);
      const exp = payload?.['exp'];
      if (typeof exp === 'number') this.expiresAt = new Date(exp * 1000).toISOString();
    }
    this.persist();
  }

  private async mint(): Promise<void> {
    // A mint must start clean-ish: stale vt causes 400 on check-in per the
    // gateway (seen with an expired Tango-VT from a captured old session).
    this.cookies = {};
    this.expiresAt = undefined;
    try {
      const res = await request('https://gateway.tango.me/visitor-lobby/api/public/visitors/v1/check-in?appId=tango', {
        method: 'POST',
        body: JSON.stringify({ landingUrl: 'https://www.tango.me/' }),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          Origin: 'https://www.tango.me',
          Referer: 'https://www.tango.me/',
          'User-Agent': DEFAULT_USER_AGENT,
        },
        onSetCookie: (values) => {
          this.recordSetCookies(values);
        },
      });
      if (res.status !== 200 || !this.isFresh()) {
        throw new Error(`check-in returned HTTP ${res.status} (no visitor token issued)`);
      }
      this.debug(`tango: visitor session minted (Tango-VT expires ${this.expiresAt})`);
      this.persist();
    } catch (e) {
      // rethrow for the caller (smart route / monitoring retry) to react
      throw new Error(`Could not start a Tango visitor session: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
  }

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    const file = path.join(this.dataDir, SESSION_FILE);
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as StoredSession;
      this.cookies = stored.cookies ?? {};
      this.analyticsKey = stored.analyticsKey;
      this.username = stored.username;
      this.expiresAt = stored.jwtExpiresAt;
      this.debug(`tango: loaded stored session (cookies: ${Object.keys(this.cookies).join(', ')})`);
      if (!this.isFresh()) void this.ensure().catch((e) => this.warn(`tango: stored session expired: ${e instanceof Error ? e.message : e}`));
    } catch {
      this.debug('tango: no stored session — will mint on first use');
      void this.ensure().catch((e) => this.warn(String(e)));
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const file = path.join(this.dataDir, SESSION_FILE);
      const payload: StoredSession = {
        cookies: this.cookies,
        analyticsKey: this.analyticsKey,
        username: this.username,
        jwtExpiresAt: this.expiresAt,
      };
      fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    } catch (e) {
      this.warn(`tango: could not persist session — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
