import { EventEmitter } from 'node:events';
import { execFile, execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import { AppError } from '@rekordly/shared';
import { ExternalBinary, resolveExecutable } from '@rekordly/recorder';import { attemptDnsFix, extractUnresolvedHost, isDnsFailure } from './dns-fix';

const execFileAsync = promisify(execFile);

const ytDlpBinary = new ExternalBinary('yt-dlp');

/**
 * Kill a process AND its entire child tree. On Windows, killing only the
 * parent leaves grandchildren running (orphaned): yt-dlp delegates live HLS
 * to its own ffmpeg child, which would keep recording forever and hold the
 * stdio pipes open so the 'close' event never fires.
 *
 * ponytail: this MUST be synchronous — an async taskkill races the caller's
 * follow-up kill of the parent, and once the parent is gone taskkill can no
 * longer enumerate the tree ("process not found"), orphaning ffmpeg again.
 */
function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      /* process already gone — nothing to kill */
    }
  }
}

/**
 * ponytail: non-destructive liveness check for a process we did not spawn in
 * this session (an orphaned recording from a previous app run). On Windows
 * process.kill(pid, 0) is unreliable, so tasklist is used instead.
 *
 * PIDs are recycled aggressively on Windows - pass allowedNames (image names
 * like 'ffmpeg.exe') so a recycled pid belonging to an unrelated
 * process is never mistaken for a live recorder.
 */
export function isPidAlive(pid: number, allowedNames?: string[]): boolean {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync(
        'tasklist',
        ['/FI', 'PID eq ' + String(pid), '/FO', 'CSV', '/NH'],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 },
      ).toString();
      const line = out.split(/\r?\n/).find((l) => l.includes(String.fromCharCode(34) + String(pid) + String.fromCharCode(34)));
      if (line === undefined) return false;
      if (allowedNames !== undefined) {
        const lower = line.toLowerCase();
        return allowedNames.some((name) => lower.startsWith(String.fromCharCode(34) + name.toLowerCase()));
      }
      return true;
    } catch {
      return false;
    }
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * ponytail: list PIDs of running yt-dlp/ffmpeg processes whose command line
 * mentions the given path fragment. Used to re-attach orphaned recordings
 * whose pid was never persisted (app closed before the DB write landed) or
 * whose persisted pid was recycled by an unrelated process.
 */
export function findRecordingProcessPids(pathFragment: string): number[] {
  if (process.platform !== 'win32') return [];
  try {
    // ponytail: quote/wildcard characters would break the -like filter —
    // neutralize them (paths containing them are pathological anyway).
    const escaped = pathFragment.replace(/['*?]/g, ' ');
    const ps = `Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'ffmpeg.exe' -or $_.Name -eq 'yt-dlp.exe') -and ($_.CommandLine -like '*` + escaped + `*') } | Select-Object -ExpandProperty ProcessId`;
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 },
    ).toString();
    return out
      .split(/\r?\n/)
      .map((line) => parseInt(line.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

/**
 * plan §11: async liveness check — same semantics as `isPidAlive` without
 * blocking Electron's main process. Orphan/recovery paths must use this.
 */
export async function isPidAliveAsync(pid: number, allowedNames?: string[]): Promise<boolean> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'tasklist',
        ['/FI', 'PID eq ' + String(pid), '/FO', 'CSV', '/NH'],
        { windowsHide: true, timeout: 5000 },
      );
      const line = stdout.split(/\r?\n/).find((l) => l.includes(String.fromCharCode(34) + String(pid) + String.fromCharCode(34)));
      if (line === undefined) return false;
      if (allowedNames !== undefined) {
        const lower = line.toLowerCase();
        return allowedNames.some((name) => lower.startsWith(String.fromCharCode(34) + name.toLowerCase()));
      }
      return true;
    } catch {
      return false;
    }
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export interface RecorderProcessSnapshot {
  pid: number;
  name: string;
  commandLine: string;
}

/**
 * plan §11: ONE bulk snapshot of all running recorder processes instead of one
 * powershell scan per stale job. The caller matches output-path fragments in
 * JS, so 30 orphans cost a single subprocess instead of 30.
 */
export async function listRecorderProcessesAsync(): Promise<RecorderProcessSnapshot[]> {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ffmpeg.exe' -or $_.Name -eq 'yt-dlp.exe' } | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json`,
      ],
      { windowsHide: true, timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
    );
    const text = stdout.trim();
    if (text === '' || text === 'null') return [];
    const rows = (
      Array.isArray(JSON.parse(text)) ? JSON.parse(text) : [JSON.parse(text)]
    ) as Array<{ ProcessId?: number; Name?: string; CommandLine?: string | null }>;
    const snapshots: RecorderProcessSnapshot[] = [];
    for (const row of rows) {
      if (typeof row.ProcessId === 'number' && row.ProcessId > 0) {
        snapshots.push({
          pid: row.ProcessId,
          name: typeof row.Name === 'string' ? row.Name : '',
          commandLine: typeof row.CommandLine === 'string' ? row.CommandLine : '',
        });
      }
    }
    return snapshots;
  } catch {
    return [];
  }
}

