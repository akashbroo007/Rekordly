import { describe, expect, it } from 'vitest';
import type { StreamObject } from '@rekordly/shared';
import { RecordingQueue } from './queue';

const stream: StreamObject = {
  creatorId: 'creator-1',
  creatorName: 'Test Creator',
  platformId: 'test-platform',
  title: 'Test Stream',
  streamUrl: 'https://example.com/stream.m3u8',
};

describe('RecordingQueue', () => {
  it('flows a job through the valid state chain', () => {
    const queue = new RecordingQueue();
    const job = queue.enqueue(stream);
    expect(job.state).toBe('queued');
    queue.setState(job.id, 'preparing');
    queue.setState(job.id, 'recording');
    queue.setState(job.id, 'verifying');
    queue.setState(job.id, 'completed');
    queue.setState(job.id, 'indexed');
    expect(queue.get(job.id)?.state).toBe('indexed');
    expect(queue.get(job.id)?.startedAt).toBeDefined();
    expect(queue.get(job.id)?.finishedAt).toBeDefined();
  });

  it('rejects invalid transitions', () => {
    const queue = new RecordingQueue();
    const job = queue.enqueue(stream);
    expect(() => queue.setState(job.id, 'completed')).toThrow(/Cannot transition/);
    expect(job.state).toBe('queued');
  });

  it('returns the oldest queued job', () => {
    const queue = new RecordingQueue();
    const first = queue.enqueue(stream);
    queue.enqueue(stream);
    expect(queue.next()?.id).toBe(first.id);
  });

  it('emits events on mutation', () => {
    const queue = new RecordingQueue();
    const states: string[] = [];
    queue.on('state-changed', (job) => states.push(job.state));
    const job = queue.enqueue(stream);
    queue.setState(job.id, 'preparing');
    queue.setState(job.id, 'recording');
    expect(states).toEqual(['preparing', 'recording']);
  });
});
