import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { FfmpegService } from '../recording/ffmpeg';
import type { DownloadProbeResultDto, Logger } from '@rekordly/shared';
import type { DownloadQueueRepo, DownloadQueueRecord } from '@rekordly/database';
import type { NotificationService } from './notification-service';
import { YtDlpService } from '../recording/yt-dlp';
import { ensureMp4Container } from '../recording/container';
import {
  HttpDownloader,
  TransferStoppedError,
  classifyUrl,
  formatLimitRate,
  type TransferProgress,
} from './download-engine';

export interface DownloadManagerOptions {
  repo: DownloadQueueRepo;
  notifications: NotificationService;
  logger: Logger;
  /** Folder used to resolve relative download destinations (recordings dir). */
  defaultDestinationDir: () => string;
  /** Live limits read on every scheduler tick. */
  getLimits: () => { maxConcurrentDownloads: number; downloadBandwidthLimit: number };
}

export interface DownloadManagerEvents {
  'download-queued': [{ downloadId: string; timestamp: string }];
  'download-started': [{ downloadId: string; timestamp: string }];
  'download-progress': [{ downloadId: string; percent: number; speed: number; eta: number; timestamp: string }];
  'download-paused': [{ downloadId: string; timestamp: string }];
  'download-resumed': [{ downloadId: string; timestamp: string }];
  'download-completed': [{ downloadId: string; timestamp: string }];
  'download-failed': [{ downloadId: string; error: string; timestamp: string }];
  'download-cancelled': [{ downloadId: string; timestamp: string }];
}

export interface DownloadAddOptions {
  url: string;
  destination: string;
  fileName: string;
  title?: string;
  pluginId?: string;
  creatorId?: string;
  priority?: number;
  audioOnly?: boolean;
  /** Requested quality: 'best' or a height like '1080p' (yt-dlp engine only). */
  quality?: string;
}

interface ActiveTransfer {
  pause(): void;
  cancel(): void;
}

/** Image extensions yt-dlp may use for written thumbnails. */
const THUMBNAIL_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

/** Video extensions that get an ffmpeg-generated thumbnail fallback. */
const VIDEO_EXTENSIONS = [
  '.mp4', '.m4v', '.mkv', '.webm', '.mov', '.avi', '.flv', '.wmv', '.ts',
] as const;

/**
 * Derive a filesystem-safe website folder name from a URL
 * (e.g. "https://www.youtube.com/watch?v=x" -> "youtube").
 */
export function deriveSiteFolder(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const parts = host.split('.').filter((part) => part.length > 0);
    // ponytail: take the second-level label ("youtube" of youtube.com,
    // "chaturbate" of chaturbate.com); single-label hosts use it directly.
    const name = parts.length >= 2 ? parts[parts.length - 2]! : (parts[0] ?? '');
    const safe = name.replace(/[^a-z0-9_-]/g, '').slice(0, 64);
    return safe.length > 0 ? safe : 'misc';
  } catch {
    return 'misc';
  }
}

const TICK_MS = 1000;
/** Minimum gap between progress writes to SQLite per item. */
const PROGRESS_WRITE_THROTTLE_MS = 700;

/**
 * Queue manager + transfer engine for generic downloads.
 *
 * The scheduler picks queued items by priority up to the configured
 * concurrency limit and routes each through either the native HTTP
 * downloader (direct media files) or yt-dlp (site extraction), streaming
 * progress into the database and emitting events for the UI.
 */
export class DownloadManager extends EventEmitter<DownloadManagerEvents> {
  private readonly repo: DownloadQueueRepo;
  private readonly notifications: NotificationService;
  private readonly logger: Logger;
  private readonly ytDlp = new YtDlpService();
  /** Active transfers keyed by download id. */
  private readonly transfers = new Map<string, ActiveTransfer>();
  /** Items whose runItem() has been kicked off but not yet registered a transfer. */
  private readonly startingIds = new Set<string>();
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(options: DownloadManagerOptions) {
    super();
    this.repo = options.repo;
    this.notifications = options.notifications;
    this.logger = options.logger;

    this.deps = options;

    // Route yt-dlp progress events into the shared progress pipeline.
    // ponytail: yt-dlp's "[download] 45% of ~123MiB" lines carry the total —
    // forward it so the UI can show "45.3 MB / 100 MB" instead of "?".
    this.ytDlp.on('progress', (jobId, progress) => {
      this.handleProgress(jobId, progress);
    });

    this.logger.info('download manager initialized');
  }

