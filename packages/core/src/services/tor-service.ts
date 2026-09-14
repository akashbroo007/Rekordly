import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { get } from 'node:https';
import type { Agent } from 'node:http';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { Logger } from '@rekordly/shared';

/**
 * ponytail: embedded secure proxy (Tor). Site reachability is a property of
 * the USER'S network (ISP/DNS blocks are regional), not of the plugin — so
 * routing is decided per creator (`creators.use_proxy`). When any creator
 * opts in, this service lazily:
 *   1. downloads the Tor Expert Bundle once (userData cache, mirrors list),
 *   2. runs `tor` with a SocksPort (in-process http agents) AND an
 *      HTTPTunnelPort (HTTP CONNECT URL for child processes: ffmpeg/yt-dlp),
 *   3. stays up until app quit.
 * No user configuration — the per-creator toggle is the only control.
 */

export type ProxyStatusState = 'idle' | 'downloading' | 'connecting' | 'active' | 'error';

export interface ProxyStatus {
  state: ProxyStatusState;
  message?: string;
  socksPort?: number;
  httpPort?: number;
}

export interface TorServiceOptions {
  /** Directory for the downloaded bundle + tor runtime (e.g. userData/tor). */
  rootDir: string;
  logger: Logger;
  /**
   * ponytail: host-side creator lookup — "plugin:externalId" -> the user's
   * per-creator proxy decision. Injected so this service stays creator-agnostic.
   */
  isProxied(identifier: string): boolean;
  /** Bootstrap wait before giving up (tor download can be slow on Tor itself). */
  bootstrapTimeoutMs?: number;
}

export interface TorServiceEvents {
  'status-changed': [status: ProxyStatus];
}

/**
 * ponytail: pinned fallback only — the service discovers the current stable
 * version from the dist index at runtime, so these never 404-storm when a
 * new Tor release replaces the latest bundle.
 */
const TOR_VERSIONS = ['15.0.22', '15.0.21'] as const;

const TOR_MIRRORS = [
  'https://dist.torproject.org',
  'https://mirror.netcologne.de/torproject.org',
] as const;

function bundleAssetName(version: string): string | null {
  switch (process.platform) {
    case 'win32':
      return `tor-expert-bundle-windows-x86_64-${version}.tar.gz`;
    case 'darwin':
      return `tor-expert-bundle-macos-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-${version}.tar.gz`;
    case 'linux':
      return `tor-expert-bundle-linux-x86_64-${version}.tar.gz`;
    default:
      return null;
  }
}

/** torrc content: two listeners on fixed local ports, minimal disk writes. */
export function buildTorrc(dataDir: string, socksPort: number, httpPort: number): string {
  return [
    'SocksPort 127.0.0.1:' + socksPort + ' IsolateDestAddr',
    'HTTPTunnelPort 127.0.0.1:' + httpPort,
    'DataDirectory ' + dataDir,
    'AvoidDiskWrites 1',
    'SafeLogging 1',
    '',
  ].join('\n');
}

/** Pick a free TCP port by bind-then-close (best-effort uniqueness). */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => (port > 0 ? resolve(port) : reject(new Error('no free port'))));
    });
  });
}

/** Pure: semver-ish numeric tuple compare ("15.0.22" > "15.0.9"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((s) => parseInt(s, 10) || 0);
  const pb = b.split('.').map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Parse the dist index (Apache directory listing) and return the newest
 * STABLE version — pure-numeric folders only ("16.0a11" alphas are skipped).
 */
export function discoverLatestVersionFromIndex(html: string): string | null {
  const versions = [...html.matchAll(/href="(\d+(?:\.\d+)+)\/?"/g)].map((m) => m[1]!);
  if (versions.length === 0) return null;
  return versions.reduce((best, v) => (compareVersions(v, best) > 0 ? v : best));
}

export class TorService extends EventEmitter<TorServiceEvents> {
  private readonly options: TorServiceOptions;
  private status: ProxyStatus = { state: 'idle' };
  private startPromise: Promise<void> | null = null;
  private process: ChildProcess | null = null;
  private socksPort = 0;
  private httpPort = 0;
  private torPath: string | null = null;

  constructor(options: TorServiceOptions) {
    super();
    this.options = options;
  }

  getStatus(): ProxyStatus {
    return { ...this.status };
  }

  onStatusChanged(listener: (status: ProxyStatus) => void): () => void {
    this.on('status-changed', listener);
    return () => {
      this.off('status-changed', listener);
    };
  }

  private setStatus(status: ProxyStatus): void {
    this.status = status;
    this.emit('status-changed', { ...status });
  }

  /** True when this creator should route through the embedded proxy. */
  isProxyEnabledFor(identifier: string): boolean {
    return this.options.isProxied(identifier);
  }

