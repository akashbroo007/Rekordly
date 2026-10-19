/**
 * RoomRelay — serves Tango's short-token HLS to the recorder from a local
 * Node HTTP server.
 *
 * ponytail (validated against the live cinema edge): every master/variant
 * URL carries a per-broadcast token that stops working in ~15-30s, and the
 * edge 401s requests without the visitor JWT (Tango-VT) cookie — which is
 * exactly why plain ffmpeg dies mid-recording on a hand-over URL. The
 * relay owns the refresh cycle instead: it re-serves a playlist whose
 * entries always point at locally-fresh upstream URLs, and it proxies each
 * segment on demand through the session jar, so the recorder sees ordinary
 * HLS at http://127.0.0.1:<port>/index.m3u8.
 *
 * The heavy resources (browser etc.) other plugins pin don't apply here —
 * pure Node holds everything — so `holdsBrowser()` is false and the
 * ProxyRegistry counts it out of the browser cap; the relay's own idle
 * watchdog stops it after the recording ends.
 */
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ManagedProxy } from '@rekordly/plugin-sdk';
import { HLS_TIMEOUT_MS, request } from './http';
import { fetchBinary, pickBestVariant, parseVariants, segmentSeq, type StreamVariant } from './hls';

const REFRESH_INTERVAL_MS = 5_000;
const IDLE_CHECK_INTERVAL_MS = 15_000;
export const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

/** ponytail: tiny segment cache — ffmpeg occasionally re-reads a segment
 * (resync, reconnect); raw bytes cost ~200KB each, so cap by count+bytes. */
const MAX_CACHED_SEGMENTS = 24;
const MAX_CACHE_BYTES = 48 * 1024 * 1024;

/** How many playlist entries we expose (matches the upstream window feel). */
const PLAYLIST_WINDOW = 10;

export interface RelayApi {
  /** Mint YOUNG playback URLs for this room via the watch endpoint. */
  mintMasterUrls(): Promise<string[]>;
  /** Cookie header for edge requests (includes the visitor JWT). */
  cookieHeader(): string;
  /** The VT username claim — the HLS `username` param the edge validates. */
  hlsUsername(): string | undefined;
  /** ARM HLS access (token-data) — lasts ~10 s from the call. */
  armHls(): Promise<boolean>;
  /**
   * ponytail (visitor seat): the gateway keeps ONE visitor per IP active —
   * a stale minted session loses its HLS seat (edge 401) and must re-mint.
   * Throttled recovery hook; relays never spam it. */
  recoverSession(): Promise<void>;
  /** Session jar feed (Set-Cookie from edge responses keep the jar warm). */
  onSetCookie: (values: string[]) => void;
  agent?: import('node:http').Agent | null;
}

export interface RoomRelayOptions {
  alias: string;
  streamId: string;
  api: RelayApi;
  debug: (message: string) => void;
  idleTimeoutMs?: number;
  /** Registry bookkeeping — an idle stop hands the key back. */
  onIdleStop?: () => void;
}

export class RoomRelay implements ManagedProxy {
  private server: http.Server | null = null;
  private masterUrl: string | null = null;
  private variantUrl: string | null = null;
  private variants: StreamVariant[] = [];
  /** Local seq → upstream segment URL + upstream EXTINF duration. */
  private entries = new Map<number, { url: string; duration: number }>();
  private targetDuration = 2;
  private refreshTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private refreshing = false;
  private lastActivityAtMs = Date.now();
  private stopped = false;
  private cache = new Map<number, Buffer>();
  private cacheBytes = 0;
  private mintFailures = 0;
  private lastArmAt = 0;
  private readonly idleTimeoutMs: number;
  private readonly opts: RoomRelayOptions;

  constructor(opts: RoomRelayOptions) {
    this.opts = opts;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  }

