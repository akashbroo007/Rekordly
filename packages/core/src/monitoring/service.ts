import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Logger } from '@rekordly/shared';
import { AppError } from '@rekordly/shared';
import type {
  MonitoringEvent,
  MonitoringJob,
  MonitoringCheckResult,
  MonitoringDashboardData,
} from '@rekordly/shared';
import type { MonitoringRepo } from '@rekordly/database';
import type { PluginManager } from '../plugin-manager/manager';
import type { NotificationService } from '../services/notification-service';
import { MonitoringQueue } from './queue';
import { Scheduler } from './scheduler';
import { BrowserPool } from './browser-pool';

export interface MonitoringServiceOptions {
  repo: MonitoringRepo;
  pluginManager: PluginManager;
  notifications: NotificationService;
  logger: Logger;
  baseIntervalMs?: number;
  maxConcurrent?: number;
}

/**
 * ponytail: how soon a degraded (unreachable-site) check is retried. Short
 * enough to catch the site coming back quickly, long enough to not hammer
 * it; much shorter than a full interval so auto-record detection resumes
 * promptly after a network blip.
 */
const UNKNOWN_CHECK_RETRY_MS = 60_000;

/**
 * ponytail: creator-live is an EDGE event, not a level. The first version
 * emitted it on EVERY successful check while a creator stayed live — with a
 * 10–30s interval the user got a "X is LIVE" Telegram/Discord push every
 * poll. This set tracks monitor ids whose last definitive check was live so
 * the event fires only on the offline→live transition (and creator-offline
 * only on live→offline). Call `rearmLive()` when a live creator's action
 * failed (auto-record could not start) so the NEXT check re-emits and the
 * pipeline self-heals without spamming in between.
 */

export interface MonitoringServiceEvents {
  event: [event: MonitoringEvent];
}

/**
 * Monitoring Service: orchestrates the monitoring engine.
 * Never contains platform-specific logic.
 * Delegates all website-specific work to plugins.
 */
export class MonitoringService extends EventEmitter<MonitoringServiceEvents> {
  private readonly queue: MonitoringQueue;
  private readonly scheduler: Scheduler;
  private readonly browserPool: BrowserPool;
  private readonly repo: MonitoringRepo;
  private readonly pluginManager: PluginManager;
  private readonly notifications: NotificationService;
  private readonly logger: Logger;
  /** Default poll interval for creators (from app settings). */
  private baseIntervalMs: number;
  private running = false;
  private checkDurations: number[] = [];
  /** Monitor ids whose last definitive check was live (edge detection). */
  private readonly liveIds = new Set<string>();

  constructor(options: MonitoringServiceOptions) {
    super();
    this.repo = options.repo;
    this.pluginManager = options.pluginManager;
    this.notifications = options.notifications;
    this.logger = options.logger;
    this.baseIntervalMs = options.baseIntervalMs ?? 300_000;

    this.queue = new MonitoringQueue({
      maxRetries: 5,
      initialBackoffMs: 30000,
      maxBackoffMs: 600000,
    });

    this.browserPool = new BrowserPool({ maxPages: 10 }, this.logger);

    this.scheduler = new Scheduler(
      this.queue,
      {
        baseIntervalMs: this.baseIntervalMs,
        maxConcurrent: options.maxConcurrent ?? 5,
        tickIntervalMs: 5000,
      },
      {
        onCheckDue: (job) => this.checkCreator(job),
        onStatsUpdate: () => this.emitStats(),
      },
      this.logger,
    );

    this.setupQueueEvents();
  }

  // --- Lifecycle ------------------------------------------------------------

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Restore persisted jobs
    this.restoreJobs();

    this.browserPool.start();
    this.scheduler.start();

    this.emitEvent({ type: 'scheduler-started', timestamp: new Date().toISOString() });
    this.emitStats();
    this.logger.info('monitoring service started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    this.scheduler.stop();
    this.browserPool.stop();

    this.emitEvent({ type: 'scheduler-stopped', timestamp: new Date().toISOString() });
    this.emitStats();
    this.logger.info('monitoring service stopped');
  }