  /** In-process agent for plugin HTTP calls, or null to go direct. */
  getProxyAgent(identifier: string): Agent | null {
    if (!this.isProxyEnabledFor(identifier) || this.status.state !== 'active') return null;
    // ponytail: generous handshake timeout — on constrained networks (e.g.
    // cellular hotspots) the first circuits can take tens of seconds; the
    // socks client's default would cut them off mid-handshake.
    return new SocksProxyAgent(`socks5h://127.0.0.1:${this.socksPort}`, { timeout: 60_000 });
  }

  /** HTTP CONNECT proxy URL for child processes, or null to go direct. */
  getProxyHttpUrl(identifier: string): string | null {
    if (!this.isProxyEnabledFor(identifier) || this.status.state !== 'active') return null;
    return `http://127.0.0.1:${this.httpPort}`;
  }

  /**
   * Probe through the SOCKS listener (the same route plugins use) and return
   * the apparent exit IP + round-trip latency — the "Test connection" button
   * on the Secure Proxy page. Requires the proxy to be active.
   */
  async testConnection(): Promise<{ ip: string; latencyMs: number }> {
    if (this.status.state !== 'active') {
      throw new Error('Secure proxy is not active');
    }
    return this.probeCircuit();
  }

  /**
   * Detect a system-level VPN (direct connectivity upgrade) WITHOUT touching
   * this service's state. Cloudflare's own trace endpoint is the signal:
   * when a system VPN like WARP is active it reports `warp=on`. Best-effort —
   * a failure means "not detected", never an error, so the Secure Proxy page
   * always renders.
   */
  async detectSystemVpn(timeoutMs = 5000): Promise<{ detected: boolean; product?: string }> {
    try {
      const body = await new Promise<string>((resolve, reject) => {
        const request = get(
          'https://www.cloudflare.com/cdn-cgi/trace',
          { timeout: timeoutMs, headers: { 'User-Agent': 'Rekordly' } },
          (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              reject(new Error(`trace returned HTTP ${res.statusCode}`));
              return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
          },
        );
        request.on('timeout', () => request.destroy(new Error('trace timed out')));
        request.on('error', reject);
      });
      const warp = /^warp=(\S+)\s*$/m.exec(body)?.[1];
      if (warp === 'on' || warp === 'plus') {
        return { detected: true, product: 'Cloudflare WARP' };
      }
      return { detected: false };
    } catch {
      // No trace reachable — no claim about the system network.
      return { detected: false };
    }
  }

