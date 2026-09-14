import { describe, expect, it } from 'vitest';
import { buildDirectFfmpegArgs, buildFormatSelector } from './yt-dlp';

const FORBIDDEN_LIVE = ['-vf', 'libx264', 'libx265', 'libvpx', '-c:v ', 'scale='];

describe('copy-only gate (plan §7)', () => {
  it.each([undefined, '', 'best'])('best/unset quality (%s) captures with -c copy and no scaler/encoder', (quality) => {
    const args = buildDirectFfmpegArgs('https://example.com/live.m3u8', '/tmp/out.mp4', { quality });
    expect(args).toContain('-c');
    expect(args).toContain('copy');
    const joined = args.join(' ');
    for (const token of FORBIDDEN_LIVE) {
      expect(joined).not.toContain(token);
    }
  });

  it('keeps fragmented-mp4 flags on the copy path (crash resilience, §12)', () => {
    const args = buildDirectFfmpegArgs('https://example.com/live.m3u8', '/tmp/out.mp4', {});
    expect(args.join(' ')).toContain('+frag_keyframe+empty_moov+default_base_moof');
  });

  it('keeps reconnect flags on the copy path (class A transient handling)', () => {
    const args = buildDirectFfmpegArgs('https://example.com/live.m3u8', '/tmp/out.mp4', {});
    expect(args).toEqual(expect.arrayContaining(['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5']));
  });

  it('forwards headers/cookies/user-agent without altering the copy codec path', () => {
    const args = buildDirectFfmpegArgs('https://example.com/live.m3u8', '/tmp/out.mp4', {
      headers: { 'User-Agent': 'UA', Referer: 'https://example.com/' },
      cookies: [{ name: 'session', value: 'abc' }],
    });
    const joined = args.join(' ');
    expect(joined).toContain('-user_agent');
    expect(joined).toContain('Referer: https://example.com/');
    expect(joined).toContain('Cookie: session=abc');
    expect(joined).not.toContain('-vf');
  });

  it('explicit downgrade STILL captures copy-only live (transcode moved to the background pool)', () => {
    const args = buildDirectFfmpegArgs('https://example.com/live.m3u8', '/tmp/out.mp4', { quality: '720p' });
    const joined = args.join(' ');
    expect(joined).toContain('-c copy');
    for (const token of FORBIDDEN_LIVE) {
      expect(joined).not.toContain(token);
    }
  });

  it('yt-dlp fallback selector stays source-quality (no live transcode there either)', () => {
    expect(buildFormatSelector('best')).toBe('bestvideo+bestaudio/best');
    expect(buildFormatSelector(undefined)).toBe('bestvideo+bestaudio/best');
  });

  it('proxied capture adds -http_proxy BEFORE the input url (ffmpeg input option)', () => {
    const args = buildDirectFfmpegArgs('https://example.com/live.m3u8', '/tmp/out.mp4', {
      proxyUrl: 'http://127.0.0.1:48065',
    });
    const proxyIdx = args.indexOf('-http_proxy');
    expect(proxyIdx).toBeGreaterThan(-1);
    expect(args[proxyIdx + 1]).toBe('http://127.0.0.1:48065');
    const inputIdx = args.indexOf('-i');
    expect(proxyIdx).toBeLessThan(inputIdx);
  });

  it('no proxyUrl means no proxy flag (direct recordings are untouched)', () => {
    const args = buildDirectFfmpegArgs('https://example.com/live.m3u8', '/tmp/out.mp4', {});
    expect(args).not.toContain('-http_proxy');
    expect(args).not.toContain('-proxy');
  });
});