  // --- Creator management ---------------------------------------------------

  /**
   * Update the default monitoring interval at runtime (e.g. when the user
   * changes "Monitoring interval" in settings). Applies to every existing
   * job so the change takes effect immediately without an app restart.
   */
  setBaseIntervalMs(intervalMs: number): void {
    if (!Number.isFinite(intervalMs) || intervalMs < 30_000) return;
    this.baseIntervalMs = intervalMs;
    for (const job of this.queue.list()) {
      job.intervalMs = intervalMs;
      // Pull the next check earlier if the new interval is shorter.
      job.nextCheckAt = Math.min(job.nextCheckAt, Date.now() + intervalMs);
      this.persistJob(job);
    }
    this.logger.info({ intervalMs }, 'monitoring base interval updated');
    this.emitStats();
  }

  addCreator(
    creatorId: string,
    pluginId: string,
    intervalMs = this.baseIntervalMs,
  ): MonitoringJob {
    const existing = this.queue.getByCreatorId(creatorId);
    if (existing !== undefined) {
      return existing;
    }

    const now = new Date().toISOString();
    const job: MonitoringJob = {
      id: randomUUID(),
      creatorId,
      pluginId,
      state: 'queued',
      priority: 0,
      intervalMs,
      nextCheckAt: Date.now(),
      attempts: 0,
      maxAttempts: 5,
      createdAt: now,
      updatedAt: now,
    };

    this.queue.add(job);
    this.repo.create({
      id: job.id,
      creatorId: job.creatorId,
      pluginId: job.pluginId,
      state: job.state,
      priority: job.priority,
      intervalMs: job.intervalMs,
      nextCheckAt: job.nextCheckAt,
      lastCheckAt: null,
      lastResult: null,
      attempts: 0,
      maxAttempts: job.maxAttempts,
      error: null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
    this.emitStats();
    this.logger.info({ jobId: job.id, creatorId, pluginId }, 'monitoring job added');
    return job;
  }

  removeCreator(creatorId: string): boolean {
    const job = this.queue.getByCreatorId(creatorId);
    if (job === undefined) return false;

    this.queue.removeByCreatorId(creatorId);
    this.liveIds.delete(creatorId);
    this.repo.remove(job.id);
    this.emitStats();
    this.logger.info({ jobId: job.id, creatorId }, 'monitoring job removed');
    return true;
  }

  /**
   * Forces the NEXT check of this creator to re-emit `creator-live` even if
   * the monitor currently considers them live. Used by the host when an
   * auto-record attempt fails (no stream URL, disk full, extraction error):
   * without a re-arm the edge detector would stay silent on subsequent
   * checks and the pipeline would never retry for this live session.
   */
  rearmLive(creatorId: string): void {
    if (this.liveIds.delete(creatorId)) {
      this.logger.debug({ creatorId }, 'live edge re-armed — next check re-emits creator-live');
    }
  }

  pauseCreator(creatorId: string): boolean {
    const job = this.queue.getByCreatorId(creatorId);
    if (job === undefined) return false;

    this.queue.pause(job.id);
    this.repo.setState(job.id, 'paused');
    this.logger.info({ creatorId }, 'monitoring paused');
    return true;
  }

  resumeCreator(creatorId: string): boolean {
    const job = this.queue.getByCreatorId(creatorId);
    if (job === undefined) return false;

    this.queue.resume(job.id);
    this.repo.setState(job.id, 'queued');
    this.logger.info({ creatorId }, 'monitoring resumed');
    return true;
  }

  // --- Queries --------------------------------------------------------------

  getStatus(): { running: boolean; uptime: number } {
    return {
      running: this.running,
      uptime: this.scheduler.uptime(),
    };
  }

  getJobs(): MonitoringJob[] {
    return this.queue.list();
  }

  getDashboard(): MonitoringDashboardData {
    const stats = this.queue.stats();
    const durations = this.checkDurations.length > 0 ? this.checkDurations : [0];
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const dueJobs = this.queue.due(1);
    const nextCheck = dueJobs.length > 0 ? dueJobs[0]!.nextCheckAt : Date.now() + 300_000;

    return {
      currentlyChecking: stats.checking,
      queuedJobs: stats.queued,
      liveCreators: stats.live,
      offlineCreators: stats.offline,
      health: {
        totalJobs: stats.total,
        activeJobs: stats.queued + stats.checking,
        failedJobs: stats.failed,
        pausedJobs: stats.paused,
        averageCheckDurationMs: avgDuration,
        lastCheckAt: this.checkDurations.length > 0 ? new Date().toISOString() : undefined,
        uptime: this.scheduler.uptime(),
      },
      averageCheckDurationMs: avgDuration,
      nextScheduledCheck: nextCheck,
    };
  }

  // --- Internal -------------------------------------------------------------

  private async checkCreator(job: MonitoringJob): Promise<void> {
    const startTime = Date.now();
    this.emitEvent({
      type: 'creator-checked',
      creatorId: job.creatorId,
      pluginId: job.pluginId,
      jobId: job.id,
      timestamp: new Date().toISOString(),
    });

    try {
      const managed = this.pluginManager.get(job.pluginId);
      if (managed === undefined || managed.instance === null) {
        throw new AppError({
          code: 'PLUGIN_NOT_AVAILABLE',
          message: `Plugin ${job.pluginId} is not available`,
        });
      }

      const liveDetection = managed.instance.capabilities.liveDetection;
      if (liveDetection === undefined) {
        throw new AppError({
          code: 'PLUGIN_NO_LIVE_DETECTION',
          message: `Plugin ${job.pluginId} does not support live detection`,
        });
      }

      const result = await liveDetection.getLiveStatus(job.creatorId);
      const durationMs = Date.now() - startTime;

      // ponytail: a DEGRADED check (site unreachable, transport failure) is
      // neither live nor ended — the plugin says so via `unknown`. Treating
      // it as offline emitted `creator-offline`, which the app wiring
      // translates into `stopForCreator` — healthy recordings were
      // finalized mid-capture by a network blip (verified: a 15-min-capped
      // BongaCams recording finalized after ~5min with 21s of media while
      // the site was unreachable). Keep the previous definitive state, do
      // not count a failure, and retry sooner than a full interval.
      if (result.unknown === true) {
        const current = this.queue.get(job.id);
        if (current !== undefined) {
          const retryMs = Math.min(current.intervalMs, UNKNOWN_CHECK_RETRY_MS);
          current.lastCheckAt = Date.now();
          current.nextCheckAt = Date.now() + retryMs;
          current.updatedAt = new Date().toISOString();
          // ponytail: the scheduler's tick marked the job 'checking'
          // transiently; restore 'queued' — that state is due again after
          // the retry deadline ('checking' itself is not in due() and would
          // leave the job a zombie).
          this.queue.updateState(current.id, 'queued');
          this.repo.update(current.id, {
            nextCheckAt: current.nextCheckAt,
            lastCheckAt: current.lastCheckAt,
            state: 'queued',
          });
          this.logger.info(
            { creatorId: job.creatorId, durationMs, retryMs },
            'monitoring check degraded (site unreachable) — state kept, retrying soon',
          );
        }
        this.emitStats();
        return;
      }

      const checkResult: MonitoringCheckResult = {
        isLive: result.isLive,
        title: result.title,
        thumbnail: result.thumbnail,
        viewerCount: result.viewerCount,
        streamUrl: result.streamUrl,
        startedAt: result.startedAt,
        checkedAt: new Date().toISOString(),
        durationMs,
      };

      const wasLive = this.liveIds.has(job.creatorId);

      this.queue.recordCheck(job.id, checkResult);
      this.repo.setLastCheck(job.id, JSON.stringify(checkResult), durationMs, job.nextCheckAt);

      this.checkDurations.push(durationMs);
      if (this.checkDurations.length > 100) {
        this.checkDurations = this.checkDurations.slice(-100);
      }

      // ponytail: emit only on state TRANSITIONS — see liveIds above.
      if (result.isLive) {
        this.repo.setState(job.id, 'live');
        if (!wasLive) {
          this.liveIds.add(job.creatorId);
          this.emitEvent({
            type: 'creator-live',
            creatorId: job.creatorId,
            pluginId: job.pluginId,
            jobId: job.id,
            isLive: true,
            data: checkResult,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        this.repo.setState(job.id, 'offline');
        if (wasLive) {
          this.liveIds.delete(job.creatorId);
          this.emitEvent({
            type: 'creator-offline',
            creatorId: job.creatorId,
            pluginId: job.pluginId,
            jobId: job.id,
            isLive: false,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.emitEvent({
        type: 'plugin-error',
        creatorId: job.creatorId,
        pluginId: job.pluginId,
        jobId: job.id,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });

      this.queue.scheduleRetry(job.id);
      this.repo.setError(job.id, errorMsg);
      this.repo.incrementAttempts(job.id);

      this.notifications.send({
        level: 'error',
        title: 'Monitoring check failed',
        message: `Failed to check ${job.creatorId}: ${errorMsg}`,
        data: { creatorId: job.creatorId, pluginId: job.pluginId },
      });
    }
  }

  private restoreJobs(): void {
    const persisted = this.repo.list();
    for (const record of persisted) {
      const state = record.state === 'checking' ? 'queued' : record.state;
      const job: MonitoringJob = {
        id: record.id,
        creatorId: record.creatorId,
        pluginId: record.pluginId,
        state: state as MonitoringJob['state'],
        priority: record.priority,
        intervalMs: record.intervalMs,
        nextCheckAt: record.nextCheckAt,
        lastCheckAt: record.lastCheckAt ?? undefined,
        lastResult: record.lastResult != null ? JSON.parse(record.lastResult) as MonitoringCheckResult : undefined,
        attempts: record.attempts,
        maxAttempts: record.maxAttempts,
        error: record.error ?? undefined,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
      this.queue.add(job);
      // Seed the edge-detection set from persisted state so a live creator
      // doesn't re-announce on the first post-restart check. A stale 'live'
      // that has actually gone offline self-corrects: the next definitive
      // check sees isLive=false while seeded — live→offline edge emits once,
      // which is correct behavior anyway.
      if (state === 'live') {
        this.liveIds.add(record.creatorId);
      }
    }
    this.logger.info({ count: persisted.length }, 'restored monitoring jobs');
  }

  private persistJob(job: MonitoringJob): void {
    // ponytail: upsert — jobs restored from the DB already exist, so a plain
    // insert would violate the primary key.
    this.repo.update(job.id, {
      intervalMs: job.intervalMs,
      nextCheckAt: job.nextCheckAt,
      state: job.state,
      attempts: job.attempts,
      lastCheckAt: job.lastCheckAt ?? null,
      lastResult: job.lastResult !== undefined ? JSON.stringify(job.lastResult) : null,
      error: job.error ?? null,
    });
  }

  private setupQueueEvents(): void {
    this.queue.on('job-failed', (job) => {
      this.notifications.send({
        level: 'error',
        title: 'Monitoring permanently failed',
        message: `Creator ${job.creatorId} check failed after ${job.attempts} attempts`,
        data: { creatorId: job.creatorId, pluginId: job.pluginId },
      });
    });
  }

  private emitEvent(event: MonitoringEvent): void {
    this.emit('event', event);
  }

  /** Broadcast a dashboard snapshot so the UI stays live without polling. */
  private emitStats(): void {
    this.emitEvent({
      type: 'stats-updated',
      stats: this.getDashboard(),
      timestamp: new Date().toISOString(),
    });
  }
}