/** plan §11: async whole-tree kill (awaited — no fire-and-forget races). */
export async function killProcessTreeAsync(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        timeout: 15000,
      });
    } catch {
      /* process already gone — nothing to kill */
    }
  }
}

export interface YtDlpProgress {
  percent: number;
  speed: number;
  eta: number;
  bytesDownloaded: number;
  /** Total expected size in bytes (0 when yt-dlp couldn't determine it). */
  totalBytes: number;
}

export interface YtDlpEvents {
  /** Progress is always scoped to the job that produced it. */
  progress: [jobId: string, progress: YtDlpProgress];
  error: [error: AppError];
  /**
   * ponytail: emitted right after the downloader child is spawned — the
   * recording service persists the pid so an orphaned process (app closed
   * while recording) can be re-adopted on the next launch.
   */
  spawned: [jobId: string, pid: number];
}

export interface YtDlpDownloadResult {
  filePath: string;
  duration: number;
  /** True when the download was ended early via stopDownload() (e.g. stream ended). */
  stopped: boolean;
  /**
   * ponytail: true when the stop came from the per-recording duration cap
   * (segment splitting) — NOT from a user cancel or stream-end finalize.
   * The recording service chains the next segment on this signal.
   */
  durationCapReached: boolean;
}

export interface YtDlpDownloadOptions {
  quality?: string;
  headers?: Record<string, string>;
  cookies?: Array<{ name: string; value: string }>;
  /**
   * ponytail: HTTP proxy URL for the download child process — routes ffmpeg
   * (`-proxy`) / yt-dlp (`--proxy`) through the host proxy when the plugin
   * site is only reachable that way (creators.useProxy).
   */
  proxyUrl?: string;
  resume?: boolean;
  /** Stop recording after this many seconds (live duration cap). */
  durationSeconds?: number;
  /**
   * ponytail: live-HLS stall watchdog — when a live capture produces no NEW
   * media (output size stops growing) for this long, the capture is torn
   * down and surfaced as a transient failure so the recording service can
   * restart it with the captured parts preserved. Default 90s (live HLS
   * segments are a few seconds; a healthy capture grows every keyframe).
   */
  stallTimeoutMs?: number;
  /** Cap transfer speed, e.g. "500K" or "4M" (bytes/s as yt-dlp --limit-rate). */
  limitRate?: string;
  /** Extract audio only and convert to MP3 (requires ffmpeg). */
  audioOnly?: boolean;
  /** Also save the video's thumbnail image next to the output file. */
  writeThumbnail?: boolean;
}

/**
 * ponytail: parse a quality preference like "480p" / "720p" / "1080p" into a
 * target height in pixels. Returns null for 'best'/unset/unknown values.
 * Exported for the post-record transcode router (plan §8) — the live path
 * itself never transcodes.
 */
export function parseQualityHeight(quality?: string): number | null {
  if (quality === undefined || quality === '' || quality === 'best') return null;
  const match = quality.match(/^(\d{3,4})p$/i);
  if (match === null) return null;
  const height = parseInt(match[1]!, 10);
  return height > 0 ? height : null;
}

/**
 * Build a yt-dlp -f selector for a user-chosen quality. A height pick like
 * "720p" caps the video at that height (never upscales) and falls back to
 * lower heights or a combined format when the exact one is unavailable.
 */
export function buildFormatSelector(quality?: string): string {
  const height = parseQualityHeight(quality);
  if (height === null) {
    return 'bestvideo+bestaudio/best';
  }
  return `bv*[height<=${height}]+ba/b[height<=${height}]/bv*+ba/b`;
}

/**
 * ponytail: default live-HLS stall watchdog window (see YtDlpDownloadOptions
 * .stallTimeoutMs). Generous against real keyframe/segment cadence (2-6s)
 * but far below the minutes-long dead windows a failing playlist reload
 * produces silently.
 */
const DEFAULT_LIVE_STALL_TIMEOUT_MS = 90_000;

function unitToBytes(unit: string): number {
  switch (unit) {
    case 'GiB':
    case 'GB':
      return 1024 * 1024 * 1024;
    case 'MiB':
    case 'MB':
      return 1024 * 1024;
    case 'KiB':
    case 'kB':
      return 1024;    default:
      return 1;
  }
}

/**
 * plan §7: pure constructor for the direct-HLS ffmpeg capture command.
 * Extracted verbatim from `downloadHlsFfmpeg` so the copy-only gate test can
 * scan the exact args a live recording spawns — no process needed.
 */
