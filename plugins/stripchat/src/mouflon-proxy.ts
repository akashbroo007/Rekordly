/**
 * MouflonProxy — records Stripchat's MOUFLON-obfuscated HLS without
 * reimplementing the cipher.
 *
 * Background: real (non-advert) playlists tag segments with
 * `#EXT-X-MOUFLON:URI:<obfuscated-url>` while the actual URI line is a dummy
 * (`media.mp4`). The web player de-obfuscates the URIs in JS before fetching;
 * plain ffmpeg therefore 404s on every segment.
 *
 * Strategy: keep a headless browser playing the room. Its player decodes each
 * segment URL for us — we observe those network requests and learn the
 * seq -> decoded-URL mapping. A tiny local HTTP server then serves ffmpeg a
 * cleaned playlist whose segment entries point back at us; we fetch the real
 * bytes from the CDN using the decoded URLs.
 */
import * as http from 'http';
import * as https from 'https';
import type { AddressInfo } from 'net';
import { blockHeavyResources, launchHeadlessBrowser } from './browser';
import { decodeMouflonUri } from './mouflon-cipher';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Extract the numeric sequence from a segment filename. */
function seqOf(url: string): number | null {
  // ..._<seq>_<token>_<timestamp>.mp4
  const m = url.match(/_(\d{2,})_[^_]+_\d+\.mp4(?:$|\?)/);
  return m?.[1] !== undefined ? parseInt(m[1], 10) : null;
}

interface PlaylistEntry {
  extinf: string;
  seq: number;
}

/**
 * ponytail: segment caching limits. Raw video segments are several MB each,
 * so an unbounded (or even large-count) cache can pin gigabytes in RAM —
 * the cause of system-wide stalls on smaller machines. ffmpeg reads each
 * segment immediately as it is served, so a small FIFO window (~3 min) plus
 * a hard byte ceiling is plenty.
 */
const MAX_CACHED_SEGMENTS = 100;
const MAX_CACHE_BYTES = 192 * 1024 * 1024;

/**
 * ponytail: idle auto-stop. ffmpeg is the ONLY consumer of the local server;
 * when a recording ends, ffmpeg stops requesting — so a quiet period means
 * the recording is over and the headless browser (several hundred MB) can be
 * released instead of lingering until the next extraction evicts it.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 90_000;

export interface MouflonProxyStartOptions {
  /**
   * Reuse an already-running headless browser (e.g. the one that captured
   * the signed playlist) instead of launching another Chromium process.
   * OWNERSHIP TRANSFERS to the proxy: stop() will close it.
   */
  browser?: import('playwright-core').Browser;
}

export interface MouflonProxyOptions {
  logger?: { debug: (m: string) => void };
  /** How long the proxy tolerates zero requests before stopping itself. */
  idleTimeoutMs?: number;
  /** Called when the idle watchdog stops the proxy (self-termination). */
  onIdleStop?: () => void;
  /**
   * ponytail: resolve the MOUFLON pkey -> pdkey pair. When a key verifies
   * against a real segment URI, segment URLs are decrypted in pure Node and
   * the headless browser is RELEASED for the rest of the recording.
   */
  resolvePdKey?: (pkey: string) => Promise<string | null>;
}

export class MouflonProxy {
  private server: http.Server | null = null;
  private browser: import('playwright-core').Browser | null = null;
  private page: import('playwright-core').Page | null = null;
  private decoded = new Map<number, string>();
  private cache = new Map<number, Buffer>();
  private cacheBytes = 0;
  private initSegment: Buffer | null = null;
  private initUrl: string | null = null;
  private targetDuration = 2;
  private refreshTimer: NodeJS.Timeout | null = null;
  private lastFetchAt = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private lastRequestAt = Date.now();
  private readonly idleTimeoutMs: number;
  private readonly onIdleStop: (() => void) | null;
  private readonly resolvePdKey: ((pkey: string) => Promise<string | null>) | undefined;
  /** pkey parsed from the playlist's MOUFLON header tag. */
  private pkey: string | null = null;
  /** True once a node-decoded URL passed seq self-verification. */
  private nodeDecodeVerified = false;
  /** ponytail: event-driven wakeup for "first segment decoded" (startup). */
  private firstDecodedWaiters: Array<() => void> = [];
  /** ponytail: event-driven waiters keyed by seq ("decoded[seq] available"). */
  private seqWaiters = new Map<number, Array<() => void>>();
  private log: (msg: string) => void;

