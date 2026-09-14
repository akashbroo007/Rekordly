import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FfmpegService } from './ffmpeg';
import { listRecorderProcessesAsync } from './yt-dlp';
import {
  baseStream,
  createRepo,
  createService,
  ffmpegAvailable,
  mkOutputDir,
  waitForStatus,
} from './test-harness';

const execFileAsync = promisify(execFile);

/**
 * Phase H stress/torture (plan §18) — REAL ffmpeg captures against a local
 * HLS origin, REAL RecordingService + REAL downloader, in-memory repo (which
 * doubles as the DB-write meter).
 *
 * Origin design: a complete 60s VOD asset served WITH end tag and
 * ~realtime-throttled segments, so captures behave like sustained live
 * sessions and END NATURALLY (exit 0, clean moov, playable files).
 *
 * KNOWN LIMITATION (pre-existing, Windows-wide, verified 2026-09-08): a
 * mid-capture STOP ('q' over stdin) is ignored by ffmpeg on Windows — every
 * variant ('q', 'q\n', 'q'+EOF, both PATH and vendored builds) was probed and
 * the process only dies to the 5s-grace force-kill, leaving a moov-less
 * fragment the repair remux cannot salvage ("moov atom not found"). Stopped
 * captures therefore assert CLEANUP (rows terminal, no stray processes),
 * never playability. Fixing Windows graceful stop (e.g. TS-during-capture +
 * background remux) is a follow-up, not part of this plan.
 *
 * Gated: `STRESS_HLS=1 pnpm --filter @rekordly/core exec vitest run
 * src/recording/service-stress.test.ts` (default N=3, `STRESS_N=30` for the
 * full soak). NOT part of the default suite. Per §26 this validates the
 * ENGINE; real-site 30-live remains manual.
 */
const STRESS_N = Math.max(1, parseInt(process.env.STRESS_N ?? '3', 10));
const runStress =
  process.env.STRESS_HLS === '1' && ffmpegAvailable ? describe : describe.skip;