  // --- Lifecycle -------------------------------------------------------------

  /** Start the scheduler. Recovers items left 'downloading' by a previous session. */
  start(): void {
    if (this.ticker !== null) return;
    // ponytail: transfers die with the process — anything still marked
    // 'downloading' at boot is stale and goes back to the queue.
    const stale = this.repo.listActive();
    for (const item of stale) {
      this.repo.update(item.id, { status: 'queued' });
      this.logger.info({ downloadId: item.id }, 'recovered stale downloading item');
    }
    this.ticker = setInterval(this.tick, TICK_MS);
    this.logger.info('download scheduler started');
  }

  /** Stop the scheduler and gracefully pause all active transfers. */
  stop(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    for (const [id, transfer] of this.transfers) {
      try {
        transfer.pause();
      } catch (error) {
        this.logger.warn({ downloadId: id, error }, 'failed to stop transfer on shutdown');
      }
    }
    this.logger.info('download scheduler stopped');
  }

  private tick = (): void => {
    const { maxConcurrentDownloads } = this.deps.getLimits();
    let guard = 0;
    while (this.transfers.size + this.startingIds.size < maxConcurrentDownloads && guard < 20) {
      guard += 1;
      const next = this.nextQueued();
      if (next === undefined) break;
      this.startingIds.add(next.id);
      void this.runItem(next).finally(() => {
        this.startingIds.delete(next.id);
      });
    }
  };

  private nextQueued(): DownloadQueueRecord | undefined {
    const queued = this.repo.listQueued().filter((item) => !this.startingIds.has(item.id));
    queued.sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
    return queued[0];
  }

  // --- Queue operations ------------------------------------------------------

  addDownload(options: DownloadAddOptions): DownloadQueueRecord {
    const now = new Date().toISOString();
    // ponytail: no explicit destination means "auto-organize": put the file in
    // <downloadsDir>/<website>/ so the user never has to pick a folder. The
    // resolved absolute path is stored so retries stay stable even if the
    // setting changes later.
    const destination =
      options.destination.trim() === '' || options.destination === '.'
        ? join(this.deps.defaultDestinationDir(), deriveSiteFolder(options.url))
        : options.destination;
    const record: DownloadQueueRecord = {
      id: randomUUID(),
      url: options.url,
      destination,
      fileName: options.fileName,
      title: options.title ?? null,
      pluginId: options.pluginId ?? null,
      creatorId: options.creatorId ?? null,
      status: 'queued',
      engine: 'auto',
      audioOnly: options.audioOnly ?? false,
      quality: options.quality ?? 'best',
      priority: options.priority ?? 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
      percent: 0,
      retries: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    };

    this.repo.create(record);
    this.emit('download-queued', { downloadId: record.id, timestamp: now });
    this.notifications.send({
      level: 'info',
      title: 'Download queued',
      message: `Download "${record.fileName}" added to queue`,
      data: { downloadId: record.id },
    });

    return record;
  }

  listDownloads(status?: string): DownloadQueueRecord[] {
    return this.repo.list(status);
  }

  getDownload(id: string): DownloadQueueRecord | undefined {
    return this.repo.get(id);
  }

  removeDownload(id: string): void {
    const transfer = this.transfers.get(id);
    if (transfer !== undefined) {
      transfer.cancel();
      this.transfers.delete(id);
    }
    this.repo.remove(id);
  }

  pauseDownload(id: string): void {
    const item = this.repo.get(id);
    if (item === undefined) return;

    const transfer = this.transfers.get(id);
    if (transfer !== undefined) {
      // ponytail: the transfer's catch block sees the DB is already 'paused'
      // and leaves it alone — set the status first.
      this.transfers.delete(id);
      this.repo.update(id, { status: 'paused', speed: 0, eta: 0 });
      this.emit('download-paused', { downloadId: id, timestamp: new Date().toISOString() });
      transfer.pause();
      return;
    }

    if (item.status === 'downloading') {
      this.repo.update(id, { status: 'paused', speed: 0, eta: 0 });
      this.emit('download-paused', { downloadId: id, timestamp: new Date().toISOString() });
    }
  }

  resumeDownload(id: string): void {
    const item = this.repo.get(id);
    if (item !== undefined && item.status === 'paused') {
      this.repo.update(id, { status: 'queued' });
      this.emit('download-resumed', { downloadId: id, timestamp: new Date().toISOString() });
    }
  }

