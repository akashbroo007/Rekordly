import { EventEmitter } from 'node:events';
import type { MonitoringJob, MonitoringCheckResult } from '@rekordly/shared';

export interface MonitoringQueueOptions {
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
}

export interface MonitoringQueueEvents {
  'job-ready': [job: MonitoringJob];
  'job-completed': [job: MonitoringJob];
  'job-failed': [job: MonitoringJob];
  'job-retry': [job: MonitoringJob];
}

/**
 * Priority queue for monitoring jobs with retry and exponential backoff.
 * No duplicate jobs per creator.
 */
export class MonitoringQueue extends EventEmitter<MonitoringQueueEvents> {
  private readonly jobs = new Map<string, MonitoringJob>();
  private readonly creatorIndex = new Map<string, string>();
  private readonly options: MonitoringQueueOptions;

  constructor(options?: Partial<MonitoringQueueOptions>) {
    super();
    this.options = {
      maxRetries: options?.maxRetries ?? 5,
      initialBackoffMs: options?.initialBackoffMs ?? 30000,
      maxBackoffMs: options?.maxBackoffMs ?? 600000,
    };
  }

  add(job: MonitoringJob): void {
    if (this.creatorIndex.has(job.creatorId)) {
      return;
    }
    this.jobs.set(job.id, job);
    this.creatorIndex.set(job.creatorId, job.id);
  }

  remove(id: string): boolean {
    const job = this.jobs.get(id);
    if (job === undefined) return false;
    this.creatorIndex.delete(job.creatorId);
    this.jobs.delete(id);
    return true;
  }

  removeByCreatorId(creatorId: string): boolean {
    const id = this.creatorIndex.get(creatorId);
    if (id === undefined) return false;
    this.jobs.delete(id);
    this.creatorIndex.delete(creatorId);
    return true;
  }

  get(id: string): MonitoringJob | undefined {
    return this.jobs.get(id);
  }

  getByCreatorId(creatorId: string): MonitoringJob | undefined {
    const id = this.creatorIndex.get(creatorId);
    return id !== undefined ? this.jobs.get(id) : undefined;
  }

  list(): MonitoringJob[] {
    return [...this.jobs.values()];
  }

  listByState(state: string): MonitoringJob[] {
    return this.list().filter((j) => j.state === state);
  }

  /** Get jobs ready to be checked, ordered by priority then nextCheckAt. */
  due(limit = 10): MonitoringJob[] {
    const now = Date.now();
    return this.list()
      .filter((j) => (j.state === 'queued' || j.state === 'offline' || j.state === 'live') && j.nextCheckAt <= now)
      .sort((a, b) => a.priority - b.priority || a.nextCheckAt - b.nextCheckAt)
      .slice(0, limit);
  }

  size(): number {
    return this.jobs.size;
  }

  updateState(id: string, state: MonitoringJob['state']): MonitoringJob | undefined {
    const job = this.jobs.get(id);
    if (job === undefined) return undefined;
    job.state = state;
    job.updatedAt = new Date().toISOString();
    return job;
  }

  recordCheck(id: string, result: MonitoringCheckResult): MonitoringJob | undefined {
    const job = this.jobs.get(id);
    if (job === undefined) return undefined;
    job.lastCheckAt = Date.now();
    job.lastResult = result;
    job.attempts += 1;
    job.nextCheckAt = Date.now() + job.intervalMs;
    job.updatedAt = new Date().toISOString();

    if (result.isLive) {
      job.state = 'live';
    } else {
      job.state = 'offline';
    }
    return job;
  }

  scheduleRetry(id: string): MonitoringJob | undefined {
    const job = this.jobs.get(id);
    if (job === undefined) return undefined;

    job.attempts += 1;
    if (job.attempts >= this.options.maxRetries) {
      job.state = 'failed';
      this.emit('job-failed', job);
      return job;
    }

    const backoff = Math.min(
      this.options.initialBackoffMs * Math.pow(2, job.attempts - 1),
      this.options.maxBackoffMs,
    );
    job.state = 'retrying';
    job.nextCheckAt = Date.now() + backoff;
    job.updatedAt = new Date().toISOString();
    this.emit('job-retry', job);
    return job;
  }

  pause(id: string): MonitoringJob | undefined {
    const job = this.jobs.get(id);
    if (job === undefined) return undefined;
    job.state = 'paused';
    job.updatedAt = new Date().toISOString();
    return job;
  }

  resume(id: string): MonitoringJob | undefined {
    const job = this.jobs.get(id);
    if (job === undefined) return undefined;
    job.state = 'queued';
    job.nextCheckAt = Date.now();
    job.updatedAt = new Date().toISOString();
    return job;
  }

  stats(): {
    total: number;
    queued: number;
    checking: number;
    live: number;
    offline: number;
    paused: number;
    retrying: number;
    failed: number;
  } {
    const jobs = this.list();
    return {
      total: jobs.length,
      queued: jobs.filter((j) => j.state === 'queued').length,
      checking: jobs.filter((j) => j.state === 'checking').length,
      live: jobs.filter((j) => j.state === 'live').length,
      offline: jobs.filter((j) => j.state === 'offline').length,
      paused: jobs.filter((j) => j.state === 'paused').length,
      retrying: jobs.filter((j) => j.state === 'retrying').length,
      failed: jobs.filter((j) => j.state === 'failed').length,
    };
  }
}