  constructor(
    private playlistUrl: string,
    private roomUrl: string,
    private headers: Record<string, string>,
    opts: MouflonProxyOptions = {},
  ) {
    this.log = opts.logger?.debug ?? (() => {});
    this.idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.onIdleStop = opts.onIdleStop ?? null;
    this.resolvePdKey = opts.resolvePdKey;
  }

  /** Start browser decoding + local server. Resolves once the stream flows. */
  async start(options: MouflonProxyStartOptions = {}): Promise<void> {
    if (options.browser !== undefined) {
      this.browser = options.browser;
    } else {
      this.browser = await launchHeadlessBrowser();
    }
    const context = await this.browser.newContext({
      userAgent: BROWSER_UA,
      // ponytail: we only need the player to RUN (so it decodes segment
      // URLs), not to look good — a small viewport cuts renderer memory
      // and decode work substantially.
      viewport: { width: 640, height: 360 },
    });
    this.page = await context.newPage();
    await blockHeavyResources(this.page);

    // Learn decoded segment URLs from the player's own requests.
    this.page.on('request', (req) => {
      const url = req.url();
      if (!url.includes('.mp4')) return;
      if (url.includes('_init_')) {
        this.initUrl = url;
        return;
      }
      const seq = seqOf(url);
      if (seq !== null && !this.decoded.has(seq)) {
        this.decoded.set(seq, url);
        this.log(`mouflon-proxy: learned seq ${seq}`);
        // ponytail: wake anything waiting on this seq / on the first decode
        // (event-driven instead of busy-polling loops).
        const waiters = this.seqWaiters.get(seq);
        if (waiters !== undefined) {
          this.seqWaiters.delete(seq);
          for (const w of waiters) w();
        }
        if (this.firstDecodedWaiters.length > 0) {
          const first = this.firstDecodedWaiters;
          this.firstDecodedWaiters = [];
          for (const w of first) w();
        }
      }
    });

    await this.page.goto(this.roomUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    }).catch(() => undefined);

