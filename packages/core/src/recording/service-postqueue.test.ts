import { execFile } from 'node:child_process';
import { copyFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  baseStream,
  createRepo,
  createService,
  ffmpegAvailable,
  mkOutputDir,
  waitForStatus,
} from './test-harness';

const execFileAsync = promisify(execFile);
const itNeedsFfmpeg = ffmpegAvailable ? it : it;

/** Valid 1s h264 fixture so background enrichment has real media to work on. */
let fixturePath: string | null = null;
beforeAll(async () => {
  if (!ffmpegAvailable) return;
  const dir = await mkdtemp(join(tmpdir(), 'rekordly-postq-fixture-'));
  fixturePath = join(dir, 'fixture.mp4');
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=1:size=64x64:rate=5',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-t', '1',
    fixturePath,
  ]);
});

describe('RecordingService background post-processing (plan §13)', () => {
  itNeedsFfmpeg('completes the live path while post work is still queued (live-never-waits)', async () => {
    const outputDir = await mkOutputDir('rekordly-postq-');
    const { repo, recordings } = createRepo();
    const { service, fakeYtDlp } = createService({ repo, outputDir, startGapMs: 10, minMeaningfulCaptureSeconds: 0 });
    service.postQueue.setPaused(true);
    fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
      await copyFile(fixturePath as string, outputPath);
      return { filePath: outputPath, duration: 0, stopped: false, durationCapReached: false };
    });

    const jobId = await service.startRecording({ ...baseStream });
    expect(await waitForStatus(repo, jobId, ['completed'], 15_000)).toBe('completed');

    // Live contract: entry + completed row exist, post work untouched.
    expect(recordings.size).toBe(1);
    expect(service.postQueue.size).toBe(1);
    const entry = [...recordings.values()][0]!;
    expect(entry.thumbnailPath).toBeUndefined();
    expect(entry.resolution).toBeUndefined();
    expect(repo.getJob(jobId)?.verified).toBe(false);

    // Release the queue: enrichment (thumbnail + metadata + verified) lands.
    service.postQueue.setPaused(false);
    await vi.waitFor(
      () => {
        const updated = [...recordings.values()][0]!;
        expect(updated.thumbnailPath).toBeDefined();
        expect(updated.resolution).toBeDefined();
      },
      { timeout: 30_000 },
    );
    await vi.waitFor(() => expect(repo.getJob(jobId)?.verified).toBe(true), { timeout: 10_000 });
    expect(service.postQueue.size).toBe(0);
  });

  itNeedsFfmpeg('a burst of finishes queues instead of bursting ffmpeg', async () => {
    const outputDir = await mkOutputDir('rekordly-postq-');
    const { repo, recordings } = createRepo();
    const { service, fakeYtDlp } = createService({ repo, outputDir, startGapMs: 10, minMeaningfulCaptureSeconds: 0 });
    service.postQueue.setPaused(true);
    fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
      await copyFile(fixturePath as string, outputPath);
      return { filePath: outputPath, duration: 0, stopped: false, durationCapReached: false };
    });

    const ids = await Promise.all([
      service.startRecording({ ...baseStream }),
      service.startRecording({ ...baseStream }),
      service.startRecording({ ...baseStream }),
    ]);
    for (const id of ids) {
      expect(await waitForStatus(repo, id, ['completed'], 15_000)).toBe('completed');
    }
    // All three live paths finished; all three post tasks still queued — at
    // most one ffmpeg post job runs at a time once released (WorkQueue c=1).
    expect(recordings.size).toBe(3);
    expect(service.postQueue.size).toBe(3);
    expect(service.postQueue.activeCount).toBe(0);
    service.postQueue.setPaused(false);
    await vi.waitFor(() => expect(service.postQueue.size).toBe(0), { timeout: 60_000 });
  });
});

