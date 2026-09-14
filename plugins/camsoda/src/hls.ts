/**
 * HLS master playlist handling for Camsoda edge streams.
 *
 * The vtoken endpoint returns {edge_servers, stream_name, token}; the playable
 * master playlist is `https://{edge}/{stream_name}_v1/index.m3u8?token={token}`
 * (verified against the live CDN). Edge server entries come in two shapes:
 * "host/path" (e.g. "streaming-edge-front.livemediahost.com/edge3-cad") and
 * bare hostnames (older rooms, e.g. "edge4-fld.livemediahost.com") — both are
 * used verbatim after the scheme.
 */
import { httpGet } from './http';
import { isRecordableStream, type StreamInfo } from './api';

export interface StreamVariant {
  url: string;
  bandwidth: number;
  resolution?: string;
  codecs?: string;
}

/** Builds one candidate master playlist URL from an edge server entry. */
export function masterPlaylistUrl(stream: StreamInfo, edgeServer: string): string {
  const server = edgeServer.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return `https://${server}/${stream.streamName}_v1/index.m3u8?token=${stream.token}`;
}

/** CDN-side headers; without the Referer some edges 403. */
export function cdnHeaders(baseUrl: string): Record<string, string> {
  return {
    Referer: `${baseUrl}/`,
    Origin: baseUrl,
    Accept: '*/*',
  };
}

/**
 * Fetch a master playlist and parse its variants.
 * Throws when the URL is not a live master playlist (used for validation).
 */
export async function fetchVariants(
  masterUrl: string,
  logger?: (m: string) => void,
): Promise<StreamVariant[]> {
  const res = await httpGet(masterUrl, cdnHeaders('https://www.camsoda.com'), { logger });
  if (res.status !== 200 || !res.body.includes('#EXTM3U')) {
    throw new Error(`Playlist not playable (HTTP ${res.status})`);
  }
  if (res.body.includes('#EXT-X-PLAYLIST-TYPE:VOD')) {
    throw new Error('Playlist is a VOD, not a live stream');
  }

  const lines = res.body.split('\n').map((l) => l.trim());
  const variants: StreamVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]?.startsWith('#EXT-X-STREAM-INF:')) continue;
    const rawUrl = lines[i + 1];
    if (!rawUrl || rawUrl.startsWith('#')) continue;
    const attrs = lines[i]!.slice('#EXT-X-STREAM-INF:'.length);
    const bandwidth = parseInt(attrs.match(/BANDWIDTH=(\d+)/)?.[1] ?? '0', 10);
    const codecs = attrs.match(/CODECS="([^"]*)"/)?.[1];
    const resolution = attrs.match(/RESOLUTION=([0-9]+x[0-9]+)/)?.[1];
    const url = /^https?:/i.test(rawUrl) ? rawUrl : new URL(rawUrl, masterUrl).toString();
    variants.push({ url, bandwidth, resolution, codecs });
  }
  if (variants.length === 0) {
    throw new Error('Playlist has no variants');
  }
  return variants;
}

/**
 * Pick the highest-bandwidth H.264 variant. avc1 is preferred over AV1/hevc
 * (large score bonus) so a slightly lower-bandwidth avc1 variant still wins —
 * AV1 segments break recording and playback on many systems.
 */
export function pickBestVariant(variants: StreamVariant[]): StreamVariant {
  const score = (v: StreamVariant): number => {
    let s = v.bandwidth;
    if (/avc1/i.test(v.codecs ?? '')) s += 5_000_000;
    else if (/av01|hvc1|hev1/i.test(v.codecs ?? '')) s -= 5_000_000;
    return s;
  };
  return [...variants].sort((a, b) => score(b) - score(a))[0]!;
}

/**
 * Probe every edge server (and every legacy URL form) until a live master
 * playlist answers. Failing edges are common (regional load balancing), so
 * the first that validates wins.
 */
export async function resolvePlayableStream(
  stream: StreamInfo,
  logger?: (m: string) => void,
): Promise<{ url: string; variants: StreamVariant[] }> {
  if (!isRecordableStream(stream)) {
    throw new Error(`Stream is not publicly watchable (status: ${stream.status || 'unknown'})`);
  }
  const errors: string[] = [];
  for (const edgeServer of stream.edgeServers) {
    const candidates: string[] = [masterPlaylistUrl(stream, edgeServer)];
    for (const candidate of candidates) {
      try {
        const variants = await fetchVariants(candidate, logger);
        logger?.(`camsoda: playable master via ${edgeServer}`);
        return { url: candidate, variants };
      } catch (e) {
        errors.push(`${edgeServer}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  throw new Error(`No reachable HLS playlist (tried ${stream.edgeServers.length} edges): ${errors.join('; ')}`);
}
