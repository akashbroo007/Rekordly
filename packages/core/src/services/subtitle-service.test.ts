import { describe, expect, it } from 'vitest';
import {
  assToVtt,
  formatVttTimecode,
  isLiveHlsPlaylist,
  isSubtitleFile,
  looksLikeDash,
  looksLikeHls,
  parseSubtitleTimecode,
  srtToVtt,
  toWebVtt,
} from './subtitle-service';

describe('parseSubtitleTimecode', () => {
  it('parses SRT style comma timecodes', () => {
    expect(parseSubtitleTimecode('00:01:02,500')).toBe(62.5);
  });

  it('parses VTT style dot timecodes with hours', () => {
    expect(parseSubtitleTimecode('01:00:00.000')).toBe(3600);
  });

  it('parses short mm:ss.mmm forms', () => {
    expect(parseSubtitleTimecode('02:03.5')).toBe(123.5);
  });

  it('returns null for garbage', () => {
    expect(parseSubtitleTimecode('not a time')).toBeNull();
  });
});

describe('srtToVtt', () => {
  it('converts a basic SRT with cue ids and comma timings', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:03,000',
      'Hello world',
      '',
      '2',
      '00:00:04,000 --> 00:00:06,000',
      'Second line',
      '',
    ].join('\n');
    const vtt = srtToVtt(srt);
    expect(vtt?.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:03.000');
    expect(vtt).toContain('Hello world');
    expect(vtt).not.toMatch(/^\s*2\s*$/m);
  });

  it('keeps multi-line cue text', () => {
    const srt = '00:00:01,000 --> 00:00:03,000\nline one\nline two';
    const vtt = srtToVtt(srt);
    expect(vtt).toContain('line one\nline two');
  });

  it('returns null for content without valid cues', () => {
    expect(srtToVtt('random nonsense')).toBeNull();
  });
});

describe('assToVtt', () => {
  it('converts Dialogue lines with the declared Format', () => {
    const ass = [
      '[Script Info]',
      'Title: test',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello {\\i1}italic{\\i0} world',
      'Dialogue: 0,0:00:04.50,0:00:06.00,Default,,0,0,0,,Sign\\Ntext',
    ].join('\n');
    const vtt = assToVtt(ass);
    expect(vtt).toContain('00:00:01.000 --> 00:00:03.000');
    expect(vtt).toContain('Hello italic world');
    expect(vtt).toContain('Sign\ntext');
  });

  it('drops override tags and empty dialogues', () => {
    const ass = [
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\pos(1,2)}',
    ].join('\n');
    expect(assToVtt(ass)).toBeNull();
  });
});

describe('toWebVtt', () => {
  it('routes by extension and validates VTT content', () => {
    expect(toWebVtt('movie.srt', '1\n00:00:01,000 --> 00:00:02,000\nHi')).toContain('WEBVTT');
    expect(toWebVtt('movie.vtt', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi')).toContain('WEBVTT');
    // A .vtt without the WEBVTT header is treated as SRT-like content.
    expect(toWebVtt('movie.vtt', '00:00:01,000 --> 00:00:02,000\nHi')).toContain('WEBVTT');
    expect(toWebVtt('movie.txt', 'anything')).toBeNull();
  });

  it('detects subtitle files by extension', () => {
    expect(isSubtitleFile('movie.en.srt')).toBe(true);
    expect(isSubtitleFile('SUBS.VTT')).toBe(true);
    expect(isSubtitleFile('caption.ass')).toBe(true);
    expect(isSubtitleFile('video.mp4')).toBe(false);
  });
});

describe('formatVttTimecode', () => {
  it('formats hours, minutes, seconds and millis', () => {
    expect(formatVttTimecode(3661.5)).toBe('01:01:01.500');
    expect(formatVttTimecode(0)).toBe('00:00:00.000');
  });
});

describe('HLS detection', () => {
  it('detects HLS from URL, content type, or body', () => {
    expect(looksLikeHls('https://cdn.example.com/live/stream.m3u8?tok=1')).toBe(true);
    expect(looksLikeHls('https://cdn.example.com/live/stream.m3u')).toBe(true);
    expect(looksLikeHls('https://cdn.example.com/video', 'application/vnd.apple.mpegurl')).toBe(true);
    expect(looksLikeHls('https://cdn.example.com/video', null, '#EXTM3U\n#EXTINF:4,')).toBe(true);
    expect(looksLikeHls('https://cdn.example.com/video.mp4', 'video/mp4')).toBe(false);
  });

  it('classifies live vs VOD playlists', () => {
    expect(isLiveHlsPlaylist('#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\na.ts')).toBe(true);
    expect(isLiveHlsPlaylist('#EXTM3U\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXTINF:4,\na.ts')).toBe(true);
    expect(isLiveHlsPlaylist('#EXTM3U\n#EXT-X-ENDLIST\n#EXTINF:4,\na.ts')).toBe(false);
    // Master playlists report nothing about liveness.
    expect(isLiveHlsPlaylist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n720p.m3u8')).toBe(false);
  });

  it('detects DASH manifests', () => {
    expect(looksLikeDash('https://cdn.example.com/manifest.mpd')).toBe(true);
    expect(looksLikeDash('https://cdn.example.com/x', 'application/dash+xml')).toBe(true);
    expect(looksLikeDash('https://cdn.example.com/x.mp4')).toBe(false);
  });
});