  cancelDownload(id: string): void {
    const item = this.repo.get(id);
    if (item === undefined) return;

    const transfer = this.transfers.get(id);
    if (transfer !== undefined) {
      this.transfers.delete(id);
      this.repo.update(id, { status: 'cancelled', finishedAt: new Date().toISOString(), speed: 0, eta: 0 });
      this.emit('download-cancelled', { downloadId: id, timestamp: new Date().toISOString() });
      transfer.cancel();
      return;
    }

    if (item.status !== 'completed') {
      this.repo.update(id, { status: 'cancelled', finishedAt: new Date().toISOString() });
      this.emit('download-cancelled', { downloadId: id, timestamp: new Date().toISOString() });
    }
  }

  retryDownload(id: string): void {
    const item = this.repo.get(id);
    if (item !== undefined && (item.status === 'failed' || item.status === 'cancelled')) {
      this.repo.update(id, { status: 'queued', retries: 0, error: null });
      this.emit('download-queued', { downloadId: id, timestamp: new Date().toISOString() });
    }
  }

  setPriority(id: string, priority: number): void {
    this.repo.update(id, { priority });
  }

  pauseAll(): void {
    for (const item of this.repo.list('downloading')) {
      this.pauseDownload(item.id);
    }
  }

  resumeAll(): void {
    for (const item of this.repo.list('paused')) {
      this.resumeDownload(item.id);
    }
  }

  clearCompleted(): void {
    this.repo.clearCompleted();
  }

  clearFailed(): void {
    this.repo.clearFailed();
  }

  retryAll(): void {
    for (const item of this.repo.list('failed')) {
      this.retryDownload(item.id);
    }
  }

  countByStatus(): Record<string, number> {
    return this.repo.countByStatus();
  }

  /**
   * Inspect a URL before queuing: report which engine would handle it and
   * which qualities are actually available so the UI can offer a picker.
   */
  async probeDownload(url: string): Promise<DownloadProbeResultDto> {
    const kind = await classifyUrl(url);
    if (kind === 'http') {
      // ponytail: direct files have exactly one "quality" — the file itself.
      return { engine: 'http', formats: [{ value: 'best', label: 'Original file' }] };
    }

    const info = await this.ytDlp.extractInfo(url);

    // ponytail: collapse per-format entries into distinct video heights,
    // keeping the highest fps variant of each height.
    const heights = new Map<number, number>();
    for (const format of info.formats) {
      if (format.height !== undefined && format.vcodec !== undefined && format.vcodec !== 'none') {
        const fps = format.fps ?? 0;
        const best = heights.get(format.height) ?? 0;
        if (fps > best) heights.set(format.height, fps);
      }
    }
    const qualityOptions = [...heights.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([height, fps]) => ({
        value: `${height}p`,
        label: `${height}p${fps >= 48 ? ' · high fps' : ''}`,
      }));

    return {
      engine: 'ytdlp',
      title: info.title,
      durationSeconds: info.duration > 0 ? Math.round(info.duration) : undefined,
      formats: [{ value: 'best', label: 'Best available' }, ...qualityOptions],
    };
  }

  bulkRemove(ids: string[]): void {
    for (const id of ids) {
      this.removeDownload(id);
    }
  }

  bulkRetry(ids: string[]): void {
    for (const id of ids) {
      this.retryDownload(id);
    }
  }

  // --- Transfer execution ----------------------------------------------------

  private async runItem(item: DownloadQueueRecord): Promise<void> {
    const now = new Date().toISOString();
    this.repo.update(item.id, { status: 'downloading', startedAt: item.startedAt ?? now, error: null });
    this.emit('download-started', { downloadId: item.id, timestamp: now });

    try {
      const kind =
        item.engine === 'http' || item.engine === 'ytdlp' ? item.engine : await classifyUrl(item.url);
      this.repo.update(item.id, { engine: kind });

      const result =
        kind === 'http' ? await this.runHttpTransfer(item) : await this.runYtDlpTransfer(item);

      this.repo.update(item.id, {
        status: 'completed',
        percent: 100,
        speed: 0,
        eta: 0,
        bytesDownloaded: result.bytesDownloaded,
        totalBytes: result.totalBytes,
        filePath: result.filePath,
        thumbnailPath: result.thumbnailPath ?? null,
        finishedAt: new Date().toISOString(),
      });
      this.emit('download-completed', { downloadId: item.id, timestamp: new Date().toISOString() });
      this.notifications.send({
        level: 'info',
        title: 'Download completed',
        message: `"${item.title ?? item.fileName}" finished downloading`,
        data: { downloadId: item.id },
      });
    } catch (error) {
      await this.handleRunError(item, error);
    }
  }

