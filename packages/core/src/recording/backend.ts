import type { HttpCookie, StreamObject } from '@rekordly/shared';
import { YtDlpService, type YtDlpDownloadOptions, type YtDlpDownloadResult, type YtDlpProgress } from './yt-dlp';

/**
 * RecorderBackend seam (CONCURRENT_CAPTURE_PLAN §2).
 *
 * Phase A: types + thin adapter only. No behavior change — `FfmpegCopyBackend`
 * delegates to the existing `YtDlpService`. `RecordingService` is NOT rewired yet
 * (that happens in Phase B/C in small steps).
 *
 * The seam is the only future migration boundary: a `RustSidecarBackend` must be
 * able to replace `FfmpegCopyBackend` without touching the manager, UI, scheduling,
 * admission, post-processing, or library.
 */

/** Input to resolution — today this is the plugin-supplied Standard Stream Object. */
export type StreamInput = StreamObject;

/**
 * Resolved stream ready for capture.
 * Phase A: copied from the StreamObject (no network, no `yt-dlp -g`).
 * Phase B adds per-site short resolution; yt-dlp-required sites keep the
 * persistent fallback (plan §3, constraint §0.1.1).
 */
export interface ResolvedStream {
  streamUrl: string;
  headers?: Record<string, string>;
  cookies?: HttpCookie[];
  /** ponytail: host proxy URL for child processes (see StreamObject.proxyUrl). */
  proxyUrl?: string;
  /** The originating stream (creator/platform context for finalize + library). */
  source: StreamObject;
}

export interface CaptureOptions {
  jobId: string;
  outputPath: string;
  quality?: string;
  headers?: Record<string, string>;
  cookies?: HttpCookie[];
  /** HTTP proxy URL for the capture child process (ffmpeg/yt-dlp). */
  proxyUrl?: string;
  resume?: boolean;
  durationSeconds?: number;
  limitRate?: string;
  audioOnly?: boolean;
  writeThumbnail?: boolean;
}

export type RecordingProgress = YtDlpProgress;

export type RecordingResult = YtDlpDownloadResult;

/** Why a capture was stopped — recorded for future A/B/C failure classification (Phase B). */
export type StopReason = 'user' | 'stream-ended' | 'duration-cap' | 'shutdown';

/**
 * Minimum worker state machine (plan §5). Type-only in Phase A — no logic yet.
 * Internal to the recorder; the UI only ever sees a subset.
 */
export type WorkerState =
  | 'QUEUED'
  | 'OFFLINE'
  | 'RESOLVING'
  | 'STARTING'
  | 'RECORDING'
  | 'RECONNECTING'
  | 'RE_RESOLVING'
  | 'STOPPING'
  | 'FINALIZING'
  | 'FAILED';

/** Explicit per-stream resource cost (plan §6) — scheduler input, not just a stream count. */
export interface RecordingResourceCost {
  processCount: number;
  estimatedNetworkMbps?: number;
  estimatedDiskMbps?: number;
  requiresTranscode: boolean;
}

export interface RecordingHandle {
  pid?: number;
  progress(): RecordingProgress;
  stop(reason?: StopReason): Promise<void>;
  wait(): Promise<RecordingResult>;
}

export interface RecorderBackend {
  resolve(input: StreamInput): Promise<ResolvedStream>;
  capture(stream: ResolvedStream, options: CaptureOptions): Promise<RecordingHandle>;
  /** Declared cost BEFORE capture — admission control input (estimates optional, §9). */
  resourceCost(stream: ResolvedStream, quality?: string): RecordingResourceCost;
}

/**
 * Pure: copy a StreamObject into a ResolvedStream without network access.
 * Credentials (headers/cookies) are carried through, never logged.
 */
export function resolveStreamObject(input: StreamInput): ResolvedStream {
  return {
    streamUrl: input.streamUrl,
    headers: input.headers !== undefined ? { ...input.headers } : undefined,
    cookies: input.cookies !== undefined ? [...input.cookies] : undefined,
    proxyUrl: input.proxyUrl,
    source: input,
  };
}

/** True when the URL routes to the direct-ffmpeg copy path (mirrors YtDlpService.download). */
export function isDirectHlsUrl(streamUrl: string): boolean {
  return streamUrl.includes('.m3u8');
}

/** True when the quality asks for a live re-encode (current violator yt-dlp.ts:581, Phase D). */
export function requiresLiveTranscode(quality?: string): boolean {
  if (quality === undefined || quality === '' || quality === 'best') return false;
  return /^(\d{3,4})p$/i.test(quality);
}

/**
 * Pure: declared resource cost for admission control.
 * Unknown bitrates stay `undefined` and must degrade gracefully (constraint §0.1.4).
 */
export function classifyResourceCost(streamUrl: string, quality?: string): RecordingResourceCost {
  return {
    processCount: isDirectHlsUrl(streamUrl) ? 1 : 2,
    requiresTranscode: requiresLiveTranscode(quality),
  };
}

const EMPTY_PROGRESS: RecordingProgress = {
  percent: 0,
  speed: 0,
  eta: 0,
  bytesDownloaded: 0,
  totalBytes: 0,
};

function toDownloadOptions(options: CaptureOptions): YtDlpDownloadOptions {
  return {
    quality: options.quality,
    headers: options.headers,
    cookies: options.cookies?.map((c) => ({ name: c.name, value: c.value })),
    proxyUrl: options.proxyUrl,
    resume: options.resume,
    durationSeconds: options.durationSeconds,
    limitRate: options.limitRate,
    audioOnly: options.audioOnly,
    writeThumbnail: options.writeThumbnail,
  };
}

/** Minimal downloader surface the backend needs (structurally satisfied by YtDlpService). */
export type CaptureDownloader = Pick<YtDlpService, 'download' | 'stopDownload' | 'on' | 'off'>;

/**
 * Default backend: delegates 1:1 to the existing `YtDlpService`.
 * No behavior change in Phase A — same spawn args, same events, same results.
 */
export class FfmpegCopyBackend implements RecorderBackend {
  private readonly downloader: CaptureDownloader;

  constructor(downloader?: CaptureDownloader) {
    this.downloader = downloader ?? new YtDlpService();
  }

  async resolve(input: StreamInput): Promise<ResolvedStream> {
    return resolveStreamObject(input);
  }

  resourceCost(stream: ResolvedStream, quality?: string): RecordingResourceCost {
    return classifyResourceCost(stream.streamUrl, quality);
  }

  async capture(stream: ResolvedStream, options: CaptureOptions): Promise<RecordingHandle> {
    const { jobId, outputPath } = options;
    let pid: number | undefined;
    let lastProgress: RecordingProgress = { ...EMPTY_PROGRESS };

    const onProgress = (eventJobId: string, progress: YtDlpProgress): void => {
      if (eventJobId !== jobId) return;
      lastProgress = { ...progress };
    };
    const onSpawned = (eventJobId: string, eventPid: number): void => {
      if (eventJobId !== jobId) return;
      pid = eventPid;
    };
    this.downloader.on('progress', onProgress);
    this.downloader.on('spawned', onSpawned);

    const pending = this.downloader.download(jobId, stream.streamUrl, outputPath, toDownloadOptions(options));
    const settled = pending.finally(() => {
      this.downloader.off('progress', onProgress);
      this.downloader.off('spawned', onSpawned);
    });

    return {
      get pid() {
        return pid;
      },
      progress: () => ({ ...lastProgress }),
      stop: async (_reason?: StopReason) => {
        this.downloader.stopDownload(jobId);
      },
      wait: () => settled,
    };
  }
}
