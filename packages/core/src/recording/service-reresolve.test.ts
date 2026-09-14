import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ExternalBinary } from '@rekordly/recorder';
import { AppError, type StreamObject } from '@rekordly/shared';
import type { RecordingJobRecord } from '@rekordly/database';
import { baseStream, createRepo, createService, waitForStatus } from './test-harness';

const execFileAsync = promisify(execFile);
const ffmpegBinary = new ExternalBinary('ffmpeg');
// Skip fixture-backed tests where no ffmpeg is resolvable (binary absence,
// not breakage, is the only silent-skip case).
const itNeedsFfmpeg = ffmpegBinary.resolve() !== null ? it : it.skip;

/** Valid 1s h264 fixture for end-to-end (merge/verify/thumb/metadata) paths. */
let fixturePath: string | null = null;
beforeAll(async () => {
  if (ffmpegBinary.resolve() === null) {
    // eslint-disable-next-line no-console
    console.warn('ffmpeg unavailable — skipping fixture-backed re-resolve tests');
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'rekordly-fixture-'));
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

describe('RecordingService worker lifecycle states (plan §5)', () => {
  it('reports RECORDING during capture and FAILED after an error', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-workerstate-'));
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      resolveStream: async () => null,
    });
    let fail!: (error: unknown) => void;
    fakeYtDlp.download.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );

    const jobId = await service.startRecording({ ...baseStream });
    await vi.waitFor(() => expect(service.getWorkerState(jobId)).toBe('RECORDING'));
    // FATAL (local) errors fail immediately without bounded same-URL retries.
    fail(new AppError({ code: 'FFMPEG_SPAWN_FAILED', message: 'boom', recoverable: false }));
    expect(await waitForStatus(repo, jobId, ['failed'])).toBe('failed');
    expect(service.getWorkerState(jobId)).toBe('FAILED');
  });

  it('reports STOPPING once a live recording is cancelled', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-workerstate-'));
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      resolveStream: async () => null,
    });
    fakeYtDlp.download.mockImplementationOnce(() => new Promise(() => undefined));

    const jobId = await service.startRecording({ ...baseStream });
    await vi.waitFor(() => expect(service.getWorkerState(jobId)).toBe('RECORDING'));
    await service.cancelRecording(jobId);
    expect(repo.getJob(jobId)?.status).toBe('cancelled');
    expect(service.getWorkerState(jobId)).toBe('STOPPING');
  });

  itNeedsFfmpeg(
    'leaves FINALIZING behind a completed re-resolved recording',
    { timeout: 90_000 },
    async () => {
      const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-workerstate-'));
      const { repo } = createRepo();
      const { service, fakeYtDlp } = createService({
        repo,
        outputDir,
        minMeaningfulCaptureSeconds: 0,
        resolveStream: async (job: RecordingJobRecord) => ({
          ...baseStream,
          streamUrl: 'https://fresh.example/live.m3u8',
          title: job.title,
        }),
      });
      service.updateSettings({ retryDelay: 50 });
      const fixtureBytes = fixturePath as string;
      let calls = 0;
      fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
        calls += 1;
        await copyFile(fixtureBytes, outputPath);
        if (calls === 1) {
          throw new AppError({
            code: 'FFMPEG_HLS_DOWNLOAD_FAILED',
            message: 'HTTP error 403 Forbidden',
            recoverable: true,
          });
        }
        return { filePath: outputPath, duration: 0, stopped: false, durationCapReached: false };
      });

      const jobId = await service.startRecording({ ...baseStream });
      expect(await waitForStatus(repo, jobId, ['completed'])).toBe('completed');
      expect(service.getWorkerState(jobId)).toBe('FINALIZING');
    },
  );
});

