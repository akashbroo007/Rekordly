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
  statfs,
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
import type { RecordingRepo, RecordingJobRecord, RecordingRecord } from '@rekordly/database';
import type { NotificationService } from '../services/notification-service';
import type { Entitlements } from '../services/entitlements';
import type { GateNotifier } from '../services/gate-notifier';
import { YtDlpService, isPidAliveAsync, listRecorderProcessesAsync, parseQualityHeight } from './yt-dlp';
import type { YtDlpProgress } from './yt-dlp';
import { isDirectHlsUrl, requiresLiveTranscode } from './backend';
import { WorkQueue } from './post-queue';
import { classifyCaptureFailure, computeBackoffMs } from './failures';
import type { WorkerState } from './backend';
import { WorkerStateMachine } from './worker-state';
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

/** Non-blocking wait used for jittered re-resolve backoff (plan §4). */
async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, ms));
    timer.unref?.();
  });
}

/**
 * ponytail: below this duration a "clean" capture end is junk, not a
 * recording — the buffered HLS window of a network blip (see the instant-end
 * retry in the capture loop). Streams that genuinely end this fast are
 * better surfaced as retried-then-failed than as useless 1s "completed"
 * entries. Injectable so fixture-backed tests with tiny media can opt out.
 */
const DEFAULT_MIN_MEANINGFUL_CAPTURE_SECONDS = 15;

/** plan §10: progress snapshots are identical — no DB write needed. */
function sameProgress(a: YtDlpProgress | null, b: YtDlpProgress): boolean {
  return (
    a !== null &&
    a.bytesDownloaded === b.bytesDownloaded &&
    a.speed === b.speed &&
    a.eta === b.eta &&
    a.percent === b.percent
  );
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
  /**
   * plan §10: progress flush cadence. Overridable for tests; production uses
   * PROGRESS_FLUSH_MS so 30 streams cost ≤ ~15 DB writes/s combined.
   */
  progressFlushMs?: number;
  /**
   * plan §9: minimum free bytes required on the output drive before a queued
   * start launches. Reuses the existing Settings → Recording floor
   * (`autoRecordMinFreeDiskGb`); absent/≤0 disables the check (graceful).
   */
  getMinFreeBytes?: () => number;
  /** plan §9: minimum gap between capture launches (thundering-herd guard). */
  startGapMs?: number;
  /** Cooldown before a parked queued start is reconsidered (default 5s). */
  admissionRetryMs?: number;
  /**
   * ponytail: CRF used by the background quality-derivative transcode (the
   * "(480p)" files). Read live per transcode so the Settings knob applies
   * without a restart; default 23 = previous fixed behavior.
   */
  getDerivativeCrf?: () => number;
  /**
   * Pro tier gate: live entitlements read per scheduling decision. When the
   * tier's concurrency limit is lower than the user setting, the effective
   * cap is the minimum of the two (free tier clamps to 2).
   */
  getEntitlements?: () => Entitlements;
  /**
   * Pro tier gate notifications: persistent bell entry + OS notification on
   * every gate hit (cooldown-managed inside GateNotifier).
   */
  getGateNotifier?: () => GateNotifier | undefined;
  /**
   * ponytail: instant-end floor (see the capture loop). 0 disables the
   * check — fixture-backed tests with tiny media opt out; production uses
   * the default (15s).
   */
  minMeaningfulCaptureSeconds?: number;
}

/** Explicit per-scheduler resource cost (plan §6) — estimates stay optional. */
export interface RecordingResourceUsage {
  activeStreams: number;
  activeProcesses: number;
  /** Observed downstream bytes/s summed over capturing workers (copy ≈ disk). */
  estimatedNetworkBps?: number;
  estimatedDiskBps?: number;
  /** Owned by the Phase G transcode pool — always 0 until then. */
  activeTranscodes: number;
  queuedTranscodes: number;
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
  private readonly getEntitlements?: () => Entitlements;
  private readonly getGateNotifier?: () => GateNotifier | undefined;
  private readonly activeRecordings = new Map<string, AbortController>();
  /** Jobs currently being finalized because the live stream ended. */
  private readonly finalizingJobs = new Set<string>();
  /**
   * ponytail: jobs the user paused while their capture pipeline is between
   * downloader generations (reconnect backoff, retry sleep). The row says
   * 'paused' already; this flag stops the pipeline from launching another
   * download generation behind it (pause must actually stop the capture).
   */
  private readonly pausedJobs = new Set<string>();
  /** In-memory worker lifecycle per job (plan §5) — the DB row stays authoritative. */
  private readonly workerStates = new Map<string, WorkerStateMachine>();
  /**
   * plan §10: per-job progress accumulator. FFmpeg/yt-dlp emit progress per
   * log line; only the latest snapshot per flush window reaches SQLite
   * (≤0.5 writes/s/stream at 30 streams instead of ~30/s).
   */
  private readonly progressAcc = new Map<
    string,
    { latest: YtDlpProgress; lastFlush: number; lastWritten: YtDlpProgress | null }
  >();
  private readonly progressFlushMs: number;
  private readonly getMinFreeBytes?: () => number;
  private readonly getDerivativeCrf?: () => number;
  private readonly startGapMs: number;
  private readonly admissionRetryMs: number;
  /**
   * plan §13: background post-processing (verify/repair/remux/thumbnail/
   * metadata) drains at concurrency 1; explicit downgrade transcodes drain
   * at concurrency 2. The live path only enqueues — it never awaits these.
   */
  readonly postQueue: WorkQueue;
  readonly transcodeQueue: WorkQueue;
  /**
   * plan §9: staggered-start queue. Bursts (e.g. 30 auto-records firing at
   * once) launch at most one capture per START_GAP_MS instead of spawning
   * every child in the same tick.
   */
  private readonly startQueue: Array<{
    jobId: string;
    stream: StreamObject;
    options: StartRecordingOptions;
  }> = [];
  private startPumpActive = false;
  private lastStartAt = 0;
  /** Instant-end floor (see the capture loop); 0 disables the check. */
  private readonly minCaptureSeconds: number;

  /** Default minimum gap between capture launches (plan §9). */
  static readonly START_GAP_MS = 2000;
  /** Max wait for a paused pipeline to finish parking before resume gives up. */
  static readonly RESUME_PARK_WAIT_MS = 10_000;
  /** Cooldown before a parked queued start is reconsidered. */
  static readonly ADMISSION_RETRY_MS = 5000;

