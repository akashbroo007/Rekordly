import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@rekordly/shared';
import {
  baseStream,
  createRepo,
  createService,
  mkOutputDir,
  waitForStatus,
} from './test-harness';

describe('RecordingService staggered admission (plan §9)', () => {
  it('launches bursts with gaps instead of all at once, without delaying the return', async () => {
    const outputDir = await mkOutputDir('rekordly-admission-');
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({ repo, outputDir, startGapMs: 250 });
    const launchedAt: number[] = [];
    fakeYtDlp.download.mockImplementation(async () => {
      launchedAt.push(Date.now());
      return new Promise(() => undefined);
    });

    // Pre-create output dirs so mkdir latency doesn't skew launch-gap timing.
    await mkdir(join(outputDir, baseStream.platformId, baseStream.creatorName), { recursive: true });
    const t1 = Date.now();
    const ids = await Promise.all([
      service.startRecording({ ...baseStream }),
      service.startRecording({ ...baseStream }),
      service.startRecording({ ...baseStream }),
    ]);
    // All three accepted immediately — queueing never blocks the caller.
    expect(Date.now() - t1).toBeLessThan(120);
    expect(new Set(ids).size).toBe(3);

    await vi.waitFor(() => expect(fakeYtDlp.download).toHaveBeenCalledTimes(3), { timeout: 5000 });
    expect(launchedAt).toHaveLength(3);
    // Production gap is 2000ms; the 120ms floor here absorbs fs/timer jitter
    // under parallel-suite load while still proving serialization (same-tick
    // launches would measure ~0ms).
    expect(launchedAt[1]! - launchedAt[0]!).toBeGreaterThanOrEqual(120);
    expect(launchedAt[2]! - launchedAt[1]!).toBeGreaterThanOrEqual(120);
  });

  it('drops a start cancelled while queued instead of launching it', async () => {
    const outputDir = await mkOutputDir('rekordly-admission-');
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({ repo, outputDir, startGapMs: 300 });
    fakeYtDlp.download.mockImplementation(async () => new Promise(() => undefined));

    const first = await service.startRecording({ ...baseStream });
    const second = await service.startRecording({ ...baseStream });
    await service.cancelRecording(second);

    await new Promise((r) => setTimeout(r, 700));
    const launchedUrls = fakeYtDlp.download.mock.calls.map((c) => c[0] as string);
    expect(fakeYtDlp.download).toHaveBeenCalledTimes(1);
    expect(launchedUrls).toEqual([first]);
    expect(repo.getJob(second)?.status).toBe('cancelled');
  });

  it('parks starts at the ceiling and launches them once room frees up', async () => {
    const outputDir = await mkOutputDir('rekordly-admission-');
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      startGapMs: 150,
      admissionRetryMs: 150,
    });
    service.updateSettings({ maxConcurrent: 1 });
    // Pre-create dirs so the first launch's row flips to 'recording' well
    // before the second launch's admission check (gap >> mkdir latency).
    await mkdir(join(outputDir, baseStream.platformId, baseStream.creatorName), { recursive: true });
    let failFirst!: (error: unknown) => void;
    fakeYtDlp.download
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failFirst = reject;
          }),
      )
      .mockImplementation(async () => new Promise(() => undefined));

    const first = await service.startRecording({ ...baseStream });
    const second = await service.startRecording({ ...baseStream });
    await vi.waitFor(() => expect(service.getWorkerState(first)).toBe('RECORDING'));

    // Ceiling reached: the second start waits QUEUED instead of failing.
    await new Promise((r) => setTimeout(r, 400));
    expect(fakeYtDlp.download).toHaveBeenCalledTimes(1);
    expect(['preparing', 'queued']).toContain(repo.getJob(second)?.status);

    failFirst(new AppError({ code: 'FFMPEG_SPAWN_FAILED', message: 'binary gone', recoverable: false }));
    await waitForStatus(repo, second, ['recording'], 15_000);
    expect(fakeYtDlp.download).toHaveBeenCalledTimes(2);
  });

  it('parks starts when the output drive is below the free-space floor', async () => {
    const outputDir = await mkOutputDir('rekordly-admission-');
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      startGapMs: 20,
      getMinFreeBytes: () => Number.MAX_SAFE_INTEGER,
    });
    fakeYtDlp.download.mockImplementation(async () => new Promise(() => undefined));

    const jobId = await service.startRecording({ ...baseStream });
    await new Promise((r) => setTimeout(r, 300));
    expect(fakeYtDlp.download).not.toHaveBeenCalled();
    expect(['preparing', 'queued']).toContain(repo.getJob(jobId)?.status);
  });

  it('reports in-memory resource usage with graceful unknown estimates', async () => {
    const outputDir = await mkOutputDir('rekordly-admission-');
    const { repo } = createRepo();
    const { service, fakeYtDlp, liveDownloader } = createService({ repo, outputDir, startGapMs: 20 });
    fakeYtDlp.download.mockImplementation(async () => new Promise(() => undefined));

    const idle = service.getResourceUsage();
    expect(idle.activeStreams).toBe(0);
    expect(idle.activeProcesses).toBe(0);
    expect(idle.estimatedNetworkBps).toBeUndefined();
    expect(idle.activeTranscodes).toBe(0);

    const jobId = await service.startRecording({ ...baseStream });
    await vi.waitFor(() => expect(service.getWorkerState(jobId)).toBe('RECORDING'));
    fakeYtDlp.getActivePids.mockReturnValue([{ pid: 4242, type: 'ffmpeg' }]);
    liveDownloader.emit('progress', jobId, { percent: 0, speed: 8000, eta: 0, bytesDownloaded: 8000, totalBytes: 0 });

    const loaded = service.getResourceUsage();
    expect(loaded.activeStreams).toBe(1);
    expect(loaded.activeProcesses).toBe(1);
    expect(loaded.estimatedNetworkBps).toBe(8000);
    expect(loaded.estimatedDiskBps).toBe(8000);
  });
});
