import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { AppError, type RecordingState, type StreamObject } from '@rekordly/shared';

export interface RecordingJob {
  id: string;
  stream: StreamObject;
  state: RecordingState;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: AppError;
}

/** State machine from ARCHITECTURE.md: queued -> preparing -> recording -> verifying -> completed -> indexed. */
const ALLOWED_TRANSITIONS: Record<RecordingState, readonly RecordingState[]> = {
  queued: ['preparing', 'cancelled'],
  preparing: ['recording', 'failed', 'cancelled'],
  recording: ['verifying', 'paused', 'failed', 'cancelled'],
  paused: ['recording', 'cancelled'],
  verifying: ['completed', 'failed', 'cancelled'],
  completed: ['indexed'],
  indexed: [],
  failed: [],
  cancelled: [],
};

export interface RecordingQueueEvents {
  added: [job: RecordingJob];
  removed: [id: string];
  'state-changed': [job: RecordingJob];
}

export class RecordingQueue extends EventEmitter<RecordingQueueEvents> {
  private readonly jobs = new Map<string, RecordingJob>();

  constructor(private readonly capacity = 100) {
    super();
  }

  enqueue(stream: StreamObject): RecordingJob {
    if (this.jobs.size >= this.capacity) {
      throw new AppError({
        code: 'QUEUE_FULL',
        message: `Recording queue is full (${this.capacity} jobs)`,
        recoverable: true,
      });
    }
    const job: RecordingJob = {
      id: randomUUID(),
      stream,
      state: 'queued',
      createdAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    this.emit('added', job);
    return job;
  }

  remove(id: string): void {
    if (this.jobs.delete(id)) {
      this.emit('removed', id);
    }
  }

  get(id: string): RecordingJob | undefined {
    return this.jobs.get(id);
  }

  list(): RecordingJob[] {
    return [...this.jobs.values()];
  }

  /** Oldest job still in the 'queued' state. */
  next(): RecordingJob | undefined {
    for (const job of this.jobs.values()) {
      if (job.state === 'queued') {
        return job;
      }
    }
    return undefined;
  }

  setState(id: string, state: RecordingState, error?: AppError): RecordingJob {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new AppError({ code: 'JOB_NOT_FOUND', message: `Recording job ${id} not found` });
    }
    const allowed = ALLOWED_TRANSITIONS[job.state];
    if (!allowed.includes(state)) {
      throw new AppError({
        code: 'INVALID_TRANSITION',
        message: `Cannot transition recording job from ${job.state} to ${state}`,
        recoverable: true,
      });
    }
    job.state = state;
    job.error = error;
    if (state === 'recording') {
      job.startedAt = Date.now();
    }
    if (
      state === 'completed' ||
      state === 'failed' ||
      state === 'cancelled' ||
      state === 'indexed'
    ) {
      job.finishedAt = Date.now();
    }
    this.emit('state-changed', job);
    return job;
  }
}
