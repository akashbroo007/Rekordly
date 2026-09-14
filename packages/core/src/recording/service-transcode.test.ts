import { execFile } from 'node:child_process';
import { access, copyFile, mkdtemp } from 'node:fs/promises';
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

/** Valid 1s h264 fixture so the background transcode has real media to work on. */
let fixturePath: string | null = null;
beforeAll(async () => {
  if (!ffmpegAvailable) return;
  const dir = await mkdtemp(join(tmpdir(), 'rekordly-transcode-fixture-'));
  fixturePath = join(dir, 'fixture.mp4');
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=1:size=128x128:rate=5',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-t', '1',
    fixturePath,
  ]);
});

describe('RecordingService background transcode pool (plan §8)', () => {
  itNeedsFfmpeg(
    'explicit downgrade captures source-quality live, then gains a derivative entry',
    { timeout: 90_000 },
    async () => {
      const outputDir = await mkOutputDir('rekordly-transcode-');
      const { repo, recordings } = createRepo();
      const { service, fakeYtDlp } = createService({ repo, outputDir, startGapMs: 10, minMeaningfulCaptureSeconds: 0 });
      fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
        await copyFile(fixturePath as string, outputPath);
        return { filePath: outputPath, duration: 0, stopped: false, durationCapReached: false };
      });
      // ponytail: spy on the REAL FfmpegService.transcode (calls through) so
      // the CRF reaching ffmpeg can be asserted below.
      const ffmpegService = (service as unknown as { ffmpeg: { transcode: (i: string, o: string, opt: { height: number; crf?: number }) => Promise<void> } }).ffmpeg;
      const transcodeSpy = vi.spyOn(ffmpegService, 'transcode');

      const jobId = await service.startRecording({ ...baseStream }, { quality: '720p' });
      expect(await waitForStatus(repo, jobId, ['completed'], 15_000)).toBe('completed');

      // Derivative appears in the background pool (c=2) without touching live.
      await vi.waitFor(
        () => expect(
          [...recordings.values()].filter((r) => (r.filePath ?? '').includes('_720p.mp4')),
        ).toHaveLength(1),
        { timeout: 60_000 },
      );

      // ponytail: the selected quality REPLACES the source — wait for the
      // cleanup (thumbnail reuse + source removal) to settle, then only the
      // 720p derivative stays in the Library and the source capture file is
      // gone from disk.
      await vi.waitFor(() => expect(recordings.size).toBe(1), { timeout: 60_000 });
      const derivative = [...recordings.values()].find((r) => (r.filePath ?? '').includes('_720p.mp4'))!;
      expect(derivative.quality).toBe('720p');
      expect(derivative.title).toContain('(720p)');
      await expect(access(derivative.filePath ?? '')).resolves.toBeUndefined();

      // ponytail: the CRF knob (Settings → Recording → Advanced) must reach
      // ffmpeg — default 23 when unset, the configured value when wired.
      expect(transcodeSpy.mock.calls.length).toBeGreaterThan(0);
      const lastCall = transcodeSpy.mock.calls[transcodeSpy.mock.calls.length - 1]!;
      expect(lastCall[2]).toMatchObject({ height: 720, crf: 23 });
    },
  );

  itNeedsFfmpeg(
    'derivative transcode uses the configured CRF (storage knob)',
    { timeout: 90_000 },
    async () => {
      const outputDir = await mkOutputDir('rekordly-transcode-crf-');
      const { repo, recordings } = createRepo();
      const { service, fakeYtDlp } = createService({
        repo,
        outputDir,
        startGapMs: 10,
        getDerivativeCrf: () => 27,
        minMeaningfulCaptureSeconds: 0,
      });
      fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
        await copyFile(fixturePath as string, outputPath);
        return { filePath: outputPath, duration: 0, stopped: false, durationCapReached: false };
      });
      const ffmpegService = (service as unknown as { ffmpeg: { transcode: (i: string, o: string, opt: { height: number; crf?: number }) => Promise<void> } }).ffmpeg;
      const transcodeSpy = vi.spyOn(ffmpegService, 'transcode');

      const jobId = await service.startRecording({ ...baseStream }, { quality: '480p' });
      expect(await waitForStatus(repo, jobId, ['completed'], 15_000)).toBe('completed');
      // ponytail: wait for the derivative row (size goes 1 → 2), then for the
      // cleanup to remove the source (2 → 1) before asserting the CRF.
      await vi.waitFor(
        () => expect(
          [...recordings.values()].filter((r) => (r.filePath ?? '').includes('_480p.mp4')),
        ).toHaveLength(1),
        { timeout: 60_000 },
      );
      await vi.waitFor(() => expect(recordings.size).toBe(1), { timeout: 60_000 });
      expect(transcodeSpy.mock.calls.length).toBeGreaterThan(0);
      const lastCall = transcodeSpy.mock.calls[transcodeSpy.mock.calls.length - 1]!;
      expect(lastCall[2]).toMatchObject({ height: 480, crf: 27 });
    },
  );

  itNeedsFfmpeg(
    'best quality enqueues no transcode at all',
    { timeout: 60_000 },
    async () => {
      const outputDir = await mkOutputDir('rekordly-transcode-');
      const { repo, recordings } = createRepo();
      const { service, fakeYtDlp } = createService({ repo, outputDir, startGapMs: 10, minMeaningfulCaptureSeconds: 0 });
      fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
        await copyFile(fixturePath as string, outputPath);
        return { filePath: outputPath, duration: 0, stopped: false, durationCapReached: false };
      });

      const jobId = await service.startRecording({ ...baseStream }, { quality: 'best' });
      expect(await waitForStatus(repo, jobId, ['completed'], 15_000)).toBe('completed');
      await vi.waitFor(() => expect(service.postQueue.size).toBe(0), { timeout: 60_000 });
      expect(service.transcodeQueue.size).toBe(0);
      expect(service.transcodeQueue.activeCount).toBe(0);
      expect(recordings.size).toBe(1);
    },
  );

  itNeedsFfmpeg(
    'yt-dlp fallback captures are already source-capped, so no derivative is queued',
    { timeout: 60_000 },
    async () => {
      const outputDir = await mkOutputDir('rekordly-transcode-');
      const { repo, recordings } = createRepo();
      const { service, fakeYtDlp } = createService({ repo, outputDir, startGapMs: 10, minMeaningfulCaptureSeconds: 0 });
      fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
        await copyFile(fixturePath as string, outputPath);
        return { filePath: outputPath, duration: 0, stopped: false, durationCapReached: false };
      });

      const jobId = await service.startRecording(
        { ...baseStream, streamUrl: 'https://example.com/watch?v=123' },
        { quality: '720p' },
      );
      expect(await waitForStatus(repo, jobId, ['completed'], 15_000)).toBe('completed');
      await vi.waitFor(() => expect(service.postQueue.size).toBe(0), { timeout: 60_000 });
      expect(service.transcodeQueue.size).toBe(0);
      expect(recordings.size).toBe(1);
    },
  );
});

