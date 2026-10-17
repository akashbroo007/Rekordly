import { describe, expect, it } from 'vitest';
import { extractViewerCount } from './viewer-count';

describe('extractViewerCount', () => {
  it('reads the canonical keys each platform uses', () => {
    expect(extractViewerCount({ viewer_count: 1234 })).toBe(1234); // Twitch/Kick
    expect(extractViewerCount({ num_viewers: 543 })).toBe(543); // Chaturbate
    expect(extractViewerCount({ watching_now: 1212 })).toBe(1212); // Rumble
    expect(extractViewerCount({ viewers: 77 })).toBe(77); // Stripchat/CamSoda
    expect(extractViewerCount({ concurrentViewers: '4021' })).toBe(4021); // YouTube (string)
  });

  it('scans nested payloads such as SSR preloaded state', () => {
    expect(
      extractViewerCount({ chatRoom: { roomByUsername: { alice: { user: {}, chat: { viewers: 812 } } } } }),
    ).toBe(812);
  });

  it('prefers the viewer count over unrelated numeric fields', () => {
    expect(extractViewerCount({ id: 98_765, height: 1080, viewers: 61, quality: 3 })).toBe(61);
  });

  it('reads JSON-ish keys and HTML attributes out of raw text', () => {
    expect(extractViewerCount('{"status":"online","viewers":230,"token":"x"}')).toBe(230);
    expect(extractViewerCount('<div data-viewers="1,034">live</div>')).toBe(1034);
    expect(extractViewerCount('Watch now — 2,314 watching')).toBe(2314);
  });

  it('understands k/m prose suffixes', () => {
    expect(extractViewerCount('12.5k viewers')).toBe(12_500);
  });

  it('ignores implausible values (follow totals, ids)', () => {
    expect(extractViewerCount({ viewers: -1 })).toBeUndefined();
    expect(extractViewerCount({ viewers: 9_999_999 })).toBeUndefined();
    expect(extractViewerCount({ viewers: 'many' })).toBeUndefined();
  });

  it('never reads follower-count-like keys', () => {
    // BongaCams' loversCount is a fan total, not live viewers.
    expect(extractViewerCount({ loversCount: 8_500, followers_count: 1_200 })).toBeUndefined();
  });

  it('returns undefined for payloads without viewer data', () => {
    expect(extractViewerCount({ formats: { 'mp4-hls': { encodings: [{ videoKbps: 700 }] } } })).toBeUndefined();
    expect(extractViewerCount('<html><body>offline</body></html>')).toBeUndefined();
    expect(extractViewerCount(null)).toBeUndefined();
    expect(extractViewerCount(undefined)).toBeUndefined();
  });

  it('survives deep nesting without throwing', () => {
    let deep: Record<string, unknown> = { viewers: 42 };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(extractViewerCount(deep)).toBeUndefined(); // beyond MAX_DEPTH
    expect(extractViewerCount({ a: { b: { c: { d: { viewers: 9 } } } } })).toBe(9);
  });
});
