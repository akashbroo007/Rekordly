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
    this.repo.remove(job.id);
    this.emitStats();
    this.logger.info({ jobId: job.id, creatorId }, 'monitoring job removed');
    return true;
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

      this.queue.recordCheck(job.id, checkResult);
      this.repo.setLastCheck(job.id, JSON.stringify(checkResult), durationMs, job.nextCheckAt);

      this.checkDurations.push(durationMs);
      if (this.checkDurations.length > 100) {
        this.checkDurations = this.checkDurations.slice(-100);
      }

      if (result.isLive) {
        this.emitEvent({
          type: 'creator-live',
          creatorId: job.creatorId,
          pluginId: job.pluginId,
          jobId: job.id,
          isLive: true,
          data: checkResult,
          timestamp: new Date().toISOString(),
        });
        this.repo.setState(job.id, 'live');
      } else {
        this.emitEvent({
          type: 'creator-offline',
          creatorId: job.creatorId,
          pluginId: job.pluginId,
          jobId: job.id,
          isLive: false,
          timestamp: new Date().toISOString(),
        });
        this.repo.setState(job.id, 'offline');
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
