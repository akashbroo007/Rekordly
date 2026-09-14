/**
 * MyFreeCams FCServer protocol client.
 *
 * The site's chat/video infrastructure is driven by FCServer websocket
 * sessions (wss://wchatNN.myfreecams.com/fcsl). Monitoring works with a
 * GUEST login — no account needed. Wire format (verified against the live
 * servers and www.myfreecams.com/js/wsgw.js):
 *
 *   frame  = <6-digit payload length><payload>          (ASCII, concatenated)
 *   payload= "<fctype> <from> <to> <arg1> <arg2> [data]"
 *   client sends the same fields terminated by "\n\0" (no length prefix)
 *
 * Flow: send "fcsws_20180422\n\0" (hello), guest login (fctype 1,
 * a1=20071025, data "guest:guest"), then per creator a MODELQUERY
 * (fctype 10, arg1=20) carrying the username. The server answers with a
 * URL-encoded JSON model object: {nm, uid, vs, u:{camserv}, m:{topic, rc}}.
 * `vs` is the video state (0/90 = watchable, 2 = away, 12 = private,
 * 13 = group, 14 = club, 127 = offline).
 *
 * One shared guest session is kept alive (pinged every ~15s like the site's
 * own client) and reused for every creator check — no per-model sockets.
 */
import type { PluginLogger } from '@rekordly/plugin-sdk';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WsClient } from './ws-client';
import { request, withSmartRoute, pluginDataDir, DIRECT_TIMEOUT_MS, PROXY_TIMEOUT_MS } from './http';

export const FCTYPE_LOGIN = 1;
export const FCTYPE_MODEL_QUERY = 10;
export const FCTYPE_LOGOUT = 99;

const FC_HELLO = 'fcsws_20180422\n\0';
const FC_GUEST_LOGIN = '1 0 0 20071025 0 guest:guest\n\0';
const FC_PING = '0 0 0 0 0\n\0';
const FC_LOGOUT = '99 0 0 0 0\n\0';

const SITE_BASE = 'https://www.myfreecams.com';
const SERVER_CONFIG_URL = `${SITE_BASE}/_js/serverconfig.js`;

/** Model-object `vs` values that can serve a watchable broadcast. */
export const VS_WATCHABLE = [0, 90] as const;

export const VS_STATUS_MESSAGE: Record<number, string> = {
  2: 'Model is away',
  12: 'Model is in a private show',
  13: 'Model is in a group show',
  14: 'Model is in a club show',
  127: 'Model is offline',
};

export function isWatchableVs(vs: number | undefined): boolean {
  return vs !== undefined && (VS_WATCHABLE as readonly number[]).includes(vs);
}

export interface MfcModel {
  nm?: string;
  uid?: number;
  vs?: number;
  u?: { camserv?: number; avatar?: number; blurb?: string; creation?: number };
  m?: { topic?: string; rc?: number; camscore?: number; rank?: number };
}

export interface MfcServerConfig {
  chatServers: string[];
  h5video: Record<string, string>;
  wzobs: Record<string, string>;
}

// ---- server config (cached) ----------------------------------------------

const SERVER_CONFIG_TTL_MS = 10 * 60_000;
let serverConfigCache: { cfg: MfcServerConfig; fetchedAt: number } | null = null;

const EMPTY_SERVER_CONFIG: MfcServerConfig = { chatServers: [], h5video: {}, wzobs: {} };

function toStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function normalizeServerConfig(raw: unknown): MfcServerConfig | null {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
  if (obj === null || !Array.isArray(obj['chat_servers'])) return null;
  const chatServers = obj['chat_servers'].filter((s): s is string => typeof s === 'string');
  if (chatServers.length === 0) return null;
  return {
    chatServers,
    h5video: toStringRecord(obj['h5video_servers']),
    wzobs: toStringRecord(obj['wzobs_servers']),
  };
}

/**
 * ponytail: persist the last-good serverconfig in the plugin data dir. When
 * www.myfreecams.com becomes unreachable (ISP throttling is regional), the
 * CHAT servers (wchatNN) are frequently still reachable — the cached chat
 * list keeps the primary detection path alive instead of forcing every
 * check through the HTTP fallback.
 */