export function buildDirectFfmpegArgs(
  streamUrl: string,
  outputPath: string,
  options: YtDlpDownloadOptions = {},
): string[] {
  const args: string[] = [];
  // ponytail: input-option form — must come BEFORE `-i`. The option name is
  // `-http_proxy` (verified against the vendored ffmpeg: `-proxy` is NOT a
  // recognized CLI option there and fails the whole recording with
  // "Unrecognized option 'proxy'"). An HTTP CONNECT URL is used because
  // every ffmpeg build supports it (SOCKS support is newer). The host's
  // HTTPTunnelPort provides exactly such a URL.
  if (options.proxyUrl !== undefined && options.proxyUrl !== '') {
    args.push('-http_proxy', options.proxyUrl);
  }
  const ua = options.headers?.['User-Agent'] ?? options.headers?.['user-agent'];
  if (ua) {
    args.push('-user_agent', ua);
  }

  // ponytail: forward every other header (Referer/Origin/etc.) plus cookies —
  // many HLS edges reject requests without them.
  const headerLines: string[] = [];
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (key.toLowerCase() === 'user-agent') continue;
    headerLines.push(`${key}: ${value}`);
  }
  if (options.cookies !== undefined && options.cookies.length > 0) {
    headerLines.push(`Cookie: ${options.cookies.map((c) => `${c.name}=${c.value}`).join('; ')}`);
  }
  if (headerLines.length > 0) {
    args.push('-headers', headerLines.join('\r\n'));
  }

  // ponytail: live HLS connections drop occasionally — reconnect instead of failing
  args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');

  // ponytail: accept fragmented-MP4 HLS regardless of segment file names.
  // Many platforms serve Apple-standard fMP4 HLS whose segments end in
  // ".hls.fmp4" — ffmpeg's HLS demuxer rejects such URLs by default
  // ("detected format mov,mp4... mismatches allowed extensions"), which
  // fails the recording before a single segment is read. The plugin SDK's
  // StreamObject cannot express ffmpeg input options, so the recorder must
  // be lenient generically: this flag encodes no platform knowledge and
  // enables every plugin serving fMP4 HLS.
  args.push('-extension_picky', '0');

  args.push('-i', streamUrl);

  // plan §8: the live path ALWAYS captures source quality with -c copy.
  // An explicit downgrade ("720p") is served later by the background
  // transcode pool, never by a live libx264 re-encode (see requiresLiveTranscode
  // for the routing decision). `options.quality` is intentionally ignored here.
  args.push('-c', 'copy');

  // ponytail: TS-based HLS carries ADTS AAC; the MP4 muxer rejects ADTS
  // ("Malformed AAC bitstream detected") and the trailer write fails, leaving
  // a truncated file. aac_adtstoasc converts ADTS → raw AAC for MP4; on fMP4
  // HLS inputs (already raw, no ADTS) the filter passes packets through
  // unchanged — verified against both a Camsoda fMP4 stream (still records
  // fine) and a BongaCams TS stream (fails without the filter).
  args.push('-bsf:a', 'aac_adtstoasc');

  // ponytail: fragmented MP4 instead of faststart — faststart defers the
  // moov atom to process exit, so a cancelled/killed recording produced an
  // unplayable file. Fragmented MP4 writes self-contained fragments as it
  // goes: the file is playable at ANY point (while still recording,
  // after cancel, after stream-end) with no repair pass needed.
  args.push('-movflags', '+frag_keyframe+empty_moov+default_base_moof');

  // ponytail: the per-recording duration cap is enforced by a timer +
  // graceful 'q' stop (NOT `-t`) — the close handler must be able to
  // distinguish a duration-cap stop from a natural stream end, which the
  // segment-chaining logic keys off (same as the yt-dlp path).

  args.push('-y', outputPath);
  return args;
}

/**
 * yt-dlp integration for stream downloading.
 * Supports HLS/DASH, quality selection, resume, metadata, and progress.
 * Every active download runs as a tracked child process so it can report
 * progress per-job and be stopped cleanly when the stream ends.
 */
export class YtDlpService extends EventEmitter<YtDlpEvents> {
  private readonly activeProcesses = new Map<string, ChildProcessWithoutNullStreams>();
  /** Jobs whose stop came from the duration cap (segment splitting). */
  private readonly durationCappedJobs = new Set<string>();
  /** Jobs asked to stop: their exit resolves as `stopped` instead of an error. */
  private readonly stoppingJobs = new Set<string>();
  /**
   * ponytail: jobs the live-HLS stall watchdog tore down — their close
   * resolves as a TRANSIENT failure (not a graceful end) so the recording
   * service restarts capture with the captured parts preserved. Without
   * this a dead playlist window silently removed minutes from the saved
   * video (15min wall → 6min file, verified).
   */
  private readonly stalledJobs = new Set<string>();
  /**
   * ponytail: jobs whose child process IS ffmpeg directly (m3u8 path) —
   * it reads stdin, so 'q' stops it gracefully. Jobs running yt-dlp instead
   * delegate live HLS to an ffmpeg grandchild that stdin can't reach; those
   * need a full process-tree kill.
   */
  private readonly directFfmpegJobs = new Set<string>();