  /** Start mint + local server; resolves once the playlist is flowing. */
  async start(): Promise<void> {
    await this.remintAndRefresh(true);
    if (this.masterUrl === null) {
      // first mint failed (e.g. the visitor seat was lost) — recoverSession
      // has already run inside the failure path; one re-cycle to settle.
      await this.refreshUpstream();
    }
    if (this.masterUrl === null) {
      throw new Error(`tango: could not obtain playback URLs for ${this.opts.alias} (mint returned no master)`);
    }
    this.server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));

    this.refreshTimer = setInterval(() => {
      void this.refreshUpstream();
    }, REFRESH_INTERVAL_MS);
    this.refreshTimer.unref?.();
    this.idleTimer = setInterval(() => {
      if (Date.now() - this.lastActivityAtMs < this.idleTimeoutMs) return;
      this.opts.debug(`tango: relay for ${this.opts.alias} idle ≥${Math.round(this.idleTimeoutMs / 1000)}s — stopping`);
      this.opts.onIdleStop?.();
      void this.stop().catch(() => undefined);
    }, IDLE_CHECK_INTERVAL_MS);
    this.idleTimer.unref?.();
  }

  get url(): string {
    const addr = this.server?.address() as AddressInfo;
    return `http://127.0.0.1:${addr.port}/index.m3u8`;
  }

  holdsBrowser(): boolean {
    return false;
  }

  lastActivityAt(): number {
    return this.lastActivityAtMs;
  }

  /** Currently known variants (for the quality options table). */
  getVariantTable(): StreamVariant[] {
    return this.variants;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
    this.cache.clear();
    this.cacheBytes = 0;
    this.entries.clear();
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  // ---- upstream refresh ---------------------------------------------------

  /**
   * ponytail (token TTL): the token-data ARM lasts ~10 s from the call.
   * Re-arm whenever the last arm is older than 3 s — master, variant and
   * in-window segment fetches then always run inside the validity window,
   * and a late segment fetch (ffmpeg stall) heals itself via the 401 retry.
   */
  private async ensureArmed(): Promise<void> {
    if (Date.now() - this.lastArmAt < 3_000) return;
    const armed = await this.opts.api.armHls();
    if (armed) this.lastArmAt = Date.now();
  }
  /** Master URL + the username/tech/label query the edge requires. */
  private edgeMasterUrl(): string | null {
    const master = this.masterUrl;
    if (master === null) return null;
    const username = this.opts.api.hlsUsername();
    if (username === undefined) return master;
    const separator = master.includes('?') ? '&username=' : '?username=';
    return `${master}${separator}${encodeURIComponent(username)}&accountId=&tech=lhls&label=pwatcf`;
  }

  private async refreshUpstream(): Promise<void> {
    if (this.refreshing || this.stopped) return;
    this.refreshing = true;
    try {
      if (this.variantUrl !== null) {
        const ok = await this.fetchVariantInto(this.variantUrl);
        if (ok) return;
      }
      if (this.masterUrl !== null) {
        const ok = await this.refetchMaster();
        if (ok) return;
      }
      await this.remintAndRefresh();
    } catch (e) {
      this.opts.debug(`tango: relay refresh for ${this.opts.alias} failed: ${e instanceof Error ? e.message : String(e)}`);
      if (this.stopped) return;
      try {
        await this.remintAndRefresh(true);
      } catch (remintErr) {
        this.opts.debug(`tango: relay remint for ${this.opts.alias} failed: ${remintErr instanceof Error ? remintErr.message : String(remintErr)}`);
      }
    } finally {
      this.refreshing = false;
    }
  }

  /** Mint playback URLs via the watch endpoint, then fetch master+variant. */
  private async remintAndRefresh(initial = false): Promise<void> {
    if (this.stopped) return;
    const urls = await this.opts.api.mintMasterUrls();
    this.opts.debug(`tango: relay mint for ${this.opts.alias} → ${urls.length} URLs (initial=${initial}): ${urls.slice(0, 4).join(' , ').slice(0, 400)}`);
    const master =
      urls.find((u) => u.includes('/master.m3u8') && u.length <= 140) ??
      urls.find((u) => u.includes('/master.m3u8')) ??
      urls[0];
    if (master === undefined) {
      this.mintFailures++;
      if (initial || this.mintFailures >= 2) {
        throw new Error(`watch minted no master playlist for ${this.opts.alias}`);
      }
      return;
    }
    this.mintFailures = 0;
    this.masterUrl = master;
    const ok = await this.refetchMaster();
    if (!ok && !initial) this.opts.debug(`tango: master fetch failed after remint for ${this.opts.alias}`);
  }

  /** Fetch the master and resolve + fetch the best variant into `entries`. */
  private async refetchMaster(): Promise<boolean> {
    const master = this.edgeMasterUrl();
    if (master === null) return false;
    try {
      await this.ensureArmed();
      const res = await request(master, {
        headers: this.edgeHeaders(),
        timeoutMs: HLS_TIMEOUT_MS,
        onSetCookie: this.opts.api.onSetCookie,
        agent: this.opts.api.agent ?? null,
      });
      if (res.status === 401 || res.status === 403) {
        const names = this.opts
          .api.cookieHeader()
          .split('; ')
          .map((pair) => pair.slice(0, Math.max(pair.indexOf('='), 0)))
          .join(',');
        this.opts.debug(
          `tango: master fetch for ${this.opts.alias} got ${res.status} | jar=[${names}] | url=${master.slice(0, 90)} | servedBy=${res.headers['x-served-by'] ?? '-'}`,
        );
        this.masterUrl = null;
        this.variantUrl = null;
        await this.opts.api.recoverSession();
        this.lastArmAt = 0; // arm was for the lost seat — re-arm on retry
        return false;
      }
      if (res.status === 404) {
        this.opts.debug(`tango: ${this.opts.alias} playlist gone (404) — broadcast ended`);
        this.variantUrl = null;
        return false; // relay lets idle watchdog reap it
      }
      if (res.status !== 200) return false;
      const body = res.text();
      if (!body.includes('#EXTM3U')) return false;
      const variants = parseVariants(this.masterUrl ?? master, body);
      if (variants.length === 0) {
        this.opts.debug(`tango: master for ${this.opts.alias} has no variants`);
        return false;
      }
      this.variants = variants;
      const best = pickBestVariant(variants);
      this.variantUrl = best.url;
      return await this.fetchVariantInto(best.url);
    } catch (e) {
      this.opts.debug(`tango: master fetch for ${this.opts.alias} errored: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  /** Fetch a variant playlist and merge its segments into `entries`. */
  private async fetchVariantInto(variantUrl: string): Promise<boolean> {
    try {
      const res = await request(variantUrl, {
        headers: this.edgeHeaders(),
        timeoutMs: HLS_TIMEOUT_MS,
        onSetCookie: this.opts.api.onSetCookie,
        agent: this.opts.api.agent ?? null,
      });
      if (res.status === 401 || res.status === 403) {
        this.variantUrl = null;
        return false;
      }
      if (res.status !== 200) return false;
      const body = res.text();
      const target = body.match(/#EXT-X-TARGETDURATION:(\d+)/);
      if (target?.[1] !== undefined) this.targetDuration = Math.max(1, parseInt(target[1], 10));
      const lines = body.split('\n');
      let pending: number | null = null;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#EXTINF:')) {
          pending = parseFloat(trimmed.slice(8));
          continue;
        }
        if (pending !== null && trimmed !== '' && !trimmed.startsWith('#')) {
          const duration = pending;
          pending = null;
          const abs = /^https?:/i.test(trimmed) ? trimmed : new URL(trimmed, variantUrl).toString();
          const seq = segmentSeq(abs);
          if (seq !== null) this.entries.set(seq, { url: abs, duration });
        }
      }
      if (this.entries.size === 0) this.opts.debug(`tango: variant for ${this.opts.alias} had no parser segments`);
      return true;
    } catch (e) {
      this.opts.debug(`tango: variant fetch for ${this.opts.alias} errored: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  private edgeHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Referer: 'https://www.tango.me/',
      Origin: 'https://www.tango.me',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    const cookie = this.opts.api.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    return headers;
  }

  // ---- local server ------------------------------------------------------

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.lastActivityAtMs = Date.now();
    try {
      const path = (req.url ?? '/').split('?')[0] ?? '/';
      if (path === '/index.m3u8') {
        await this.servePlaylist(res);
      } else if (path.startsWith('/s/')) {
        const seq = parseInt(path.slice(3).replace(/\.ts$/i, ''), 10);
        if (Number.isNaN(seq)) {
          res.writeHead(404).end();
          return;
        }
        await this.serveSegment(seq, res);
      } else {
        res.writeHead(404).end();
      }
    } catch (e) {
      this.opts.debug(`tango: relay handler error: ${e instanceof Error ? e.message : String(e)}`);
      try {
        res.writeHead(502).end();
      } catch {
        /* ignore */
      }
    }
  }

  private servePlaylist(res: http.ServerResponse): void {
    const seqs = [...this.entries.keys()].sort((a, b) => a - b).slice(-PLAYLIST_WINDOW);
    const first = seqs[0];
    const lines = ['#EXTM3U', '#EXT-X-VERSION:6', `#EXT-X-TARGETDURATION:${this.targetDuration}`, '#EXT-X-INDEPENDENT-SEGMENTS'];
    lines.push(`#EXT-X-MEDIA-SEQUENCE:${first ?? 0}`);
    for (const seq of seqs) {
      const rawDuration = this.entries.get(seq)?.duration ?? 1;
      const duration = Number.isFinite(rawDuration) && rawDuration > 0.05 ? rawDuration : 1;
      lines.push(`#EXTINF:${duration.toFixed(3)},`);
      lines.push(`/s/${seq}.ts`);
    }
    res.writeHead(200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    });
    res.end(lines.join('\n') + '\n');
  }

  private async serveSegment(seq: number, res: http.ServerResponse): Promise<void> {
    // tiny cache read-through
    const cached = this.cache.get(seq);
    if (cached !== undefined) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(cached);
      return;
    }
    let entry = this.entries.get(seq);
    if (entry === undefined) {
      // ffmpeg asked for a segment the window hasn't shown yet — chase it now
      await this.refreshUpstream();
      entry = this.entries.get(seq);
    }
    if (entry === undefined || this.stopped) {
      res.writeHead(404).end();
      return;
    }
    let result = await this.fetchSegment(entry.url);
    if (result === null || result.status === 401 || result.status === 403) {
      // arm fell out of its ~10 s TTL or the segment aged — re-arm and retry
      // the same URL once before escalating to a full remint.
      await this.ensureArmed();
      result = await this.fetchSegment(entry.url);
    }
    if (result === null || result.status === 401 || result.status === 403) {
      // visitor seat likely lost — re-mint the session, re-mint URLs, retry
      this.lastArmAt = 0;
      await this.opts.api.recoverSession();
      await this.remintAndRefresh(true);
      entry = this.entries.get(seq);
      if (entry !== undefined) result = await this.fetchSegment(entry.url);
    }
    if (result === null || result.status !== 200) {
      const status = result?.status ?? 502;
      res.writeHead(status >= 400 ? status : 502).end();
      return;
    }
    this.cache.set(seq, result.body);
    this.cacheBytes += result.body.length;
    while (this.cache.size > MAX_CACHED_SEGMENTS || (this.cacheBytes > MAX_CACHE_BYTES && this.cache.size > 1)) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      const buf = this.cache.get(oldest);
      this.cache.delete(oldest);
      if (buf !== undefined) this.cacheBytes -= buf.length;
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(result.body);
  }

  private async fetchSegment(url: string): Promise<{ status: number; body: Buffer } | null> {
    try {
      return await fetchBinary(url, this.edgeHeaders(), this.opts.api.agent ?? null);
    } catch (e) {
      this.opts.debug(`tango: segment fetch errored: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
