/**
 * ponytail: Dreamcam VR bridge — fmp4s:// WebSocket feed → local fMP4 HLS.
 *
 * The 3D (VR) stream arrives as fragmented MP4 over a WebSocket
 * (`fmp4s://stream.dreamcamtrue.com/fmp4/{id}?...`). Protocol (captured from
 * the site player and verified live):
 *
 *   connect wss://stream.dreamcamtrue.com/fmp4/{id}?<params>
 *   -> client sends {"url":"stream/hello","version":"3.0.0","correlationId":...}
 *   <- server sends stream/qual JSON: video_streams [{codec,width,height}], audio_streams
 *   -> client sends {"url":"stream/play","includeMask":false,"version":"3.0.0",...}
 *   <- binary messages: fMP4 (ftyp init fragment first, then moof/mdat media
 *      fragments, AAC audio inside). Text control messages:
 *      {"error":"Stream ended"} ends the feed; PT_START_FAIL_* are token errors.
 *
 * ffmpeg/yt-dlp cannot consume a WebSocket, so this module bridges the feed
 * into a local **live fMP4 HLS** playlist:
 *
 *   - every binary frame is buffered; the first frame (ftyp..moov) becomes
 *     the init segment (EXT-X-MAP), later frames become 1 media segment each
 *   - GET /playlist.m3u8 serves a sliding window of the last N segments
 *     (a LIVE window: no EXT-X-PLAYLIST-TYPE and no EXT-X-ENDLIST — with
 *     ENDLIST ffmpeg finishes capture after one window instead of polling)
 *   - GET /init.mp4 and /seg<N>.m4s serve buffered data (memory-backed)
 *   - the feed runs continuously once started (segments accumulate up to the
 *     window size); ffmpeg pulls it like any other live HLS stream
 *
 * `fmp4s://` maps to `wss://`; a plain `fmp4://` maps to `ws://` (white-label
 * environments and local integration probes).
 *
 * The result is a plain http:// URL with `.m3u8` in it — the recorder's
 * direct-ffmpeg copy path takes it with zero core changes.
 */
import * as http from 'http';
import type { Agent } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { ManagedProxy } from '@rekordly/plugin-sdk';

const FMP4_PROTOCOL_VERSION = '3.0.0';
/** Segments kept in the sliding window (each ≈2s of VR video). */
const WINDOW_SEGMENTS = 30;
/** Stop the whole bridge when no consumer has fetched anything for this long. */
const IDLE_TIMEOUT_MS = 90_000;
/** Give up if the server sends nothing (no fragments) for this long. */
const FEED_STALL_TIMEOUT_MS = 30_000;
/** Seconds advertised per segment — fragments are ~2s on the wire. */
const TARGET_DURATION = 2;
/** Reject start() when the feed produced no media within this window. */
const START_TIMEOUT_MS = 20_000;

export interface VrBridgeOptions {
  /** fmp4s:// (or fmp4://) URL from the BSS broadcast.streams entry (video3D). */
  streamUrl: string;
  siteOrigin: string;
  userAgent: string;
  logger: { debug(m: string): void; warn(m: string): void } | null;
  /** Called when the feed ends or dies after having started. */
  onDead?: () => void;
  /**
   * ponytail: in-process proxy agent (host SOCKS agent) for the feed
   * connection. Detection and extraction must agree on the route — when the
   * fetch cycle needed the proxy, the WebSocket does too. The agent object
   * is passed by reference (same process); null/undefined = direct.
   */
  agent?: Agent | null;
}

interface Segment {
  seq: number;
  data: Buffer;
}

function correlationId(): string {
  return 'rekordly-xxxxxxxx-xxxx'.replace(/x/g, () =>
    Math.floor(16 * Math.random()).toString(16),
  );
}

