import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { StreamObject } from '@rekordly/shared';
import {
  FfmpegCopyBackend,
  classifyResourceCost,
  isDirectHlsUrl,
  requiresLiveTranscode,
  resolveStreamObject,
  type CaptureDownloader,
} from './backend';
import type { YtDlpDownloadResult } from './yt-dlp';

/** Minimal fake downloader — never spawns a process; completes only when told to. */
class FakeDownloader extends EventEmitter {
  private readonly pending = new Map<
    string,
    { resolve: (result: YtDlpDownloadResult) => void; outputPath: string }
  >();
  download = vi.fn(
    async (jobId: string, _url: string, outputPath: string): Promise<YtDlpDownloadResult> =>
      new Promise<YtDlpDownloadResult>((resolve) => {
        this.pending.set(jobId, { resolve, outputPath });
      }),
  );
  stopDownload = vi.fn((_jobId: string): boolean => true);
  /** Complete the pending download like a real child-process close would. */
  finish(jobId: string): void {
    const entry = this.pending.get(jobId);
    entry?.resolve({ filePath: entry.outputPath, duration: 0, stopped: false, durationCapReached: false });
  }
}

const stream: StreamObject = {
  creatorId: 'creator-1',
  creatorName: 'Test Creator',
  platformId: 'test-platform',
  title: 'Test Stream',
  streamUrl: 'https://example.com/live.m3u8',
  headers: { Referer: 'https://example.com/' },
  cookies: [{ name: 'session', value: 'abc' }],
};

describe('resolveStreamObject', () => {
  it('carries url, headers, and cookies through without network access', async () => {
    const backend = new FfmpegCopyBackend(new FakeDownloader() as unknown as CaptureDownloader);
    const resolved = await backend.resolve(stream);
    expect(resolved.streamUrl).toBe(stream.streamUrl);
    expect(resolved.headers).toEqual(stream.headers);
    expect(resolved.cookies).toEqual(stream.cookies);
    expect(resolved.source).toBe(stream);
  });
});

describe('isDirectHlsUrl / requiresLiveTranscode / classifyResourceCost', () => {
  it('routes direct HLS to 1 process, others to the 2-process fallback', () => {
    expect(isDirectHlsUrl('https://x/live.m3u8')).toBe(true);
    expect(isDirectHlsUrl('https://x/watch?v=1')).toBe(false);
    expect(classifyResourceCost('https://x/live.m3u8', 'best')).toEqual({
      processCount: 1,
      requiresTranscode: false,
    });
    expect(classifyResourceCost('https://x/watch?v=1', 'best').processCount).toBe(2);
  });

  it('flags explicit height qualities as live-transcode (Phase D fixes the path)', () => {
    expect(requiresLiveTranscode('best')).toBe(false);
    expect(requiresLiveTranscode(undefined)).toBe(false);
    expect(requiresLiveTranscode('720p')).toBe(true);
    expect(classifyResourceCost('https://x/live.m3u8', '720p')).toMatchObject({
      processCount: 1,
      requiresTranscode: true,
    });
  });

  it('leaves bitrate estimates unknown (graceful degradation, §0.1.4)', () => {
    const cost = classifyResourceCost('https://x/live.m3u8', 'best');
    expect(cost.estimatedNetworkMbps).toBeUndefined();
    expect(cost.estimatedDiskMbps).toBeUndefined();
  });
});

describe('FfmpegCopyBackend.capture', () => {
  it('delegates to the downloader and exposes pid/progress/stop/wait', async () => {
    const fake = new FakeDownloader();
    const backend = new FfmpegCopyBackend(fake as unknown as CaptureDownloader);
    const resolved = resolveStreamObject(stream);

    const handle = await backend.capture(resolved, { jobId: 'job-1', outputPath: '/tmp/out.mp4' });
    expect(handle.pid).toBeUndefined();
    expect(handle.progress()).toMatchObject({ percent: 0, bytesDownloaded: 0 });

    fake.emit('spawned', 'job-1', 4242);
    expect(handle.pid).toBe(4242);

    // Events for other jobs must not leak across handles.
    fake.emit('progress', 'job-other', { percent: 50, speed: 9, eta: 1, bytesDownloaded: 9, totalBytes: 0 });
    expect(handle.progress().bytesDownloaded).toBe(0);
    fake.emit('progress', 'job-1', { percent: 10, speed: 100, eta: 5, bytesDownloaded: 1024, totalBytes: 0 });
    expect(handle.progress()).toMatchObject({ percent: 10, bytesDownloaded: 1024 });

    await handle.stop('user');
    expect(fake.stopDownload).toHaveBeenCalledWith('job-1');

    fake.finish('job-1');
    const result = await handle.wait();
    expect(result).toMatchObject({ filePath: '/tmp/out.mp4', stopped: false });
  });
});