    // Local server for ffmpeg.
    this.server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));

    // Refresh the upstream playlist periodically.
    await this.refreshPlaylist();
    this.refreshTimer = setInterval(() => {
      void this.refreshPlaylist();
    }, 2000);

    // Wait until the browser has decoded at least one segment so ffmpeg has
    // something to chew on immediately (event-driven, no busy-wait).
    if (this.decoded.size === 0 && !(await this.waitForFirstDecoded(30_000))) {
      throw new Error('mouflon-proxy: browser did not start decoding segments');
    }

    // ponytail: idle watchdog — release the whole browser tree when the
    // recording is over (ffmpeg stops requesting). Checked every 15s.
    this.lastRequestAt = Date.now();
    this.idleTimer = setInterval(() => {
      if (Date.now() - this.lastRequestAt < this.idleTimeoutMs) return;
      this.log(`mouflon-proxy: idle for ${Math.round(this.idleTimeoutMs / 1000)}s — stopping (recording likely ended)`);
      this.onIdleStop?.();
      void this.stop().catch(() => undefined);
    }, 15_000);
    this.idleTimer.unref?.();
  }

  /** Resolve when the first decoded segment arrives; false on timeout. */
  private waitForFirstDecoded(timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const waiter = (): void => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.firstDecodedWaiters = this.firstDecodedWaiters.filter((w) => w !== waiter);
        resolve(false);
      }, timeoutMs);
      timer.unref?.();
      this.firstDecodedWaiters.push(waiter);
    });
  }

  /** Resolve when `seq` is decoded; false on timeout. */
  private waitForSeq(seq: number, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const waiter = (): void => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        const waiters = this.seqWaiters.get(seq);
        if (waiters !== undefined) {
          const filtered = waiters.filter((w) => w !== waiter);
          if (filtered.length > 0) this.seqWaiters.set(seq, filtered);
          else this.seqWaiters.delete(seq);
        }
        resolve(false);
      }, timeoutMs);
      timer.unref?.();
      const existing = this.seqWaiters.get(seq);
      if (existing !== undefined) existing.push(waiter);
      else this.seqWaiters.set(seq, [waiter]);
    });
  }

  /** Local playlist URL to hand to ffmpeg. */
  get url(): string {
    const addr = this.server?.address() as AddressInfo;
    return `http://127.0.0.1:${addr.port}/index.m3u8`;
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
    // ponytail: release cached video bytes immediately — they can be
    // hundreds of MB and would otherwise stay pinned until GC.
    this.cache.clear();
    this.cacheBytes = 0;
    this.decoded.clear();
    this.seqWaiters.clear();
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        /* ignore */
      }
      this.browser = null;
      this.page = null;
    }
  }

  // ---- upstream playlist -------------------------------------------------

  private httpGetBuffer(url: string, timeoutMs = 15_000): Promise<{ status: number; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const mod = new URL(url).protocol === 'https:' ? https : http;
      const req = mod.get(url, { headers: this.headers, timeout: timeoutMs }, (res) => {
        if ((res.statusCode ?? 500) >= 300 && res.statusCode! < 400 && res.headers.location) {
          res.resume();
          resolve(this.httpGetBuffer(new URL(res.headers.location, url).toString(), timeoutMs));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });
    });
  }

  private async refreshPlaylist(): Promise<void> {
    // Avoid overlapping refreshes.
    if (Date.now() - this.lastFetchAt < 1500) return;
    this.lastFetchAt = Date.now();
    try {
      const { status, body } = await this.httpGetBuffer(this.playlistUrl);
      if (status !== 200) {
        this.log(`mouflon-proxy: playlist refresh got ${status}`);
        return;
      }
      const text = body.toString('utf-8');
      const lines = text.split('\n');
      const out: string[] = [];
      const newEntries: PlaylistEntry[] = [];
      let pendingExtinf: string | null = null;
      let pendingSeq: number | null = null;
      for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('#EXT-X-TARGETDURATION:')) {
          this.targetDuration = parseInt(line.split(':')[1] ?? '2', 10) || 2;
        } else if (line.startsWith('#EXT-X-MOUFLON')) {
          continue; // strip obfuscation metadata
        } else if (line.startsWith('#EXT-X-MAP:')) {
          const initMatch = line.match(/URI="([^"]+)"/);
          if (initMatch?.[1] !== undefined) this.initUrl = initMatch[1];
          continue;
        } else if (line.startsWith('#EXTINF:')) {
          pendingExtinf = line;
          continue;
        } else if (line.startsWith('#')) {
          out.push(line);
          continue;
        } else if (line === '') {
          continue;
        } else {
          // A real URI line — normally the dummy "media.mp4". Resolve its seq
          // from the preceding MOUFLON tag (already parsed below) or from the
          // entry queue.
          if (pendingExtinf !== null && pendingSeq !== null) {
            out.push(pendingExtinf);
            out.push(`/seg/${pendingSeq}`);
            newEntries.push({ extinf: pendingExtinf, seq: pendingSeq });
          }
          pendingExtinf = null;
          pendingSeq = null;
          continue;
        }
      }

      // Second pass: pair EXTINF with the MOUFLON URI seq numbers. The MOUFLON
      // tag precedes the dummy URI line, so re-parse properly here.
      const paired: PlaylistEntry[] = [];
      const encBySeq = new Map<number, string>();
      let extinf: string | null = null;
      for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('#EXTINF:')) {
          extinf = line;
        } else if (line.startsWith('#EXT-X-MOUFLON')) {
          if (line.startsWith('#EXT-X-MOUFLON:URI:')) {
            const encUrl = line.slice('#EXT-X-MOUFLON:URI:'.length);
            const seq = seqOf(encUrl);
            if (seq !== null) encBySeq.set(seq, encUrl);
            if (extinf !== null && seq !== null) {
              paired.push({ extinf, seq });
              extinf = null;
            }
          } else {
            // Header tag — `#EXT-X-MOUFLON:<...>:<psch>:<pkey>`; the pkey
            // identifies which pdkey decrypts the segment URIs.
            const parts = line.split(':');
            if (parts.length >= 4) this.pkey = parts[parts.length - 1]!;
          }
        } else if (!line.startsWith('#') && line !== '') {
          extinf = null; // consumed the dummy URI
        }
      }

      // ponytail: pure-Node decoding — when the pdkey is known, decrypt the
      // obfuscated URIs directly. Each decoded URL is self-verified (the
      // decoded filename must contain the same seq), so a wrong key is
      // rejected and the browser fallback stays in charge.
      if (encBySeq.size > 0 && this.resolvePdKey !== undefined && this.pkey !== null) {
        await this.tryNodeDecode(encBySeq);
      }

      if (paired.length > 0) {
        this.entriesForServe = paired;
      }
    } catch (e) {
      this.log(`mouflon-proxy: refresh failed: ${e}`);
    }
  }

  /**
   * ponytail: decrypt MOUFLON URIs in pure Node. On the FIRST verified
   * decode the headless browser is released entirely — the local server
   * keeps serving ffmpeg from decrypted URLs for the rest of the recording
   * (saves ~400-700MB that the browser would pin for hours).
   */
  private async tryNodeDecode(encBySeq: Map<number, string>): Promise<void> {
    if (this.resolvePdKey === undefined || this.pkey === null) return;
    let pdkey: string | null;
    try {
      pdkey = await this.resolvePdKey(this.pkey);
    } catch {
      pdkey = null;
    }
    if (pdkey === null) return;
    let verified = 0;
    for (const [seq, encUrl] of encBySeq) {
      if (this.decoded.has(seq)) continue;
      const decoded = decodeMouflonUri(encUrl, pdkey);
      if (decoded !== null && seqOf(decoded) === seq) {
        this.decoded.set(seq, decoded);
        verified++;
        // Wake anything waiting on this seq / the first decode.
        const waiters = this.seqWaiters.get(seq);
        if (waiters !== undefined) {
          this.seqWaiters.delete(seq);
          for (const w of waiters) w();
        }
        if (this.firstDecodedWaiters.length > 0) {
          const first = this.firstDecodedWaiters;
          this.firstDecodedWaiters = [];
          for (const w of first) w();
        }
      }
    }
    if (verified > 0 && !this.nodeDecodeVerified) {
      this.nodeDecodeVerified = true;
      this.log(
        `mouflon-proxy: pure-Node MOUFLON decoding verified (${verified} segments) — releasing headless browser`,
      );
      const browser = this.browser;
      this.browser = null;
      this.page = null;
      if (browser !== null) {
        void browser.close().catch(() => undefined);
      }
    }
  }

  private entriesForServe: PlaylistEntry[] = [];

  // ---- local server ------------------------------------------------------

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const path = req.url ?? '/';
      // ponytail: any request proves ffmpeg is still consuming — feed the
      // idle watchdog.
      this.lastRequestAt = Date.now();
      this.log(`mouflon-proxy: req ${path}`);
      if (path.startsWith('/index.m3u8')) {
        await this.servePlaylist(res);
      } else if (path.startsWith('/init.mp4')) {
        await this.serveInit(res);
      } else if (path.startsWith('/seg/')) {
        // ponytail: ffmpeg's hls demuxer only accepts known segment
        // extensions, so local URLs are /seg/<seq>.mp4.
        const seq = parseInt(path.slice('/seg/'.length).replace(/\.mp4$/, ''), 10);
        await this.serveSegment(seq, res);
      } else {
        res.writeHead(404).end();
      }
    } catch (e) {
      this.log(`mouflon-proxy: handler error: ${e}`);
      try {
        res.writeHead(502).end();
      } catch {
        /* ignore */
      }
    }
  }

  private async servePlaylist(res: http.ServerResponse): Promise<void> {
    // Only expose segments the browser has already decoded, so ffmpeg never
    // hits a URL we cannot resolve yet.
    let available = this.entriesForServe.filter((e) => this.decoded.has(e.seq));
    // ponytail: fallback — if upstream pairing hasn't produced entries yet
    // (e.g. the first playlist fetch raced the player), serve straight from
    // the decoded map so ffmpeg never sees an empty playlist.
    if (available.length === 0 && this.decoded.size > 0) {
      const seqs = [...this.decoded.keys()].sort((a, b) => a - b).slice(-10);
      available = seqs.map((seq) => ({ extinf: `#EXTINF:${this.targetDuration}.000,`, seq }));
    }
    const lines = ['#EXTM3U', '#EXT-X-VERSION:6', `#EXT-X-TARGETDURATION:${this.targetDuration}`, '#EXT-X-INDEPENDENT-SEGMENTS'];
    if (this.initUrl) lines.push('#EXT-X-MAP:URI="/init.mp4"');
    const first = available[0];
    if (first !== undefined) {
      lines.push(`#EXT-X-MEDIA-SEQUENCE:${first.seq}`);
      for (const e of available) {
        lines.push(e.extinf);
        lines.push(`/seg/${e.seq}.mp4`);
      }
    } else {
      lines.push('#EXT-X-MEDIA-SEQUENCE:0');
    }
    res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
    res.end(lines.join('\n') + '\n');
  }

  private async serveInit(res: http.ServerResponse): Promise<void> {
    if (this.initSegment === null) {
      const url = this.initUrl;
      if (!url) {
        res.writeHead(404).end();
        return;
      }
      const { status, body } = await this.httpGetBuffer(url);
      if (status !== 200) {
        res.writeHead(status).end();
        return;
      }
      this.initSegment = body;
    }
    res.writeHead(200, { 'Content-Type': 'video/mp4' });
    res.end(this.initSegment);
  }

  private async serveSegment(seq: number, res: http.ServerResponse): Promise<void> {
    const cached = this.cache.get(seq);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'video/mp4' });
      res.end(cached);
      return;
    }
    // Wait for the browser to decode this seq (it is playing live) —
    // event-driven wakeup instead of a polling loop that ties up handlers.
    if (!this.decoded.has(seq) && !(await this.waitForSeq(seq, 20_000))) {
      this.log(`mouflon-proxy: no decoded URL for seq ${seq}`);
      res.writeHead(404).end();
      return;
    }
    const url = this.decoded.get(seq);
    if (url === undefined) {
      this.log(`mouflon-proxy: no decoded URL for seq ${seq}`);
      res.writeHead(404).end();
      return;
    }
    const { status, body } = await this.httpGetBuffer(url);
    if (status !== 200) {
      this.log(`mouflon-proxy: segment ${seq} fetch ${status}`);
      res.writeHead(status).end();
      return;
    }
    this.cache.set(seq, body);
    this.cacheBytes += body.length;
    // ponytail: FIFO eviction via Map insertion order — O(1), no sort. Both
    // a segment-count cap and a hard byte ceiling keep memory bounded even
    // when bitrates spike (the old 300-segment cache could pin ~1 GB+).
    while (this.cache.size > MAX_CACHED_SEGMENTS || (this.cacheBytes > MAX_CACHE_BYTES && this.cache.size > 1)) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      const buf = this.cache.get(oldest);
      this.cache.delete(oldest);
      if (buf !== undefined) this.cacheBytes -= buf.length;
    }
    res.writeHead(200, { 'Content-Type': 'video/mp4' });
    res.end(body);
  }
}