  private async handleRunError(item: DownloadQueueRecord, error: unknown): Promise<void> {
    if (error instanceof TransferStoppedError) {
      // ponytail: pause/cancel already wrote the terminal status before
      // stopping the transfer — only backfill if the row is untouched.
      const fresh = this.repo.get(item.id);
      if (fresh !== undefined && fresh.status === 'downloading') {
        this.repo.update(item.id, {
          status: error.reason,
          speed: 0,
          eta: 0,
          ...(error.reason === 'cancelled' ? { finishedAt: new Date().toISOString() } : {}),
        });
        this.emit(
          error.reason === 'paused' ? 'download-paused' : 'download-cancelled',
          { downloadId: item.id, timestamp: new Date().toISOString() },
        );
      }
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn({ downloadId: item.id, error: message }, 'download attempt failed');

    const fresh = this.repo.get(item.id);
    if (fresh === undefined || fresh.status !== 'downloading') {
      return; // removed or user-stopped meanwhile — do not resurrect
    }

    const retries = fresh.retries + 1;
    if (retries <= fresh.maxRetries) {
      this.repo.update(item.id, { status: 'queued', retries, error: message });
      this.logger.info({ downloadId: item.id, retries }, 'download requeued for retry');
      return;
    }

    this.repo.update(item.id, { status: 'failed', error: message, finishedAt: new Date().toISOString() });
    this.emit('download-failed', { downloadId: item.id, error: message, timestamp: new Date().toISOString() });
    this.notifications.send({
      level: 'error',
      title: 'Download failed',
      message: `"${item.title ?? item.fileName}" failed: ${message.slice(0, 120)}`,
      data: { downloadId: item.id },
    });
  }

  private handleProgress(
    id: string,
    progress: TransferProgress,
  ): void {
    const now = Date.now();
    const lastWrite = this.lastProgressWrite.get(id) ?? 0;
    const shouldPersist = now - lastWrite >= PROGRESS_WRITE_THROTTLE_MS || progress.percent >= 100;
    if (!shouldPersist) return;
    this.lastProgressWrite.set(id, now);

    this.repo.update(id, {
      bytesDownloaded: Math.round(progress.bytesDownloaded),
      totalBytes: Math.round(progress.totalBytes),
      speed: Math.round(progress.speed),
      eta: Math.round(progress.eta),
      percent: Math.min(100, Math.max(0, Math.round(progress.percent))),
    });
    this.emit('download-progress', {
      downloadId: id,
      percent: progress.percent,
      speed: progress.speed,
      eta: progress.eta,
      timestamp: new Date().toISOString(),
    });
  }

  private lastProgressWrite = new Map<string, number>();

  private resolveDestination(destination: string): string {
    if (isAbsolute(destination)) return resolve(destination);
    return join(this.deps.defaultDestinationDir(), destination);
  }

  /**
   * ponytail: direct HTTP downloads have no metadata source, so generate a
   * poster frame with ffmpeg for video files (same pattern as recordings).
   * Non-fatal: a missing thumbnail never fails the download.
   */
  private async generateFallbackThumbnail(filePath: string): Promise<string | undefined> {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    if (!VIDEO_EXTENSIONS.includes(ext as (typeof VIDEO_EXTENSIONS)[number])) return undefined;
    const thumbPath = `${filePath}.thumb.jpg`;
    try {
      await this.ffmpeg.generateThumbnail(filePath, thumbPath, 5);
      return thumbPath;
    } catch (error) {
      this.logger.warn({ filePath, error }, 'thumbnail generation failed');
      return undefined;
    }
  }

  private async runHttpTransfer(
    item: DownloadQueueRecord,
  ): Promise<{ filePath: string; bytesDownloaded: number; totalBytes: number; thumbnailPath?: string }> {
    const dir = this.resolveDestination(item.destination);
    const finalPath = join(dir, item.fileName);
    const downloader = new HttpDownloader();
    this.transfers.set(item.id, downloader);
    try {
      const result = await downloader.download({
        url: item.url,
        filePath: finalPath,
        bandwidthLimit: this.deps.getLimits().downloadBandwidthLimit,
        onProgress: (progress) => this.handleProgress(item.id, progress),
      });
      const thumbnailPath = await this.generateFallbackThumbnail(result.filePath);
      return { ...result, thumbnailPath };
    } finally {
      this.transfers.delete(item.id);
      this.lastProgressWrite.delete(item.id);
    }
  }

  private async runYtDlpTransfer(
    item: DownloadQueueRecord,
  ): Promise<{ filePath: string; bytesDownloaded: number; totalBytes: number; thumbnailPath?: string }> {
    const dir = this.resolveDestination(item.destination);
    // ponytail: strip any extension the user typed — yt-dlp picks the real
    // container extension itself (and MP3 extraction replaces it entirely).
    const baseName = item.fileName.replace(/\.[a-z0-9]+$/i, '') || 'download';
    const outputTemplate = join(dir, baseName);

    const limit = this.deps.getLimits().downloadBandwidthLimit;
    this.transfers.set(item.id, {
      pause: () => {
        this.ytDlp.stopDownload(item.id);
      },
      cancel: () => {
        this.ytDlp.stopDownload(item.id);
      },
    });

    try {
      const result = await this.ytDlp.download(item.id, item.url, outputTemplate, {
        quality: item.quality === '' ? 'best' : item.quality,
        resume: true,
        audioOnly: item.audioOnly,
        writeThumbnail: true,
        limitRate: limit > 0 ? formatLimitRate(limit) : undefined,
      });

      if (result.stopped) {
        // ponytail: distinguish pause vs cancel by what the user asked for.
        const fresh = this.repo.get(item.id);
        const reason = fresh?.status === 'cancelled' ? 'cancelled' : 'paused';
        throw new TransferStoppedError(reason);
      }

      const located = await this.locateOutputFile(dir, baseName);
      // ponytail: yt-dlp often lands Twitch/YouTube HLS content as a raw
      // MPEG-TS (or MKV) file — remux into a real mp4 so the in-app player
      // (Chromium <video>) can play it. Best-effort, keeps original on failure.
      const normalized =
        located !== null
          ? await ensureMp4Container(this.ffmpeg, this.logger, { downloadId: item.id }, located)
          : null;
      const size = normalized !== null ? (await stat(normalized)).size : 0;
      const thumbnailPath = await this.locateThumbnailFile(dir, baseName);
      return {
        filePath: normalized ?? outputTemplate,
        bytesDownloaded: size,
        totalBytes: size,
        thumbnailPath,
      };
    } finally {
      this.transfers.delete(item.id);
      this.lastProgressWrite.delete(item.id);
    }
  }

  /**
   * yt-dlp chooses the final container extension itself (and MP3 extraction
   * replaces it), so scan the destination for the newest file matching the
   * requested base name instead of assuming one path.
   */
  /** Find a yt-dlp-written thumbnail (<base>.jpg/.webp/...) next to the media file. */
  private async locateThumbnailFile(dir: string, baseName: string): Promise<string | undefined> {
    try {
      const entries = await readdir(dir);
      const match = entries.find(
        (name) =>
          name.startsWith(baseName) &&
          THUMBNAIL_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)),
      );
      return match !== undefined ? join(dir, match) : undefined;
    } catch {
      return undefined;
    }
  }

  private async locateOutputFile(dir: string, baseName: string): Promise<string | null> {
    try {
      const entries = await readdir(dir);
      const candidates = entries.filter(
        (name) =>
          name.startsWith(baseName) &&
          !name.endsWith('.part') &&
          !name.endsWith('.ytdl') &&
          // ponytail: thumbnails share the base name — they are not the video.
          !THUMBNAIL_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)) &&
          name !== baseName,
      );
      if (candidates.length === 0) return null;
      let best: { name: string; mtimeMs: number } | null = null;
      for (const name of candidates) {
        try {
          const info = await stat(join(dir, name));
          if (best === null || info.mtimeMs > best.mtimeMs) {
            best = { name, mtimeMs: info.mtimeMs };
          }
        } catch {
          /* vanished mid-scan */
        }
      }
      return best !== null ? join(dir, best.name) : null;
    } catch {
      return null;
    }
  }

  private readonly deps: DownloadManagerOptions;
  private readonly ffmpeg = new FfmpegService();
}
