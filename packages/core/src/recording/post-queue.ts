import type { Logger } from '@rekordly/shared';

/**
 * Minimal in-memory FIFO work queue with bounded concurrency
 * (CONCURRENT_CAPTURE_PLAN §13).
 *
 * The live recording path only ever *enqueues* — post-processing
 * (verify/repair/remux/thumbnail/metadata) and explicit transcodes drain
 * here, so 30 simultaneous finishes can never spawn 30 parallel ffmpeg
 * bursts. Failures are logged and dropped; the library entry created at
 * finish time is always kept.
 *
 * Rationale for recording-local (not the DB-backed BackgroundJobService):
 * that service has no pump (`processNext` is never called) and no handlers
 * registered — routing every finish through it would add per-finish DB rows
 * plus a new cross-service pump. Revisit when crash-durable post-processing
 * is required.
 */
export interface QueuedTask {
  key: string;
  run: () => Promise<void>;
}

export class WorkQueue {
  private readonly pending: QueuedTask[] = [];
  private active = 0;
  private paused = false;

  constructor(
    private readonly concurrency: number,
    private readonly logger?: Logger,
  ) {}

  /** Jobs waiting for a slot (future UI: "Queued for processing"). */
  get size(): number {
    return this.pending.length;
  }

  get activeCount(): number {
    return this.active;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Test seam (and future low-power hook) — pump resumes on unpause. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) void this.pump();
  }

  enqueue(task: QueuedTask): void {
    this.pending.push(task);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.paused) return;
    while (this.active < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift()!;
      this.active++;
      void this.runOne(task);
    }
  }

  private async runOne(task: QueuedTask): Promise<void> {
    try {
      await task.run();
    } catch (error) {
      this.logger?.warn({ key: task.key, error }, 'background post-processing task failed');
    } finally {
      this.active--;
      void this.pump();
    }
  }
}
