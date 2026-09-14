import { describe, expect, it, vi } from 'vitest';
import { WorkQueue } from './post-queue';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('WorkQueue', () => {
  it('serializes work at concurrency 1 (no 30× ffmpeg bursts)', async () => {
    const queue = new WorkQueue(1);
    const order: string[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    const gate = deferred();
    queue.enqueue({
      key: 'a',
      run: async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        order.push('a-start');
        await gate.promise;
        order.push('a-end');
        concurrent--;
      },
    });
    queue.enqueue({ key: 'b', run: async () => void order.push('b') });
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual(['a-start']);
    expect(maxConcurrent).toBe(1);
    gate.resolve();
    await vi.waitFor(() => expect(order).toEqual(['a-start', 'a-end', 'b']));
    expect(queue.size).toBe(0);
    expect(queue.activeCount).toBe(0);
  });

  it('allows 2 parallel transcodes at concurrency 2', async () => {
    const queue = new WorkQueue(2);
    const gates = [deferred(), deferred(), deferred()];
    let concurrent = 0;
    let maxConcurrent = 0;
    gates.forEach((gate, i) => {
      queue.enqueue({
        key: `t${i}`,
        run: async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await gate.promise;
          concurrent--;
        },
      });
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(maxConcurrent).toBe(2);
    expect(queue.size).toBe(1);
    gates.forEach((gate) => gate.resolve());
    await vi.waitFor(() => expect(queue.activeCount).toBe(0));
    expect(queue.size).toBe(0);
  });

  it('drops failures without breaking the queue', async () => {
    const warnings: unknown[] = [];
    const queue = new WorkQueue(1, { warn: (o: unknown) => void warnings.push(o) } as never);
    const ran: string[] = [];
    queue.enqueue({ key: 'bad', run: async () => { throw new Error('ffmpeg exploded'); } });
    queue.enqueue({ key: 'good', run: async () => void ran.push('good') });
    await vi.waitFor(() => expect(ran).toEqual(['good']));
    expect(warnings.length).toBe(1);
  });

  it('holds work while paused and resumes on unpause (live-never-waits seam)', async () => {
    const queue = new WorkQueue(1);
    queue.setPaused(true);
    expect(queue.isPaused).toBe(true);
    const ran: string[] = [];
    queue.enqueue({ key: 'held', run: async () => void ran.push('held') });
    await new Promise((r) => setTimeout(r, 50));
    expect(ran).toEqual([]);
    expect(queue.size).toBe(1);
    queue.setPaused(false);
    await vi.waitFor(() => expect(ran).toEqual(['held']));
  });
});
