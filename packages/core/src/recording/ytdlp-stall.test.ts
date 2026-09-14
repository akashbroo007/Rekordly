import { execFile } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { ExternalBinary } from '@rekordly/recorder';
import type { AppError } from '@rekordly/shared';
import { YtDlpService, buildDirectFfmpegArgs } from './yt-dlp';

const execFileAsync = promisify(execFile);
const ffmpegAvailable = new ExternalBinary('ffmpeg').resolve() !== null;
const itNeedsFfmpeg = ffmpegAvailable ? it : it.skip;

/**
 * ponytail: reproduces the silent live-capture stall — a playlist that
 * NEVER updates (failing reload / dead window) leaves ffmpeg running with
 * media time frozen. The stall watchdog must tear the capture down with a
 * transient failure so the recording service restarts it (preserving the
 * captured parts) instead of silently missing minutes of the broadcast
 * (15min wall → 6min file, verified against MyFreeCams).
 */
describe('live-HLS stall watchdog', () => {
  let originDir: string;
  let segments: string[] = [];
  let server: Server | null = null;
  let stallUrl = '';
  let vodUrl = '';

  beforeAll(async () => {
    if (!ffmpegAvailable) return;
    originDir = await mkdtemp(join(tmpdir(), 'rekordly-stall-origin-'));
    // 4s testsrc asset, 2s segments → 2 .ts files.
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
      '-t', '4',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '0',
      '-hls_segment_filename', join(originDir, 'seg%d.ts'),
      join(originDir, 'vod.m3u8'),
    ]);
    segments = (await readdir(originDir)).filter((n) => /^seg\d+\.ts$/.test(n));
    expect(segments.length).toBeGreaterThan(0);

    const serve = (body: string): void => {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end(body);
    };
    let res!: ServerResponse;
    server = createServer((req, r) => {
      res = r;
      if (req.url === '/stuck.m3u8') {
        // ponytail: complete segment list, NO end tag, NEVER updated — the
        // dead playlist window. ffmpeg copies the buffered segments, then
        // idles polling for updates that never come.
        serve([
          '#EXTM3U',
          '#EXT-X-VERSION:3',
          '#EXT-X-TARGETDURATION:2',
          '#EXT-X-MEDIA-SEQUENCE:0',
          ...segments.flatMap((name) => ['#EXTINF:2.0,', `/${name}`]),
        ].join('\n'));
        return;
      }
      if (req.url === '/vod.m3u8') {
        // Same asset WITH the end tag — a genuine natural end.
        serve([
          '#EXTM3U',
          '#EXT-X-VERSION:3',
          '#EXT-X-TARGETDURATION:2',
          '#EXT-X-MEDIA-SEQUENCE:0',
          ...segments.flatMap((name) => ['#EXTINF:2.0,', `/${name}`]),
          '#EXT-X-ENDLIST',
        ].join('\n'));
        return;
      }
      const name = (req.url ?? '').slice(1);
      if (/^seg\d+\.ts$/.test(name)) {
        void (async () => {
          try {
            const fs = await import('node:fs/promises');
            const file = await fs.readFile(join(originDir, name));
            r.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': String(file.length) });
            r.end(file);
          } catch {
            r.writeHead(404);
            r.end();
          }
        })();
        return;
      }
      r.writeHead(404);
      r.end();
    });
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => {
        const address = server!.address();
        const port = typeof address === 'object' && address !== null ? address.port : 0;
        expect(port).toBeGreaterThan(0);
        stallUrl = `http://127.0.0.1:${port}/stuck.m3u8`;
        vodUrl = `http://127.0.0.1:${port}/vod.m3u8`;
        resolve();
      });
    });
  }, 120_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  });

  itNeedsFfmpeg(
    'rejects a live capture whose playlist never delivers new media (transient, not completed)',
    { timeout: 60_000 },
    async () => {
      const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-stall-'));
      const ytdlp = new YtDlpService();
      let sawProgress = false;
      ytdlp.on('progress', () => { sawProgress = true; });

      await expect(
        ytdlp.download('job-stall', stallUrl, join(outputDir, 'out.mp4'), { stallTimeoutMs: 5_000 }),
      ).rejects.toMatchObject({
        code: 'FFMPEG_HLS_DOWNLOAD_FAILED',
      });
      await expect(
        ytdlp.download('job-stall-2', stallUrl, join(outputDir, 'out2.mp4'), { stallTimeoutMs: 5_000 }),
      ).rejects.toSatisfy((e: AppError) => /stalled/i.test(e.message));
      expect(sawProgress).toBe(true);
      // No child processes left behind.
      expect(ytdlp.getActivePids()).toEqual([]);
    },
  );

  itNeedsFfmpeg(
    'a genuine natural end still completes (watchdog does not break clean endings)',
    { timeout: 60_000 },
    async () => {
      const outputDir = await mkdtemp(join(tmpdir(), 'rekordly-stall-vod-'));
      const ytdlp = new YtDlpService();
      const result = await ytdlp.download(
        'job-vod',
        vodUrl,
        join(outputDir, 'out.mp4'),
        { stallTimeoutMs: 5_000 },
      );
      // A short VOD ends naturally with exit 0 — no stall, no retry flag.
      expect(result.stopped).toBe(false);
      expect(ytdlp.getActivePids()).toEqual([]);
    },
  );

  it('buildDirectFfmpegArgs stays header-faithful for the stall path', () => {
    const args = buildDirectFfmpegArgs('https://edge.example/live.m3u8', join(tmpdir(), 'o.mp4'), {
      headers: { 'User-Agent': 'UA', Referer: 'https://site.example/' },
    });
    expect(args).toContain('-user_agent');
    expect(args.join(' ')).toContain('Referer: https://site.example/');
    expect(args).toContain('-reconnect');
  });
});