export class VrBridge implements ManagedProxy {
  private server: http.Server | null = null;
  private ws: WebSocket | null = null;
  private readonly segments: Segment[] = [];
  private initSegment: Buffer | null = null;
  private nextSeq = 1;
  private started = false;
  private dead = false;
  private lastConsumerActivity = Date.now();
  private lastFeedActivity = Date.now();
  private idleTimer: NodeJS.Timeout | null = null;
  private stallTimer: NodeJS.Timeout | null = null;
  /** Pending start() — resolved on the first media fragment, rejected on failure. */
  private resolveStart: (() => void) | null = null;
  private rejectStart: ((err: Error) => void) | null = null;
  private startTimer: NodeJS.Timeout | null = null;
  private port = 0;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: VrBridgeOptions) {}

  // ---- ManagedProxy -------------------------------------------------------

  /** The bridge holds no headless browser — it is a lightweight local server. */
  holdsBrowser(): boolean {
    return false;
  }

  lastActivityAt(): number {
    return this.lastConsumerActivity;
  }

  async stop(): Promise<void> {
    this.dead = true;
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.stallTimer !== null) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
    // A stop() during startup fails the pending start() — never leave the
    // caller hanging on a promise nobody will settle.
    this.failStart(new Error('VR bridge stopped before media arrived'));
    if (this.ws !== null) {
      try {
        this.ws.close();
      } catch {
        /* already gone */
      }
      this.ws = null;
    }
    if (this.server !== null) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
    this.segments.length = 0;
    this.initSegment = null;
  }

  /** True once at least one fragment arrived (feed is flowing). */
  get isFeedFlowing(): boolean {
    return this.started;
  }

  /** http://127.0.0.1:<port>/playlist.m3u8 — the recorder-facing URL. */
  get url(): string {
    return `http://127.0.0.1:${this.port}/playlist.m3u8`;
  }

  // ---- lifecycle ----------------------------------------------------------

  /** Start the local server and the WebSocket feed. Resolves when flowing. */
  async start(): Promise<void> {
    await this.startServer();
    await this.connectFeed();
  }

  private startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handleRequest(req, res));
      server.on('error', reject);
      // Port 0 = pick a free one; single consumer is local ffmpeg.
      server.listen(0, '127.0.0.1', () => {
        this.port = (server.address() as AddressInfo).port;
        this.server = server;
        resolve();
      });
    });
  }

  private touchConsumer(): void {
    this.lastConsumerActivity = Date.now();
  }

  /** Settle a pending start() successfully (first media fragment arrived). */
  private settleStart(): void {
    if (this.startTimer !== null) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    const resolve = this.resolveStart;
    this.resolveStart = null;
    this.rejectStart = null;
    resolve?.();
  }

  /** Settle a pending start() as failed (idempotent; no-op once started). */
  private failStart(err: Error): void {
    if (this.startTimer !== null) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    const reject = this.rejectStart;
    this.resolveStart = null;
    this.rejectStart = null;
    reject?.(err);
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.touchConsumer();
    const path = (req.url ?? '/').split('?')[0]!;
    if (path === '/playlist.m3u8') {
      const body = this.buildPlaylist();
      if (body === null) {
        res.writeHead(503, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end('#EXTM3U\n');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(body);
      return;
    }
    if (path === '/init.mp4' && this.initSegment !== null) {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(this.initSegment);
      return;
    }
    const segMatch = path.match(/^\/seg(\d+)\.m4s$/);
    if (segMatch !== null) {
      const seq = parseInt(segMatch[1]!, 10);
      const seg = this.segments.find((s) => s.seq === seq);
      if (seg !== undefined) {
        res.writeHead(200, {
          'Content-Type': 'video/iso.segment',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(seg.data);
        return;
      }
    }
    res.writeHead(404);
    res.end();
  }

  /**
   * Sliding-window live playlist. The init fragment is advertised via
   * EXT-X-MAP; each buffered WebSocket frame becomes one EXTINF entry.
   * The window only contains fully buffered segments, so ffmpeg never 404s
   * mid-download; the playlist sequence anchors at the oldest buffered seq.
   */
  private buildPlaylist(): string | null {
    if (this.initSegment === null || this.segments.length === 0) return null;
    // ponytail: a sliding-window LIVE playlist — no EXT-X-PLAYLIST-TYPE and
    // NO EXT-X-ENDLIST. With ENDLIST (or EVENT, which forbids dropping old
    // segments) ffmpeg treated one window (~60s) as the whole broadcast and
    // finalized the recording right after it, shredding captures into parts.
    const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:6', `#EXT-X-TARGETDURATION:${TARGET_DURATION}`];
    const oldest = this.segments[0]!.seq;
    lines.push(`#EXT-X-MEDIA-SEQUENCE:${oldest}`);
    lines.push(`#EXT-X-MAP:URI="/init.mp4"`);
    for (const seg of this.segments) {
      lines.push(`#EXTINF:${TARGET_DURATION.toFixed(6)},`);
      lines.push(`/seg${seg.seq}.m4s`);
    }
    return `${lines.join('\n')}\n`;
  }

  /** Map the BSS stream scheme onto a WebSocket URL the feed understands. */
  private wsUrlFor(streamUrl: string): string {
    if (streamUrl.startsWith('fmp4s://')) {
      return `wss://${streamUrl.substring('fmp4s://'.length)}`;
    }
    if (streamUrl.startsWith('fmp4://')) {
      return `ws://${streamUrl.substring('fmp4://'.length)}`;
    }
    return streamUrl;
  }

  private connectFeed(): Promise<void> {
    const wsUrl = this.wsUrlFor(this.options.streamUrl);
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Origin: this.options.siteOrigin,
          'User-Agent': this.options.userAgent,
        },
        handshakeTimeout: 15_000,
        // ponytail: route the feed through the host's secure proxy when the
        // fetch cycle needed it — the agent is passed by reference (same
        // process), so the plugin needs no proxy dependency of its own.
        ...(this.options.agent !== undefined && this.options.agent !== null
          ? { agent: this.options.agent }
          : {}),
      });
      this.ws = ws;

      // start() settles on the FIRST media fragment (feed flowing) — the
      // handshake text messages alone prove nothing about recordability.
      this.resolveStart = resolve;
      this.rejectStart = reject;
      this.startTimer = setTimeout(() => {
        this.markDead(`start timeout (no media within ${START_TIMEOUT_MS / 1000}s)`);
      }, START_TIMEOUT_MS);
      this.startTimer.unref?.();

      const fail = (err: Error): void => {
        if (!this.started) this.failStart(err);
        else this.markDead(`feed error: ${err.message}`);
      };

      ws.on('open', () => {
        this.options.logger?.debug('dreamcam: VR feed connected, sending hello');
        this.sendCommand('hello');
      });

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        this.lastFeedActivity = Date.now();
        if (isBinary) {
          this.ingestFragment(data);
          return;
        }
        this.handleTextMessage(data.toString());
      });

      ws.on('error', (err: Error) => fail(err));
      ws.on('close', () => {
        if (!this.started) {
          this.failStart(new Error('VR feed closed before any media arrived'));
        } else {
          this.markDead('feed closed');
        }
      });
    });
  }

  private handleTextMessage(text: string): void {
    this.options.logger?.debug(`dreamcam: VR control: ${text.slice(0, 200)}`);
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof msg['error'] === 'string') {
      const err = msg['error'];
      if (err === 'Stream ended') {
        this.markDead('stream ended');
        return;
      }
      // Token/showstate failures — the public feed should never hit these,
      // but if it does the recording cannot proceed.
      this.markDead(`feed error: ${err}`);
      return;
    }
    if (typeof msg['code'] === 'string' && msg['code'].startsWith('PT_START_FAIL')) {
      this.markDead(`feed refused: ${msg['code']}`);
      return;
    }
    // stream/qual arrives after hello — answer it with play, then the
    // binary fragments start. start() resolves on the first media fragment
    // (ingestFragment flips `started` and calls settleStart).
    if (msg['url'] === 'stream/qual') {
      this.sendCommand('play', { includeMask: false });
    }
  }

  private sendCommand(method: string, extra: Record<string, unknown> = {}): void {
    if (this.ws === null) return;
    const msg = {
      ...extra,
      url: `stream/${method}`,
      version: FMP4_PROTOCOL_VERSION,
      correlationId: correlationId(),
    };
    this.ws.send(JSON.stringify(msg));
  }

  private ingestFragment(data: Buffer): void {
    if (this.dead) return;
    // The first binary frame is the fMP4 init fragment (ftyp..moov).
    if (this.initSegment === null) {
      const head = data.subarray(4, 8).toString('latin1');
      if (head !== 'ftyp') {
        this.options.logger?.warn(`dreamcam: unexpected first VR frame (head=${head})`);
      }
      this.initSegment = Buffer.from(data);
      this.armStallWatchdog();
      this.armIdleWatchdog();
      return;
    }
    // A new init-style fragment (rare) replaces the map.
    const head = data.subarray(4, 8).toString('latin1');
    if (head === 'ftyp') {
      this.initSegment = Buffer.from(data);
      return;
    }
    this.segments.push({ seq: this.nextSeq, data: Buffer.from(data) });
    this.nextSeq += 1;
    while (this.segments.length > WINDOW_SEGMENTS) {
      this.segments.shift();
    }
    if (!this.started) {
      this.started = true;
      this.options.logger?.debug('dreamcam: VR feed flowing');
      this.settleStart();
    }
  }

  private armStallWatchdog(): void {
    this.stallTimer = setInterval(() => {
      if (this.dead) return;
      if (Date.now() - this.lastFeedActivity > FEED_STALL_TIMEOUT_MS) {
        this.markDead('feed stalled (no fragments)');
      }
    }, 10_000);
    this.stallTimer.unref?.();
  }

  private armIdleWatchdog(): void {
    this.idleTimer = setInterval(() => {
      if (this.dead) return;
      if (Date.now() - this.lastConsumerActivity > IDLE_TIMEOUT_MS) {
        this.options.logger?.debug('dreamcam: VR bridge idle — shutting down');
        void this.stop().then(this.options.onDead).catch(() => undefined);
      }
    }, 15_000);
    this.idleTimer.unref?.();
  }

  private markDead(reason: string): void {
    if (this.dead) return;
    this.dead = true;
    this.options.logger?.debug(`dreamcam: VR bridge dead (${reason})`);
    // A death before the first fragment is a failed start(), not a hang.
    this.failStart(new Error(reason));
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        /* listener errors must not break teardown */
      }
    }
    void this.stop().then(this.options.onDead).catch(() => undefined);
  }
}
