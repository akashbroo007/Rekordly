/**
 * Unit tests for the Rumble plugin's pure parsing logic.
 *
 * The fixtures mirror shapes captured from live Rumble pages/APIs
 * (2026-09) — see the module docs in channel.ts / embed.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyVideoEntry,
  normalizeHandle,
  parseChannelPage,
  videoIdFromEmbedUrl,
  videoIdFromPath,
  videoIdFromWatchUrl,
} from './channel';
import {
  classifyEmbedLive,
  parseEmbedResponse,
  pickPlayableEntries,
  resolveBestVariantFromBody,
  resolveChannelLive,
} from './embed';

// ponytail: the tests import plugin-sdk types only — no runtime dep needed,
// but vitest resolves the workspace package fine when it is present.

describe('normalizeHandle', () => {
  it('accepts every user-facing form', () => {
    expect(normalizeHandle('rumble:Styx')).toBe('styx');
    expect(normalizeHandle('https://rumble.com/c/Styxhexenhammer666')).toBe('styxhexenhammer666');
    expect(normalizeHandle('https://rumble.com/user/SomeName/')).toBe('somename');
    expect(normalizeHandle('rumble.com/c/Styx')).toBe('styx');
    expect(normalizeHandle('@SomeName')).toBe('somename');
    expect(normalizeHandle('  Styx  ')).toBe('styx');
  });
});

describe('video id extraction', () => {
  it('parses embed URLs', () => {
    expect(videoIdFromEmbedUrl('https://rumble.com/embed/v5pv5f/')).toBe('v5pv5f');
    expect(videoIdFromEmbedUrl('https://rumble.com/embed/ufe9n.v5pv5f')).toBe('v5pv5f');
  });

  it('parses watch URLs and bare relative paths', () => {
    expect(videoIdFromWatchUrl('/v7dota4-the-spokane-cocaine-fires.html')).toBe('v7dota4');
    expect(videoIdFromPath('/v7fymo6-live-97.-bundestagssitzung.html')).toBe('v7fymo6');
    expect(videoIdFromPath('/v7fymo6')).toBe('v7fymo6');
  });
});

describe('classifyVideoEntry (page JSON items)', () => {
  // VALIDATED live-item shape (RTDE channel page, 2026-09):
  // live:true, livestream_status:2, watching_now:1069
  const liveItem = {
    object_type: 'video',
    relative_url: '/v7fymo6-live-97-bundestagssitzung.html',
    live: true,
    livestream_status: 2,
    watching_now: 1069,
  };
  const vodItem = {
    object_type: 'video',
    relative_url: '/v7dota4-the-spokane-cocaine-fires.html',
    live: false,
    livestream_status: null,
  };
  const upcomingItem = {
    object_type: 'video',
    relative_url: '/v7zzzz9-scheduled-stream.html',
    live: true,
    livestream_status: 1,
  };

  it('marks the running broadcast live', () => {
    const c = classifyVideoEntry(liveItem as never);
    expect(c).toEqual({ videoId: 'v7fymo6', isLive: true, isUpcoming: false });
  });

  it('treats VODs as offline', () => {
    const c = classifyVideoEntry(vodItem as never);
    expect(c?.isLive).toBe(false);
  });

  it('marks scheduled streams upcoming, not live', () => {
    const c = classifyVideoEntry(upcomingItem as never);
    expect(c?.isLive).toBe(false);
    expect(c?.isUpcoming).toBe(true);
  });

  it('ignores channel/link objects', () => {
    const c = classifyVideoEntry({ object_type: 'channel', relative_url: '/c/RTDE' } as never);
    expect(c).toBeNull();
  });
});

describe('parseChannelPage (og: meta with unquoted attributes)', () => {
  // ponytail: Rumble emits <meta property=og:title content=RTDE> — the
  // unquoted-attribute form is what the real pages carry.
  const html = `
    <html><head>
      <meta property=og:title content=RTDE>
      <meta property=og:image content=https://hugh.cdn.rumble.cloud/avatar.png>
      <meta property=og:description content='Browse the most recent videos from channel "RTDE"'>
      <script type="application/json">{"items":[
        {"object_type":"video","relative_url":"/v7dota4-the-spokane-cocaine-fires.html","live":false,
         "by":{"name":"RT DE","thumb":"https://cdn/avatar.png","followers":1234,"verified_badge":true}}
      ]}</script>
    </head></html>`;
  const signals = parseChannelPage(html);

  it('extracts identity from the item `by` block', () => {
    expect(signals.identity.displayName).toBe('RT DE');
    expect(signals.identity.avatarUrl).toBe('https://cdn/avatar.png');
    expect(signals.identity.followerCount).toBe(1234);
    expect(signals.identity.verified).toBe(true);
  });

  it('falls back to og: meta when items carry no by block', () => {
    const onlyMeta = parseChannelPage('<meta property=og:title content=RTDE>');
    expect(onlyMeta.identity.displayName).toBe('RTDE');
  });

  it('falls back to the first watch-page anchor', () => {
    const s = parseChannelPage('<a href="/v7dota4-the-spokane-cocaine-fires.html">watch</a>');
    expect(s.firstLinkVideoId).toBe('v7dota4');
  });
});

describe('parseEmbedResponse', () => {
  it('throws the body message on HTTP 200 "unavailable" payloads', () => {
    expect(() =>
      parseEmbedResponse({ status: 200, body: JSON.stringify({ sys: { msg: 'Video is unavailable' } }), headers: {} }),
    ).toThrow('Rumble says: Video is unavailable');
  });

  it('treats non-JSON bodies as retryable errors', () => {
    expect(() => parseEmbedResponse({ status: 200, body: '<html>blocked</html>', headers: {} })).toThrow(
      'invalid JSON',
    );
  });

  it('throws on 404', () => {
    expect(() => parseEmbedResponse({ status: 404, body: '', headers: {} })).toThrow('404');
  });
});

describe('classifyEmbedLive (embedJS payloads)', () => {
  it('treats live === 2 as live', () => {
    const c = classifyEmbedLive({
      live: 2,
      ua: { hls: { 1080: { url: 'https://x/playlist.m3u8', meta: { live: true, h: 1080 } } } },
    });
    expect(c.isLive).toBe(true);
    expect(c.hasPlayback).toBe(true);
  });

  it('treats live === 1 + DVR as upcoming', () => {
    const c = classifyEmbedLive({ live: 1, livestream_has_dvr: true });
    expect(c.isLive).toBe(false);
    expect(c.isUpcoming).toBe(true);
  });

  it('treats live === 1 without DVR as was-live (offline)', () => {
    const c = classifyEmbedLive({ live: 1, livestream_has_dvr: null });
    expect(c.isLive).toBe(false);
    expect(c.isUpcoming).toBe(false);
  });

  it('reports an empty live payload (empty-playlist 200) as offline with no playback', () => {
    // ponytail: embedJS answers {} for live ids outside the embedded player
    // — verified 2026-09. Classification must not lie "live" on this.
    const c = classifyEmbedLive({});
    expect(c.isLive).toBe(false);
    expect(c.hasPlayback).toBe(false);
  });
});

describe('pickPlayableEntries (embedJS ua tree)', () => {
  it('flattens the standard tree, skipping tar duplicates', () => {
    const entries = pickPlayableEntries({
      ua: {
        mp4: { 360: { url: 'https://x/360.mp4', meta: { h: 360, w: 640 } } },
        hls: { 1080: { url: 'https://x/playlist.m3u8', meta: { h: 1080, live: true } } },
        tar: { 480: { url: 'https://x/tar', meta: { h: 480 } } },
      },
    });
    expect(entries.map((e) => e.url)).toEqual(
      expect.arrayContaining(['https://x/360.mp4', 'https://x/playlist.m3u8']),
    );
    expect(entries.some((e) => e.url === 'https://x/tar')).toBe(false);
    const hls = entries.find((e) => e.format === 'hls');
    expect(hls?.isLive).toBe(true);
  });

  it('handles the nested wrapper shape', () => {
    const entries = pickPlayableEntries({
      ua: { mp4: { 720: { 720: { url: 'https://x/720.mp4', meta: { w: 1280 } } } } },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.height).toBe(720);
  });
});

describe('resolveChannelLive (page-first live decision)', () => {
  const liveEntry = {
    entry: {
      relative_url: '/v7fymo6.html',
      live: true,
      livestream_status: 2,
      live_streamed_on: '2026-09-25T07:06:11+00:00',
      thumb: 'https://cdn/thumb.jpg',
      eid: 'LptErE7uG78',
    },
    watchingNow: 1212,
    hlsUrl: 'https://rumble.com/live-hls-dvr/2tboQ9Xmo1I/playlist.m3u8',
    title: 'LIVE: session',
  };

  it('confirms live when the playlist answers', async () => {
    const d = await resolveChannelLive([liveEntry], async () => true);
    expect(d.isLive).toBe(true);
    expect(d.title).toBe('LIVE: session');
    expect(d.viewerCount).toBe(1212);
    expect(d.hlsUrl).toBe(liveEntry.hlsUrl);
  });

  it('skips a live-flagged item whose playlist is dead (crashed stream)', async () => {
    const d = await resolveChannelLive([liveEntry], async () => false);
    expect(d.isLive).toBe(false);
  });

  it('ignores upcoming entries entirely', async () => {
    const upcoming = {
      ...liveEntry,
      entry: { ...liveEntry.entry, livestream_status: 1 },
    };
    const d = await resolveChannelLive([upcoming], async () => true);
    expect(d.isLive).toBe(false);
    expect(d.isUpcoming).toBe(true);
  });

  it('returns offline for an empty entry list', async () => {
    const d = await resolveChannelLive([], async () => true);
    expect(d.isLive).toBe(false);
  });
});

describe('resolveBestVariantFromBody (master playlist resolution)', () => {
  const MASTER = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-STREAM-INF:BANDWIDTH=7000000,RESOLUTION=1920x1080,CODECS="avc1.64002a,mp4a.40.2"',
    'https://cdn/1080p/chunklist_DVR.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=640x360,CODECS="avc1.42c00a,mp4a.40.2"',
    'https://cdn/360p/chunklist_DVR.m3u8',
    '',
  ].join('\n');

  it('picks the highest-bandwidth avc1 variant', () => {
    const r = resolveBestVariantFromBody('https://rumble.com/live-hls-dvr/x/playlist.m3u8', 200, MASTER);
    expect(r.url).toBe('https://cdn/1080p/chunklist_DVR.m3u8');
    expect(r.variants).toHaveLength(2);
    expect(r.variants[0]?.resolution).toBe('1920x1080');
  });

  it('returns null on playlist 404 (definitive offline)', () => {
    const r = resolveBestVariantFromBody('https://rumble.com/live-hls-dvr/x/playlist.m3u8', 404, '');
    expect(r.url).toBeNull();
  });

  it('throws on non-200 non-404 (WAF/5xx)', () => {
    expect(() =>
      resolveBestVariantFromBody('https://rumble.com/live-hls-dvr/x/playlist.m3u8', 403, 'forbidden'),
    ).toThrow('HTTP 403');
  });

  it('rejects VOD playlists', () => {
    expect(() =>
      resolveBestVariantFromBody(
        'https://rumble.com/live-hls-dvr/x/playlist.m3u8',
        200,
        '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:10,\na.ts\n',
      ),
    ).toThrow('VOD');
  });
});
