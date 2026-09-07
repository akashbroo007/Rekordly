/**
 * sf-media:// protocol — streams local recording files and thumbnails into
 * the renderer. The renderer cannot use file:// URLs (webSecurity), so all
 * media access goes through this handler, which supports HTTP Range requests
 * so <video> can seek within large recordings.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { protocol } from 'electron';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { Readable } from 'node:stream';

const SCHEME = 'sf-media';

/** Must be called before app.whenReady(). */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

export function registerMediaProtocolHandler(): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
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