  async extractInfo(streamUrl: string): Promise<{
    title: string;
    duration: number;
    formats: Array<{
      formatId: string;
      resolution: string;
      extension: string;
      height?: number;
      fps?: number;
      filesize?: number;
      vcodec?: string;
      acodec?: string;
    }>;
  }> {
    const binary = ytDlpBinary.resolve();
    if (binary === null) {
      throw new AppError({
        code: 'YTDLP_NOT_FOUND',
        message: 'yt-dlp binary not found on PATH',
        recoverable: true,
      });
    }

    const probeArgs = [
      '--dump-json',
      '--no-download',
      // ponytail: same playlist guard as download() — a watch?v=..&list=..
      // probe must not expand into an infinite Mix playlist.
      '--no-playlist',
      // ponytail: some ISPs intermittently reset connections (SNI-level
      // interference). Aggressive retries let the probe punch through.
      '--retries', '10',
      '--extractor-retries', '10',
      '--socket-timeout', '15',
      // ponytail: direct/generic links behind Cloudflare return 403 unless
      // the request impersonates a real browser (needs curl_cffi).
      '--extractor-args', 'generic:impersonate',
    ];

    let result = await ytDlpBinary.run([...probeArgs, streamUrl]);

    // ponytail: portable DNS-block self-heal — on a network where the ISP
    // resolver returns NXDOMAIN for the site, resolve it via DNS-over-HTTPS
    // and pin it in the hosts file (one UAC prompt), then retry once.
    if (result.code !== 0 && isDnsFailure(result.stderr)) {
      const host = extractUnresolvedHost(result.stderr);
      if (host !== null) {
        const fix = await attemptDnsFix(host);
        if (fix.fixed) {
          result = await ytDlpBinary.run([...probeArgs, streamUrl]);
        }
      }
    }

    if (result.code !== 0) {
      throw new AppError({
        code: 'YTDLP_EXTRACT_FAILED',
        message: `yt-dlp extraction failed: ${result.stderr.slice(0, 500)}`,
        recoverable: true,
      });
    }

    const info = JSON.parse(result.stdout) as {
      title?: string;
      duration?: number;
      formats?: Array<{
        format_id: string;
        resolution?: string;
        ext?: string;
        height?: number;
        fps?: number;
        filesize?: number;
        filesize_approx?: number;
        vcodec?: string;
        acodec?: string;
      }>;
    };

    return {
      title: info.title ?? 'Untitled',
      duration: info.duration ?? 0,
      formats: (info.formats ?? []).map((f) => ({
        formatId: f.format_id,
        resolution: f.resolution ?? 'unknown',
        extension: f.ext ?? 'mp4',
        height: f.height,
        fps: f.fps,
        filesize: f.filesize ?? f.filesize_approx,
        vcodec: f.vcodec,
        acodec: f.acodec,
      })),
    };
  }