  /** Default flush cadence for recording progress → SQLite. */
  static readonly PROGRESS_FLUSH_MS = 2000;

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
    this.getEntitlements = options.getEntitlements;
    this.getGateNotifier = options.getGateNotifier;
    this.progressFlushMs = options.progressFlushMs ?? RecordingService.PROGRESS_FLUSH_MS;
    this.getMinFreeBytes = options.getMinFreeBytes;
    this.getDerivativeCrf = options.getDerivativeCrf;
    this.minCaptureSeconds =
      options.minMeaningfulCaptureSeconds ?? DEFAULT_MIN_MEANINGFUL_CAPTURE_SECONDS;
    this.startGapMs = options.startGapMs ?? RecordingService.START_GAP_MS;
    this.admissionRetryMs = options.admissionRetryMs ?? RecordingService.ADMISSION_RETRY_MS;
    this.postQueue = new WorkQueue(1, this.logger);
    this.transcodeQueue = new WorkQueue(2, this.logger);
    this.settings = { ...DEFAULT_SETTINGS, outputDir: options.defaultOutputDir };

    // ponytail: progress events carry the jobId — the accumulator flushes at
    // most one SQLite write per job per PROGRESS_FLUSH_MS window, skipping
    // windows whose snapshot is identical to the last write (plan §10).
    this.ytDlp.on('progress', (jobId, progress) => {
      const now = Date.now();
      let entry = this.progressAcc.get(jobId);
      if (entry === undefined) {
        entry = { latest: progress, lastFlush: 0, lastWritten: null };
        this.progressAcc.set(jobId, entry);
      } else {
        entry.latest = progress;
      }
      if (
        now - entry.lastFlush >= this.progressFlushMs &&
        !sameProgress(entry.lastWritten, progress)
      ) {
        entry.lastFlush = now;
        entry.lastWritten = { ...progress };
        this.repo.updateJob(jobId, {
          bytesDownloaded: progress.bytesDownloaded,
          speed: progress.speed,
          eta: progress.eta,
          percent: progress.percent,
        });
      }
    });