  /** One SOCKS round-trip to the Tor check endpoint. No state guard. */
  private async probeCircuit(timeoutMs = 60_000): Promise<{ ip: string; latencyMs: number }> {    const agent = new SocksProxyAgent(`socks5h://127.0.0.1:${this.socksPort}`, { timeout: timeoutMs });
    const startedAt = Date.now();
    const body = await new Promise<string>((resolve, reject) => {
      const request = get(
        'https://check.torproject.org/api/ip',
        { agent, timeout: timeoutMs, headers: { 'User-Agent': 'Rekordly' } },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`probe returned HTTP ${res.statusCode}`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        },
      );
      request.on('timeout', () => request.destroy(new Error('probe timed out')));
      request.on('error', reject);
    });
    let ip = 'unknown';
    try {
      const parsed = JSON.parse(body) as { IP?: string; ip?: string };
      ip = parsed.IP ?? parsed.ip ?? 'unknown';
    } catch {
      /* keep 'unknown' — latency still reports */
    }
    if (!/IsTor/i.test(body)) {
      throw new Error('Route did not verify as a Tor circuit');
    }
    return { ip, latencyMs: Date.now() - startedAt };
  }

  /**
   * Make the proxy ready if this creator needs it. Concurrent callers share
   * one start promise; resolvable failures reject so the plugin call fails
   * loudly instead of silently going direct against a blocked site.
   */
  async ensureProxy(identifier: string): Promise<void> {
    if (!this.isProxyEnabledFor(identifier)) return;
    if (this.status.state === 'active') return;
    this.startPromise ??= this.start().catch((err) => {
      this.startPromise = null;
      this.setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      throw err;
    });
    await this.startPromise;
  }

  /** Download (once) + extract + spawn + wait for bootstrap. */
  async start(): Promise<void> {
    this.setStatus({ state: 'connecting', message: 'Starting secure proxy…' });
    mkdirSync(this.options.rootDir, { recursive: true });
    this.torPath ??= this.resolveTorBinary();
    if (this.torPath === null) {
      await this.downloadBundle();
      this.torPath = this.resolveTorBinary();
      if (this.torPath === null) {
        throw new Error('Tor bundle downloaded but the tor binary was not found');
      }
    }

    const [socksPort, httpPort] = [await findFreePort(), await findFreePort()];
    const dataDir = join(this.options.rootDir, 'data');
    const torrcPath = join(this.options.rootDir, 'torrc');
    writeFileSync(torrcPath, buildTorrc(dataDir, socksPort, httpPort), 'utf8');
    this.cleanupOrphanedTor();

    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.torPath!, ['-f', torrcPath], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.process = child;
      this.socksPort = socksPort;
      this.httpPort = httpPort;
      // ponytail: persist the pid so a force-killed app run can have its
      // orphaned daemon cleaned up before the next start (two tor instances
      // sharing one DataDirectory corrupt circuit state and stall SOCKS).
      try {
        if (child.pid !== undefined) {
          writeFileSync(join(this.options.rootDir, 'tor.pid'), String(child.pid), 'utf8');
        }
      } catch {
        /* pid tracking is best-effort */
      }

      const timer = setTimeout(() => {
        reject(new Error('Secure proxy did not finish bootstrapping in time'));
        this.stop();
      }, this.options.bootstrapTimeoutMs ?? 180_000);
      timer.unref?.();

      const onLine = (text: string): void => {
        for (const line of text.split(/\r?\n/)) {
          if (!line.includes('Bootstrapped')) continue;
          const match = line.match(/Bootstrapped\s+(\d+)%/);
          if (match !== null && match[1] === '100') {
            clearTimeout(timer);
            resolve();
          }
        }
      };
      child.stdout?.on('data', (chunk: Buffer) => onLine(chunk.toString()));
      child.stderr?.on('data', (chunk: Buffer) => onLine(chunk.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (this.status.state === 'idle') {
          reject(new Error(`Secure proxy exited early (code ${code ?? 'signal'})`));
          return;
        }
        // ponytail: tor died mid-session (active OR during warm-up) —
        // surface it and allow the next ensureProxy() call to start fresh.
        this.process = null;
        this.startPromise = null;
        this.setStatus({ state: 'error', message: 'Secure proxy exited unexpectedly' });
      });
    });

    // ponytail: warm-up gate — "Bootstrapped 100%" only means tor finished
    // loading directory info (often in ~5s from cache); the FIRST usable
    // circuits can take tens of seconds longer on constrained networks.
    // Declaring 'active' here raced that window: monitoring checks and the
    // UI probe timed out while circuits were still forming. Sample the real
    // SOCKS route with SHORT probes — each attempt reuses the same daemon
    // whose circuit pool is converging, so the first success lands as soon
    // as one circuit works instead of burning a minute per failed attempt.
    this.setStatus({ state: 'connecting', message: 'Warming up circuits…' });
    try {
      const WARMUP_ATTEMPTS = 8;
      const WARMUP_PROBE_MS = 15_000;
      let warmed = false;
      for (let attempt = 1; attempt <= WARMUP_ATTEMPTS; attempt++) {
        try {
          await this.probeCircuit(WARMUP_PROBE_MS);
          warmed = true;
          this.options.logger.info({ attempts: attempt }, 'proxy warm-up probe succeeded');
          break;
        } catch (err) {
          if (attempt < WARMUP_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 2_000));
          } else {
            this.options.logger.warn(
              { err },
              'proxy warm-up probe failed after bootstrap — declaring active anyway',
            );
          }
        }
      }
      if (!warmed) {
        // ponytail: bootstrap is still authoritative — the check endpoint
        // itself may be unreachable; monitoring retries will catch the rest.
      }
    } finally {
      this.setStatus({
        state: 'active',
        socksPort,
        httpPort,
        message: 'Secure proxy active',
      });
      this.options.logger.info({ socksPort, httpPort }, 'tor proxy active');
    }
  }

  stop(): void {
    if (this.process !== null) {
      this.process.removeAllListeners('close');
      try {
        this.process.kill();
      } catch {
        /* already gone */
      }
      this.process = null;
    }
    this.startPromise = null;
    this.setStatus({ state: 'idle' });
  }

  /**
   * ponytail: a force-killed app run leaves its tor daemon orphaned; two
   * tor instances sharing one DataDirectory corrupt circuit state and stall
   * SOCKS connections. Before spawning, kill the tracked pid — but ONLY
   * after verifying the process really is tor (pid reuse must never kill
   * an unrelated program).
   */
  private cleanupOrphanedTor(): void {
    const pidFile = join(this.options.rootDir, 'tor.pid');
    if (!existsSync(pidFile)) return;
    let raw = '';
    try {
      raw = readFileSync(pidFile, 'utf8').trim();
    } catch {
      return;
    }
    const pid = parseInt(raw, 10);
    try {
      rmSync(pidFile, { force: true });
    } catch {
      /* best-effort */
    }
    if (!Number.isFinite(pid) || pid <= 0) return;
    try {
      if (process.platform === 'win32') {
        const listing = execFileSync(
          'tasklist',
          ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
          { windowsHide: true, timeout: 10_000, encoding: 'utf8' },
        );
        if (!listing.toLowerCase().includes('tor.exe')) return;
        execFileSync('taskkill', ['/PID', String(pid), '/F'], { windowsHide: true, timeout: 10_000 });
        this.options.logger.warn({ pid }, 'killed orphaned tor daemon from a previous run');
      } else {
        const comm = readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
        if (comm !== 'tor') return;
        process.kill(pid, 'SIGKILL');
        this.options.logger.warn({ pid }, 'killed orphaned tor daemon from a previous run');
      }
    } catch (err) {
      this.options.logger.debug({ pid, err }, 'orphaned tor cleanup skipped');
    }
  }

  // --- Bundle management -----------------------------------------------------

  private resolveTorBinary(): string | null {
    const root = this.options.rootDir;
    if (!existsSync(root)) return null;
    const wanted = process.platform === 'win32' ? 'tor.exe' : 'tor';
    // ponytail: the expert bundle layout differs per platform/release — find
    // the binary by name instead of hardcoding a layout that may change.
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(root, entry.name, wanted);
      if (existsSync(candidate)) return candidate;
      const nested = readdirSync(join(root, entry.name), { withFileTypes: true });
      for (const sub of nested) {
        if (!sub.isDirectory()) continue;
        const deep = join(root, entry.name, sub.name, wanted);
        if (existsSync(deep)) return deep;
      }
    }
    return null;
  }

  private async downloadBundle(): Promise<void> {
    if (bundleAssetName('0') === null) {
      throw new Error(`Secure proxy is not available on ${process.platform}`);
    }
    this.setStatus({ state: 'downloading', message: 'Downloading secure proxy runtime…' });

    const staging = join(this.options.rootDir, 'staging');
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    const archivePath = join(staging, 'tor-bundle.tar.gz');

    let lastError: unknown = null;
    for (const url of await this.bundleCandidates()) {
      try {
        await this.downloadFile(url, archivePath);
        this.extractArchive(archivePath, this.options.rootDir);
        this.options.logger.info({ url }, 'tor bundle downloaded');
        return;
      } catch (err) {
        lastError = err;
        this.options.logger.warn({ url, err }, 'tor bundle download failed — trying next mirror');
      }
    }
    throw new Error(
      `Could not download the secure proxy runtime: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  /**
   * Candidate URLs to try in order: for each mirror, the version discovered
   * from that mirror's own index (self-healing), then the pinned fallbacks.
   */
  private async bundleCandidates(): Promise<string[]> {
    const asset = (version: string): string | null => bundleAssetName(version);
    const urls: string[] = [];
    for (const mirror of TOR_MIRRORS) {
      try {
        const res = await this.fetchText(`${mirror}/torbrowser/`);
        const latest = discoverLatestVersionFromIndex(res);
        if (latest !== null) {
          const name = asset(latest);
          if (name !== null) urls.push(`${mirror}/torbrowser/${latest}/${name}`);
        }
      } catch (err) {
        this.options.logger.warn({ mirror, err }, 'tor dist index discovery failed');
      }
    }
    for (const mirror of TOR_MIRRORS) {
      for (const version of TOR_VERSIONS) {
        const name = asset(version);
        if (name !== null) urls.push(`${mirror}/torbrowser/${version}/${name}`);
      }
    }
    return [...new Set(urls)];
  }

  private fetchText(url: string, hops = 0): Promise<string> {
    if (hops > 3) return Promise.reject(new Error('Too many redirects'));
    return new Promise((resolve, reject) => {
      const request = get(url, { timeout: 30_000, headers: { 'User-Agent': 'Rekordly' } }, (res) => {
        if (
          res.statusCode !== undefined &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          resolve(this.fetchText(new URL(res.headers.location, url).toString(), hops + 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      });
      request.on('timeout', () => request.destroy(new Error('index fetch timed out')));
      request.on('error', reject);
    });
  }

  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = get(url, { timeout: 120_000, headers: { 'User-Agent': 'Rekordly' } }, (res) => {
        if (res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          this.downloadFile(new URL(res.headers.location, url).toString(), destPath).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      });
      request.on('timeout', () => request.destroy(new Error('download timed out')));
      request.on('error', reject);
    });
  }

  private extractArchive(archivePath: string, destDir: string): void {
    // ponytail: bsdtar ships with Windows 10+/macOS/Linux — handles tar.gz
    // without adding an extraction dependency to the app bundle.
    execFileSync(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xf', archivePath, '-C', destDir], {
      windowsHide: true,
      timeout: 120_000,
    });
    try {
      rmSync(archivePath, { force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}
