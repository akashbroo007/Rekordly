/**
 * HLS master-playlist parsing and quality selection for Kick.
 *
 * Kick's playback_url is a standard HLS master playlist (LL-HLS for some
 * channels: #EXT-X-PREFETCH entries appear in media playlists — ffmpeg 6+
 * handles those fine, no special handling needed for recording).
 */

interface Variant {
  url: string;
  bandwidth: number;
  codecs?: string;
  resolution?: string;
  framerate?: number;
}

export interface QualityOption {
  id: string;
  label: string;
  format: string;
  resolution?: string;
  bitrate?: number;
  isBest?: boolean;
}

/**
 * ponytail: prefer H.264 (avc1) over AV1/hevc — AV1 segments break recording
 * and playback on many systems. Implemented as a large score bonus so a
 * slightly lower-bandwidth avc1 variant still wins over an av1 one.
 */
function scoreVariant(v: Variant): number {
  let s = v.bandwidth;
  if (/avc1/i.test(v.codecs ?? '')) s += 5_000_000;
  else if (/av01|hvc1|hev1/i.test(v.codecs ?? '')) s -= 5_000_000;
  return s;
}

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // ponytail: quoted values may contain commas — split only on commas that
  // are outside quotes.
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes;
    if (c === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  if (current) parts.push(current);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq > 0) attrs[part.slice(0, eq).trim()] = part.slice(eq + 1).trim().replace(/^"|"$/g, '');
  }
  return attrs;
}

/**
 * Fetch a master playlist and pick the best variant.
 * Returns the resolved media-playlist URL plus the quality options for the
 * StreamObject. A playlist without #EXT-X-STREAM-INF is treated as an
 * already-resolved media playlist and used as-is.
 */
export async function resolveBestVariant(
  masterUrl: string,
  fetchPlaylist: (url: string) => Promise<{ status: number; body: string }>,
): Promise<{ url: string; qualityOptions: QualityOption[] }> {
  const fallbackQuality: QualityOption[] = [
    { id: 'best', label: 'Best', format: 'hls', isBest: true },
  ];
  const res = await fetchPlaylist(masterUrl);
  if (res.status !== 200 || !res.body.includes('#EXT-X-STREAM-INF')) {
    // Already a media playlist (or unreachable) — use as-is.
    return { url: masterUrl, qualityOptions: fallbackQuality };
  }

  const lines = res.body.split('\n').map((l) => l.trim());
  const variants: Variant[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]?.startsWith('#EXT-X-STREAM-INF:')) continue;
    const rawUrl = lines[i + 1];
    if (!rawUrl || rawUrl.startsWith('#')) continue;
    const attrs = parseAttributes(lines[i]!.slice('#EXT-X-STREAM-INF:'.length));
    const bandwidth = parseInt(attrs['BANDWIDTH'] ?? '0', 10);
    const resolution = attrs['RESOLUTION'];
    const codecs = attrs['CODECS'];
    const framerate = attrs['FRAME-RATE'] !== undefined ? parseFloat(attrs['FRAME-RATE']) : undefined;
    const url = /^https?:/i.test(rawUrl) ? rawUrl : new URL(rawUrl, masterUrl).toString();
    variants.push({ url, bandwidth, codecs, resolution, framerate });
  }

  if (variants.length === 0) {
    return { url: masterUrl, qualityOptions: fallbackQuality };
  }

  variants.sort((a, b) => scoreVariant(b) - scoreVariant(a));

  const qualityOptions: QualityOption[] = variants.map((v, idx) => ({
    id: `variant-${idx}`,
    label: v.resolution ?? `${Math.round(v.bandwidth / 1000)} kbps`,
    format: 'hls',
    resolution: v.resolution,
    bitrate: v.bandwidth > 0 ? v.bandwidth : undefined,
    isBest: idx === 0,
  }));

  return { url: variants[0]!.url, qualityOptions };
}
