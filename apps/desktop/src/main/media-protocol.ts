/**
 * sf-media:// protocol — streams local recording files and thumbnails into
 * the renderer. The renderer cannot use file:// URLs (webSecurity), so all
 * media access goes through this handler, which supports HTTP Range requests
 * so <video> can seek within large recordings.
 *
 * It also proxies *remote* streams (VLC-style network playback): the renderer
 * can't fetch cross-origin media directly (CSP + CORS), so HLS playlists,
 * segments, and direct files are relayed through here. Remote URLs ride the
 * same scheme as local files:
 *   sf-media:///C:/path/file.mp4              → local file
 *   sf-media:///remote/<base64url(url)>       → network stream relay
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { net, protocol } from 'electron';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { Readable } from 'node:stream';
import { looksLikeHls, looksLikeDash } from '@rekordly/core';

const SCHEME = 'sf-media';

/**
 * ponytail: UA for the sf-media relay — the Electron default includes an
 * "Electron/x.y.z" token that cam-site CDNs 403. Strip it so playback matches
 * what the probe saw (Chromium UA without the Electron token).
 */
function relayUserAgent(): string {
  const chromeMajor = process.versions.chrome?.split('.')[0] ?? '';
  return chromeMajor === ''
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
}

/** Prefix for relayed remote URLs (base64url-encoded). */
export const REMOTE_PREFIX = '/remote/';

/** Must be called before app.whenReady(). */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

/** Encodes a remote URL into the sf-media relay path. */
export function encodeRemoteUrl(url: string): string {
  return `${SCHEME}://${REMOTE_PREFIX}${Buffer.from(url, 'utf8').toString('base64url')}`;
}

/** Decodes a relay path back into the remote URL (null when not a relay path). */
export function decodeRemoteUrl(pathname: string): string | null {
  if (!pathname.startsWith(REMOTE_PREFIX)) return null;
  const encoded = pathname.slice(REMOTE_PREFIX.length);
  try {
    const url = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Range header the media element sent (or null). */
function rangeFrom(request: Request): { start: number; end: number | null } | null {
  const header = request.headers.get('range');
  if (header === null) return null;
  const m = header.match(/bytes=(\d*)-(\d*)/);
  if (m === null) return null;
  const start = m[1] !== undefined && m[1] !== '' ? parseInt(m[1], 10) : 0;
  if (!Number.isFinite(start) || start < 0) return null;
  const end = m[2] !== undefined && m[2] !== '' ? parseInt(m[2], 10) : null;
  return { start, end: Number.isFinite(end as number) ? (end as number) : null };
}

/**
 * Proxies one remote HTTP(S) request (playlist, segment, direct media) to the
 * renderer, preserving Range/Content-Type/Content-Length semantics so both
 * hls.js and the plain <video> element keep seeking/buffering.
 */
async function relayRemote(request: Request, remoteUrl: string): Promise<Response> {
  const headers: Record<string, string> = {
    // ponytail: Chromium UA (no "Electron/" token) — cam-site CDNs 403 the
    // default one. The request itself goes through net.fetch below so the
    // TLS fingerprint is real Chrome too (undici's ClientHello gets JA3-blocked).
    'User-Agent': relayUserAgent(),
  };
  const range = rangeFrom(request);
  if (range !== null) {
    headers['Range'] = range.end !== null ? `bytes=${range.start}-${range.end}` : `bytes=${range.start}-`;
  }

  // ponytail: Chromium's network stack — real browser TLS fingerprint,
  // HTTP/2, header order. Node fetch/undici is fingerprint-blocked by the
  // same edges that block curl (verified with a live Cam4 edge URL).
  const upstream = await net.fetch(remoteUrl, {
    headers,
    redirect: 'follow',
    credentials: 'include',
  });

  // Rewrite HLS/DASH playlist responses so child URIs resolve against our relay.
  const isPlaylist =
    looksLikeHls(remoteUrl, upstream.headers.get('content-type')) ||
    looksLikeDash(remoteUrl, upstream.headers.get('content-type'));
  if (isPlaylist && upstream.status === 200) {
    const text = await upstream.text();
    const rewritten = rewriteHlsPlaylist(text, remoteUrl);
    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const responseHeaders: Record<string, string> = {
    'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength !== null) responseHeaders['Content-Length'] = contentLength;
  const contentRange = upstream.headers.get('content-range');
  if (contentRange !== null) responseHeaders['Content-Range'] = contentRange;
  if (upstream.status === 206 || range !== null) responseHeaders['Accept-Ranges'] = 'bytes';

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

/**
 * Rewrites an HLS playlist for relay: every segment / variant-playlist URI is
 * converted to an sf-media relay URL so all media fetches come back through
 * this handler (CSP-safe, CORS-free, consistent UA).
 */
function rewriteHlsPlaylist(text: string, playlistUrl: string): string {
  const base = new URL(playlistUrl);
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      // Non-comment, non-empty lines carry a URI (segments / variant playlists).
      if (trimmed !== '' && !line.startsWith('#')) {
        return resolveToRelay(trimmed, base);
      }
      // URI="…" attributes inside tags (#EXT-X-MAP, #EXT-X-MEDIA, #EXT-X-KEY, …).
      if (line.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (_all, uri: string) => `URI="${resolveToRelay(uri, base)}"`);
      }
      return line;
    })
    .join('\n');
}

function resolveToRelay(uri: string, base: URL): string {
  try {
    const resolved = new URL(uri, base).toString();
    return encodeRemoteUrl(resolved).replace(`${SCHEME}://`, '');
  } catch {
    return uri;
  }
}

export function registerMediaProtocolHandler(): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      // Relay path — proxy a remote http(s) URL.
      const remote = decodeRemoteUrl(url.pathname);
      if (remote !== null) {
        return await relayRemote(request, remote);
      }

      // sf-media:///C:/path/to/file.mp4 → C:/path/to/file.mp4
      let filePath = decodeURIComponent(url.pathname);
      if (filePath.startsWith('/') && /^\/[A-Za-z]:/.test(filePath)) {
        filePath = filePath.slice(1);
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        return new Response('Not found', { status: 404 });
      }
      const size = statSync(filePath).size;
      const range = request.headers.get('range');

      if (range !== null) {
        const match = range.match(/bytes=(\d*)-(\d*)/);
        if (match !== null) {
          const start = match[1] !== undefined && match[1] !== '' ? parseInt(match[1], 10) : 0;
          const end = match[2] !== undefined && match[2] !== '' ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
          if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
            return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
          }
          const stream = Readable.toWeb(
            createReadStream(filePath, { start, end }),
          ) as WebReadableStream<Uint8Array>;
          return new Response(stream as unknown as ReadableStream, {
            status: 206,
            headers: {
              'Content-Type': contentTypeFor(filePath),
              'Content-Length': String(end - start + 1),
              'Content-Range': `bytes ${start}-${end}/${size}`,
              'Accept-Ranges': 'bytes',
            },
          });
        }
      }

      // Full response (thumbnails, initial loads)
      const stream = Readable.toWeb(createReadStream(filePath)) as WebReadableStream<Uint8Array>;
      return new Response(stream as unknown as ReadableStream, {
        status: 200,
        headers: {
          'Content-Type': contentTypeFor(filePath),
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes',
        },
      });
    } catch (error) {
      console.error('sf-media handler error:', error);
      return new Response('Internal error', { status: 500 });
    }
  });
}

function contentTypeFor(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  return 'application/octet-stream';
}

/** Convert an absolute local file path into a sf-media:// URL for the renderer. */
export function toMediaUrl(filePath: string): string {
  return `${SCHEME}:///${filePath.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}