import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Logger } from '@rekordly/shared';
import type { BackgroundJobRepo, BackgroundJobRecord } from '@rekordly/database';

export interface BackgroundJobServiceOptions {
  repo: BackgroundJobRepo;
  logger: Logger;
}

export interface BackgroundJobServiceEvents {
  'job-queued': [{ jobId: string; type: string; timestamp: string }];
  'job-started': [{ jobId: string; type: string; timestamp: string }];
  'job-completed': [{ jobId: string; type: string; timestamp: string }];
  'job-failed': [{ jobId: string; type: string; error: string; timestamp: string }];
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<unknown>;

export class BackgroundJobService extends EventEmitter<BackgroundJobServiceEvents> {
  private readonly repo: BackgroundJobRepo;
  private readonly logger: Logger;
  private readonly handlers = new Map<string, JobHandler>();
  private readonly processing = new Set<string>();

  constructor(options: BackgroundJobServiceOptions) {
    super();
    this.repo = options.repo;
    this.logger = options.logger;
  }

  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  enqueue(type: string, payload?: Record<string, unknown>, priority?: number): BackgroundJobRecord {
    const now = new Date().toISOString();
    const record: BackgroundJobRecord = {
      id: randomUUID(),
      type,
      status: 'queued',
      priority: priority ?? 0,
      payload: payload ? JSON.stringify(payload) : null,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.repo.create(record);
    this.emit('job-queued', { jobId: record.id, type, timestamp: now });
    return record;
  }

  getJob(id: string): BackgroundJobRecord | undefined {
    return this.repo.get(id);
  }

  listJobs(type?: string, status?: string): BackgroundJobRecord[] {
    return this.repo.list(type, status);
  }

  cancelJob(id: string): void {
    const job = this.repo.get(id);
    if (job && job.status === 'queued') {
      this.repo.update(id, { status: 'cancelled', finishedAt: new Date().toISOString() });
    }
  }

  removeJob(id: string): void {
    this.repo.remove(id);
  }

  clearCompleted(): void {
    this.repo.clearCompleted();
  }

  countByStatus(): Record<string, number> {
    return this.repo.countByStatus();
  }

  async processNext(): Promise<void> {
    if (this.processing.size >= 2) return;

    const due = this.repo.listDue();
    if (due.length === 0) return;

    const job = due[0]!;
    const handler = this.handlers.get(job.type);
    if (!handler) {
      this.repo.update(job.id, { status: 'failed', error: `No handler for type: ${job.type}`, finishedAt: new Date().toISOString() });
      return;
    }

    this.processing.add(job.id);
    this.repo.update(job.id, { status: 'running', startedAt: new Date().toISOString() });
    this.emit('job-started', { jobId: job.id, type: job.type, timestamp: new Date().toISOString() });

    try {
      const payload = job.payload ? JSON.parse(job.payload) as Record<string, unknown> : {};
      const result = await handler(payload);
      this.repo.update(job.id, {
        status: 'completed',
        result: JSON.stringify(result),
        progress: 100,
        finishedAt: new Date().toISOString(),
      });
      this.emit('job-completed', { jobId: job.id, type: job.type, timestamp: new Date().toISOString() });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.repo.update(job.id, { status: 'failed', error: errorMsg, finishedAt: new Date().toISOString() });
      this.emit('job-failed', { jobId: job.id, type: job.type, error: errorMsg, timestamp: new Date().toISOString() });
      this.logger.error({ jobId: job.id, type: job.type, error: errorMsg }, 'background job failed');
    } finally {
      this.processing.delete(job.id);
    }
  }
}
