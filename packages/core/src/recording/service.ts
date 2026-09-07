import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
// ponytail: async fs only — the sync variants blocked the event loop during
// recording I/O, freezing the UI (especially on slower disks/smaller systems).
import {
  access,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { Logger } from '@rekordly/shared';
import { AppError } from '@rekordly/shared';
import type {
  StreamObject,
  RecordingEvent,
  RecordingSettings,
  FileVerificationResult,
} from '@rekordly/shared';
import type { RecordingRepo, RecordingJobRecord } from '@rekordly/database';
import type { NotificationService } from '../services/notification-service';
import { YtDlpService, isPidAlive, findRecordingProcessPids } from './yt-dlp';
import { FfmpegService } from './ffmpeg';
import { ensureMp4Container } from './container';
import { FileVerifier } from './verifier';

/** ponytail: non-blocking existence check (replaces sync existsSync). */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface RecordingServiceOptions {
  repo: RecordingRepo;
  notifications: NotificationService;
  logger: Logger;
  defaultOutputDir: string;
  /**
   * ponytail: re-resolve a live stream for a cancelled job (plugin
   * extractStream). Returning null / throwing means the broadcast is no
   * longer live and a resume attempt must fail with STREAM_OFFLINE.
   */
  resolveStream?: (job: RecordingJobRecord) => Promise<StreamObject | null>;
  /**
   * Live low-resource-mode flag read on every scheduling decision — when
   * true, concurrent recordings are capped to 1 and thumbnails are skipped.
   */
  isLowResourceMode?: () => boolean;
}

export interface RecordingServiceEvents {
  event: [event: RecordingEvent];
}

const DEFAULT_SETTINGS: RecordingSettings = {
  outputDir: '',
  defaultQuality: 'best',
  maxConcurrent: 3,
  bandwidthLimit: 0,
  retryCount: 3,
  retryDelay: 5000,
  verifyEnabled: true,
  thumbnailEnabled: true,
  metadataEnabled: true,
  namingTemplate: '{creator}_{date}_{time}',
};

/** Per-recording overrides supplied by the caller (UI). */
export interface StartRecordingOptions {
  /** Stop the recording after this many minutes. Omit = until stream ends. */
  durationMinutes?: number;
  /** Quality preference for this recording ('best' = default). */
  quality?: string;
  /**
   * ponytail: split the recording into parts every N minutes. Each part is
   * finalized to the Library normally; when the cap is reached a
   * `recording-segment-finished` event is emitted so the host can chain the
   * next segment after re-running its guardrails. 0/omit = single file.
   */
  segmentMinutes?: number;
  /**
   * ponytail: set when resuming a cancelled recording — the original final
   * path whose `.partN.mp4` siblings this session appends to.
   */
  resumeFrom?: string;
}

/**
 * Recording Service: manages the full recording lifecycle.
 * Never knows anything about websites.
 * Receives only the Standard Stream Object.
 */
export class RecordingService extends EventEmitter<RecordingServiceEvents> {
  private readonly repo: RecordingRepo;
  private readonly notifications: NotificationService;
  private readonly logger: Logger;
  private readonly ytDlp: YtDlpService;
  private readonly ffmpeg: FfmpegService;
  private readonly verifier: FileVerifier;
  private settings: RecordingSettings;
  private readonly resolveStream?: RecordingServiceOptions['resolveStream'];
  private readonly isLowResourceMode?: () => boolean;
  private readonly activeRecordings = new Map<string, AbortController>();
  /** Jobs currently being finalized because the live stream ended. */
  private readonly finalizingJobs = new Set<string>();

  constructor(options: RecordingServiceOptions) {
    super();
    this.repo = options.repo;
    this.notifications = options.notifications;
    this.logger = options.logger;
    this.ytDlp = new YtDlpService();
    this.ffmpeg = new FfmpegService();
    this.verifier = new FileVerifier();
    this.resolveStream = options.resolveStream;
    this.isLowResourceMode = options.isLowResourceMode;
    this.settings = { ...DEFAULT_SETTINGS, outputDir: options.defaultOutputDir };

    // ponytail: progress events carry the jobId — update only that job
    this.ytDlp.on('progress', (jobId, progress) => {
      this.repo.updateJob(jobId, {
        bytesDownloaded: progress.bytesDownloaded,
        speed: progress.speed,
        eta: progress.eta,
        percent: progress.percent,
      });
    });

    // ponytail: persist the downloader's OS pid so the job can be re-adopted
    // after an app restart (autonomous recorder — the yt-dlp/ffmpeg child
    // keeps recording even when the app window is closed).
    this.ytDlp.on('spawned', (jobId, pid) => {
      this.repo.updateJob(jobId, { pid });
    });
  }

  // --- Lifecycle ------------------------------------------------------------

  /** Effective concurrency cap: Low-Resource Mode forces a single slot. */
  private get effectiveMaxConcurrent(): number {
    return this.isLowResourceMode?.() === true ? 1 : this.settings.maxConcurrent;
  }

  async startRecording(stream: StreamObject, options: StartRecordingOptions = {}): Promise<string> {
    const activeCount = this.repo.listJobs('recording').length;
    if (activeCount >= this.effectiveMaxConcurrent) {
      throw new AppError({
        code: 'MAX_CONCURRENT_RECORDINGS',
        message: `Maximum concurrent recordings (${this.effectiveMaxConcurrent}) reached`,
        recoverable: true,
      });
    }

    const jobId = randomUUID();
    const now = new Date().toISOString();
    const title = this.generateTitle(stream);

    const jobRecord: RecordingJobRecord = {
      id: jobId,
      creatorId: stream.creatorId !== '' ? stream.creatorId : null,
      pluginId: stream.platformId,
      streamUrl: stream.streamUrl,
      title,
      platformId: stream.platformId,
      thumbnail: stream.thumbnail,
      quality: options.quality ?? this.settings.defaultQuality,
      status: 'preparing',
      attempts: 0,
      maxAttempts: this.settings.retryCount,
      bytesDownloaded: 0,
      speed: 0,
      eta: 0,
      percent: 0,
      verified: false,
      createdAt: now,
    };

    this.repo.createJob(jobRecord);

    this.emitEvent({
      type: 'recording-queued',
      jobId,
      timestamp: now,
    });

    this.notifications.send({
      level: 'info',
      title: 'Recording queued',
      message: `Recording "${title}" has been queued`,
      data: { jobId },
    });

    // Start the recording pipeline asynchronously
    this.processRecording(jobId, stream, options).catch((error) => {
      this.logger.error({ jobId, error }, 'recording pipeline failed');
    });

    return jobId;
  }

  async pauseRecording(jobId: string): Promise<void> {
    const job = this.repo.getJob(jobId);
    if (job === undefined) {
      throw new AppError({ code: 'JOB_NOT_FOUND', message: `Recording job ${jobId} not found` });
    }
    if (job.status !== 'recording') {
      throw new AppError({
        code: 'INVALID_STATE',
        message: `Cannot pause recording in state: ${job.status}`,
        recoverable: true,
      });
    }

    this.repo.updateJob(jobId, { status: 'paused' });
    this.emitEvent({
      type: 'recording-paused',
      jobId,
      timestamp: new Date().toISOString(),
    });
  }

  async resumeRecording(jobId: string): Promise<void> {
    const job = this.repo.getJob(jobId);
    if (job === undefined) {
      throw new AppError({ code: 'JOB_NOT_FOUND', message: `Recording job ${jobId} not found` });
    }

    if (job.status === 'paused') {
      this.repo.updateJob(jobId, { status: 'recording' });
      this.emitEvent({
        type: 'recording-resumed',
        jobId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ponytail: resuming a cancelled recording continues the capture into a
    // numbered part file — only possible while the broadcast is still live.
    if (job.status === 'cancelled') {
      const partialPath = job.filePath;
      if (
        typeof partialPath !== 'string' ||
        partialPath === '' ||
        !(await fileExists(partialPath))
      ) {
        throw new AppError({
          code: 'INVALID_STATE',
          message: 'No partial file to resume — use Retry to start a fresh recording.',
          recoverable: true,
        });
      }

      const activeCount = this.repo.listJobs('recording').length;
      if (activeCount >= this.effectiveMaxConcurrent) {
        throw new AppError({
          code: 'MAX_CONCURRENT_RECORDINGS',
          message: `Maximum concurrent recordings (${this.effectiveMaxConcurrent}) reached`,
          recoverable: true,
        });
      }

      // Liveness check + fresh stream URL (the old one has expired by now).
      // resolveStream returning null / throwing means the broadcast ended.
      let stream: StreamObject | null = null;
      if (this.resolveStream !== undefined) {
        try {
          stream = await this.resolveStream(job);
        } catch (error) {
          this.logger.warn({ jobId, error }, 'stream re-resolution failed during resume');
        }
      }
      if (stream === null) {
        throw new AppError({
          code: 'STREAM_OFFLINE',
          message: 'Broadcast is no longer live — cannot resume this recording.',
          recoverable: true,
        });
      }

      // Preserve the partial as part 1 of the eventually merged file.
      const part1 = partialPath.replace(/\.mp4$/i, '.part1.mp4');
      await rename(partialPath, part1);

      this.repo.updateJob(jobId, {
        status: 'queued',
        error: null,
        streamUrl: stream.streamUrl,
        bytesDownloaded: 0,
        speed: 0,
        eta: 0,
        percent: 0,
        finishedAt: null,
      });
      this.emitEvent({
        type: 'recording-queued',
        jobId,
        timestamp: new Date().toISOString(),
      });

      this.notifications.send({
        level: 'info',
        title: 'Recording resumed',
        message: `Continuing recording "${job.title}"`,
        data: { jobId },
      });

      this.processRecording(jobId, { ...stream, title: job.title }, {
        quality: job.quality ?? undefined,
        resumeFrom: partialPath,
      }).catch((error) => {
        this.logger.error({ jobId, error }, 'recording resume pipeline failed');
      });
      return;
    }

    throw new AppError({
      code: 'INVALID_STATE',
      message: `Cannot resume recording in state: ${job.status}`,
      recoverable: true,
    });
  }

  async cancelRecording(jobId: string): Promise<void> {
    const job = this.repo.getJob(jobId);
    if (job === undefined) {
      throw new AppError({ code: 'JOB_NOT_FOUND', message: `Recording job ${jobId} not found` });
    }

    const controller = this.activeRecordings.get(jobId);
    if (controller !== undefined) {
      controller.abort();
      this.activeRecordings.delete(jobId);
    }

    this.ytDlp.cancelDownload(jobId);
    // ponytail: adopted orphaned recordings have no ChildProcess handle in
    // this session — kill the whole tree by the persisted pid instead.
    if (job.pid !== null && job.pid !== undefined) this.ytDlp.stopPidTree(job.pid);
    this.repo.updateJob(jobId, { status: 'cancelled', finishedAt: new Date().toISOString() });

    this.emitEvent({
      type: 'recording-cancelled',
      jobId,
      timestamp: new Date().toISOString(),
    });

    this.notifications.send({
      level: 'info',
      title: 'Recording cancelled',
      message: `Recording "${job.title}" was cancelled`,
      data: { jobId },
    });
  }

  /**
   * Remove a finished job from the queue history. Only terminal states
   * (failed / completed / cancelled) can be removed — active recordings
   * must be cancelled first.
   */
  removeJob(jobId: string): void {
    const job = this.repo.getJob(jobId);
    if (job === undefined) {
      throw new AppError({ code: 'JOB_NOT_FOUND', message: `Recording job ${jobId} not found` });
    }
    const TERMINAL = ['failed', 'completed', 'cancelled'];
    if (!TERMINAL.includes(job.status)) {
      throw new AppError({
        code: 'INVALID_STATE',
        message: `Cannot remove a job in state: ${job.status}. Cancel it first.`,
        recoverable: true,
      });
    }
    this.repo.removeJob(jobId);
    this.logger.info({ jobId }, 'recording job removed');
  }

  /** Remove every failed (and cancelled) job. Returns the number of jobs removed. */
  clearFailedJobs(): number {
    const failed = [
      ...this.repo.listJobs('failed'),
      ...this.repo.listJobs('cancelled'),
    ];
    for (const job of failed) {
      this.repo.removeJob(job.id);
    }
    if (failed.length > 0) {
      this.logger.info({ count: failed.length }, 'cleared failed recording jobs');
    }
    return failed.length;
  }

  async retryRecording(jobId: string): Promise<void> {
    const job = this.repo.getJob(jobId);
    if (job === undefined) {
      throw new AppError({ code: 'JOB_NOT_FOUND', message: `Recording job ${jobId} not found` });
    }
    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new AppError({
        code: 'INVALID_STATE',
        message: `Cannot retry recording in state: ${job.status}`,
        recoverable: true,
      });
    }

    const activeCount = this.repo.listJobs('recording').length;
    if (activeCount >= this.effectiveMaxConcurrent) {
      throw new AppError({
        code: 'MAX_CONCURRENT_RECORDINGS',
        message: `Maximum concurrent recordings (${this.effectiveMaxConcurrent}) reached`,
        recoverable: true,
      });
    }

    // ponytail: rebuild the Standard Stream Object from the stored job so the
    // pipeline can be re-run. The naming template is '{creator}_{date}_{time}',
    // so the creator name is the first underscore-separated token of the title.
    const stream: StreamObject = {
      creatorId: job.creatorId ?? '',
      creatorName: job.title.split('_')[0] || job.creatorId || job.platformId,
      platformId: job.platformId,
      title: job.title,
      streamUrl: job.streamUrl,
      thumbnail: job.thumbnail ?? undefined,
    };

    this.repo.updateJob(jobId, {
      status: 'queued',
      attempts: 0,
      error: null,
      bytesDownloaded: 0,
      speed: 0,
      eta: 0,
      percent: 0,
      finishedAt: null,
      pid: null,
    });

    this.emitEvent({
      type: 'recording-queued',
      jobId,
      timestamp: new Date().toISOString(),
    });

    this.notifications.send({
      level: 'info',
      title: 'Recording queued',
      message: `Recording "${job.title}" is being retried`,
      data: { jobId },
    });

    // Re-launch the recording pipeline asynchronously
    this.processRecording(jobId, stream, {
      quality: job.quality ?? undefined,
    }).catch((error) => {
      this.logger.error({ jobId, error }, 'recording retry pipeline failed');
    });
  }

  /**
   * Finalize all active recordings for a creator (called when the live
   * stream ends). The downloader is asked to stop gracefully and whatever
   * has been recorded so far is kept and post-processed.
   */
  async stopForCreator(creatorId: string, reason = 'stream-ended'): Promise<number> {
    const active = this.repo.listJobs('recording').filter((job) => job.creatorId === creatorId);
    for (const job of active) {
      await this.finalizeRecording(job.id, reason);
    }
    return active.length;
  }

  /**
   * Gracefully finish a recording early: mark it `stopping`, notify, and
   * stop the underlying download process. The normal completion pipeline
   * (verify → thumbnail → metadata → library record) then runs on the
   * partial file.
   */
  async finalizeRecording(jobId: string, reason = 'stream-ended'): Promise<void> {
    const job = this.repo.getJob(jobId);
    if (job === undefined) return;
    if (job.status !== 'recording') return;
    if (this.finalizingJobs.has(jobId)) return;

    this.finalizingJobs.add(jobId);
    this.repo.updateJob(jobId, { status: 'stopping' });

    this.emitEvent({
      type: 'recording-finalized',
      jobId,
      timestamp: new Date().toISOString(),
    });

    this.notifications.send({
      level: 'info',
      title: 'Recording finalized',
      message: `Stream ended — saving recording "${job.title}" (${reason})`,
      data: { jobId, reason },
    });

    const stopped = this.ytDlp.stopDownload(jobId);
    // ponytail: adopted orphaned recordings have no ChildProcess handle in
    // this session — kill the whole tree by the persisted pid instead.
    if (!stopped && job.pid !== null && job.pid !== undefined) {
      this.ytDlp.stopPidTree(job.pid);
    }
  }

  // --- Queries --------------------------------------------------------------

  /**
   * ponytail: reconcile jobs left non-terminal by an app crash/restart.
   * Jobs whose recorded pid is STILL ALIVE are adopted (the yt-dlp/ffmpeg
   * child kept recording while the app was closed) — a file-growth watcher
   * finalizes them into the Library once the process exits. Jobs whose pid
   * is missing or dead get one command-line-scan fallback, then the old
   * behavior applies: marked failed so no zombie recording cards linger.
   * Returns the number of adopted recordings.
   */
  recoverStaleJobs(): number {
    const TERMINAL = ['failed', 'completed', 'cancelled'];
    const RECORDER_NAMES = ['ffmpeg.exe', 'yt-dlp.exe'];
    const stale = this.getJobs().filter((job) => !TERMINAL.includes(job.status));
    const now = new Date().toISOString();
    let adopted = 0;
    for (const job of stale) {
      const pidLive =
        job.pid !== null && job.pid !== undefined && isPidAlive(job.pid, RECORDER_NAMES);
      // ponytail: fallback — the pid write may never have landed before the
      // app closed. Scan running recorder processes by output-path fragment.
      const scanned =
        pidLive
          ? []
          : job.filePath !== null && job.filePath !== undefined && job.filePath !== ''
            ? findRecordingProcessPids(job.filePath)
            : [];
      const pid = pidLive ? job.pid! : (scanned[0] ?? null);
      if (pid !== null) {
        this.repo.updateJob(job.id, { status: 'recording', error: null, pid });
        void this.watchOrphanedJob(job.id, { stable: 0, idle: 0, lastSize: -1 });
        this.emitEvent({ type: 'recording-started', jobId: job.id, timestamp: now });
        this.notifications.send({
          level: 'info',
          title: 'Recording re-attached',
          message: `${job.title} kept recording while the app was closed — it is still being captured.`,
          data: { jobId: job.id },
        });
        this.logger.info(
          { jobId: job.id, pid, viaCommandLineScan: !pidLive },
          'adopted orphaned recording process',
        );
        adopted++;
      } else {
        this.repo.updateJob(job.id, {
          status: 'failed',
          error: 'App restarted while the recording was active',
          finishedAt: now,
        });
      }
    }
    const failedCount = stale.length - adopted;
    if (adopted > 0) this.logger.info({ adopted }, 're-attached orphaned recordings');
    if (failedCount > 0) {
      this.logger.warn({ count: failedCount }, 'marked stale recording jobs as failed');
    }
    return adopted;
  }

  /**
   * ponytail: file-growth watcher for an adopted orphaned recording. The
   * child process has no handle in this session, so progress is proxied by
   * polling the output file's size; once the process is gone AND the file
   * has stopped growing, the recording is finalized into the Library.
   * A stalled orphan (process alive but no growth for 5 minutes) is killed
   * and salvaged instead of being watched forever.
   */
  private async watchOrphanedJob(
    jobId: string,
    state: { stable: number; idle: number; lastSize: number },
  ): Promise<void> {
    const POLL_MS = 5000;
    const MAX_IDLE_POLLS = 60; // 5 min without growth = stalled
    const job = this.repo.getJob(jobId);
    if (job === undefined) return;
    const TERMINAL = ['failed', 'completed', 'cancelled'];
    if (TERMINAL.includes(job.status)) return;
    if (job.pid === null || job.pid === undefined) return;

    let size = state.lastSize;
    if (job.filePath !== null && job.filePath !== undefined && job.filePath !== '') {
      try {
        size = (await stat(job.filePath)).size;
        // ponytail: no stdout pipes anymore — file size is the only
        // progress signal available for an adopted job.
        this.repo.updateJob(jobId, { bytesDownloaded: size, speed: 0 });
      } catch {
        size = 0;
      }
    }

    if (isPidAlive(job.pid, ['ffmpeg.exe', 'yt-dlp.exe'])) {
      state.idle =
        size === state.lastSize && state.lastSize >= 0 ? state.idle + 1 : 0;
      state.lastSize = size;
      if (state.idle >= MAX_IDLE_POLLS) {
        this.logger.warn({ jobId, pid: job.pid }, 'orphaned recording stalled — stopping it');
        this.ytDlp.stopPidTree(job.pid);
      }
      setTimeout(() => void this.watchOrphanedJob(jobId, state), POLL_MS).unref?.();
      return;
    }

    // Process is gone — require the file to be stable for a couple of
    // polls (ffmpeg flushes its tail right before exiting).
    const grew = size !== state.lastSize;
    state.lastSize = size;
    if (grew && state.stable < 5) {
      state.stable += 1;
      setTimeout(() => void this.watchOrphanedJob(jobId, state), POLL_MS).unref?.();
      return;
    }
    await this.finalizeOrphanedJob(jobId);
  }

  /**
   * ponytail: save an adopted orphaned recording (its process finished while
   * the app was closed) into the Library — same post-processing as the
   * normal pipeline: promote temp file, normalize container, repair,
   * thumbnail + metadata.
   */
  private async finalizeOrphanedJob(jobId: string): Promise<void> {
    const job = this.repo.getJob(jobId);
    if (job === undefined) return;
    const TERMINAL = ['failed', 'completed', 'cancelled'];
    if (TERMINAL.includes(job.status)) return;
    try {
      if (job.filePath === null || job.filePath === undefined || job.filePath === '') {
        throw new AppError({
          code: 'RECORDING_FILE_MISSING',
          message: 'Adopted recording has no output path',
          recoverable: true,
        });
      }
      this.repo.updateJob(jobId, { status: 'processing' });
      const resolved = await this.resolveDownloadedFile(job.filePath);
      if (resolved === null) {
        throw new AppError({
          code: 'RECORDING_NO_DATA',
          message: 'No recording data was written — nothing to salvage.',
          recoverable: true,
        });
      }
      const normalized = await this.normalizeContainer(jobId, resolved);
      await this.repairPartialFile(normalized);
      const stream: StreamObject = {
        creatorId: job.creatorId ?? '',
        creatorName: job.title.split('_')[0] || job.creatorId || job.platformId,
        platformId: job.platformId,
        title: job.title,
        streamUrl: job.streamUrl,
        thumbnail: job.thumbnail ?? undefined,
      };
      await this.saveToLibrary(jobId, stream, normalized, basename(normalized), 'completed');
      const now = new Date().toISOString();
      this.repo.updateJob(jobId, { status: 'completed', finishedAt: now, pid: null });
      this.emitEvent({ type: 'recording-completed', jobId, timestamp: now });
      this.notifications.send({
        level: 'info',
        title: 'Recording saved',
        message: `${job.title} finished while the app was closed and was saved to your Library.`,
        data: { jobId },
      });
    } catch (error) {
      const now = new Date().toISOString();
      this.repo.updateJob(jobId, {
        status: 'failed',
        error: 'Orphaned recording could not be finalized',
        finishedAt: now,
        pid: null,
      });
      this.emitEvent({ type: 'recording-failed', jobId, error: String(error), timestamp: now });
      this.logger.warn({ jobId, error }, 'orphaned recording finalization failed');
    }
  }

  getJobs(): RecordingJobRecord[] {
    return this.repo.listJobs();
  }

  getSettings(): RecordingSettings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<RecordingSettings>): RecordingSettings {
    this.settings = { ...this.settings, ...patch };
    return this.getSettings();
  }

  // --- Pipeline -------------------------------------------------------------

  private async processRecording(
    jobId: string,
    stream: StreamObject,
    options: StartRecordingOptions = {},
  ): Promise<void> {
    const controller = new AbortController();
    this.activeRecordings.set(jobId, controller);

    // ponytail: track the output path at the closure level so the catch block
    // can save partial files even when the job row has no filePath yet.
    let outputPath = '';

    try {
      // Prepare output directory
      const outputDir = join(this.settings.outputDir, stream.platformId, stream.creatorName);
      await mkdir(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = this.generateTitle(stream).replace(/[^a-zA-Z0-9_-]/g, '_');
      // ponytail: resumed sessions write to the next .partN.mp4 sibling of
      // the original file; parts are merged back into it when the session ends.
      outputPath =
        options.resumeFrom !== undefined
          ? await this.nextPartPath(options.resumeFrom)
          : join(outputDir, `${baseName}_${timestamp}.mp4`);

      // Update status to recording
      this.repo.updateJob(jobId, {
        status: 'recording',
        startedAt: new Date().toISOString(),
        // ponytail: remembered so an orphaned process can be re-adopted and
        // its output file watched after an app restart.
        filePath: outputPath,
      });
      this.emitEvent({
        type: 'recording-started',
        jobId,
        timestamp: new Date().toISOString(),
      });

      // ponytail: service-level duration watchdog — guarantees a time-limited
      // recording stops even if the downloader-level timer was never armed
      // (e.g. no parseable progress lines). finalizeRecording is idempotent,
      // and a no-op once the job left the 'recording' state.
      if (options.durationMinutes !== undefined && options.durationMinutes > 0) {
        const watchdog = setTimeout(
          () => void this.finalizeRecording(jobId, 'duration-limit-reached'),
          options.durationMinutes * 60 * 1000 + 15_000,
        );
        watchdog.unref?.();
      }

      // ponytail: segment-splitting watchdog — mirrors the duration watchdog
      // above but for segmentMinutes-based recordings. If the downloader-level
      // timer fails (ffmpeg ignores 'q', timer doesn't fire), this guarantees
      // the segment still gets finalized. finalizeRecording is idempotent, so
      // when the downloader timer fires normally this is a harmless no-op.
      if (options.segmentMinutes !== undefined && options.segmentMinutes > 0) {
        const segmentWatchdog = setTimeout(
          () => void this.finalizeRecording(jobId, 'segment-split-watchdog'),
          options.segmentMinutes * 60 * 1000 + 15_000,
        );
        segmentWatchdog.unref?.();
      }

      // ponytail: the stream may have ended while we were preparing — skip the download
      if (this.finalizingJobs.has(jobId)) {
        this.finalizingJobs.delete(jobId);
        this.repo.updateJob(jobId, { status: 'cancelled', finishedAt: new Date().toISOString() });
        return;
      }

      // Download with yt-dlp
      const downloadResult = await this.ytDlp.download(
        jobId,
        stream.streamUrl,
        outputPath,
        {
          quality: options.quality ?? this.settings.defaultQuality,
          headers: stream.headers,
          cookies: stream.cookies?.map((c) => ({ name: c.name, value: c.value })),
          resume: true,
          // ponytail: segmentMinutes (splitting) takes precedence over the
          // stop-after cap — the UI treats them as mutually exclusive.
          durationSeconds:
            options.segmentMinutes !== undefined && options.segmentMinutes > 0
              ? options.segmentMinutes * 60
              : options.durationMinutes !== undefined && options.durationMinutes > 0
                ? options.durationMinutes * 60
                : undefined,
        },
      );

      if (controller.signal.aborted) {
        // ponytail: user cancelled — the partial file is truncated (no moov
        // atom on Windows TerminateProcess). Remux-repair it so the file is
        // still playable, then keep it in the Library as a partial entry
        // (with thumbnail) so users never lose what was captured.
        let cancelPath = downloadResult.filePath;
        if (options.resumeFrom !== undefined) {
          cancelPath = await this.mergeParts(options.resumeFrom);
        }
        cancelPath = (await this.resolveDownloadedFile(cancelPath)) ?? cancelPath;
        if (await fileExists(cancelPath)) {
          cancelPath = await this.normalizeContainer(jobId, cancelPath);
          await this.repairPartialFile(cancelPath);
          await this.saveToLibrary(jobId, stream, cancelPath, basename(cancelPath), 'cancelled');
        } else {
          this.logger.warn({ jobId }, 'cancelled recording produced no file — nothing to keep');
        }
        this.repo.updateJob(jobId, { status: 'cancelled', finishedAt: new Date().toISOString() });
        return;
      }

      // ponytail: true when the stream ended and we stopped the downloader early
      const wasFinalized = downloadResult.stopped || this.finalizingJobs.delete(jobId);

      // Update status to processing
      this.repo.updateJob(jobId, { status: 'processing', pid: null });

      // ponytail: a resumed session merges its parts back into the original
      // file so the Library keeps a single entry per recording.
      let targetPath = downloadResult.filePath;
      if (options.resumeFrom !== undefined) {
        targetPath = await this.mergeParts(options.resumeFrom);
      }

      // ponytail: a killed download (duration cap / stream end) often leaves
      // yt-dlp's temp file ('.part') or a merge intermediate instead of the
      // final '.mp4' — resolve whatever was actually written, promote it to
      // the clean final name, and fail with a clear message when the capture
      // produced nothing at all (previously this crashed with a raw ENOENT).
      const resolvedPath = await this.resolveDownloadedFile(targetPath);
      if (resolvedPath === null) {
        throw new AppError({
          code: 'RECORDING_NO_DATA',
          message:
            'No recording data was written — the stream may have ended before capture started.',
          recoverable: true,
        });
      }
      if (resolvedPath !== targetPath) {
        try {
          await rm(targetPath, { force: true });
          await rename(resolvedPath, targetPath);
        } catch (error) {
          this.logger.warn({ jobId, resolvedPath, targetPath, error }, 'failed to promote resolved file');
          targetPath = resolvedPath;
        }
      }

      // ponytail: a promoted yt-dlp temp file is often a raw MPEG-TS stream
      // wearing an '.mp4' name. VLC plays it, but Chromium's <video> element
      // (the in-app player) cannot demux it — remux any non-mp4 container
      // into a proper faststart mp4 before verification/library.
      targetPath = await this.normalizeContainer(jobId, targetPath);

      // Verify the recording
      let verificationPassed = true;
      if (this.settings.verifyEnabled) {
        this.emitEvent({
          type: 'verification-started',
          jobId,
          timestamp: new Date().toISOString(),
        });

        let verification = await this.verifier.verify(targetPath);

        // ponytail: a stream-ended recording is truncated by design — the mp4
        // moov atom may be missing. Try a remux repair before giving up.
        if (!verification.integrity && wasFinalized) {
          verification = await this.repairPartialFile(targetPath);
        }

        verificationPassed = verification.integrity;
        if (!verification.integrity && !wasFinalized) {
          throw new AppError({
            code: 'VERIFICATION_FAILED',
            message: `File verification failed: ${verification.errors.join(', ')}`,
            recoverable: true,
          });
        }

        this.emitEvent({
          type: 'verification-completed',
          jobId,
          timestamp: new Date().toISOString(),
        });
      }

      // Create or refresh the Library record (reused across resumes)
      const now = new Date().toISOString();
      const { recordingId, thumbnailPath } = await this.saveToLibrary(
        jobId,
        stream,
        targetPath,
        basename(targetPath),
        'completed',
      );

      // Update job status
      this.repo.updateJob(jobId, {
        status: 'completed',
        verified: verificationPassed,
        filePath: targetPath,
        thumbnailPath,
        finishedAt: now,
      });

      this.emitEvent({
        type: 'recording-completed',
        jobId,
        recordingId,
        timestamp: now,
      });

      this.notifications.send({
        level: 'info',
        title: 'Recording completed',
        message: `Recording "${stream.title}" completed successfully`,
        data: { jobId, recordingId },
      });

      // ponytail: segment chaining — when this completion was a duration-cap
      // split (not a user stop-after or stream end), tell the host so it can
      // re-run its guardrails and start the next segment. The event carries
      // the original StreamObject + options for the continuation.
      const chainable =
        options.segmentMinutes !== undefined &&
        options.segmentMinutes > 0 &&
        downloadResult.durationCapReached &&
        options.resumeFrom === undefined;
      if (chainable) {
        this.emitEvent({
          type: 'recording-segment-finished',
          jobId,
          recordingId,
          data: {
            stream: stream as unknown as Record<string, unknown>,
            options: {
              quality: options.quality,
              segmentMinutes: options.segmentMinutes,
            } as unknown as Record<string, unknown>,
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.repo.updateJob(jobId, {
        status: 'failed',
        error: errorMsg,
        finishedAt: new Date().toISOString(),
      });

      // ponytail: even on failure, a partial file may exist on disk (killed
      // download, verification failure, etc.). Save it to the Library with a
      // 'failed' status and a thumbnail so the user never loses captured data.
      try {
        if (outputPath) {
          const resolved = await this.resolveDownloadedFile(outputPath);
          if (resolved !== null) {
            const normalized = await this.normalizeContainer(jobId, resolved);
            await this.repairPartialFile(normalized);
            await this.saveToLibrary(jobId, stream, normalized, basename(normalized), 'failed');
          }
        }
      } catch (saveError) {
        this.logger.warn({ jobId, error: saveError }, 'failed to save partial recording to library');
      }

      this.emitEvent({
        type: 'recording-failed',
        jobId,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });

      this.notifications.send({
        level: 'error',
        title: 'Recording failed',
        message: `Recording failed: ${errorMsg}`,
        data: { jobId },
      });

      this.logger.error({ jobId, error }, 'recording failed');
    } finally {
      this.activeRecordings.delete(jobId);
    }
  }

  /**
   * ponytail: remux non-mp4 containers (raw MPEG-TS temp files from killed
   * yt-dlp downloads) into a real faststart mp4 that Chromium's <video> can
   * play. Best-effort: on failure the original file is kept untouched.
   */
  private async normalizeContainer(jobId: string, filePath: string): Promise<string> {
    return ensureMp4Container(this.ffmpeg, this.logger, { jobId }, filePath);
  }

  /**
   * ponytail: locate the file a (possibly killed) download actually wrote.
   * yt-dlp downloads into '<output>.part' and format merges leave
   * '<output>.fNNN.ext' intermediates — the final '.mp4' only appears on a
   * clean exit. Returns the final path when it exists, otherwise the
   * largest sibling temp/intermediate, or null when nothing was written.
   */
  private async resolveDownloadedFile(filePath: string): Promise<string | null> {
    if (await fileExists(filePath)) return filePath;
    const dir = dirname(filePath);
    const base = basename(filePath);
    const candidates: Array<{ path: string; size: number }> = [];
    try {
      for (const name of await readdir(dir)) {
        if (name === base || !name.startsWith(base)) continue;
        const full = join(dir, name);
        try {
          candidates.push({ path: full, size: (await stat(full)).size });
        } catch {
          /* file vanished between listing and stat */
        }
      }
    } catch {
      return null;
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.size - a.size);
    return candidates[0]!.path;
  }

  /**
   * Attempt to make a truncated (stream-ended) recording playable by
   * remuxing it into a fresh mp4 container. Returns the verification of the
   * repaired file; on failure the original file is left untouched.
   */
  private async repairPartialFile(filePath: string): Promise<FileVerificationResult> {
    const repairedPath = `${filePath}.repair.mp4`;
    try {
      await this.ffmpeg.remux(filePath, repairedPath, { format: 'mp4' });
      if (!(await fileExists(repairedPath)) || (await stat(repairedPath)).size === 0) {
        throw new Error('repaired file is empty');
      }
      const verification = await this.verifier.verify(repairedPath);
      if (!verification.integrity) {
        throw new Error('repaired file still fails verification');
      }
      // Replace the broken original with the repaired file
      await rm(filePath, { force: true });
      await rename(repairedPath, filePath);
      this.logger.info({ filePath }, 'repaired truncated recording');
      return verification;
    } catch (error) {
      this.logger.warn({ filePath, error }, 'partial recording repair failed');
      if (await fileExists(repairedPath)) {
        await rm(repairedPath, { force: true });
      }
      return this.verifier.verify(filePath);
    }
  }

  /** Next `.partN.mp4` sibling for a resumed session's output file. */
  private async nextPartPath(finalPath: string): Promise<string> {
    const dir = dirname(finalPath);
    const base = basename(finalPath).replace(/\.mp4$/i, '');
    let max = 0;
    try {
      for (const name of await readdir(dir)) {
        const match = name.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.part(\\d+)\\.mp4$`));
        if (match !== null) max = Math.max(max, parseInt(match[1]!, 10));
      }
    } catch {
      /* directory unreadable — start at part 1 */
    }
    return join(dir, `${base}.part${max + 1}.mp4`);
  }

  /**
   * Merge all `<final>.partN.mp4` siblings back into `<final>` via ffmpeg
   * concat. Falls back to the first (largest-so-far) part when merging fails
   * (e.g. codec mismatch between sessions).
   */
  private async mergeParts(finalPath: string): Promise<string> {
    const dir = dirname(finalPath);
    const base = basename(finalPath).replace(/\.mp4$/i, '');
    let parts: string[] = [];
    try {
      parts = (await readdir(dir))
        .filter((n) => n.startsWith(`${base}.part`) && n.endsWith('.mp4'))
        .sort();
    } catch {
      return finalPath;
    }
    if (parts.length === 0) return finalPath;

    if (parts.length === 1) {
      // single part — just promote it to the final name
      await rm(finalPath, { force: true });
      await rename(join(dir, parts[0]!), finalPath);
      return finalPath;
    }

    const listPath = join(dir, `${base}.concat.txt`);
    await writeFile(
      listPath,
      parts.map((p) => `file '${join(dir, p).replace(/'/g, '"')}'`).join(String.fromCharCode(10)),
    );
    try {
      await this.ffmpeg.concat(listPath, finalPath);
      for (const p of parts) await rm(join(dir, p), { force: true });
      this.logger.info({ finalPath, parts: parts.length }, 'merged resumed recording parts');
      return finalPath;
    } catch (error) {
      this.logger.warn({ finalPath, error }, 'part merge failed — keeping first part');
      return join(dir, parts[0]!);
    } finally {
      await rm(listPath, { force: true });
    }
  }

  /**
   * Generate thumbnail + metadata and upsert the Library row for a finished
   * (or cancelled-partial) recording. Reuses the existing row on resumes so
   * there is exactly one Library entry per job.
   */
  private async saveToLibrary(
    jobId: string,
    stream: StreamObject,
    filePath: string,
    fileName: string,
    status: 'completed' | 'cancelled' | 'failed',
  ): Promise<{ recordingId: string; thumbnailPath?: string }> {
    // Generate thumbnail (skipped in Low-Resource Mode to save disk/CPU)
    let thumbnailPath: string | undefined;
    if (this.settings.thumbnailEnabled && this.isLowResourceMode?.() !== true) {
      try {
        const candidate = `${filePath}.thumb.jpg`;
        await this.ffmpeg.generateThumbnail(filePath, candidate);
        // ponytail: only persist the path when the file actually exists —
        // otherwise the Library shows a permanently broken image.
        if (await fileExists(candidate)) {
          thumbnailPath = candidate;
        }
      } catch (error) {
        this.logger.warn({ jobId, error }, 'thumbnail generation failed');
      }
    }

    // Extract metadata
    let metadata: Record<string, unknown> = {};
    if (this.settings.metadataEnabled) {
      try {
        metadata = await this.ffmpeg.getMetadata(filePath);
      } catch (error) {
        this.logger.warn({ jobId, error }, 'metadata extraction failed');
      }
    }

    // ponytail: guard — a missing file previously crashed with a raw ENOENT
    // stat error instead of a clear, recoverable failure.
    if (!(await fileExists(filePath))) {
      throw new AppError({
        code: 'RECORDING_FILE_MISSING',
        message: `Recording file was not written: ${filePath}`,
        recoverable: true,
      });
    }

    const now = new Date().toISOString();
    const stat_ = await stat(filePath);
    const fields = {
      creatorId: null,
      jobId,
      // ponytail: use the job's generated title ('{creator}_{date}_{time}',
      // same as the file on disk) — the raw stream title ('Your favorite
      // French streamer…') told the user nothing about WHO was recorded.
      title: this.repo.getJob(jobId)?.title ?? stream.title,
      platformId: stream.platformId,
      fileName,
      filePath,
      thumbnailPath,
      status,
      quality: this.repo.getJob(jobId)?.quality ?? this.settings.defaultQuality,
      resolution: (metadata as { resolution?: string }).resolution,
      sizeBytes: stat_.size,
      durationSeconds: (metadata as { duration?: number }).duration,
      videoCodec: (metadata as { videoCodec?: string }).videoCodec,
      audioCodec: (metadata as { audioCodec?: string }).audioCodec,
      bitrate: (metadata as { bitrate?: number }).bitrate,
      fps: (metadata as { fps?: number }).fps,
      isFavorite: false,
      startedAt: this.repo.getJob(jobId)?.startedAt,
      endedAt: now,
      updatedAt: now,
    };

    // ponytail: resumed sessions refresh the existing row instead of
    // creating a duplicate Library entry.
    const existing = this.repo.listRecordings().find((r) => r.jobId === jobId);
    if (existing !== undefined) {
      this.repo.updateRecording(existing.id, fields);
      return { recordingId: existing.id, thumbnailPath };
    }

    const recordingId = randomUUID();
    this.repo.createRecording({ ...fields, id: recordingId, createdAt: now });
    return { recordingId, thumbnailPath };
  }

  private generateTitle(stream: StreamObject): string {
    const now = new Date();
    const date = now.toISOString().split('T')[0]!;
    const time = now.toTimeString().split(' ')[0]!.replace(/:/g, '-');
    return this.settings.namingTemplate
      .replace('{creator}', stream.creatorName)
      .replace('{title}', stream.title)
      .replace('{platform}', stream.platformId)
      .replace('{date}', date)
      .replace('{time}', time);
  }

  private emitEvent(event: RecordingEvent): void {
    this.emit('event', event);
  }

  /**
   * Get all active child process PIDs from yt-dlp/ffmpeg.
   * Used by ProcessMonitorService to poll resource usage.
   */
  getActiveChildPids(): Array<{ pid: number; type: 'yt-dlp' | 'ffmpeg' }> {
    return this.ytDlp.getActivePids();
  }
}
