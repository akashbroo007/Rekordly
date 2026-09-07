import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Generic download engine.
 *
 * Two transfer strategies cover "almost every site":
 *  - 'http'   — direct media URLs (mp4/mp3/mkv/... or audio|video content-type),
 *               streamed natively with Range-based resume and bandwidth pacing.
 *  - 'ytdlp'  — everything else is delegated to yt-dlp, whose extractors cover
 *               1000+ sites (YouTube, Vimeo, Twitter/X, TikTok, SoundCloud, ...).
 */

export type DownloadEngineKind = 'http' | 'ytdlp';

/** File extensions that indicate a directly downloadable media file. */
const DIRECT_MEDIA_EXTENSIONS = [
  '.mp4', '.m4v', '.mkv', '.webm', '.mov', '.avi', '.flv', '.wmv', '.ts', '.mpg', '.mpeg',
  '.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.wma',
] as const;

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * Synchronous URL classification by file extension.
 * Returns null when the URL does not obviously point at a media file.
 */
export function classifyUrlSync(url: string): DownloadEngineKind | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const pathname = decodeURIComponent(parsed.pathname).toLowerCase();
    if (DIRECT_MEDIA_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
      return 'http';
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Full classification: extension sniffing first, then a HEAD probe to check
 * the Content-Type. Anything that is not clearly a direct media file is
 * handed to yt-dlp, whose generic extractor also handles plain URLs.
 */
export async function classifyUrl(url: string): Promise<DownloadEngineKind> {
  const sync = classifyUrlSync(url);
  if (sync !== null) return sync;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': DEFAULT_USER_AGENT },
    });
    clearTimeout(timeout);
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (
      contentType.startsWith('audio/') ||
      contentType.startsWith('video/') ||
      contentType.includes('octet-stream')
    ) {
      return 'http';
    }
  } catch {
    // Probe failed (offline, blocked HEAD, CORS-less CDN...) — let yt-dlp try.
  }
  return 'ytdlp';
}

/** Thrown when a transfer was intentionally stopped (pause/cancel), not failed. */
export class TransferStoppedError extends Error {
  constructor(public readonly reason: 'paused' | 'cancelled') {
    super(`transfer ${reason}`);
    this.name = 'TransferStoppedError';
  }
}

export interface TransferProgress {
  bytesDownloaded: number;
  totalBytes: number;
  speed: number;
  eta: number;
  percent: number;
}

export interface HttpDownloadOptions {
  url: string;
  /** Final target path; a `.part` sibling file is used during the transfer. */
  filePath: string;
  /** Byte offset to resume from (size of an existing .part file). */
  resumeFromBytes?: number;
  /** Speed cap in bytes/s. 0 or undefined = unlimited. */
  bandwidthLimit?: number;
  onProgress?: (progress: TransferProgress) => void;
}

export interface HttpDownloadResult {
  filePath: string;
  bytesDownloaded: number;
  totalBytes: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function writeChunk(stream: WriteStream, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (error?: Error | null) => (error ? reject(error) : resolve()));
  });
}

/**
 * Native HTTP(S) media downloader with Range resume, redirect following and
 * optional bandwidth pacing. Pause/cancel abort the request while keeping
 * the partial `.part` file so a later resume continues where it left off.
 */
export class HttpDownloader {
  private controller: AbortController | null = null;
  private stopReason: 'paused' | 'cancelled' | null = null;

  /** Gracefully stop the transfer, keeping the partial file. */
  pause(): void {
    this.stopReason ??= 'paused';
    this.controller?.abort();
  }

  /** Hard-stop the transfer, keeping the partial file (retry can resume). */
  cancel(): void {
    this.stopReason ??= 'cancelled';
    this.controller?.abort();
  }

  async download(options: HttpDownloadOptions): Promise<HttpDownloadResult> {
    this.stopReason = null;
    this.controller = new AbortController();
    const partPath = `${options.filePath}.part`;

    await mkdir(dirname(options.filePath), { recursive: true });

    let startByte = options.resumeFromBytes ?? 0;
    if (startByte > 0) {
      try {
        startByte = (await stat(partPath)).size;
      } catch {
        startByte = 0;
      }
    }

    const headers: Record<string, string> = {
      'user-agent': DEFAULT_USER_AGENT,
      accept: '*/*',
    };
    if (startByte > 0) {
      headers['range'] = `bytes=${startByte}-`;
    }

    let response: Response;
    try {
      response = await fetch(options.url, {
        headers,
        redirect: 'follow',
        signal: this.controller.signal,
      });
    } catch (error) {
      if (this.stopReason !== null) {
        throw new TransferStoppedError(this.stopReason);
      }
      throw new Error(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok || response.body === null) {
      throw new Error(`HTTP ${response.status} ${response.statusText || 'request failed'}`);
    }

    // ponytail: if the server ignored the Range header it returns 200 with the
    // full body — restart from zero instead of corrupting the partial file.
    if (startByte > 0 && response.status !== 206) {
      startByte = 0;
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    const totalBytes = startByte + (Number.isFinite(contentLength) ? contentLength : 0);

    const stream = createWriteStream(partPath, { flags: startByte > 0 ? 'a' : 'w' });
    const reader = response.body.getReader();

    let received = startByte;
    let lastReportAt = Date.now();
    let lastReportBytes = startByte;
    // Bandwidth pacing window (1s token window).
    let windowStart = Date.now();
    let windowBytes = 0;
    const limit = options.bandwidthLimit ?? 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value === undefined) continue;

        received += value.byteLength;
        await writeChunk(stream, value);

        if (limit > 0) {
          windowBytes += value.byteLength;
          const elapsed = Date.now() - windowStart;
          const expectedMs = (windowBytes / limit) * 1000;
          if (expectedMs > elapsed) {
            await sleep(Math.min(expectedMs - elapsed, 2000));
          }
          if (Date.now() - windowStart >= 1000) {
            windowStart = Date.now();
            windowBytes = 0;
          }
        }

        const now = Date.now();
        if (now - lastReportAt >= 500) {
          const elapsedSeconds = (now - lastReportAt) / 1000;
          const speed = elapsedSeconds > 0 ? (received - lastReportBytes) / elapsedSeconds : 0;
          const percent = totalBytes > 0 ? Math.min(100, (received / totalBytes) * 100) : 0;
          const eta = speed > 0 && totalBytes > 0 ? ((totalBytes - received) / speed) * 1000 : 0;
          options.onProgress?.({
            bytesDownloaded: received,
            totalBytes,
            speed,
            eta,
            percent,
          });
          lastReportAt = now;
          lastReportBytes = received;
        }
      }

      await new Promise<void>((resolve, reject) => {
        stream.end((error?: Error | null) => (error ? reject(error) : resolve()));
      });

      // ponytail: if the server sent fewer bytes than Content-Length promised
      // (truncated connection closed cleanly), treat it as an error so the
      // retry logic can resume the remainder.
      if (totalBytes > 0 && received < totalBytes) {
        throw new Error(`Connection closed early (${received}/${totalBytes} bytes)`);
      }

      await rename(partPath, options.filePath);
      return { filePath: options.filePath, bytesDownloaded: received, totalBytes };
    } catch (error) {
      try {
        stream.destroy();
      } catch {
        /* already closed */
      }
      if (this.stopReason !== null) {
        throw new TransferStoppedError(this.stopReason);
      }
      throw error;
    }
  }
}

/** Format bytes/s as a yt-dlp --limit-rate value (e.g. 5242880 -> "5120K"). */
export function formatLimitRate(bytesPerSecond: number): string {
  return `${Math.max(1, Math.round(bytesPerSecond / 1024))}K`;
}