import { describe, expect, it, vi } from 'vitest';
import { MonitoringQueue } from './queue';
import type { MonitoringJob } from '@rekordly/shared';

function makeJob(overrides: Partial<MonitoringJob> = {}): MonitoringJob {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'job-1',
    creatorId: 'myfreecams:model',
    pluginId: 'myfreecams',
    state: 'queued',
    priority: 0,
    intervalMs: 300_000,
    nextCheckAt: 0,
    attempts: 0,
    maxAttempts: 5,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function offlineResult(): Parameters<MonitoringQueue['recordCheck']>[1] {
  return { isLive: false, checkedAt: new Date().toISOString(), durationMs: 10 };
}

describe('MonitoringQueue retry lifecycle', () => {
  it('resets the failure streak on every successful check (no tripwire)', () => {
    const queue = new MonitoringQueue({ maxRetries: 5, initialBackoffMs: 1000, maxBackoffMs: 5000 });
    queue.add(makeJob());
    // Five healthy checks must not arm the failure counter...
    for (let i = 0; i < 5; i++) {
      queue.recordCheck('job-1', offlineResult());
    }
    const job = queue.get('job-1')!;
    expect(job.attempts).toBe(0);
    // ...so one transport error retries instead of permanently failing.
    queue.scheduleRetry('job-1');
    expect(queue.get('job-1')!.state).toBe('retrying');
  });

  it('retrying jobs come back due after the backoff deadline', () => {
    const queue = new MonitoringQueue({ maxRetries: 5, initialBackoffMs: 100, maxBackoffMs: 5000 });
    queue.add(makeJob({ state: 'retrying', nextCheckAt: Date.now() + 10_000 }));
    expect(queue.due(10).length).toBe(0);
    queue.add(
      makeJob({ id: 'job-2', creatorId: 'bongacams:model', state: 'retrying', nextCheckAt: Date.now() - 1 }),
    );
    expect(queue.due(10).map((j) => j.id)).toContain('job-2');
  });

  it('failed jobs auto-recover after a long cooldown instead of dying forever', () => {
    const onFailed = vi.fn();
    const queue = new MonitoringQueue({ maxRetries: 3, initialBackoffMs: 100, maxBackoffMs: 5000 });
    queue.on('job-failed', onFailed);
    queue.add(makeJob());
    for (let i = 0; i < 3; i++) {
      queue.scheduleRetry('job-1');
    }
    const job = queue.get('job-1')!;
    expect(job.state).toBe('failed');
    expect(onFailed).toHaveBeenCalledTimes(1);
    // The cooldown deadline is stamped so the monitor revives automatically.
    expect(job.nextCheckAt).toBeGreaterThan(Date.now());
    expect(job.nextCheckAt).toBeLessThanOrEqual(Date.now() + 5000 + 5_000);
    expect(queue.due(10).length).toBe(0);
    // After the cooldown elapses the failed monitor is eligible again.
    job.nextCheckAt = Date.now() - 1;
    expect(queue.due(10).map((j) => j.id)).toContain('job-1');
    // And a successful check leaves the failed state entirely.
    queue.recordCheck('job-1', offlineResult());
    expect(queue.get('job-1')!.state).toBe('offline');
    expect(queue.get('job-1')!.attempts).toBe(0);
  });
});
