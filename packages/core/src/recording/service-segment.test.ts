import { execFile } from 'node:child_process';
import { copyFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecordingEvent } from '@rekordly/shared';
import { RecordingService } from './service';
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

/** Valid 1s h264 fixture so the completion pipeline has a real file to keep. */
let fixturePath: string | null = null;
beforeAll(async () => {
  if (!ffmpegAvailable) return;
  const dir = await mkdtemp(join(tmpdir(), 'rekordly-segment-fixture-'));
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

/** 4th arg of every download call is the options object (durationSeconds etc.). */
function lastDownloadOptions(
  fakeYtDlp: { download: { mock: { calls: unknown[][] } } },
): Record<string, unknown> {
  const call = fakeYtDlp.download.mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![3] as Record<string, unknown>;
}

interface ChainPayload {
  stream: unknown;
  options?: Record<string, unknown>;
}

function collectChainEvents(service: RecordingService): ChainPayload[] {
  const captured: ChainPayload[] = [];
  service.on('event', (event: RecordingEvent) => {
    if (event.type === 'recording-segment-finished') {
      captured.push((event.data ?? {}) as unknown as ChainPayload);
    }
  });
  return captured;
}

describe('RecordingService segment splitting (duration cap → chain event)', () => {
  itNeedsFfmpeg('a duration-capped segment completes AND emits recording-segment-finished with the original options', async () => {
    const outputDir = await mkOutputDir('rekordly-segment-');
    const { repo, recordings } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      startGapMs: 10,
      minMeaningfulCaptureSeconds: 0,
    });
    service.postQueue.setPaused(true);
    const chainEvents = collectChainEvents(service);
    fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
      await copyFile(fixturePath as string, outputPath);
      // The cap stop resolves as stopped:true + durationCapReached:true.
      return { filePath: outputPath, duration: 0, stopped: true, durationCapReached: true };
    });

    const jobId = await service.startRecording({ ...baseStream }, {
      quality: '720p',
      segmentMinutes: 15,
      streamType: 'vr',
      autoRecord: true,
    });
    expect(await waitForStatus(repo, jobId, ['completed'], 15_000)).toBe('completed');

    // The segment itself lands in the Library like any completed recording.
    expect(recordings.size).toBe(1);

    // The chain event carries everything the host needs to start part 2:
    // stream + original options (quality / segmentMinutes / streamType /
    // autoRecord). streamType and autoRecord used to be dropped — a VR pick
    // degraded on part 2+ and the origin was unknowable.
    await vi.waitFor(() => expect(chainEvents.length).toBe(1), { timeout: 5_000 });
    const payload = chainEvents[0]!;
    expect(payload.options).toBeDefined();
    expect(payload.options!['segmentMinutes']).toBe(15);
    expect(payload.options!['quality']).toBe('720p');
    expect(payload.options!['streamType']).toBe('vr');
    expect(payload.options!['autoRecord']).toBe(true);
    expect((payload.stream as { creatorId?: string }).creatorId).toBe(baseStream.creatorId);
  });

  itNeedsFfmpeg('a manual segmented recording (no auto-record) still emits the chain event', async () => {
    // ponytail: the host used to drop the chain for creators without the
    // auto-record opt-in ("recording silently stops after the first split").
    // The SERVICE always emits for a duration-capped split — gating on
    // auto-record belongs to the host, keyed off the round-tripped origin.
    const outputDir = await mkOutputDir('rekordly-segment-manual-');
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      startGapMs: 10,
      minMeaningfulCaptureSeconds: 0,
    });
    service.postQueue.setPaused(true);
    const chainEvents = collectChainEvents(service);
    fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
      await copyFile(fixturePath as string, outputPath);
      return { filePath: outputPath, duration: 0, stopped: true, durationCapReached: true };
    });

    const jobId = await service.startRecording({ ...baseStream }, { segmentMinutes: 15 });
    expect(await waitForStatus(repo, jobId, ['completed'], 15_000)).toBe('completed');

    await vi.waitFor(() => expect(chainEvents.length).toBe(1), { timeout: 5_000 });
    expect(chainEvents[0]!.options!['segmentMinutes']).toBe(15);
    // No origin flag — the host must treat this as a manual (ungated) chain.
    expect(chainEvents[0]!.options!['autoRecord']).toBeUndefined();
  });

  itNeedsFfmpeg('a non-cap finish (user stop / stream end) does NOT chain the next segment', async () => {
    const outputDir = await mkOutputDir('rekordly-segment-nocap-');
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      startGapMs: 10,
      minMeaningfulCaptureSeconds: 0,
    });
    service.postQueue.setPaused(true);
    const chainEvents = collectChainEvents(service);
    fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
      await copyFile(fixturePath as string, outputPath);
      // Stream ended / user stop — no duration cap reached.
      return { filePath: outputPath, duration: 0, stopped: true, durationCapReached: false };
    });

    const jobId = await service.startRecording({ ...baseStream }, { segmentMinutes: 15 });
    expect(await waitForStatus(repo, jobId, ['completed'], 15_000)).toBe('completed');

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(chainEvents.length).toBe(0);
  });

  itNeedsFfmpeg('the stop-after budget covers the WHOLE chain (30-min recording, 15-min parts = 2 parts)', async () => {
    // ponytail: the Record dialog used to drop durationMinutes when a split
    // was selected, so split chains ran until the stream ended. Duration is
    // the TOTAL budget: part 1 caps at the segment length, part 2 clamps to
    // the remainder, and nothing chains after the budget is spent.
    const outputDir = await mkOutputDir('rekordly-segment-budget-');
    const { repo } = createRepo();
    const { service, fakeYtDlp } = createService({
      repo,
      outputDir,
      startGapMs: 10,
      minMeaningfulCaptureSeconds: 0,
    });
    service.postQueue.setPaused(true);
    const chainEvents = collectChainEvents(service);
    fakeYtDlp.download.mockImplementation(async (_jobId: string, _url: string, outputPath: string) => {
      await copyFile(fixturePath as string, outputPath);
      return { filePath: outputPath, duration: 0, stopped: true, durationCapReached: true };
    });

    const jobId1 = await service.startRecording({ ...baseStream }, {
      segmentMinutes: 15,
      durationMinutes: 30,
    });
    expect(await waitForStatus(repo, jobId1, ['completed'], 15_000)).toBe('completed');

    // Part 1 caps at the segment length (15 min), NOT the 30-min budget.
    expect(lastDownloadOptions(fakeYtDlp)['durationSeconds']).toBe(900);

    // The chain event carries the budget + session anchor so the host's part
    // 2 call clamps to the same budget.
    await vi.waitFor(() => expect(chainEvents.length).toBe(1), { timeout: 5_000 });
    expect(chainEvents[0]!.options!['durationMinutes']).toBe(30);
    expect(typeof chainEvents[0]!.options!['sessionStartedAt']).toBe('number');

    // Part 2 (host round-trips the payload): 20 min of budget already spent →
    // the remaining 10 min become the last part's cap.
    const jobId2 = await service.startRecording(
      { ...baseStream },
      {
        segmentMinutes: 15,
        durationMinutes: 30,
        sessionStartedAt: Date.now() - 20 * 60 * 1000,
      },
    );
    expect(await waitForStatus(repo, jobId2, ['completed'], 15_000)).toBe('completed');
    const part2Cap = lastDownloadOptions(fakeYtDlp)['durationSeconds'] as number;
    expect(part2Cap).toBeGreaterThanOrEqual(595);
    expect(part2Cap).toBeLessThanOrEqual(600);
    // ponytail: the fake downloader completes instantly, so this mid-chain
    // part still sees ~10 min of unspent budget and emits its own chain event
    // (in production the wall clock spends the budget here and the event only
    // fires while the cap genuinely allows another part).
    await vi.waitFor(() => expect(chainEvents.length).toBe(2), { timeout: 5_000 });

    // Budget spent (31 min recorded already) → a further capped segment must
    // NOT chain: this was the "after the second one it queued another one" bug.
    const jobId3 = await service.startRecording(
      { ...baseStream },
      {
        segmentMinutes: 15,
        durationMinutes: 30,
        sessionStartedAt: Date.now() - 31 * 60 * 1000,
      },
    );
    expect(await waitForStatus(repo, jobId3, ['completed'], 15_000)).toBe('completed');
    const spentCap = lastDownloadOptions(fakeYtDlp)['durationSeconds'] as number;
    expect(spentCap).toBeLessThanOrEqual(1);
    await new Promise((resolve) => setTimeout(resolve, 400));
    // part1 + part2 events only — the exhausted-budget segment emitted none.
    expect(chainEvents.length).toBe(2);
  });
});
