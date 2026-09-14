import { describe, expect, it } from 'vitest';
import { classifyCaptureFailure, computeBackoffMs } from './failures';

describe('classifyCaptureFailure', () => {
  it('maps auth/token rejections to URL_EXPIRED (re-resolve, not reconnect)', () => {
    expect(classifyCaptureFailure({ code: 'FFMPEG_HLS_DOWNLOAD_FAILED', message: 'ffmpeg exited with code 1: HTTP error 403 Forbidden' })).toBe('URL_EXPIRED');
    expect(classifyCaptureFailure({ message: 'Server returned 401 Unauthorized' })).toBe('URL_EXPIRED');
    expect(classifyCaptureFailure({ message: 'token expired, please renew' })).toBe('URL_EXPIRED');
    expect(classifyCaptureFailure({ message: 'URL has expired' })).toBe('URL_EXPIRED');
  });

  it('maps connection wobbles to TRANSIENT (same-URL reconnect)', () => {
    expect(classifyCaptureFailure({ message: 'Connection reset by peer' })).toBe('TRANSIENT');
    expect(classifyCaptureFailure({ message: 'Operation timed out after 15000 milliseconds' })).toBe('TRANSIENT');
    expect(classifyCaptureFailure({ message: 'socket hang up' })).toBe('TRANSIENT');
    expect(classifyCaptureFailure({ message: 'EAI_AGAIN getaddrinfo' })).toBe('TRANSIENT');
    expect(classifyCaptureFailure({
      code: 'FFMPEG_HLS_DOWNLOAD_FAILED',
      message: 'live capture stalled — no media progress for 90s (connection stalled), restarting capture',
    })).toBe('TRANSIENT');
  });

  it('maps genuine endings to STREAM_ENDED (finalize, no retry)', () => {
    expect(classifyCaptureFailure({ message: 'This live event has ended' })).toBe('STREAM_ENDED');
    expect(classifyCaptureFailure({ message: 'broadcaster is offline' })).toBe('STREAM_ENDED');
  });

  it('fails fast on local errors instead of burning retry attempts', () => {
    expect(classifyCaptureFailure({ code: 'FFMPEG_NOT_FOUND', message: 'binary missing' })).toBe('FATAL');
    expect(classifyCaptureFailure({ code: 'YTDLP_SPAWN_FAILED', message: 'spawn ENOENT' })).toBe('FATAL');
  });

  it('treats unexplained mid-capture death as TRANSIENT (bounded same-URL retry)', () => {
    // e.g. SIGKILLed worker: nonzero exit, stderr tail has no signature.
    expect(classifyCaptureFailure({
      code: 'FFMPEG_HLS_DOWNLOAD_FAILED',
      message: 'ffmpeg exited with code 1: frame= 100 fps= 25 q=-1.0 size= 1792KiB time=00:00:07.27',
    })).toBe('TRANSIENT');
    expect(classifyCaptureFailure({ message: 'some unknown catastrophe' })).toBe('TRANSIENT');
  });

  it('checks URL_EXPIRED before TRANSIENT (a 403 with "connection" text still re-resolves)', () => {
    expect(classifyCaptureFailure({ message: '403 Forbidden: connection refused by edge' })).toBe('URL_EXPIRED');
  });

  it('routes a dead loopback proxy to URL_EXPIRED (re-resolve mints a fresh proxy)', () => {
    // Exact shape from a burst-start Stripchat failure (evicted MouflonProxy).
    expect(classifyCaptureFailure({
      code: 'FFMPEG_HLS_DOWNLOAD_FAILED',
      message:
        'ffmpeg exited with code 1: [http @ 00000264e0409840] No trailing CRLF found in HTTP header. Adding it. ' +
        '[tcp @ 00000264e0409680] Connection to tcp://127.0.0.1:3810 failed: Error number -138 occurred',
    })).toBe('URL_EXPIRED');
    expect(classifyCaptureFailure({ message: 'Connection refused on http://localhost:4411/index.m3u8' })).toBe('URL_EXPIRED');
  });

  it('does not misroute remote errors that merely mention localhost', () => {
    expect(classifyCaptureFailure({ message: 'https://example.com/stream is no longer live (see http://localhost:3000/guide)' })).toBe(
      'STREAM_ENDED',
    );
  });
});

describe('computeBackoffMs', () => {
  it('grows exponentially, caps at maxMs, and stays within ±25% jitter', () => {
    const noJitter = (): number => 0.5; // 0.75 + 0.5*0.5 = 1.0
    expect(computeBackoffMs(0, 1000, 60_000, noJitter)).toBe(1000);
    expect(computeBackoffMs(1, 1000, 60_000, noJitter)).toBe(2000);
    expect(computeBackoffMs(3, 1000, 60_000, noJitter)).toBe(8000);
    expect(computeBackoffMs(20, 1000, 5000, noJitter)).toBe(5000);
    for (let i = 0; i < 50; i++) {
      const v = computeBackoffMs(2, 1000);
      expect(v).toBeGreaterThanOrEqual(3000);
      expect(v).toBeLessThanOrEqual(5000);
    }
  });

  it('tolerates nonsense inputs without NaN or negatives', () => {
    expect(computeBackoffMs(-3, 1000, 60_000, () => 0.5)).toBe(1000);
    expect(Number.isFinite(computeBackoffMs(2, 1000))).toBe(true);
  });
});
