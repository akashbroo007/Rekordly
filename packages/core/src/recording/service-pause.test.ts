import { writeFile, stat } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@rekordly/shared';
import { baseStream, createRepo, createService, waitForStatus } from './test-harness';

const TICK = new Promise<void>((r) => setTimeout(r, 250));

/**
 * ponytail: pause used to only flip the DB row to 'paused' while the
 * yt-dlp/ffmpeg child kept recording (bytes + timer kept climbing behind a
 * paused label), and resume flipped the row back without any pipeline
 * behind it. These tests pin the real semantics: pause stops the capture,
 * resume relaunches it into the next part file.
 */
describe('RecordingService pause/resume', () => {
  it('stops the downloader and keeps the job paused when the download rejects', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-pause-'));
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      startGapMs: 0,
      resolveStream: async () => null,
    });
    let rejectDownload!: (error: unknown) => void;
    fakeYtDlp.download.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectDownload = reject;
        }),
    );

    const jobId = await service.startRecording({ ...baseStream });
    await waitForStatus(repo, jobId, ['recording']);
    await vi.waitFor(() => expect(fakeYtDlp.download).toHaveBeenCalledTimes(1));

    await service.pauseRecording(jobId);
    expect(repo.getJob(jobId)?.status).toBe('paused');
    expect(fakeYtDlp.stopDownload).toHaveBeenCalledWith(jobId);

    // The stopped download unwinds the pipeline — the job must STAY paused
    // (pre-fix it was flipped to 'failed' by the generic error path).
    rejectDownload(new AppError({ code: 'FFMPEG_HLS_DOWNLOAD_FAILED', message: 'stopped', recoverable: true }));
    await vi.waitFor(() => expect(service.getWorkerState(jobId)).toBe('STOPPING'));
    await TICK;
    expect(repo.getJob(jobId)?.status).toBe('paused');
    // No second generation may launch behind a paused row.
    expect(fakeYtDlp.download).toHaveBeenCalledTimes(1);
  });

  it('does not relaunch capture when paused during the reconnect backoff', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-pause-'));
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      startGapMs: 0,
      resolveStream: async () => null,
    });
    service.updateSettings({ retryDelay: 200 });

    let calls = 0;
    let failFirst!: (error: unknown) => void;
    fakeYtDlp.download.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return new Promise((_resolve, reject) => {
          failFirst = reject;
        });
      }
      return { filePath: 'unused', duration: 0, stopped: true, durationCapReached: false };
    });

    const jobId = await service.startRecording({ ...baseStream });
    await vi.waitFor(() => expect(calls).toBe(1));
    // Transient failure puts the pipeline into the backoff sleep — pause
    // while it waits. The pre-fix loop launched a new generation anyway.
    failFirst(new AppError({ code: 'FFMPEG_HLS_DOWNLOAD_FAILED', message: 'blip', recoverable: true }));
    await service.pauseRecording(jobId);
    expect(repo.getJob(jobId)?.status).toBe('paused');

    await TICK;
    expect(calls).toBe(1);
    expect(fakeYtDlp.download).toHaveBeenCalledTimes(1);
  });

  it('resume relaunches capture into the next part file after a pause', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-pause-'));
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      startGapMs: 0,
      minMeaningfulCaptureSeconds: 0,
      resolveStream: async () => ({ ...baseStream, streamUrl: 'https://fresh.example/live.m3u8' }),
    });

    let calls = 0;
    let rejectFirst!: (error: unknown) => void;
    let releaseSecond!: () => void;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
      calls += 1;
      if (calls === 1) {
        await writeFile(outputPath, Buffer.from('captured-partial'));
        return new Promise((_resolve, reject) => {
          rejectFirst = reject;
        });
      }
      // Hold the second generation open so the 'recording' window can be
      // observed deterministically (an instant resolve would skip past it).
      await secondGate;
      return { filePath: outputPath, duration: 0, stopped: true, durationCapReached: false };
    });

    const jobId = await service.startRecording({ ...baseStream });
    await waitForStatus(repo, jobId, ['recording']);
    await vi.waitFor(() => expect(calls).toBe(1));

    await service.pauseRecording(jobId);
    expect(repo.getJob(jobId)?.status).toBe('paused');
    const parkedPath = repo.getJob(jobId)?.filePath ?? '';
    expect(parkedPath).not.toBe('');

    rejectFirst(new AppError({ code: 'FFMPEG_HLS_DOWNLOAD_FAILED', message: 'stopped', recoverable: true }));
    await vi.waitFor(() => expect(service.getWorkerState(jobId)).toBe('STOPPING'));

    // Resume waits internally for the old pipeline to finish unwinding.
    await service.resumeRecording(jobId);
    await waitForStatus(repo, jobId, ['recording']);
    await vi.waitFor(() => expect(fakeYtDlp.download).toHaveBeenCalledTimes(2));

    // The parked partial was preserved as part 1 of the merged file…
    const part1 = parkedPath.replace(/\.mp4$/i, '.part1.mp4');
    await expect(stat(part1)).resolves.toBeDefined();
    // …and the resumed session writes into the next .partN.mp4 sibling.
    const secondOutput = fakeYtDlp.download.mock.calls[1]?.[2] as string;
    expect(secondOutput).toMatch(/\.part2\.mp4$/);

    // Release the gate — the session ends cleanly and completes.
    releaseSecond();
    expect(await waitForStatus(repo, jobId, ['completed'])).toBe('completed');
  });

  it('refuses resume when the broadcast ended and keeps the job paused', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-pause-'));
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      startGapMs: 0,
      resolveStream: async () => null,
    });
    let rejectDownload!: (error: unknown) => void;
    fakeYtDlp.download.mockImplementationOnce(
      (_jobId: string, _url: string, outputPath: string) =>
        new Promise((_resolve, rej) => {
          // Capture some data first — a pause with nothing on disk is a
          // different error ("No partial file to resume").
          void writeFile(outputPath, Buffer.from('captured-partial')).then(() => {
            rejectDownload = rej;
          });
        }),
    );

    const jobId = await service.startRecording({ ...baseStream });
    await waitForStatus(repo, jobId, ['recording']);
    await vi.waitFor(() => expect(fakeYtDlp.download).toHaveBeenCalledTimes(1));

    await service.pauseRecording(jobId);
    rejectDownload(new AppError({ code: 'FFMPEG_HLS_DOWNLOAD_FAILED', message: 'stopped', recoverable: true }));
    await vi.waitFor(() => expect(service.getWorkerState(jobId)).toBe('STOPPING'));

    await expect(service.resumeRecording(jobId)).rejects.toMatchObject({ code: 'STREAM_OFFLINE' });
    expect(repo.getJob(jobId)?.status).toBe('paused');
  });

  it('rejects pausing a job that is not recording', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-pause-'));
    const { repo } = createRepo();
    // Default 2s start gap keeps the row in 'preparing' for this assertion.
    const { service } = createService({ repo, outputDir, resolveStream: async () => null });

    const jobId = await service.startRecording({ ...baseStream });
    await expect(service.pauseRecording(jobId)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(repo.getJob(jobId)?.status).toBe('preparing');
  });
});