describe('RecordingService URL-expiry re-resolve (plan §4 class B)', () => {
  it('retries transient failures on the SAME url without re-resolving, then fails bounded', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-reresolve-'));
    const { repo } = createRepo();
    const resolveStream = vi.fn(async (_job: RecordingJobRecord): Promise<StreamObject | null> => null);
    const { service, fakeYtDlp } = createService({ repo, outputDir, resolveStream });
    service.updateSettings({ retryDelay: 10 });
    fakeYtDlp.download.mockRejectedValue(
      new AppError({ code: 'YTDLP_DOWNLOAD_FAILED', message: 'yt-dlp download failed: Connection reset by peer', recoverable: true }),
    );

    const jobId = await service.startRecording({ ...baseStream });
    expect(await waitForStatus(repo, jobId, ['failed'])).toBe('failed');
    // Default retryCount (3) bounds the same-URL restarts: 1 + 3 retries.
    expect(fakeYtDlp.download).toHaveBeenCalledTimes(4);
    // Same URL every time — re-resolution is only for URL_EXPIRED.
    for (const call of fakeYtDlp.download.mock.calls) {
      expect(call[1]).toBe(baseStream.streamUrl);
    }
    expect(resolveStream).not.toHaveBeenCalled();
    expect(repo.getJob(jobId)?.error).toContain('Connection reset');
  });

  it('preserves the ORIGINAL error when the stream is genuinely offline (re-resolve null)', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-reresolve-'));
    const { repo } = createRepo();
    const resolveStream = vi.fn(async (_job: RecordingJobRecord): Promise<StreamObject | null> => null);
    const { service, fakeYtDlp } = createService({ repo, outputDir, resolveStream });
    service.updateSettings({ retryDelay: 50 });
    fakeYtDlp.download.mockRejectedValueOnce(
      new AppError({ code: 'FFMPEG_HLS_DOWNLOAD_FAILED', message: 'ffmpeg exited with code 1: HTTP error 403 Forbidden', recoverable: true }),
    );

    const jobId = await service.startRecording({ ...baseStream });
    expect(await waitForStatus(repo, jobId, ['failed'])).toBe('failed');
    expect(fakeYtDlp.download).toHaveBeenCalledTimes(1);
    expect(resolveStream).toHaveBeenCalledTimes(1);
    expect(repo.getJob(jobId)?.error).toContain('403');
  });

  it('honors retryCount as the re-resolve bound (0 = no retry)', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-reresolve-'));
    const { repo } = createRepo();
    const resolveStream = vi.fn(async (_job: RecordingJobRecord): Promise<StreamObject | null> => null);
    const { service, fakeYtDlp } = createService({ repo, outputDir, resolveStream });
    service.updateSettings({ retryCount: 0, retryDelay: 10 });
    fakeYtDlp.download.mockRejectedValueOnce(
      new AppError({ code: 'FFMPEG_HLS_DOWNLOAD_FAILED', message: 'HTTP error 403 Forbidden', recoverable: true }),
    );

    const jobId = await service.startRecording({ ...baseStream });
    expect(await waitForStatus(repo, jobId, ['failed'])).toBe('failed');
    expect(fakeYtDlp.download).toHaveBeenCalledTimes(1);
    expect(resolveStream).not.toHaveBeenCalled();
  });

  itNeedsFfmpeg(
    're-resolves once, preserves the first generation as .part1, merges, and completes',
    { timeout: 90_000 },
    async () => {
      const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-reresolve-'));
      const { repo, recordings } = createRepo();
      const freshUrl = 'https://fresh.example/live.m3u8?token=new';
      const resolveStream = vi.fn(async (job: RecordingJobRecord): Promise<StreamObject | null> => ({
        ...baseStream,
        streamUrl: freshUrl,
        title: job.title,
      }));
      const { service, fakeYtDlp } = createService({
        repo,
        outputDir,
        resolveStream,
        minMeaningfulCaptureSeconds: 0,
      });
      service.updateSettings({ retryDelay: 50 });
      const fixtureBytes = fixturePath as string;

      let calls = 0;
      fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
        calls += 1;
        await copyFile(fixtureBytes, outputPath);
        if (calls === 1) {
          throw new AppError({
            code: 'FFMPEG_HLS_DOWNLOAD_FAILED',
            message: 'ffmpeg exited with code 1: HTTP error 403 Forbidden (token expired)',
            recoverable: true,
          });
        }
        return { filePath: outputPath, duration: 0, stopped: false, durationCapReached: false };
      });

      const jobId = await service.startRecording({ ...baseStream });
      expect(await waitForStatus(repo, jobId, ['completed'])).toBe('completed');

      // Second generation captured with the FRESH url, not the expired one.
      expect(fakeYtDlp.download).toHaveBeenCalledTimes(2);
      expect(fakeYtDlp.download.mock.calls[1]?.[1]).toBe(freshUrl);
      expect(resolveStream).toHaveBeenCalledTimes(1);

      const job = repo.getJob(jobId);
      expect(job?.streamUrl).toBe(freshUrl);
      expect(job?.attempts).toBe(1);

      // Continuity: merged single library entry holding BOTH generations.
      expect(recordings.size).toBe(1);
      const mergedSize = (await stat(job?.filePath as string)).size;
      const singleSize = (await stat(fixtureBytes)).size;
      expect(mergedSize).toBeGreaterThan(singleSize);

      // No part-file leftovers after the merge.
      const dir = join(outputDir, baseStream.platformId, baseStream.creatorName);
      const leftovers = (await readdir(dir)).filter((n) => /\.part\d+\.mp4$/i.test(n) || n.endsWith('.concat.txt'));
      expect(leftovers).toEqual([]);
    },
  );

  itNeedsFfmpeg(
    'transient failure restarts capture in a new part on the same URL and completes',
    { timeout: 90_000 },
    async () => {
      const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-reresolve-'));
      const { repo, recordings } = createRepo();
      const resolveStream = vi.fn(async (_job: RecordingJobRecord): Promise<StreamObject | null> => null);
      const { service, fakeYtDlp } = createService({
        repo,
        outputDir,
        resolveStream,
        startGapMs: 10,
        minMeaningfulCaptureSeconds: 0,
      });
      service.updateSettings({ retryDelay: 50 });
      const fixtureBytes = fixturePath as string;
      let calls = 0;
      fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
        calls += 1;
        await copyFile(fixtureBytes, outputPath);
        if (calls === 1) {
          throw new AppError({
            code: 'FFMPEG_HLS_DOWNLOAD_FAILED',
            message: 'ffmpeg exited with code 1: Connection reset by peer',
            recoverable: true,
          });
        }
        return { filePath: outputPath, duration: 0, stopped: false, durationCapReached: false };
      });

      const jobId = await service.startRecording({ ...baseStream });
      expect(await waitForStatus(repo, jobId, ['completed'])).toBe('completed');
      expect(fakeYtDlp.download).toHaveBeenCalledTimes(2);
      expect(resolveStream).not.toHaveBeenCalled();
      expect(repo.getJob(jobId)?.attempts).toBe(1);
      expect(recordings.size).toBe(1);
      const mergedSize = (await stat(repo.getJob(jobId)?.filePath as string)).size;
      expect(mergedSize).toBeGreaterThan((await stat(fixtureBytes)).size);
      const dir = join(outputDir, baseStream.platformId, baseStream.creatorName);
      expect((await readdir(dir)).filter((n) => /\.part\d+\.mp4$/i.test(n))).toEqual([]);
    },
  );

  itNeedsFfmpeg(
    'an instant clean end (HLS blip: ~1s of media, exit 0) retries instead of completing',
    { timeout: 120_000 },
    async () => {
      const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-instant-'));
      const { repo, recordings } = createRepo();
      const resolveStream = vi.fn(async (_job: RecordingJobRecord): Promise<StreamObject | null> => null);
      const { service, fakeYtDlp } = createService({ repo, outputDir, resolveStream, startGapMs: 10 });
      service.updateSettings({ retryDelay: 50 });
      const fixtureBytes = fixturePath as string;

      // Real ≥16s media for the healthy retry generation.
      const longFixture = join(outputDir, 'long.mp4');
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', 'testsrc=duration=16:size=64x64:rate=5',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-t', '16',
        longFixture,
      ]);

      // The MyFreeCams blip shape: attempt 1 exits cleanly with ONLY the
      // buffered playlist window (~1s) on disk — no error raised at all.
      let calls = 0;
      fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
        calls += 1;
        await copyFile(calls === 1 ? fixtureBytes : longFixture, outputPath);
        return { filePath: outputPath, duration: 0, stopped: false, durationCapReached: false };
      });

      const jobId = await service.startRecording({ ...baseStream });
      // The 1s capture must NOT complete the job — a fresh capture restarts.
      expect(await waitForStatus(repo, jobId, ['completed'])).toBe('completed');
      expect(fakeYtDlp.download).toHaveBeenCalledTimes(2);
      expect(resolveStream).not.toHaveBeenCalled();
      // Continuity: the 1s partial is preserved as a part and merged with
      // the healthy second generation.
      expect(recordings.size).toBe(1);
      const job = repo.getJob(jobId);
      expect(job?.attempts).toBe(1);
      const mergedSize = (await stat(job?.filePath as string)).size;
      expect(mergedSize).toBeGreaterThan((await stat(longFixture)).size);
      const dir = join(outputDir, baseStream.platformId, baseStream.creatorName);
      expect((await readdir(dir)).filter((n) => /\.part\d+\.mp4$/i.test(n))).toEqual([]);
    },
  );
});
