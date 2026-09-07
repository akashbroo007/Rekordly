import type { Logger } from '@rekordly/shared';
import type { MonitoringJob } from '@rekordly/shared';
import type { MonitoringQueue } from './queue';

export interface SchedulerOptions {
  baseIntervalMs: number;
  maxConcurrent: number;
  tickIntervalMs: number;
}

export interface SchedulerCallbacks {
  onCheckDue(job: MonitoringJob): Promise<void>;
  onStatsUpdate?(): void;
}

/**
 * Scheduler that periodically polls monitoring jobs and dispatches checks.
 * Survives application restarts by restoring state from the database.
 */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private paused = false;
  private startedAt = 0;

  constructor(
    private readonly queue: MonitoringQueue,
    private readonly options: SchedulerOptions,
    private readonly callbacks: SchedulerCallbacks,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.startedAt = Date.now();

    this.timer = setInterval(() => {
      this.tick();
    }, this.options.tickIntervalMs);

    this.logger.info({ intervalMs: this.options.tickIntervalMs }, 'scheduler started');
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info('scheduler stopped');
  }

  pause(): void {
    this.paused = true;
    this.logger.info('scheduler paused');
  }

  resume(): void {
    this.paused = false;
    this.logger.info('scheduler resumed');
  }

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  uptime(): number {
    return this.running ? Date.now() - this.startedAt : 0;
  }

  private async tick(): Promise<void> {
    if (this.paused) return;

    const dueJobs = this.queue.due(this.options.maxConcurrent);
    if (dueJobs.length === 0) return;

    this.logger.debug({ count: dueJobs.length }, 'dispatching monitoring checks');

    const promises = dueJobs.map(async (job) => {
      this.queue.updateState(job.id, 'checking');
      try {
        await this.callbacks.onCheckDue(job);
      } catch (error) {
        this.logger.error({ jobId: job.id, error }, 'monitoring check failed');
        this.queue.scheduleRetry(job.id);
      }
    });

    await Promise.allSettled(promises);
    this.callbacks.onStatsUpdate?.();
  }
}