  async download(
    jobId: string,
    streamUrl: string,
    outputPath: string,
    options: YtDlpDownloadOptions = {},
  ): Promise<YtDlpDownloadResult> {
    // ponytail: m3u8 URLs need ffmpeg — yt-dlp's generic extractor drops headers on sub-requests
    if (streamUrl.includes('.m3u8')) {
      return this.downloadHlsFfmpeg(jobId, streamUrl, outputPath, options);
    }

    const binary = ytDlpBinary.resolve();
    if (binary === null) {
      throw new AppError({
        code: 'YTDLP_NOT_FOUND',
        message: 'yt-dlp binary not found on PATH',
        recoverable: true,
      });
    }

    const args: string[] = [
      '--no-warnings',
      '--no-check-certificates',
      // ponytail: a watch?v=..&list=.. URL must download just that video —
      // otherwise yt-dlp expands the playlist (Mix playlists are INFINITE,
      // so the download would sit at 0% forever).
      '--no-playlist',
      // ponytail: ride out intermittent connection resets (see extractInfo).
      '--retries', '10',
      '--extractor-retries', '10',
      '--socket-timeout', '15',
      // ponytail: bypass Cloudflare anti-bot 403 on generic/direct links.
      '--extractor-args', 'generic:impersonate',
    ];

    // ponytail: point yt-dlp at the vendored ffmpeg — end users don't have it
    // on PATH, and yt-dlp spawns ffmpeg BY NAME for HLS download, merging and
    // post-processing, so PATH-only resolution would break in the packaged app.
    const ffmpegPath = resolveExecutable('ffmpeg');
    if (ffmpegPath !== null) {
      args.push('--ffmpeg-location', ffmpegPath);
    }

    // ponytail: route through the host proxy when the site needs it.
    if (options.proxyUrl !== undefined && options.proxyUrl !== '') {
      args.push('--proxy', options.proxyUrl);
    }

    // Quality selection
    args.push('-f', buildFormatSelector(options.quality));

    // Resume support
    if (options.resume) {
      args.push('-c');
    }

    // Bandwidth cap
    if (options.limitRate !== undefined && options.limitRate !== '') {
      args.push('--limit-rate', options.limitRate);
    }

    // Audio-only extraction (post-processes with ffmpeg into MP3)
    if (options.audioOnly) {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    }

    // Save the source thumbnail alongside the media file.
    if (options.writeThumbnail) {
      args.push('--write-thumbnail');
    }

    // Output template
    args.push('-o', outputPath);

    // Machine-readable progress lines on stdout
    args.push('--newline', '--progress');

    // Headers
    if (options.headers !== undefined) {
      for (const [key, value] of Object.entries(options.headers)) {
        args.push('--add-header', `${key}:${value}`);
      }
    }

    // Cookies
    if (options.cookies !== undefined && options.cookies.length > 0) {
      const cookieHeader = options.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      args.push('--add-header', `Cookie:${cookieHeader}`);
    }

    args.push(streamUrl);

    return new Promise<YtDlpDownloadResult>((resolve, reject) => {
      const child = spawn(binary, args, { windowsHide: true });
      this.activeProcesses.set(jobId, child);
      // ponytail: persist the pid immediately (orphan adoption on restart).
      if (child.pid !== undefined) this.emit('spawned', jobId, child.pid);

      const cleanup = (): void => {
        this.activeProcesses.delete(jobId);
        this.stoppingJobs.delete(jobId);
        this.durationCappedJobs.delete(jobId);
        if (durationTimer !== undefined) {
          clearTimeout(durationTimer);
          durationTimer = undefined;
        }
      };

      // ponytail: enforce the per-recording duration cap. yt-dlp has no
      // native "stop live download after N seconds" flag, so a timer stops
      // the process gracefully (same path as stream-ended) once the cap is
      // reached — otherwise a limited recording runs until the stream ends.
      // Two timers: an EXACT one armed on the first real media progress line
      // (measures actual recorded time, excluding extraction/setup), and a
      // FALLBACK one armed at spawn (+30s slack) that guarantees the cap
      // fires even if no parseable progress line ever arrives.
      // The cap marks durationCappedJobs BEFORE stopping so the close
      // handler can report the reason (segment chaining keys off it).
      let durationTimer: ReturnType<typeof setTimeout> | undefined;
      let exactArmed = false;
      const fireDurationCap = (): void => {
        this.durationCappedJobs.add(jobId);
        this.stopDownload(jobId);
      };
      const armDurationTimer = (): void => {
        if (exactArmed) return;
        if (options.durationSeconds === undefined || options.durationSeconds <= 0) return;
        exactArmed = true;
        if (durationTimer !== undefined) clearTimeout(durationTimer);
        durationTimer = setTimeout(fireDurationCap, Math.floor(options.durationSeconds) * 1000);
        durationTimer.unref?.();
      };
      if (options.durationSeconds !== undefined && options.durationSeconds > 0) {
        durationTimer = setTimeout(fireDurationCap, (Math.floor(options.durationSeconds) + 30) * 1000);
        durationTimer.unref?.();
      }

      // ponytail: parse "[download]  45.2% of ~123.45MiB at 1.23MiB/s ETA 00:32" lines
      child.stdout.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (!line.includes('[download]')) continue;
          const percentMatch = line.match(/([\d.]+)%/);
          const sizeMatch = line.match(/of\s+(?:~\s*)?([\d.]+)(KiB|MiB|GiB)/);
          const speedMatch = line.match(/at\s+([\d.]+)(KiB|MiB|GiB)\/s/);
          const etaMatch = line.match(/ETA\s+(?:(\d+):)?(\d{1,2}):(\d{2})/);
          if (percentMatch === null && sizeMatch === null) continue;
          armDurationTimer();

          const percent = percentMatch ? parseFloat(percentMatch[1]!) : 0;
          const bytesDownloaded =
            sizeMatch && percent > 0
              ? (parseFloat(sizeMatch[1]!) * unitToBytes(sizeMatch[2]!) * percent) / 100
              : sizeMatch
                ? parseFloat(sizeMatch[1]!) * unitToBytes(sizeMatch[2]!)
                : 0;
          const speed = speedMatch ? parseFloat(speedMatch[1]!) * unitToBytes(speedMatch[2]!) : 0;
          const etaSeconds = etaMatch
            ? parseInt(etaMatch[1] ?? '0', 10) * 3600 +
              parseInt(etaMatch[2]!, 10) * 60 +
              parseInt(etaMatch[3]!, 10)
            : 0;

          const totalBytes =
            sizeMatch !== null
              ? parseFloat(sizeMatch[1]!) * unitToBytes(sizeMatch[2]!)
              : 0;
          this.emit('progress', jobId, {
            percent,
            speed,
            eta: etaSeconds,
            bytesDownloaded,
            totalBytes,
          });
        }
      });