    // ponytail: persist the downloader's OS pid so the job can be re-adopted
    // after an app restart (autonomous recorder — the yt-dlp/ffmpeg child
    // keeps recording even when the app window is closed).
    this.ytDlp.on('spawned', (jobId, pid) => {
      this.repo.updateJob(jobId, { pid });
    });
  }

  // --- Lifecycle ------------------------------------------------------------

  /**
   * Effective concurrency cap: Low-Resource Mode forces a single slot; the
   * Pro-tier entitlement clamps the user setting on the free tier.
   */
  private get effectiveMaxConcurrent(): number {
    const entitlementCap = this.getEntitlements?.().maxConcurrent;
    const base =
      entitlementCap !== undefined
        ? Math.min(this.settings.maxConcurrent, entitlementCap)
        : this.settings.maxConcurrent;
    return this.isLowResourceMode?.() === true ? Math.min(base, 1) : base;
  }

  /**
   * Pro tier: when the tier (not the user setting / low-resource mode) is
   * the binding constraint, the refusal message doubles as the upgrade CTA
   * and the hit is recorded as a persistent gate notification.
   */
  private maxConcurrentError(): AppError {
    const entitlementCap = this.getEntitlements?.().maxConcurrent;
    const tierLimited =
      entitlementCap !== undefined &&
      Number.isFinite(entitlementCap) &&
      entitlementCap < this.settings.maxConcurrent &&
      this.isLowResourceMode?.() !== true;
    if (tierLimited) {
      this.getGateNotifier?.()?.concurrencyLimitReached(entitlementCap);
    }
    return new AppError({
      code: 'MAX_CONCURRENT_RECORDINGS',
      message: tierLimited
        ? `You're already recording ${entitlementCap} streams — that's the free-tier maximum. Upgrade to Pro for unlimited recordings.`
        : `Maximum concurrent recordings (${this.effectiveMaxConcurrent}) reached`,
      recoverable: true,
    });
  }

  /**
   * Drive the in-memory worker state machine. Bookkeeping must never break
   * the pipeline, so illegal transitions are logged and skipped — the DB
   * row remains the source of truth for recovery.
   */
  private setWorkerState(jobId: string, to: WorkerState): void {
    let machine = this.workerStates.get(jobId);
    if (machine === undefined) {
      machine = new WorkerStateMachine();
      this.workerStates.set(jobId, machine);
    }
    try {
      machine.transition(to);
    } catch (error) {
      this.logger.warn({ jobId, to, from: machine.state, error }, 'worker state transition skipped');
    }
  }

  /** In-memory worker lifecycle state (plan §5); undefined once removed. */
  getWorkerState(jobId: string): WorkerState | undefined {
    return this.workerStates.get(jobId)?.state;
  }

  /**
   * plan §6/§9: lightweight resource accounting from in-memory state only
   * (no DB reads, no speed tests). Bitrate estimates come from observed
   * worker throughput and stay `undefined` until the first progress lands,
   * so unknown estimates degrade gracefully (constraint §0.1.4).
   */
  getResourceUsage(): RecordingResourceUsage {
    let activeStreams = 0;
    let estimatedNetworkBps = 0;
    let observed = false;
    for (const [jobId, machine] of this.workerStates) {
      const state = machine.state;
      if (
        state === 'RESOLVING' ||
        state === 'STARTING' ||
        state === 'RECORDING' ||
        state === 'RECONNECTING' ||
        state === 'RE_RESOLVING'
      ) {
        activeStreams++;
        const latest = this.progressAcc.get(jobId)?.latest;
        if (latest !== undefined) {
          // ponytail: progress `speed` mixes B/s (yt-dlp) and bps
          // (ffmpeg-relay) sources — treat the sum as an approximation for
          // admission only, never as billing-grade telemetry.
          estimatedNetworkBps += latest.speed;
          observed = true;
        }
      }
    }
    return {
      activeStreams,
      activeProcesses: this.ytDlp.getActivePids().length,
      ...(observed
        ? { estimatedNetworkBps, estimatedDiskBps: estimatedNetworkBps }
        : {}),
      activeTranscodes: this.transcodeQueue.activeCount,
      queuedTranscodes: this.transcodeQueue.size,
    };
  }

  /** Queue a pipeline launch behind the staggered-start pump (plan §9). */
  private enqueueStart(jobId: string, stream: StreamObject, options: StartRecordingOptions): void {
    this.startQueue.push({ jobId, stream, options });
    void this.pumpStartQueue();
  }

  private async pumpStartQueue(): Promise<void> {
    if (this.startPumpActive) return;
    this.startPumpActive = true;
    try {
      while (this.startQueue.length > 0) {
        const gapWait = this.startGapMs - (Date.now() - this.lastStartAt);
        if (gapWait > 0) await sleep(gapWait);
        const next = this.startQueue[0]!;
        const row = this.repo.getJob(next.jobId);
        if (row === undefined || (row.status !== 'preparing' && row.status !== 'queued')) {
          // Cancelled/removed while queued — drop without launching.
          this.startQueue.shift();
          continue;
        }
        if (!(await this.admissionOpen())) {
          // plan §13: pressure parks the start at the tail (still QUEUED),
          // never fails it and never throttles the live workers.
          this.startQueue.push(this.startQueue.shift()!);
          await sleep(this.admissionRetryMs);
          continue;
        }
        this.startQueue.shift();
        this.lastStartAt = Date.now();
        this.processRecording(next.jobId, next.stream, next.options).catch((error) => {
          this.logger.error({ jobId: next.jobId, error }, 'recording pipeline failed');
        });
      }
    } finally {
      this.startPumpActive = false;
    }
  }

  /** Launch-time admission: hard ceiling + output-drive room (plan §9). */
  private async admissionOpen(): Promise<boolean> {
    if (this.repo.listJobs('recording').length >= this.effectiveMaxConcurrent) return false;
    return this.diskRoomForStart();
  }

  private async diskRoomForStart(): Promise<boolean> {
    const minFree = this.getMinFreeBytes?.() ?? 0;
    if (minFree <= 0) return true;
    try {
      const stats = await statfs(this.settings.outputDir);
      return stats.bavail * stats.bsize >= minFree;
    } catch {
      // A failed probe must not block capture (graceful degradation).
      return true;
    }
  }

  async startRecording(stream: StreamObject, options: StartRecordingOptions = {}): Promise<string> {
    const activeCount = this.repo.listJobs('recording').length;
    if (activeCount >= this.effectiveMaxConcurrent) {
      throw this.maxConcurrentError();
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

    // Start the recording pipeline via the staggered-start pump (plan §9) —
    // the job row stays 'preparing' until its launch slot arrives.
    this.enqueueStart(jobId, stream, options);

    return jobId;
  }

  /**
   * Pause a live recording: stop the underlying downloader process and park
   * the job in 'paused' — whatever was captured stays on disk as a part file
   * and resumeRecording continues into a new part (same flow as resuming a
   * cancelled recording).
   */
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

    this.pausedJobs.add(jobId);
    this.repo.updateJob(jobId, { status: 'paused', speed: 0, eta: 0 });
    this.emitEvent({
      type: 'recording-paused',
      jobId,
      timestamp: new Date().toISOString(),
    });

    // Stop the actual capture (same graceful stop the finalize path uses) —
    // only flipping the row left the process recording behind a 'paused'
    // label. The stopped downloader resolves the pipeline below, which
    // detects the paused intent and keeps the partial on disk.
    const stopped = this.ytDlp.stopDownload(jobId);
    // Adopted orphaned recordings have no ChildProcess handle in this
    // session — kill the whole tree by the persisted pid instead.
    if (!stopped && job.pid !== null && job.pid !== undefined) {
      await this.ytDlp.stopPidTreeAsync(job.pid);
    }
    if (!stopped) {
      // No live process to stop (e.g. mid-reconnect) — unblock the waiting
      // pipeline directly; it re-checks pausedJobs before any restart.
      this.activeRecordings.get(jobId)?.abort();
    }
  }

  async resumeRecording(jobId: string): Promise<void> {
    const job = this.repo.getJob(jobId);
    if (job === undefined) {
      throw new AppError({ code: 'JOB_NOT_FOUND', message: `Recording job ${jobId} not found` });
    }

    if (job.status === 'paused') {
      // ponytail: pausing parks the previous pipeline (stops the downloader,
      // promotes its partial) — resume must wait for that unwind to finish
      // or the two sessions race on the same output files.
      const deadline = Date.now() + RecordingService.RESUME_PARK_WAIT_MS;
      while (this.activeRecordings.has(jobId) && Date.now() < deadline) {
        await sleep(100);
      }
      if (this.activeRecordings.has(jobId)) {
        throw new AppError({
          code: 'INVALID_STATE',
          message: 'The recording is still stopping — try resuming again in a moment.',
          recoverable: true,
        });
      }
      // Only now is it safe to clear the pause intent: while it was set, the
      // winding-down pipeline kept the job parked instead of failing it.
      this.pausedJobs.delete(jobId);
      await this.continueIntoNewPart(job);
      return;
    }

    // ponytail: resuming a cancelled recording continues the capture into a
    // numbered part file — only possible while the broadcast is still live.
    if (job.status === 'cancelled') {
      await this.continueIntoNewPart(job);
      return;
    }

    throw new AppError({
      code: 'INVALID_STATE',
      message: `Cannot resume recording in state: ${job.status}`,
      recoverable: true,
    });
  }

  /**
   * ponytail: continue a paused/cancelled recording into a numbered part
   * file of the original capture — only possible while the broadcast is
   * still live. Resolves a fresh stream URL (the old one has expired),
   * preserves the partial as part 1, and relaunches the pipeline with
   * `resumeFrom` so the parts are merged back into one file on completion.
   */
  private async continueIntoNewPart(
    job: RecordingJobRecord,
  ): Promise<void> {
    const jobId = job.id;
    // ponytail: re-read the row — pausing may have updated filePath (parked
    // partial) after this function's snapshot was taken.
    const current = this.repo.getJob(jobId);
    if (current !== undefined) job = current;
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
      throw this.maxConcurrentError();
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
    // ponytail: a session resumed from an earlier pause/cancel writes to
    // `.partN.mp4` siblings — that partial is ALREADY a part of the original
    // capture, so keep it in place and resume from the original final path
    // (renaming it here used to produce an unmergeable `.part2.part1.mp4`).
    const partMatch = /^(.+)\.part\d+\.mp4$/i.exec(partialPath);
    const resumeBase = partMatch !== null ? partMatch[1]! : partialPath;
    if (partMatch === null) {
      const part1 = partialPath.replace(/\.mp4$/i, '.part1.mp4');
      await rename(partialPath, part1);
    }

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
    this.emitEvent({
      type: 'recording-resumed',
      jobId,
      timestamp: new Date().toISOString(),
    });

    this.notifications.send({
      level: 'info',
      title: 'Recording resumed',
      message: `Continuing recording "${job.title}"`,
      data: { jobId },
    });

    this.enqueueStart(
      jobId,
      { ...stream, title: job.title },
      {
        quality: job.quality ?? undefined,
        resumeFrom: resumeBase,
      },
    );
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
    // ponytail: a pending resume handoff must not relaunch behind a cancel.
    this.pausedJobs.delete(jobId);

    this.ytDlp.cancelDownload(jobId);
    // ponytail: adopted orphaned recordings have no ChildProcess handle in
    // this session — kill the whole tree by the persisted pid instead.
    if (job.pid !== null && job.pid !== undefined) this.ytDlp.stopPidTree(job.pid);
    this.setWorkerState(jobId, 'STOPPING');
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
    this.workerStates.delete(jobId);
    this.progressAcc.delete(jobId);
    this.pausedJobs.delete(jobId);
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
      this.workerStates.delete(job.id);
      this.progressAcc.delete(job.id);
      this.pausedJobs.delete(job.id);
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
      throw this.maxConcurrentError();
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

    // Re-launch the recording pipeline via the staggered-start pump (plan §9).
    this.enqueueStart(jobId, stream, {
      quality: job.quality ?? undefined,
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
    this.setWorkerState(jobId, 'STOPPING');
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
   *
   * plan §11: fully async — liveness probes run concurrently and all
   * command-line fallbacks share ONE bulk process snapshot, so 30 orphans
   * cost ~1 powershell call instead of 30 blocking scans.
   */
  async recoverStaleJobs(): Promise<number> {
    const TERMINAL = ['failed', 'completed', 'cancelled'];
    const RECORDER_NAMES = ['ffmpeg.exe', 'yt-dlp.exe'];
    let stale: RecordingJobRecord[];
    try {
      stale = this.getJobs().filter((job) => !TERMINAL.includes(job.status));
    } catch (error) {
      // ponytail: a torn jobs table after a force-kill must not throw out of
      // boot (which left the app headless holding the single-instance lock).
      this.logger.warn({ error }, 'stale recording recovery skipped — jobs unreadable');
      return 0;
    }
    const now = new Date().toISOString();

    const liveByJob = new Map<string, boolean>();
    await Promise.all(
      stale.map(async (job) => {
        const live =
          job.pid !== null &&
          job.pid !== undefined &&
          (await isPidAliveAsync(job.pid, RECORDER_NAMES));
        liveByJob.set(job.id, live);
      }),
    );

    // ponytail: the pid write may never have landed before the app closed —
    // fall back to matching output-path fragments against a single snapshot
    // (a failure here degrades to "mark failed", never throws out of boot).
    const needsFallback = stale.some(
      (job) =>
        liveByJob.get(job.id) !== true &&
        job.filePath !== null &&
        job.filePath !== undefined &&
        job.filePath !== '',
    );
    const snapshots = needsFallback ? await listRecorderProcessesAsync() : [];
    const matchSnapshot = (fragment: string): number | null => {
      const normalized = fragment.replace(/['*?]/g, ' ');
      return snapshots.find((s) => s.commandLine.includes(normalized))?.pid ?? null;
    };

    let adopted = 0;
    const RECOVERABLE = ['queued', 'preparing', 'recording', 'stopping', 'processing'];
    for (const job of stale.filter((j) => RECOVERABLE.includes(j.status))) {
      try {
        const pidLive = liveByJob.get(job.id) === true;
        const pid =
          pidLive
            ? job.pid!
            : job.filePath !== null && job.filePath !== undefined && job.filePath !== ''
              ? matchSnapshot(job.filePath)
              : null;
        if (pid !== null) {
          this.workerStates.set(job.id, new WorkerStateMachine('RECORDING'));
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
      } catch (error) {
        // ponytail: one torn row must not abort recovery of the rest — mark
        // best-effort failed and continue so boot always reaches a window.
        try {
          this.repo.updateJob(job.id, {
            status: 'failed',
            error: 'App restarted while the recording was active',
            finishedAt: now,
          });
        } catch {
          /* row unreadable — nothing to reconcile */
        }
        this.logger.warn({ jobId: job.id, error }, 'stale recording job skipped');
      }
    }
    // ponytail: parked 'paused' rows are excluded above — they survive the
    // restart resumable, so they must not inflate the failed count.
    const failedCount = stale.filter((j) => RECOVERABLE.includes(j.status)).length - adopted;
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

    if (await isPidAliveAsync(job.pid, ['ffmpeg.exe', 'yt-dlp.exe'])) {
      state.idle =
        size === state.lastSize && state.lastSize >= 0 ? state.idle + 1 : 0;
      state.lastSize = size;
      if (state.idle >= MAX_IDLE_POLLS) {
        this.logger.warn({ jobId, pid: job.pid }, 'orphaned recording stalled — stopping it');
        await this.ytDlp.stopPidTreeAsync(job.pid);
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
      this.setWorkerState(jobId, 'FINALIZING');
      const resolved = await this.resolveDownloadedFile(job.filePath);
      if (resolved === null) {
        throw new AppError({
          code: 'RECORDING_NO_DATA',
          message: 'No recording data was written — nothing to salvage.',
          recoverable: true,
        });
      }
      const stream: StreamObject = {
        creatorId: job.creatorId ?? '',
        creatorName: job.title.split('_')[0] || job.creatorId || job.platformId,
        platformId: job.platformId,
        title: job.title,
        streamUrl: job.streamUrl,
        thumbnail: job.thumbnail ?? undefined,
      };
      // plan §13: entry + completed row now; normalize/repair/enrichment drain
      // in the background queue like the live pipeline.
      const { recordingId } = await this.createLibraryEntry(
        jobId,
        stream,
        resolved,
        basename(resolved),
        'completed',
      );
      const now = new Date().toISOString();
      this.repo.updateJob(jobId, { status: 'completed', verified: false, finishedAt: now, pid: null });
      this.emitEvent({ type: 'recording-completed', jobId, timestamp: now });
      this.notifications.send({
        level: 'info',
        title: 'Recording saved',
        message: `${job.title} finished while the app was closed and was saved to your Library.`,
        data: { jobId },
      });
      this.postQueue.enqueue({
        key: `${jobId}-finalize-orphan`,
        run: () =>
          this.finalizeFileBackground({
            jobId,
            recordingId,
            filePath: resolved,
            wasFinalized: true,
          }),
      });
    } catch (error) {
      const now = new Date().toISOString();
      this.setWorkerState(jobId, 'FAILED');
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
    // Pro tier gate: clamp the per-recording duration to the tier cap. A
    // user-requested longer duration (or none) is shortened on the free
    // tier; Pro (Infinity) leaves options untouched.
    const tierCapMinutes = this.getEntitlements?.().maxRecordingMinutes;
    if (
      tierCapMinutes !== undefined &&
      Number.isFinite(tierCapMinutes) &&
      (options.durationMinutes === undefined ||
        options.durationMinutes <= 0 ||
        options.durationMinutes > tierCapMinutes)
    ) {
      options = {
        ...options,
        durationMinutes: tierCapMinutes,
        // ponytail: the free-tier cap must END the recording, not chain a
        // new segment — segmentMinutes is suppressed so the cap-reached
        // completion is final.
        segmentMinutes: undefined,
      };
    }

    const controller = new AbortController();
    this.activeRecordings.set(jobId, controller);
    // plan §5: each pipeline run owns a fresh worker lifecycle starting QUEUED.
    this.workerStates.set(jobId, new WorkerStateMachine());

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

        // Pro tier: warn the user 2 minutes before the free-tier cap ends
        // the recording, so the stop never comes as a surprise.
        const warningMs = (options.durationMinutes - 2) * 60 * 1000;
        if (warningMs > 0) {
          const capWarning = setTimeout(() => {
            this.emitEvent({
              type: 'recording-cap-warning',
              jobId,
              data: { minutesLeft: 2 },
              timestamp: new Date().toISOString(),
            });
            this.getGateNotifier?.()?.capWarning(jobId, stream.title, 2);
          }, warningMs);
          capWarning.unref?.();
        }
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
        this.setWorkerState(jobId, 'STOPPING');
        this.repo.updateJob(jobId, { status: 'cancelled', finishedAt: new Date().toISOString() });
        return;
      }

      this.setWorkerState(jobId, 'RESOLVING');
      this.setWorkerState(jobId, 'STARTING');
      this.setWorkerState(jobId, 'RECORDING');

      // Download with yt-dlp. URL expiry (class B failure) is retried in-loop
      // with a FRESH stream URL: each generation is preserved as an explicit
      // `.partN.mp4` (plan §0.1.3 continuity — restarts are visible parts,
      // never silent gaps) and merged exactly like the resume flow on success.
      // Fresh sessions only: resume sessions already own the part namespace
      // via `resumeFrom`, so a failure there keeps the existing failed path.
      let downloadResult: Awaited<ReturnType<YtDlpService['download']>>;
      const reResolvedSegments: string[] = [];
      let captureStream = stream;
      const downloadOptions = {
        quality: options.quality ?? this.settings.defaultQuality,
        headers: stream.headers,
        cookies: stream.cookies?.map((c) => ({ name: c.name, value: c.value })),
        // ponytail: route child fetches through the host proxy when the
        // plugin flagged the stream (creators.useProxy).
        proxyUrl: stream.proxyUrl,
        resume: true,
        // ponytail: segmentMinutes (splitting) takes precedence over the
        // stop-after cap — the UI treats them as mutually exclusive.
        durationSeconds:
          options.segmentMinutes !== undefined && options.segmentMinutes > 0
            ? options.segmentMinutes * 60
            : options.durationMinutes !== undefined && options.durationMinutes > 0
              ? options.durationMinutes * 60
              : undefined,
      };
      for (let reResolveCount = 0; ; reResolveCount++) {
        // ponytail: pause landed between generations — never spawn another
        // capture behind a 'paused' row. Throwing here sends the pipeline to
        // the pause-aware unwind below (same as a stopped downloader).
        if (this.pausedJobs.has(jobId)) {
          throw new AppError({
            code: 'RECORDING_PAUSED',
            message: 'Recording paused by user',
            recoverable: true,
          });
        }
        try {
          downloadResult = await this.ytDlp.download(
            jobId,
            captureStream.streamUrl,
            outputPath,
            {
              ...downloadOptions,
              headers: captureStream.headers,
              cookies: captureStream.cookies?.map((c) => ({ name: c.name, value: c.value })),
              proxyUrl: captureStream.proxyUrl,
            },
          );
          // ponytail: an instant "clean" end is NOT a completed recording.
          // When the HLS edge drops ffmpeg's TLS handshake the playlist
          // reload fails and ffmpeg's demuxer treats it as a natural stream
          // end, exiting code 0 with only the buffered window (~1s) in the
          // file — verified against MyFreeCams' video edges (final file:
          // Duration 00:00:01.19, "Recording completed successfully").
          // Probing the capture turns that junk into the same bounded
          // transient-retry path any other blip takes: the partial is
          // preserved as a part below and a fresh capture restarts.
          if (downloadResult.stopped === false && this.minCaptureSeconds > 0) {
            const capturedSeconds = await this.capturedDurationSeconds(outputPath);
            if (capturedSeconds > 0 && capturedSeconds < this.minCaptureSeconds) {
              throw new AppError({
                code: 'CAPTURE_INSTANT_END',
                message: `Capture stopped after only ${capturedSeconds.toFixed(1)}s — network blip, retrying`,
                recoverable: true,
              });
            }
          }
          break;
        } catch (error) {
          if (controller.signal.aborted || this.finalizingJobs.has(jobId)) throw error;
          const failureClass = classifyCaptureFailure({
            code: error instanceof AppError ? error.code : undefined,
            message: error instanceof Error ? error.message : String(error),
          });
          // plan §4: URL_EXPIRED re-resolves to a fresh URL; TRANSIENT (ffmpeg
          // reconnects exhausted, crash, blip) restarts capture on the SAME
          // url — both bounded, both preserve explicit parts. Genuine endings
          // and local fatals surface unchanged. Fresh sessions only: resume
          // sessions own the part namespace via `resumeFrom`.
          const retryable =
            (failureClass === 'URL_EXPIRED' || failureClass === 'TRANSIENT') &&
            options.resumeFrom === undefined &&
            reResolveCount < this.settings.retryCount;
          const needsFreshUrl = failureClass === 'URL_EXPIRED';
          if (!retryable) throw error;
          if (this.pausedJobs.has(jobId)) throw error;
          if (needsFreshUrl && this.resolveStream === undefined) throw error;
          this.setWorkerState(jobId, needsFreshUrl ? 'RE_RESOLVING' : 'RECONNECTING');
          await sleep(computeBackoffMs(reResolveCount, this.settings.retryDelay));
          if (controller.signal.aborted || this.finalizingJobs.has(jobId)) throw error;
          const job = this.repo.getJob(jobId);
          if (job === undefined) throw error;
          // ponytail: the user paused while we slept out the reconnect
          // backoff — do not launch another generation behind a 'paused' row.
          // The original (stop-flagged) error unwinds the pipeline so the
          // partial is kept and the job stays resumable.
          if (this.pausedJobs.has(jobId)) throw error;
          if (needsFreshUrl) {
            const resolver = this.resolveStream;
            if (resolver === undefined) throw error;
            let fresh: StreamObject | null = null;
            try {
              fresh = await resolver(job);
            } catch (resolveError) {
              this.logger.warn({ jobId, error: resolveError }, 'stream re-resolution failed — keeping original failure');
            }
            // ponytail: null/throw means genuinely offline — surface the ORIGINAL
            // capture error so the existing failed+salvage path runs unchanged.
            if (fresh === null) throw error;
            captureStream = fresh;
            this.repo.updateJob(jobId, { streamUrl: fresh.streamUrl });
          } else {
            this.logger.info(
              { jobId, failureClass, attempt: reResolveCount + 1 },
              'transient capture failure — restarting capture on the same URL',
            );
          }
          // Preserve whatever this generation captured before continuing.
          // plan §17 integrity: probe readability first — a SIGKILL-truncated
          // fragment (moov-less) is unplayable AND poisons the later concat
          // merge, so it is discarded instead of preserved as a part. Readable
          // partials (clean error exits, yt-dlp .part TS files) are kept.
          const partial = await this.resolveDownloadedFile(outputPath);
          if (
            partial !== null &&
            !/\.part\d+\.mp4$/i.test(partial) &&
            !reResolvedSegments.includes(partial)
          ) {
            const format = await this.ffmpeg.getContainerFormat(partial);
            if (format === null) {
              this.logger.warn(
                { jobId, partial },
                'pre-retry segment is unreadable — discarding instead of preserving',
              );
            } else {
              const dest = await this.nextPartPath(outputPath);
              try {
                await rename(partial, dest);
                reResolvedSegments.push(dest);
              } catch (renameError) {
                this.logger.warn({ jobId, partial, dest, error: renameError }, 'failed to preserve pre-retry segment');
              }
            }
          }
          if (needsFreshUrl) {
            this.setWorkerState(jobId, 'STARTING');
            this.setWorkerState(jobId, 'RECORDING');
          } else {
            this.setWorkerState(jobId, 'RECORDING');
          }
          this.repo.updateJob(jobId, {
            attempts: job.attempts + 1,
            bytesDownloaded: 0,
            speed: 0,
            eta: 0,
            percent: 0,
          });
          this.logger.info(
            { jobId, reResolveCount: reResolveCount + 1, preservedParts: reResolvedSegments.length },
            needsFreshUrl
              ? 'stream URL expired mid-recording — re-resolved and continuing in a new part'
              : 'capture restarted in a new part after a transient failure',
          );
        }
      }

      // ponytail: a user pause stops the downloader mid-generation — park
      // the pipeline WITHOUT touching the row (it already says 'paused')
      // and WITHOUT finalizing the partial into a Library entry (which
      // would flip the row to 'cancelled' and break resume). The partial
      // file stays exactly where the resume flow expects it.
      if (this.pausedJobs.has(jobId)) {
        this.setWorkerState(jobId, 'STOPPING');
        await this.parkPausedSession(jobId, downloadResult.filePath, options);
        return;
      }

      if (controller.signal.aborted) {
        this.setWorkerState(jobId, 'STOPPING');
        // ponytail: user cancelled — keep whatever was captured as a partial
        // library entry (users never lose what was recorded). Remux-repair,
        // thumbnail, and metadata drain in the background queue (plan §13).
        let cancelPath = downloadResult.filePath;
        if (options.resumeFrom !== undefined) {
          cancelPath = await this.mergeParts(options.resumeFrom);
        }
        cancelPath = (await this.resolveDownloadedFile(cancelPath)) ?? cancelPath;
        if (await fileExists(cancelPath)) {
          try {
            const { recordingId: cancelledId } = await this.createLibraryEntry(
              jobId,
              stream,
              cancelPath,
              basename(cancelPath),
              'cancelled',
            );
            const repairPath = cancelPath;
            this.postQueue.enqueue({
              key: `${jobId}-finalize-cancelled`,
              run: () =>
                this.finalizeFileBackground({
                  jobId,
                  recordingId: cancelledId,
                  filePath: repairPath,
                  wasFinalized: true,
                }),
            });
          } catch (error) {
            this.logger.warn({ jobId, error }, 'cancelled recording library entry failed');
          }
        } else {
          this.logger.warn({ jobId }, 'cancelled recording produced no file — nothing to keep');
        }
        this.repo.updateJob(jobId, { status: 'cancelled', finishedAt: new Date().toISOString() });
        return;
      }

      // ponytail: true when the stream ended and we stopped the downloader early
      const wasFinalized = downloadResult.stopped || this.finalizingJobs.delete(jobId);

      // Update status to processing
      if (wasFinalized) this.setWorkerState(jobId, 'STOPPING');
      this.setWorkerState(jobId, 'FINALIZING');
      this.repo.updateJob(jobId, { status: 'processing', pid: null });

      // ponytail: a resumed session merges its parts back into the original
      // file so the Library keeps a single entry per recording.
      let targetPath = downloadResult.filePath;
      if (options.resumeFrom !== undefined) {
        targetPath = await this.mergeParts(options.resumeFrom);
      } else if (reResolvedSegments.length > 0) {
        // ponytail: stage the final generation as the last part, then merge
        // everything exactly like the resume flow (plan §0.1.3 continuity).
        const current = await this.resolveDownloadedFile(outputPath);
        if (current !== null && current === outputPath) {
          const lastPart = await this.nextPartPath(outputPath);
          try {
            await rename(outputPath, lastPart);
          } catch (error) {
            this.logger.warn({ jobId, outputPath, lastPart, error }, 'failed to stage final re-resolved segment');
          }
        } else if (
          current !== null &&
          !/\.part\d+\.mp4$/i.test(current) &&
          !reResolvedSegments.includes(current)
        ) {
          const dest = await this.nextPartPath(outputPath);
          try {
            await rename(current, dest);
          } catch (error) {
            this.logger.warn({ jobId, current, dest, error }, 'failed to stage final re-resolved temp segment');
          }
        }
        targetPath = await this.mergeParts(outputPath);
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

      // plan §13: the library entry and completed row land NOW (stat + upsert
      // only — no ffmpeg); normalize/verify/repair/thumbnail/metadata drain
      // in the background queue so 30 finishes never burst 30× ffmpeg.
      // plan §8: a downgraded capture stores source quality — label the entry
      // truthfully ('best'); the 720p derivative gets its own entry below.
      const effectiveQuality = options.quality ?? this.settings.defaultQuality;
      const needsDerivative =
        requiresLiveTranscode(effectiveQuality) && isDirectHlsUrl(captureStream.streamUrl);
      const now = new Date().toISOString();
      const { recordingId } = await this.createLibraryEntry(
        jobId,
        stream,
        targetPath,
        basename(targetPath),
        'completed',
        needsDerivative ? 'best' : undefined,
      );

      // Update job status
      this.repo.updateJob(jobId, {
        status: 'completed',
        verified: false,
        filePath: targetPath,
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

      this.postQueue.enqueue({
        key: `${jobId}-finalize`,
        run: async () => {
          await this.finalizeFileBackground({
            jobId,
            recordingId,
            filePath: targetPath,
            wasFinalized,
          });
          // plan §8: an explicit downgrade is served AFTER finalization by
          // the transcode pool — the live capture above stayed source-quality.
          // yt-dlp fallback captures are already source-capped, so only the
          // direct-copy path needs a derivative.
          if (needsDerivative) {
            this.enqueueDerivativeTranscode({
              jobId,
              filePath: targetPath,
              stream,
              quality: effectiveQuality,
            });
          }
        },
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

      // Pro tier: when the tier duration cap (not a user stop-after or a
      // segment split) ended the recording, tell the UI so it can show the
      // upgrade CTA. The file above is already finalized and playable.
      const tierCapMinutes = this.getEntitlements?.().maxRecordingMinutes;
      const capEndedByTier =
        tierCapMinutes !== undefined &&
        Number.isFinite(tierCapMinutes) &&
        downloadResult.durationCapReached &&
        !chainable &&
        options.resumeFrom === undefined;
      if (capEndedByTier) {
        this.emitEvent({
          type: 'recording-cap-reached',
          jobId,
          recordingId,
          data: { minutes: tierCapMinutes },
          timestamp: new Date().toISOString(),
        });
        this.getGateNotifier?.()?.capReached(
          jobId,
          stream.title,
          tierCapMinutes,
        );
      }
    } catch (error) {
      // ponytail: a user pause stops the downloader and its pending download
      // promise rejects here. The row already says 'paused' — keep it that
      // way (the pre-fix behavior failed the job instead), and keep the
      // partial resumable instead of salvaging it as a failed Library entry.
      // Checked BEFORE the FAILED transition: FAILED is terminal in the
      // worker state machine, so a paused job must never pass through it.
      if (this.pausedJobs.has(jobId)) {
        this.setWorkerState(jobId, 'STOPPING');
        this.logger.info({ jobId }, 'recording paused by user — partial kept for resume');
        await this.parkPausedSession(jobId, outputPath, options);
        return;
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.setWorkerState(jobId, 'FAILED');

      this.repo.updateJob(jobId, {
        status: 'failed',
        error: errorMsg,
        finishedAt: new Date().toISOString(),
      });

      // ponytail: even on failure, a partial file may exist on disk (killed
      // download, verification failure, etc.). Salvage it to the Library in
      // the background queue (plan §13) — failure reporting never waits.
      if (outputPath) {
        const salvagePath = outputPath;
        const salvageStream = stream;
        this.postQueue.enqueue({
          key: `${jobId}-salvage`,
          run: () => this.salvageFailedRecording(jobId, salvageStream, salvagePath),
        });
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
      this.progressAcc.delete(jobId);
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
   * Actual media seconds written by a capture attempt (0 when nothing was
   * written or the file cannot be probed). Powers the instant-end detection
   * in the capture loop — a "clean" ffmpeg exit that produced less than the
   * meaningful floor is a network blip, not a completed recording.
   */
  private async capturedDurationSeconds(filePath: string): Promise<number> {
    try {
      const actual = await this.resolveDownloadedFile(filePath);
      if (actual === null) return 0;
      if ((await stat(actual)).size === 0) return 0;
      const metadata = await this.ffmpeg.getMetadata(actual);
      return Number.isFinite(metadata.duration) ? metadata.duration : 0;
    } catch {
      return 0;
    }
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

  /**
   * ponytail: park a paused capture — promote whatever the downloader
   * actually wrote (temp siblings included) to the expected output path so
   * the resume flow finds it. The job row keeps its 'paused' status; the
   * partial is NOT finalized into the Library (that would end the session).
   */
  private async parkPausedSession(
    jobId: string,
    targetPath: string,
    options: StartRecordingOptions,
  ): Promise<void> {
    // A pause between generations (mid-reconnect) has no output path yet —
    // nothing was captured in this session, so there is nothing to park.
    if (targetPath === '') return;
    try {
      const written = await this.resolveDownloadedFile(targetPath);
      if (written === null) {
        this.logger.warn({ jobId }, 'paused recording produced no data — nothing to keep');
        return;
      }
      if (written !== targetPath) {
        await rm(targetPath, { force: true });
        await rename(written, targetPath);
      }
      // A resumed session's output is already a `.partN.mp4` sibling of the
      // original file — leave it exactly where the next resume expects it.
      if (options.resumeFrom === undefined) {
        this.repo.updateJob(jobId, { filePath: targetPath });
      }
      this.logger.info({ jobId, filePath: targetPath }, 'paused recording parked for resume');
    } catch (error) {
      // Best-effort parking must never mask the pause itself — the row is
      // already 'paused' and the user can still cancel/retry the job.
      this.logger.warn({ jobId, error }, 'failed to park paused recording partial');
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
    let parts: string[];
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
   * plan §13: create the Library row the moment capture finishes — stat +
   * upsert only, no ffmpeg. Thumbnail/metadata/verification enrich the row
   * later from the background queue. Reuses the existing row on resumes so
   * there is exactly one Library entry per job.
   */
  private async createLibraryEntry(
    jobId: string,
    stream: StreamObject,
    filePath: string,
    fileName: string,
    status: 'completed' | 'cancelled' | 'failed',
    qualityOverride?: string,
  ): Promise<{ recordingId: string }> {
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
    const jobRecord = this.repo.getJob(jobId);
    const fields = {
      // ponytail: Library rows must inherit the job's creatorId (a DB uuid)
      // — a hardcoded null made per-creator stats read 0 even with recordings.
      creatorId: jobRecord?.creatorId ?? null,
      jobId,
      // ponytail: use the job's generated title ('{creator}_{date}_{time}',
      // same as the file on disk) — the raw stream title ('Your favorite
      // French streamer…') told the user nothing about WHO was recorded.
      title: jobRecord?.title ?? stream.title,
      platformId: stream.platformId,
      fileName,
      filePath,
      thumbnailPath: undefined,
      status,
      quality: qualityOverride ?? jobRecord?.quality ?? this.settings.defaultQuality,
      resolution: undefined,
      sizeBytes: stat_.size,
      durationSeconds: undefined,
      videoCodec: undefined,
      audioCodec: undefined,
      bitrate: undefined,
      fps: undefined,
      isFavorite: false,
      startedAt: jobRecord?.startedAt,
      endedAt: now,
      updatedAt: now,
    };

    // ponytail: resumed sessions refresh the existing row instead of
    // creating a duplicate Library entry.
    const existing = this.repo.listRecordings().find((r) => r.jobId === jobId);
    if (existing !== undefined) {
      this.repo.updateRecording(existing.id, fields);
      return { recordingId: existing.id };
    }

    const recordingId = randomUUID();
    this.repo.createRecording({ ...fields, id: recordingId, createdAt: now });
    return { recordingId };
  }

  /**
   * plan §13: thumbnail + metadata enrichment for an existing Library row.
   * Runs exclusively in the background queue — the live path never awaits it.
   */
  private async enrichLibraryEntry(
    jobId: string,
    recordingId: string,
    filePath: string,
  ): Promise<{ thumbnailPath?: string }> {
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

    this.repo.updateRecording(recordingId, {
      thumbnailPath,
      resolution: (metadata as { resolution?: string }).resolution,
      durationSeconds: (metadata as { duration?: number }).duration,
      videoCodec: (metadata as { videoCodec?: string }).videoCodec,
      audioCodec: (metadata as { audioCodec?: string }).audioCodec,
      bitrate: (metadata as { bitrate?: number }).bitrate,
      fps: (metadata as { fps?: number }).fps,
    });
    return { thumbnailPath };
  }

  /**
   * plan §13: background file finalization — normalize container, verify
   * (+repair truncated stream-ended files), then enrich the Library row.
   * Best-effort: the job already completed, so failures only log and leave
   * the entry (and its `verified: false` flag) as-is.
   */
  private async finalizeFileBackground(input: {
    jobId: string;
    recordingId: string;
    filePath: string;
    wasFinalized: boolean;
  }): Promise<void> {
    const { jobId, recordingId, wasFinalized } = input;
    let targetPath = input.filePath;
    try {
      this.emitEvent({
        type: 'verification-started',
        jobId,
        timestamp: new Date().toISOString(),
      });

      // ponytail: a promoted yt-dlp temp file is often a raw MPEG-TS stream
      // wearing an '.mp4' name. VLC plays it, but Chromium's <video> element
      // (the in-app player) cannot demux it — remux any non-mp4 container
      // into a proper faststart mp4 before verification/library.
      targetPath = await this.normalizeContainer(jobId, targetPath);

      if (this.settings.verifyEnabled) {
        let verification = await this.verifier.verify(targetPath);
        // ponytail: a stream-ended recording is truncated by design — the mp4
        // moov atom may be missing. Try a remux repair before giving up.
        if (!verification.integrity && wasFinalized) {
          verification = await this.repairPartialFile(targetPath);
        }
        this.repo.updateJob(jobId, { verified: verification.integrity, filePath: targetPath });
        if (!verification.integrity) {
          this.logger.warn(
            { jobId, errors: verification.errors },
            'background verification failed — completed entry kept as unverified',
          );
        }
      } else {
        this.repo.updateJob(jobId, { verified: true, filePath: targetPath });
      }

      const { thumbnailPath } = await this.enrichLibraryEntry(jobId, recordingId, targetPath);
      if (thumbnailPath !== undefined) {
        this.repo.updateJob(jobId, { thumbnailPath });
      }

      this.emitEvent({
        type: 'verification-completed',
        jobId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn({ jobId, error }, 'background file finalization failed — entry kept as-is');
    }
  }

  /**
   * plan §8: quality derivative for explicit downgrades.
   * Drains in the transcode pool (concurrency 2). The user explicitly picked
   * this quality, so on SUCCESS the derivative REPLACES the source: the
   * source-quality file and its Library entry are removed (its thumbnail is
   * reused when the derivative has none) — otherwise every selected-quality
   * recording would appear twice in the Library. A transcode failure keeps
   * the source untouched.
   */
  private enqueueDerivativeTranscode(input: {
    jobId: string;
    filePath: string;
    stream: StreamObject;
    quality: string;
  }): void {
    const height = parseQualityHeight(input.quality);
    if (height === null) return;
    this.transcodeQueue.enqueue({
      key: `${input.jobId}-transcode-${input.quality}`,
      run: () => this.transcodeDerivative({ ...input, height }),
    });
  }

  private async transcodeDerivative(input: {
    jobId: string;
    filePath: string;
    stream: StreamObject;
    quality: string;
    height: number;
  }): Promise<void> {
    const dir = dirname(input.filePath);
    const base = basename(input.filePath).replace(/\.mp4$/i, '');
    const outPath = join(dir, `${base}_${input.quality}.mp4`);
    try {
      await this.ffmpeg.transcode(input.filePath, outPath, {
        height: input.height,
        crf: this.getDerivativeCrf?.() ?? 23,
      });
      const now = new Date().toISOString();
      const job = this.repo.getJob(input.jobId);
      const derivativeId = randomUUID();
      this.repo.createRecording({
        id: derivativeId,
        // ponytail: inherit the job's creatorId so per-creator stats keep
        // counting derivatives (the source entry they replace had it too).
        creatorId: job?.creatorId ?? null,
        jobId: input.jobId,
        title: `${job?.title ?? input.stream.title} (${input.quality})`,
        platformId: input.stream.platformId,
        fileName: basename(outPath),
        filePath: outPath,
        thumbnailPath: undefined,
        status: 'completed',
        quality: input.quality,
        resolution: undefined,
        sizeBytes: (await stat(outPath)).size,
        durationSeconds: undefined,
        videoCodec: undefined,
        audioCodec: undefined,
        bitrate: undefined,
        fps: undefined,
        isFavorite: false,
        startedAt: job?.startedAt,
        endedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const { thumbnailPath } = await this.enrichLibraryEntry(input.jobId, derivativeId, outPath);

      // ponytail: the selected quality REPLACES the source capture. Only the
      // source row produced by THIS job's capture (matched by file path) is
      // dropped — other entries (editor outputs, earlier derivatives) and the
      // just-created derivative stay untouched.
      const sourceEntry = this.repo.listRecordings().find(
        (r) => r.jobId === input.jobId && r.filePath === input.filePath,
      );
      if (sourceEntry !== undefined) {
        const inherited: Partial<RecordingRecord> = {};
        if (sourceEntry.isFavorite) inherited.isFavorite = true;
        if (sourceEntry.notes) inherited.notes = sourceEntry.notes;
        if (Object.keys(inherited).length > 0) {
          this.repo.updateRecording(derivativeId, inherited);
        }
        if (thumbnailPath === undefined && sourceEntry.thumbnailPath) {
          // ponytail: reuse the source thumbnail when the derivative did not
          // get one (thumbnail generation disabled / low-resource mode).
          const reused = join(dir, `${basename(outPath)}.thumb.jpg`);
          try {
            await rename(sourceEntry.thumbnailPath, reused);
            this.repo.updateRecording(derivativeId, { thumbnailPath: reused });
          } catch {
            /* best-effort thumbnail reuse */
          }
        }
        this.repo.removeRecording(sourceEntry.id);
        await rm(input.filePath, { force: true });
        await rm(`${input.filePath}.thumb.jpg`, { force: true });
      }
    } catch (error) {
      this.logger.warn(
        { jobId: input.jobId, error },
        'background quality transcode failed — source-quality file kept',
      );
    }
  }

  /**
   * plan §13: best-effort salvage of a failed capture's partial file into a
   * 'failed' Library entry. Runs in the background queue — failure reporting
   * never waits for it.
   */
  private async salvageFailedRecording(
    jobId: string,
    stream: StreamObject,
    outputPath: string,
  ): Promise<void> {
    try {
      const resolved = await this.resolveDownloadedFile(outputPath);
      if (resolved === null) return;
      const normalized = await this.normalizeContainer(jobId, resolved);
      await this.repairPartialFile(normalized);
      const { recordingId } = await this.createLibraryEntry(
        jobId,
        stream,
        normalized,
        basename(normalized),
        'failed',
      );
      await this.enrichLibraryEntry(jobId, recordingId, normalized);
    } catch (saveError) {
      this.logger.warn({ jobId, error: saveError }, 'failed to save partial recording to library');
    }
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
