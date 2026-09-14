import { describe, expect, it, vi } from 'vitest';
import type { RecordingJobRecord } from '@rekordly/database';
import { createRepo, createService, mkOutputDir } from './test-harness';

function progressSnapshot(bytesDownloaded: number) {
  return { percent: 0, speed: 100, eta: 0, bytesDownloaded, totalBytes: 0 };
}

describe('RecordingService progress accumulator (plan §10)', () => {
  it('coalesces a burst of per-line events into one DB write per window', async () => {
    const outputDir = await mkOutputDir('rekordly-progress-');
    const { repo } = createRepo();
    const { liveDownloader } = createService({ repo, outputDir, progressFlushMs: 60_000 });
    const writes: number[] = [];
    const inner = repo.updateJob.bind(repo);
    (repo as { updateJob: typeof inner }).updateJob = vi.fn((id: string, patch: Partial<RecordingJobRecord>) => {
      if (patch.bytesDownloaded !== undefined && patch.status === undefined) {
        writes.push(patch.bytesDownloaded);
      }
      return inner(id, patch);
    }) as typeof inner;

    for (let i = 1; i <= 10; i++) {
      liveDownloader.emit('progress', 'job-1', progressSnapshot(i * 100));
    }
    expect(writes).toEqual([100]);
  });

  it('flushes again after the window, skipping snapshots identical to the last write', async () => {
    const outputDir = await mkOutputDir('rekordly-progress-');
    const { repo } = createRepo();
    const { liveDownloader } = createService({ repo, outputDir, progressFlushMs: 40 });
    const writes: number[] = [];
    const inner = repo.updateJob.bind(repo);
    (repo as { updateJob: typeof inner }).updateJob = vi.fn((id: string, patch: Partial<RecordingJobRecord>) => {
      if (patch.bytesDownloaded !== undefined && patch.status === undefined) {
        writes.push(patch.bytesDownloaded);
      }
      return inner(id, patch);
    }) as typeof inner;

    liveDownloader.emit('progress', 'job-1', progressSnapshot(100));
    expect(writes).toEqual([100]);

    await new Promise((r) => setTimeout(r, 60));
    // Identical to the last write — skipped even though the window elapsed.
    liveDownloader.emit('progress', 'job-1', progressSnapshot(100));
    expect(writes).toEqual([100]);

    // New data after the window — flushed.
    liveDownloader.emit('progress', 'job-1', progressSnapshot(250));
    expect(writes).toEqual([100, 250]);
  });

  it('tracks jobs independently', async () => {
    const outputDir = await mkOutputDir('rekordly-progress-');
    const { repo } = createRepo();
    const { liveDownloader } = createService({ repo, outputDir, progressFlushMs: 60_000 });
    const seen = new Map<string, number>();
    const inner = repo.updateJob.bind(repo);
    (repo as { updateJob: typeof inner }).updateJob = vi.fn((id: string, patch: Partial<RecordingJobRecord>) => {
      if (patch.bytesDownloaded !== undefined && patch.status === undefined) {
        seen.set(id, patch.bytesDownloaded);
      }
      return inner(id, patch);
    }) as typeof inner;

    liveDownloader.emit('progress', 'job-a', progressSnapshot(10));
    liveDownloader.emit('progress', 'job-b', progressSnapshot(20));
    liveDownloader.emit('progress', 'job-a', progressSnapshot(11));
    expect(seen.get('job-a')).toBe(10);
    expect(seen.get('job-b')).toBe(20);
  });
});