const SERVER_CONFIG_CACHE_FILE = 'serverconfig.json';

function writeServerConfigFile(cfg: MfcServerConfig): void {
  const dir = pluginDataDir();
  if (dir === null) return;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, SERVER_CONFIG_CACHE_FILE), JSON.stringify(cfg), 'utf8');
  } catch {
    /* cache write is best-effort */
  }
}

function readServerConfigFile(): MfcServerConfig | null {
  const dir = pluginDataDir();
  if (dir === null) return null;
  try {
    const raw = readFileSync(join(dir, SERVER_CONFIG_CACHE_FILE), 'utf8');
    const cfg = normalizeServerConfig(JSON.parse(raw));
    return cfg;
  } catch {
    return null;
  }
}

/**
 * Fetch the server config WITHOUT letting network failure kill the caller:
 * live fetch → last-good file snapshot → empty config. Callers degrade
 * gracefully (chat path unavailable → HTTP fallback; extraction still has
 * the videoNNN naming heuristics). The empty config is NOT cached, so the
 * next poll retries the live fetch once the network recovers.
 */
export async function fetchServerConfig(
  identifier: string,
  logger?: PluginLogger,
): Promise<MfcServerConfig> {
  if (
    serverConfigCache !== null &&
    Date.now() - serverConfigCache.fetchedAt < SERVER_CONFIG_TTL_MS
  ) {
    return serverConfigCache.cfg;
  }
  try {
    const { value: body } = await withSmartRoute(identifier, async (agent) => {
      const res = await request(SERVER_CONFIG_URL, {
        agent,
        timeout: agent !== null ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS,
        headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${SITE_BASE}/` },
      });
      if (res.status !== 200) throw new Error(`serverconfig returned HTTP ${res.status}`);
      // ponytail: a 200 body that is not JSON is the classic ISP block-page
      // injection — retryable through the proxy (isRetryableThroughProxy).
      try {
        return JSON.parse(res.body) as unknown;
      } catch {
        throw new Error('serverconfig returned invalid JSON');
      }
    });
    const cfg = normalizeServerConfig(body);
    if (cfg === null) throw new Error('serverconfig missing chat_servers');
    serverConfigCache = { cfg, fetchedAt: Date.now() };
    writeServerConfigFile(cfg);
    logger?.debug(`myfreecams: serverconfig loaded (${cfg.chatServers.length} chat servers)`);
    return cfg;
  } catch (err) {
    logger?.debug(
      `myfreecams: serverconfig fetch failed (${err instanceof Error ? err.message : err}) — trying persisted snapshot`,
    );
    const cached = readServerConfigFile();
    if (cached !== null) {
      serverConfigCache = { cfg: cached, fetchedAt: Date.now() };
      logger?.debug(`myfreecams: using persisted serverconfig (${cached.chatServers.length} chat servers)`);
      return cached;
    }
    logger?.debug('myfreecams: no persisted serverconfig — chat path disabled until next poll');
    return EMPTY_SERVER_CONFIG;
  }
}

export function invalidateServerConfig(): void {
  serverConfigCache = null;
}

// ---- HLS URL candidates ----------------------------------------------------

/**
 * The HLS master playlist for a model's broadcast. The camserv → host map in
 * serverconfig.js is authoritative, but it can lag behind new cam servers, so
 * candidates also include the site's naming patterns (camserv-700/-500 ->
 * videoNNN, `mfc_a_`/`mfc_` ngroup styles) — probed in order.
 */
export function hlsCandidates(model: MfcModel, cfg: MfcServerConfig): string[] {
  const camserv = model.u?.camserv;
  if (typeof camserv !== 'number' || camserv <= 0 || typeof model.uid !== 'number') return [];
  const uidVideo = model.uid + 100_000_000;
  const urls: string[] = [];
  const push = (server: string, group: 'desktop' | 'mobile'): void => {
    const base = `https://${server
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')}.myfreecams.com/NxServer/ngrp:mfc`;
    const url = `${base}${group === 'mobile' ? '_a' : ''}_${uidVideo}.f4v_mobile/playlist.m3u8`;
    if (!urls.includes(url)) urls.push(url);
  };
  const mapped = cfg.h5video[String(camserv)];
  if (mapped !== undefined) push(mapped, 'desktop');
  const wzobs = cfg.wzobs[String(camserv)];
  if (wzobs !== undefined) push(wzobs, 'mobile');
  for (const delta of [700, 500]) {
    const n = camserv - delta;
    if (n <= 0) continue;
    push(`video${n}`, 'mobile');
    push(`video${n}`, 'desktop');
  }
  return urls;
}

// ---- chat session ----------------------------------------------------------

const QUERY_TIMEOUT_MS = 10_000;
const PING_INTERVAL_MS = 15_000;
/** The site's own client reconnects after 21s of server silence. */
const WATCHDOG_SILENCE_MS = 25_000;
const HANDSHAKE_TIMEOUT_MS = 8_000;
const MAX_CHAT_HOSTS = 4;
/**
 * ponytail: when a full host rotation fails (chat route blocked, site
 * throttling), do not re-attack it on every query — that is exactly the
 * behavior that got scanning IPs banned. During the cooldown, queries go
 * straight to the HTTP room-page path; the chat session is re-attempted
 * after the cooldown expires.
 */
const RETRY_COOLDOWN_MS = 60_000;

interface PendingQuery {
  usernameLower: string;
  resolve: (model: MfcModel | null) => void;
  timer: NodeJS.Timeout;
}

export class FcChatSession {
  private ws: WsClient | null = null;
  private wireBuffer = Buffer.alloc(0);
  private loggedIn = false;
  private connecting: Promise<void> | null = null;
  private pending: PendingQuery[] = [];
  private pingTimer: NodeJS.Timeout | null = null;
  private lastReceived = 0;
  private stickyHost: string | null = null;
  private loginAck: ((err: Error | null) => void) | null = null;
  /** Earliest next chat-connect attempt (epoch ms) after a failed rotation. */
  private nextChatAttemptAt = 0;

  constructor(
    private readonly userAgent: string,
    /** Host-provided HTTP proxy URL resolver (null = go direct). */
    private readonly proxyHttpUrlFor: (identifier: string) => string | null = () => null,
  ) {}

  get connected(): boolean {
    return this.ws !== null && !this.ws.isClosed;
  }

  /**
   * Query one model over the shared guest session. Resolves null when the
   * server gives no model data in time (unknown model, network trouble) —
   * callers fall back to the HTTP room-page path. Transport errors from
   * CONNECTING the session propagate so monitoring retry logic can react.
   */
  async queryModel(
    username: string,
    identifier: string,
    logger?: PluginLogger,
  ): Promise<MfcModel | null> {
    if (!this.connected && Date.now() < this.nextChatAttemptAt) {
      logger?.debug(`myfreecams: chat route in cooldown — using HTTP fallback for ${username}`);
      return null;
    }
    await this.ensureConnected(identifier, logger);
    const existing = this.pending.find((p) => p.usernameLower === username.toLowerCase());
    if (existing !== undefined) {
      // ponytail: coalesce concurrent queries for the same creator instead of
      // double-asking the chat server.
      return new Promise((resolve) => {
        const original = existing.resolve;
        existing.resolve = (model) => {
          original(model);
          resolve(model);
        };
      });
    }
    return new Promise((resolve) => {
      const entry: PendingQuery = {
        usernameLower: username.toLowerCase(),
        resolve,
        timer: setTimeout(() => {
          this.pending = this.pending.filter((p) => p !== entry);
          resolve(null);
        }, QUERY_TIMEOUT_MS),
      };
      this.pending.push(entry);
      this.ws?.send(`10 0 0 20 0 ${encodeURIComponent(username)}\n\0`);
      logger?.debug(`myfreecams: model query sent for ${username}`);
    });
  }

  async close(): Promise<void> {
    this.stopPingLoop();
    for (const p of this.pending) {
      clearTimeout(p.timer);
      p.resolve(null);
    }
    this.pending = [];
    this.loginAck = null;
    this.loggedIn = false;
    this.wireBuffer = Buffer.alloc(0);
    const ws = this.ws;
    this.ws = null;
    if (ws !== null && !ws.isClosed) {
      ws.send(FC_LOGOUT);
      // ponytail: give the logout frame a beat to flush, then drop the socket.
      await new Promise((r) => setTimeout(r, 50));
      ws.destroy();
    }
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private async ensureConnected(identifier: string, logger?: PluginLogger): Promise<void> {
    if (this.connected && this.loggedIn) return;
    if (this.connecting !== null) {
      await this.connecting;
      return;
    }
    this.connecting = this.openSession(identifier, logger);
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  /**
   * ponytail: session refresh — if the chat websocket died (idle watchdog,
   * server restart, ISP block on the chat route), the next query transparently
   * re-opens it, direct-first, falling back to the host secure proxy when the
   * network itself is the problem.
   */
  private async openSession(identifier: string, logger?: PluginLogger): Promise<void> {
    await this.close();
    const cfg = await fetchServerConfig(identifier, logger);
    if (cfg.chatServers.length === 0) {
      // ponytail: no usable serverconfig (site unreachable, no snapshot
      // yet) — arm the cooldown so each poll does not re-attack the chat
      // route; the HTTP room-page path answers meanwhile.
      this.nextChatAttemptAt = Date.now() + RETRY_COOLDOWN_MS;
      throw new Error('No chat servers in serverconfig');
    }
    const hosts = this.orderHosts(cfg.chatServers);
    let lastError: Error | null = null;
    for (const host of hosts) {
      try {
        await this.openOne(host, identifier, logger);
        this.stickyHost = host;
        this.nextChatAttemptAt = 0;
        logger?.info(`myfreecams: chat session established via ${host}`);
        this.startPingLoop();
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger?.debug(`myfreecams: chat host ${host} failed: ${lastError.message}`);
      }
    }
    this.nextChatAttemptAt = Date.now() + RETRY_COOLDOWN_MS;
    throw lastError ?? new Error('Could not connect to any MFC chat server');
  }

  private orderHosts(chatServers: string[]): string[] {
    // Prefer the modern rfc6455 "wchat*" hosts; keep the last working one in
    // front so a healthy connection is not re-rolled after every session.
    const preferred = chatServers.filter((h) => /^wchat/i.test(h));
    const pool = preferred.length > 0 ? preferred : chatServers;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    if (this.stickyHost !== null) {
      const idx = shuffled.indexOf(this.stickyHost);
      if (idx > 0) {
        shuffled.splice(idx, 1);
        shuffled.unshift(this.stickyHost);
      }
    }
    return shuffled.slice(0, MAX_CHAT_HOSTS);
  }

  private async openOne(host: string, identifier: string, logger?: PluginLogger): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err: Error | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(loginWatchdog);
        if (err !== null) {
          this.ws?.destroy();
          this.ws = null;
          reject(err);
        } else {
          resolve();
        }
      };
      // ponytail: after the TCP/TLS handshake completes, the session is only
      // usable once the guest login reply (fctype 1) arrives.
      const loginWatchdog = setTimeout(() => {
        finish(new Error(`Login reply from ${host} timed out`));
      }, HANDSHAKE_TIMEOUT_MS + 3_000);

      WsClient.connect({
        host: `${host}.myfreecams.com`,
        port: 443,
        path: '/fcsl',
        origin: SITE_BASE,
        userAgent: this.userAgent,
        timeoutMs: HANDSHAKE_TIMEOUT_MS,
        proxyUrl: this.proxyHttpUrlFor(identifier),
        logger: logger === undefined ? undefined : (m) => logger.debug(m),
        onText: (text) => this.onWireText(Buffer.from(text, 'utf8')),
        onClose: () => this.onSessionClosed(),
        onError: (err) => {
          logger?.debug(`myfreecams: chat session error: ${err.message}`);
          this.onSessionClosed();
        },
      })
        .then((ws) => {
          this.ws = ws;
          this.wireBuffer = Buffer.alloc(0);
          this.loggedIn = false;
          this.lastReceived = Date.now();
          this.loginAck = () => finish(null);
          ws.send(FC_HELLO);
          ws.send(FC_GUEST_LOGIN);
        })
        .catch((err: Error) => finish(err));
    });
  }

  /**
   * ponytail: the chat route follows the same proxy decision the host made
   * for this creator's HTTP requests — when the user's network needs the
   * embedded proxy, the websocket tunnels through it via CONNECT; when direct
   * works, no proxy URL is set and nothing boots.
   */

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      if (!this.connected) {
        this.onSessionClosed();
        return;
      }
      if (Date.now() - this.lastReceived > WATCHDOG_SILENCE_MS) {
        this.stopPingLoop();
        this.ws?.destroy();
        this.onSessionClosed();
        return;
      }
      this.ws?.send(FC_PING);
    }, PING_INTERVAL_MS);
    this.pingTimer.unref?.();
  }

  private onSessionClosed(): void {
    this.ws = null;
    this.loggedIn = false;
    this.wireBuffer = Buffer.alloc(0);
    const ack = this.loginAck;
    this.loginAck = null;
    // ponytail: a close before the login ack fails the whole host attempt
    // (the next host in order is tried); after login it is just cleanup.
    if (ack !== null) {
      ack(new Error('chat session closed before login'));
      return;
    }
    // Pending queries die with the session; callers fall back to the HTTP
    // path and the next query reconnects transparently.
    for (const p of this.pending) {
      clearTimeout(p.timer);
      p.resolve(null);
    }
    this.pending = [];
  }

  /** Chunk framing over accumulated wire bytes (payloads are ASCII). */
  private onWireText(data: Buffer): void {
    this.lastReceived = Date.now();
    this.wireBuffer = Buffer.concat([this.wireBuffer, data]);
    let pos = 0;
    while (pos + 6 < this.wireBuffer.length) {
      const lenStr = this.wireBuffer.slice(pos, pos + 6).toString('latin1');
      const len = parseInt(lenStr, 10);
      if (!(len > 0 && len < 1_000_000)) {
        // Misaligned framing — drop the buffer rather than chase corruption.
        this.wireBuffer = Buffer.alloc(0);
        return;
      }
      if (pos + 6 + len > this.wireBuffer.length) break;
      const chunk = this.wireBuffer.slice(pos + 6, pos + 6 + len).toString('latin1');
      pos += 6 + len;
      this.handleChunk(chunk);
    }
    this.wireBuffer = this.wireBuffer.slice(pos);
  }

  private handleChunk(chunk: string): void {
    const words = chunk.split(' ');
    const fctype = parseInt(words[0] ?? '', 10);
    if (Number.isNaN(fctype)) return;
    let payload = words.slice(5).join(' ');
    // ponytail: the server percent-encodes JSON payloads (and model topics).
    try {
      payload = decodeURIComponent(payload);
    } catch {
      /* keep raw — non-encoded payloads parse fine */
    }
    if (fctype === FCTYPE_LOGIN) {
      this.loggedIn = true;
      const ack = this.loginAck;
      this.loginAck = null;
      if (ack !== null) ack(null);
      return;
    }
    if (fctype === FCTYPE_MODEL_QUERY) {
      const jsonStart = payload.indexOf('{');
      if (jsonStart === -1) return;
      let model: MfcModel;
      try {
        model = JSON.parse(payload.slice(jsonStart)) as MfcModel;
      } catch {
        return;
      }
      this.dispatchModel(model);
    }
    // FCTYPE 81 (php fallback descriptors) are accepted but unused: the
    // serverconfig map plus the videoNNN naming heuristics cover the cases
    // it serves, and the php compact format is fragile to parse.
  }

  private dispatchModel(model: MfcModel): void {
    const nm = typeof model.nm === 'string' ? model.nm.toLowerCase() : undefined;
    if (nm === undefined) return;
    const idx = this.pending.findIndex((p) => p.usernameLower === nm);
    if (idx === -1) return;
    const entry = this.pending[idx];
    if (entry === undefined) return;
    this.pending.splice(idx, 1);
    clearTimeout(entry.timer);
    entry.resolve(model);
  }
}