runStress(`recording stress HLS harness (N=${STRESS_N})`, () => {
  let originDir = '';
  let segments: string[] = [];
  let server: Server | null = null;
  let baseUrl = '';

  beforeAll(async () => {
    originDir = await mkdtemp(join(tmpdir(), 'rekordly-hls-origin-'));
    // 60s testsrc asset, 2s segments → ~30 .ts files + VOD playlist to mine names from.
    // (-g/-keyint_min force a keyframe every 2s — hls_time can only cut there.)
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=size=128x128:rate=10',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-g', '20',
      '-keyint_min', '20',
      '-sc_threshold', '0',
      '-t', '60',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '0',
      '-hls_segment_filename', join(originDir, 'seg%d.ts'),
      join(originDir, 'vod.m3u8'),
    ]);
    segments = (await readdir(originDir))
      .filter((n) => /^seg\d+\.ts$/.test(n))
      .sort((a, b) => parseInt(a.slice(3, -3), 10) - parseInt(b.slice(3, -3), 10));
    expect(segments.length).toBeGreaterThan(10);

    // Live-style origin: full segment list, NO end tag — ffmpeg captures the
    // 60s asset, then idles polling for playlist updates (like a live edge).
    server = createServer(async (req, res) => {
      try {
        if (req.url === '/live.m3u8') {
          const body = [
            '#EXTM3U',
            '#EXT-X-VERSION:3',
            '#EXT-X-TARGETDURATION:2',
            '#EXT-X-MEDIA-SEQUENCE:0',
            ...segments.flatMap((name) => ['#EXTINF:2.0,', `/${name}`]),
            // Complete asset: captures END NATURALLY with a clean moov, so
            // integrity assertions are meaningful (see header note on stops).
            '#EXT-X-ENDLIST',
          ].join('\n');
          res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
          res.end(body);
          return;
        }
        const name = (req.url ?? '').slice(1);
        if (/^seg\d+\.ts$/.test(name)) {
          // ~realtime delivery: a 60s asset takes ~40s wall, so captures are
          // sustained sessions (continuous progress events) rather than a
          // sub-second localhost burst.
          await new Promise((r) => setTimeout(r, 1200));
          const data = await readFile(join(originDir, name));
          res.writeHead(200, { 'Content-Type': 'video/mp2t' });
          res.end(data);
          return;
        }
        res.writeHead(404);
        res.end();
      } catch {
        res.writeHead(500);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server?.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    expect(port).toBeGreaterThan(0);
    baseUrl = `http://127.0.0.1:${port}/live.m3u8`;
  }, 120_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  });

  it(
    'captures N streams with 1 process each, coalesced DB writes, and playable files',
    { timeout: 600_000 },
    async () => {
      const outputDir = await mkOutputDir('rekordly-stress-');
      const { repo, recordings } = createRepo();
      let progressWrites = 0;
      const inner = repo.updateJob.bind(repo);
      (repo as { updateJob: typeof inner }).updateJob = vi.fn(
        ((id: string, patch: Parameters<typeof inner>[1]) => {
          if (patch.bytesDownloaded !== undefined && patch.status === undefined) progressWrites++;
          return inner(id, patch);
        }) as typeof inner,
      );
      const { service } = createService({
        repo,
        outputDir,
        resolveStream: async () => null,
        startGapMs: 100,
        useRealDownloader: true,
        // Production 2s flush — the rate below measures the real coalescing.
      });
      service.updateSettings({ maxConcurrent: Math.max(3, STRESS_N) });

      const startedAt = Date.now();
      const ids = await Promise.all(
        Array.from({ length: STRESS_N }, () =>
          service.startRecording({ ...baseStream, streamUrl: baseUrl }),
        ),
      );

      // 1 process per stream while capturing (2-proc steady state is gone).
      await vi.waitFor(() => expect(service.getActiveChildPids()).toHaveLength(STRESS_N), {
        timeout: 60_000,
      });
      for (const id of ids) {
        expect(service.getWorkerState(id)).toBe('RECORDING');
      }
      // eslint-disable-next-line no-console
      console.log(`stress N=${STRESS_N} live procs=${service.getActiveChildPids().length}`);

      // Natural end-of-stream completions (clean moov — no stop involved).
      for (const id of ids) {
        expect(await waitForStatus(repo, id, ['completed'], 300_000)).toBe('completed');
      }
      const captureSeconds = (Date.now() - startedAt) / 1000;

      // Plan §12: ≤0.5 DB writes/s/stream (assert <1.0 for timer-slop headroom).
      const writesPerSecPerStream = progressWrites / STRESS_N / captureSeconds;
      // eslint-disable-next-line no-console
      console.log(
        `stress N=${STRESS_N} wall=${captureSeconds.toFixed(1)}s ` +
          `progressWrites=${progressWrites} (${writesPerSecPerStream.toFixed(3)}/s/stream)`,
      );
      expect(writesPerSecPerStream).toBeLessThan(1.0);

      // Integrity: every file exists, non-empty, and probes with duration.
      const ffmpeg = new FfmpegService();
      expect(recordings.size).toBe(STRESS_N);
      for (const id of ids) {
        const filePath = repo.getJob(id)?.filePath as string;
        expect((await stat(filePath)).size).toBeGreaterThan(0);
        const meta = await ffmpeg.getMetadata(filePath);
        expect(meta.duration).toBeGreaterThan(0);
      }

      // Post queues drained, no part leftovers, no stray workers.
      await vi.waitFor(() => expect(service.postQueue.size).toBe(0), { timeout: 180_000 });
      const outDir = join(outputDir, baseStream.platformId, baseStream.creatorName);
      expect((await readdir(outDir)).filter((n) => /\.part\d+\.mp4$/i.test(n))).toEqual([]);
      for (const id of ids) {
        expect(service.getWorkerState(id)).toBe('FINALIZING');
      }
    },
  );

  it(
    'SIGKILL mid-capture reconnects same-URL and completes (pipeline recovery)',
    { timeout: 300_000 },
    async () => {
      const outputDir = await mkOutputDir('rekordly-stress-');
      const { repo } = createRepo();
      const { service } = createService({
        repo,
        outputDir,
        resolveStream: async () => null,
        startGapMs: 50,
        useRealDownloader: true,
      });
      service.updateSettings({ retryDelay: 500 });

      const jobId = await service.startRecording({ ...baseStream, streamUrl: baseUrl });
      await vi.waitFor(() => expect(service.getWorkerState(jobId)).toBe('RECORDING'), { timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 6000));

      // Murder the worker's ffmpeg — the worker must notice, classify, and
      // restart capture on the same URL (plan §25). Media playability after a
      // Windows SIGKILL is NOT asserted (see header note): the truncated
      // pre-kill fragment is unrecoverable by construction.
      const [victim] = service.getActiveChildPids();
      expect(victim).toBeDefined();
      process.kill(victim!.pid, 'SIGKILL');

      await vi.waitFor(() => expect(repo.getJob(jobId)?.attempts ?? 0).toBeGreaterThanOrEqual(1), {
        timeout: 30_000,
      });
      expect(await waitForStatus(repo, jobId, ['completed'], 300_000)).toBe('completed');
      // The SIGKILL-truncated first generation is discarded as unreadable, so
      // the retried generation stands alone — merged cleanly, fully playable.
      const outDir = join(outputDir, baseStream.platformId, baseStream.creatorName);
      expect((await readdir(outDir)).filter((n) => /\.part\d+\.mp4$/i.test(n))).toEqual([]);
      const filePath = repo.getJob(jobId)?.filePath as string;
      expect((await stat(filePath)).size).toBeGreaterThan(0);
      expect((await new FfmpegService().getMetadata(filePath)).duration).toBeGreaterThan(0);
      expect(service.getActiveChildPids()).toHaveLength(0);
    },
  );

  it(
    'stop-all leaves no live workers and no stray recorder processes',
    { timeout: 120_000 },
    async () => {
      const outputDir = await mkOutputDir('rekordly-stress-');
      const { repo } = createRepo();
      const { service } = createService({
        repo,
        outputDir,
        resolveStream: async () => null,
        startGapMs: 50,
        useRealDownloader: true,
      });
      const ids = await Promise.all(
        Array.from({ length: 3 }, () => service.startRecording({ ...baseStream, streamUrl: baseUrl })),
      );
      await new Promise((r) => setTimeout(r, 4000));
      expect(service.getActiveChildPids()).toHaveLength(3);

      for (const id of ids) {
        await service.cancelRecording(id);
      }
      await vi.waitFor(() => expect(service.getActiveChildPids()).toHaveLength(0), { timeout: 30_000 });
      for (const id of ids) {
        expect(repo.getJob(id)?.status).toBe('cancelled');
      }
      // Belt and braces: no ffmpeg/yt-dlp anywhere still references our dir.
      const snapshots = await listRecorderProcessesAsync();
      expect(snapshots.filter((s) => s.commandLine.includes(outputDir))).toEqual([]);
    },
  );

  it('origin serves the live playlist and segments (preflight sanity)', async () => {
    const playlist = await (await fetch(baseUrl)).text();
    expect(playlist).toContain('#EXTM3U');
    // Complete asset by design: captures end naturally with a clean moov.
    expect(playlist).toContain('#EXT-X-ENDLIST');
    const probe = await fetch(`${baseUrl.replace('/live.m3u8', '')}/${segments[0]}`);
    expect(probe.status).toBe(200);
    // Chunked transfer has no content-length — read the body instead.
    expect((await probe.bytes()).length).toBeGreaterThan(0);
  });
});
