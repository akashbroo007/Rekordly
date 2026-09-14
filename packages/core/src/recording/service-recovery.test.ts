import { spawn, type ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordingJobRecord, RecordingRepo } from '@rekordly/database';
import {
  baseStream,
  createRepo,
  createService,
  ffmpegAvailable,
  mkOutputDir,
} from './test-harness';

const itNeedsFfmpeg = ffmpegAvailable ? it : it.skip;
/** Bulk command-line scan only exists on Windows (plan §11). */
const itNeedsWinFfmpeg = ffmpegAvailable && process.platform === 'win32' ? it : it.skip;

function staleJob(overrides: Partial<RecordingJobRecord> = {}): RecordingJobRecord {
  const now = new Date().toISOString();
  return {
    id: `stale-${Math.random().toString(36).slice(2)}`,
    creatorId: 'creator-1',
    pluginId: 'test-platform',
    streamUrl: baseStream.streamUrl,
    title: 'TestCreator_2026-01-01_00-00-00',
    platformId: 'test-platform',
    thumbnail: null,
    quality: 'best',
    status: 'recording',
    attempts: 0,
    maxAttempts: 3,
    bytesDownloaded: 1024,
    speed: 0,
    eta: 0,
    percent: 0,
    error: null,
    pid: 2_100_000_000, // implausible pid — guaranteed dead without touching real processes
    filePath: join('C:', 'nonexistent-dir-rekordly-test', 'out.mp4'),
    thumbnailPath: null,
    verified: false,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
    ...overrides,
  };
}

describe('RecordingService stale recovery parity (plan §11, constraint §0.1.6)', () => {
  it('marks dead-pid jobs failed with the legacy message and adopts nothing', async () => {
    const outputDir = await mkOutputDir('rekordly-recovery-');
    const { repo } = createRepo();
    const { service } = createService({ repo, outputDir });
    const job = staleJob();
    repo.createJob(job);

    const adopted = await service.recoverStaleJobs();

    expect(adopted).toBe(0);
    const row = repo.getJob(job.id);
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('App restarted while the recording was active');
    expect(row?.finishedAt).not.toBeNull();
  });

  it('returns 0 without throwing when the jobs table is torn', async () => {
    const outputDir = await mkOutputDir('rekordly-recovery-');
    const { repo } = createRepo();
    const broken = {
      ...repo,
      listJobs: (): RecordingJobRecord[] => {
        throw new Error('database disk image is malformed');
      },
    } as unknown as RecordingRepo;
    const { service } = createService({ repo: broken, outputDir });

    await expect(service.recoverStaleJobs()).resolves.toBe(0);
  });

  it('isolates a torn row: one bad update must not abort the rest', async () => {
    const outputDir = await mkOutputDir('rekordly-recovery-');
    const { repo } = createRepo();
    const bad = staleJob({ id: 'stale-bad' });
    const good = staleJob({ id: 'stale-good' });
    repo.createJob(bad);
    repo.createJob(good);
    const flaky = {
      ...repo,
      updateJob: (id: string, patch: Partial<RecordingJobRecord>): void => {
        if (id === bad.id) throw new Error('torn row');
        repo.updateJob(id, patch);
      },
    } as unknown as RecordingRepo;
    const { service } = createService({ repo: flaky, outputDir });

    const adopted = await service.recoverStaleJobs();

    expect(adopted).toBe(0);
    // The good row still reached the legacy failed outcome via the real repo.
    expect(repo.getJob(good.id)?.status).toBe('failed');
  });

  itNeedsFfmpeg(
    'adopts a still-live recorder process and reports a RECORDING worker',
    { timeout: 60_000 },
    async () => {
      const outputDir = await mkOutputDir('rekordly-recovery-');
      const { repo } = createRepo();
      const { service } = createService({ repo, outputDir });
      // A real long-running ffmpeg stands in for the orphaned recorder child.
      const child: ChildProcess = spawn(
        'ffmpeg',
        ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=3600:size=64x64:rate=5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'null', '-'],
        { windowsHide: true, stdio: 'ignore' },
      );
      try {
        expect(child.pid).toBeDefined();
        const job = staleJob({ filePath: join(outputDir, 'orphan.mp4') });
        repo.createJob({ ...job, pid: child.pid as number });

        const adopted = await service.recoverStaleJobs();

        expect(adopted).toBe(1);
        expect(repo.getJob(job.id)?.status).toBe('recording');
        expect(service.getWorkerState(job.id)).toBe('RECORDING');
      } finally {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already exited */
        }
        // Terminal row so the orphan watcher exits instead of polling forever.
        repo.updateJob((repo.listJobs()[0] as RecordingJobRecord).id, { status: 'cancelled' });
      }
    },
  );

  itNeedsWinFfmpeg(
    'falls back to the bulk command-line scan when the persisted pid is dead',
    { timeout: 90_000 },
    async () => {
      const outputDir = await mkOutputDir('rekordly-recovery-');
      const { repo } = createRepo();
      const { service } = createService({ repo, outputDir });
      // The output path appears verbatim in ffmpeg's command line — the bulk
      // snapshot matches it even though the persisted pid is bogus.
      // (Infinite lavfi source: a capped source can race to EOF on tiny
      // frames before the scan runs; the child is killed in `finally`.)
      const outPath = join(outputDir, 'scan-me.mp4');
      const child: ChildProcess = spawn(
        'ffmpeg',
        ['-y', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', outPath],
        { windowsHide: true, stdio: 'ignore' },
      );
      try {
        const job = staleJob({ filePath: outPath });
        repo.createJob(job);

        const adopted = await service.recoverStaleJobs();

        expect(adopted).toBe(1);
        expect(repo.getJob(job.id)?.status).toBe('recording');
        expect(repo.getJob(job.id)?.pid).toBe(child.pid);
        expect(service.getWorkerState(job.id)).toBe('RECORDING');
      } finally {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already exited */
        }
        repo.updateJob((repo.listJobs()[0] as RecordingJobRecord).id, { status: 'cancelled' });
        await rm(outPath, { force: true }).catch(() => undefined);
      }
    },
  );

  it('does not mistake an unrelated recycled pid for a live recorder', async () => {
    const outputDir = await mkOutputDir('rekordly-recovery-');
    const { repo } = createRepo();
    const { service } = createService({ repo, outputDir });
    // Self pid is alive but is node.exe, not a recorder — must not adopt.
    const job = staleJob({ pid: process.pid, filePath: join(outputDir, 'nope.mp4') });
    repo.createJob(job);

    const adopted = await service.recoverStaleJobs();

    expect(adopted).toBe(0);
    expect(repo.getJob(job.id)?.status).toBe('failed');
  });
});