      let stderrTail = '';
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrTail = (stderrTail + text).slice(-2000);
        // ponytail: for LIVE HLS streams yt-dlp delegates the download to
        // ffmpeg (e.g. Twitch) and produces NO [download] lines at all —
        // ffmpeg's progress output is relayed on stderr instead. Parse the
        // same "size=/time=" lines the direct-HLS path uses so the UI gets
        // bytes/speed updates here too.
        for (const line of text.split('\n')) {
          if (!line.includes('time=') || !line.includes('size=')) continue;
          const sizeMatch = line.match(/size=\s*(\d+)(\w+)/);
          if (sizeMatch === null) continue;
          armDurationTimer();
          const bitrateMatch = line.match(/bitrate=\s*([\d.]+)(\w+)/);
          this.emit('progress', jobId, {
            percent: 0,
            speed: bitrateMatch !== null ? parseFloat(bitrateMatch[1]!) * 1000 : 0,
            eta: 0,
            bytesDownloaded: parseInt(sizeMatch[1]!, 10) * unitToBytes(sizeMatch[2]!),
            totalBytes: 0,
          });
        }
      });

      child.on('error', (error) => {
        cleanup();
        reject(new AppError({
          code: 'YTDLP_SPAWN_FAILED',
          message: `Failed to launch yt-dlp: ${error.message}`,
          recoverable: true,
        }));
      });

      child.on('close', (code) => {
        // ponytail: capture the stop flags BEFORE cleanup deletes them — an
        // intentionally stopped download (duration cap / stream end / user
        // cancel) must resolve as `stopped`, not be rejected as a failure
        // (taskkill /F yields a non-zero exit code).
        const wasStopping = this.stoppingJobs.has(jobId);
        const wasDurationCapped = this.durationCappedJobs.has(jobId);
        cleanup();
        // ponytail: code === null means the process was killed by a signal
        // (e.g. user cancel via TerminateProcess on Windows) — treat it as an
        // intentional stop, not a failure.
        if (wasStopping || code === null) {
          // Stopped intentionally (stream ended / user action): keep what we have.
          resolve({ filePath: outputPath, duration: 0, stopped: true, durationCapReached: wasDurationCapped });
          return;
        }
        if (code !== 0) {
          reject(new AppError({
            code: 'YTDLP_DOWNLOAD_FAILED',
            message: `yt-dlp download failed (code ${code}): ${stderrTail.slice(0, 500) || 'no output'}`,
            recoverable: true,
          }));
          return;
        }
        resolve({ filePath: outputPath, duration: 0, stopped: false, durationCapReached: false });
      });
    });
  }

  // ponytail: ffmpeg natively handles HLS with headers — no extractor quirks.
  // Uses spawn directly to parse progress from stderr in real-time.
  private async downloadHlsFfmpeg(
    jobId: string,
    streamUrl: string,
    outputPath: string,
    options: YtDlpDownloadOptions = {},
  ): Promise<YtDlpDownloadResult> {
    const binary = resolveExecutable('ffmpeg');
    if (binary === null) {
      throw new AppError({
        code: 'FFMPEG_NOT_FOUND',
        message: 'FFmpeg binary not found on PATH',
        recoverable: true,
      });
    }

    const args = buildDirectFfmpegArgs(streamUrl, outputPath, options);

    return new Promise<YtDlpDownloadResult>((resolve, reject) => {
      const child = spawn(binary, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.activeProcesses.set(jobId, child);
      // ponytail: direct ffmpeg reads stdin — 'q' quits gracefully and
      // finalizes the mp4 container (see stopDownload).
      this.directFfmpegJobs.add(jobId);
      // ponytail: persist the pid immediately (orphan adoption on restart).
      if (child.pid !== undefined) this.emit('spawned', jobId, child.pid);
      // ponytail: keep only a bounded TAIL of ffmpeg stderr — ffmpeg logs
      // progress continuously, so accumulating the full output for a
      // multi-hour recording used to grow into hundreds of MB of memory.
      // 16KB is plenty for the error-tail extraction in the close handler.
      let stderrTail = '';

      const cleanup = (): void => {
        this.activeProcesses.delete(jobId);
        this.stoppingJobs.delete(jobId);
        this.directFfmpegJobs.delete(jobId);
        this.durationCappedJobs.delete(jobId);
        this.stalledJobs.delete(jobId);
        if (durationTimer !== undefined) {
          clearTimeout(durationTimer);
          durationTimer = undefined;
        }
        if (stallTimer !== undefined) {
          clearTimeout(stallTimer);
          stallTimer = undefined;
        }
      };

      // ponytail: duration cap via graceful stop (see download()).
      let durationTimer: ReturnType<typeof setTimeout> | undefined;
      if (options.durationSeconds !== undefined && options.durationSeconds > 0) {
        durationTimer = setTimeout(() => {
          this.durationCappedJobs.add(jobId);
          this.stopDownload(jobId);
        }, Math.floor(options.durationSeconds) * 1000);
        durationTimer.unref?.();
      }

      // ponytail: LIVE-HLS STALL WATCHDOG. A live capture must keep
      // producing media — ffmpeg's stderr lines keep coming even when the
      // playlist reload is failing, but the OUTPUT SIZE stops growing. When
      // that happens the stream is silently dead (verified against
      // MyFreeCams: a dropped TLS handshake stalls the playlist reload and
      // ffmpeg idles on the stale playlist — a 15-minute wall-clock
      // recording saved a 6-minute video, every stalled minute simply
      // absent). Treat the stall as a transient failure: tear the capture
      // down and let the service's retry loop restart it with the captured
      // parts preserved, instead of silently losing minutes.
      const stallTimeoutMs = options.stallTimeoutMs ?? DEFAULT_LIVE_STALL_TIMEOUT_MS;
      let stallTimer: ReturnType<typeof setTimeout> | undefined;
      let lastGrowthBytes = 0;
      let lastGrowthAt = Date.now();
      if (stallTimeoutMs > 0) {
        const checkStalled = (): void => {
          if (Date.now() - lastGrowthAt >= stallTimeoutMs) {
            // No new media for the whole window — the edge is serving a
            // dead playlist window. Tear down as a transient failure.
            this.stalledJobs.add(jobId);
            this.stopDownload(jobId);
            return;
          }
          stallTimer = setTimeout(checkStalled, Math.min(10_000, stallTimeoutMs));
          stallTimer.unref?.();
        };
        stallTimer = setTimeout(checkStalled, Math.min(10_000, stallTimeoutMs));
        stallTimer.unref?.();
      }

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrTail = (stderrTail + text).slice(-16_000);
        // ponytail: parse ffmpeg progress lines like:
        // frame=  100 fps= 65 q=-1.0 size=    1792KiB time=00:00:07.27 bitrate=2018.5kbits/s speed=4.74x
        for (const line of text.split('\n')) {
          if (!line.includes('time=') || !line.includes('size=')) continue;
          const sizeMatch = line.match(/size=\s*(\d+)(\w+)/);
          const bitrateMatch = line.match(/bitrate=\s*([\d.]+)(\w+)/);
          if (sizeMatch) {
            const bytesDownloaded = parseInt(sizeMatch[1]!, 10) * unitToBytes(sizeMatch[2]!);
            // ponytail: the watchdog keys off OUTPUT GROWTH, not line
            // arrival — ffmpeg keeps emitting identical progress lines
            // while the demuxer is stalled on a dead playlist.
            if (bytesDownloaded > lastGrowthBytes) {
              lastGrowthBytes = bytesDownloaded;
              lastGrowthAt = Date.now();
            }
            const speedBps = bitrateMatch ? parseFloat(bitrateMatch[1]!) * 1000 : 0; // kbits/s -> bps
            this.emit('progress', jobId, {
              percent: 0,
              speed: speedBps,
              eta: 0,
              bytesDownloaded,
              totalBytes: 0,
            });
          }
        }
      });

      child.on('error', (error) => {
        cleanup();
        reject(new AppError({
          code: 'FFMPEG_SPAWN_FAILED',
          message: `Failed to launch ffmpeg: ${error.message}`,
          recoverable: true,
        }));
      });

      child.on('close', (code) => {
        // ponytail: capture the stop flags BEFORE cleanup deletes them (see download()).
        const wasStalled = this.stalledJobs.has(jobId);
        const wasStopping = this.stoppingJobs.has(jobId);
        const wasDurationCapped = this.durationCappedJobs.has(jobId);
        cleanup();
        // ponytail: a stall-detected stop must NOT resolve as a graceful
        // end — that is how multi-minute dead windows became invisible and
        // the saved video came up minutes short. Reject with the stall
        // signature so the service's transient-retry loop restarts capture.
        if (wasStalled) {
          reject(new AppError({
            code: 'FFMPEG_HLS_DOWNLOAD_FAILED',
            message: `live capture stalled — no media progress for ${Math.round(stallTimeoutMs / 1000)}s (connection stalled), restarting capture`,
            recoverable: true,
          }));
          return;
        }
        // ponytail: code === null means the process was killed by a signal
        // (e.g. user cancel via TerminateProcess on Windows) — treat it as an
        // intentional stop, not a failure.
        if (wasStopping || code === null) {
          resolve({ filePath: outputPath, duration: 0, stopped: true, durationCapReached: wasDurationCapped });
          return;
        }
        if (code !== 0) {
          // ponytail: ffmpeg dumps its banner first — strip it and keep the TAIL of
          // stderr where the actual error message lives.
          const BANNER = /^(ffmpeg version|built with|configuration:|copyright|\s*lib\w+\s+version)/i;
          const meaningful = stderrTail
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !BANNER.test(l));
          const errorLines = meaningful.slice(-15).join('\n').slice(-1000);
          reject(new AppError({
            code: 'FFMPEG_HLS_DOWNLOAD_FAILED',
            message: `ffmpeg exited with code ${code}: ${errorLines || 'no output'}`,
            recoverable: true,
          }));
          return;
        }
        resolve({ filePath: outputPath, duration: 0, stopped: false, durationCapReached: false });
      });
    });
  }

  /**
   * Ask a running download to finish early (e.g. the live stream ended).
   * The pending download() promise resolves with `stopped: true` and keeps
   * whatever data was written so far.
   */
  stopDownload(jobId: string): boolean {
    const child = this.activeProcesses.get(jobId);
    if (child === undefined) return false;
    this.stoppingJobs.add(jobId);
    const pid = child.pid;

    /** Force-kill the whole tree as a last resort (orphan prevention). */
    const forceKill = (): void => {
      if (pid !== undefined) killProcessTree(pid);
      try {
        child.kill('SIGKILL');
      } catch {
        /* already exited */
      }
    };

    if (process.platform === 'win32') {
      if (this.directFfmpegJobs.has(jobId) && child.stdin !== null && child.stdin.writable) {
        // ponytail: Windows has no real SIGINT — kill() becomes
        // TerminateProcess, which prevents ffmpeg from writing the mp4 moov
        // atom. Send 'q' to ffmpeg's stdin instead: that's its documented
        // graceful-quit key and it finalizes the container properly. Fall
        // back to a tree kill after a grace period in case stdin is closed.
        try {
          child.stdin.write('q');
        } catch {
          forceKill();
        }
        const graceTimer = setTimeout(forceKill, 5000);
        child.once('close', () => clearTimeout(graceTimer));
      } else {
        // ponytail: yt-dlp path — killing only yt-dlp orphans its ffmpeg
        // grandchild, which keeps recording forever and holds the stdio
        // pipes open (so 'close' never fires and the job stays stuck in
        // 'recording'). Kill the entire process tree immediately.
        forceKill();
        // ponytail: escalation — if anything survived the tree kill, hit it
        // again; a live process here means the stream never stops.
        const escalate = setTimeout(forceKill, 3000);
        escalate.unref?.();
        child.once('close', () => clearTimeout(escalate));
      }
    } else {
      // ponytail: ffmpeg finalizes the container cleanly on SIGINT; yt-dlp
      // saves its partial state the same way and terminates its own children.
      try {
        child.kill('SIGINT');
      } catch {
        forceKill();
      }
      // ponytail: if the graceful stop is still not done after 10s, hard-kill.
      const escalate = setTimeout(forceKill, 10_000);
      escalate.unref?.();
      child.once('close', () => clearTimeout(escalate));
    }
    return true;
  }

  /** Hard-cancel a download. Kept for API compatibility with cancel flows. */
  cancelDownload(jobId: string): void {
    this.stopDownload(jobId);
  }

  isDownloading(jobId: string): boolean {
    return this.activeProcesses.has(jobId);
  }

  /**
   * ponytail: tree-kill a process by pid — an adopted orphaned recording has
   * no ChildProcess handle in this session, so stopDownload cannot reach it.
   */
  stopPidTree(pid: number): void {
    killProcessTree(pid);
    if (process.platform !== 'win32') {
      // ponytail: killProcessTree is Windows-only — fall back to a direct
      // SIGKILL so adopted orphans are still stoppable on POSIX (the
      // yt-dlp/ffmpeg grandchild may survive until tree-kill is implemented).
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }

  /**
   * plan §11: async variant of `stopPidTree` for orphan/recovery paths —
   * same semantics, never blocks the event loop.
   */
  async stopPidTreeAsync(pid: number): Promise<void> {
    await killProcessTreeAsync(pid);
    if (process.platform !== 'win32') {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }

  /**
   * Get all active process PIDs with their types.
   * Used by ProcessMonitorService to poll resource usage.
   */
  getActivePids(): Array<{ pid: number; type: 'yt-dlp' | 'ffmpeg' }> {
    const result: Array<{ pid: number; type: 'yt-dlp' | 'ffmpeg' }> = [];
    for (const [jobId, child] of this.activeProcesses.entries()) {
      if (child.pid !== undefined) {
        const isDirectFfmpeg = this.directFfmpegJobs.has(jobId);
        result.push({
          pid: child.pid,
          type: isDirectFfmpeg ? 'ffmpeg' : 'yt-dlp',
        });
      }
    }
    return result;
  }
}