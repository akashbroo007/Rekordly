/**
 * Subtitle normalization — the player's <track> element only understands
 * WebVTT, while sidecar files in the wild are mostly SubRip (.srt) and
 * occasionally SubStation Alpha (.ass/.ssa). Everything goes through here so
 * the main process hands the renderer a valid `data:text/vtt;base64,…` URL.
 */

/** Parses an SRT/WEBVTT timecode into seconds (10^-3 precision). */
export function parseSubtitleTimecode(stamp: string): number | null {
  const m = stamp.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (m === null) return null;
  const h = m[1] !== undefined ? parseInt(m[1], 10) : 0;
  const min = parseInt(m[2] ?? '', 10);
  const s = parseInt(m[3] ?? '', 10);
  // 1–2 fractional digits are padded to milliseconds ("5" → 500ms, "52" → 520ms).
  const fracRaw = m[4] ?? '';
  const ms = parseInt(fracRaw.padEnd(3, '0').slice(0, 3), 10);
  if (!Number.isFinite(min) || !Number.isFinite(s) || !Number.isFinite(ms)) return null;
  return h * 3600 + min * 60 + s + ms / 1000;
}

/**
 * Converts SubRip (.srt) content to WebVTT. Handles the numeric cue ids,
 * `hh:mm:ss,mmm → hh:mm:ss.mmm` timing difference, and inline HTML-ish tags
 * (<i>, <b>, <font>) which VTT also accepts. Blank content → null.
 */
export function srtToVtt(content: string): string | null {
  const blocks = content
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const cues: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    // Drop the numeric cue id line when present ("12").
    if (lines.length > 1 && /^\d+$/.test(lines[0]!.trim())) lines.shift();
    const timing = lines.shift();
    if (timing === undefined) continue;
    const m = timing.match(
      /^((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3}).*$/,
    );
    if (m === null) continue;
    const start = parseSubtitleTimecode(m[1]!);
    const end = parseSubtitleTimecode(m[2]!);
    if (start === null || end === null || end <= start) continue;
    const text = lines.join('\n').trim();
    if (text.length === 0) continue;
    cues.push(`${formatVttTimecode(start)} --> ${formatVttTimecode(end)}\n${text}`);
  }

  if (cues.length === 0) return null;
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

/** Formats seconds as a WebVTT timecode (`hh:mm:ss.mmm`). */
export function formatVttTimecode(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(Math.min(999, ms)).padStart(3, '0')}`;
}

/**
 * Converts SubStation Alpha (.ass/.ssa) dialogue events to WebVTT. Only the
 * [Events] section matters; overlapping Dialogue lines (signs over speech)
 * are kept — the browser renders them top/bottom.
 */
export function assToVtt(content: string): string | null {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  // "Format: Layer, Start, End, Style, Name, MarginL, …, Text" — field order.
  let format: string[] | null = null;
  const cues: { start: number; end: number; text: string }[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (/^Format\s*:/i.test(line) && format === null) {
      format = line
        .slice(line.indexOf(':') + 1)
        .split(',')
        .map((f) => f.trim().toLowerCase());
      continue;
    }
    if (!/^Dialogue\s*:/i.test(line)) continue;
    const value = line.slice(line.indexOf(':') + 1).trim();
    const fields = format ?? ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
    const startIdx = fields.indexOf('start');
    const endIdx = fields.indexOf('end');
    const textIdx = fields.indexOf('text');
    if (startIdx < 0 || endIdx < 0 || textIdx < 0) continue;
    // The Text field is last and may contain commas — split only as far as needed.
    const parts = value.split(',');
    if (parts.length < fields.length) continue;
    const start = parseSubtitleTimecode(parts[startIdx]!.trim());
    const end = parseSubtitleTimecode(parts[endIdx]!.trim());
    const text = parts.slice(textIdx).join(',').trim();
    if (start === null || end === null || text.length === 0) continue;
    // ASS overrides {\i1}… become plain text; keep the braces' inner tags out.
    const cleaned = text.replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').trim();
    if (cleaned.length === 0) continue;
    cues.push({ start, end, text: cleaned });
  }

  if (cues.length === 0) return null;
  cues.sort((a, b) => a.start - b.start);
  const body = cues
    .map((c) => `${formatVttTimecode(c.start)} --> ${formatVttTimecode(c.end)}\n${c.text}`)
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

/** Lowercased subtitle file extensions the picker accepts. */
export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa'] as const;

/** True when the file name looks like a subtitle we can normalize. */
export function isSubtitleFile(fileName: string): boolean {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return (SUBTITLE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Normalizes any supported subtitle content to a WebVTT string.
 * Returns null when the content can't be parsed (caller reports an error).
 */
export function toWebVtt(fileName: string, content: string): string | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'vtt') return /WEBVTT/i.test(content) ? content : srtToVtt(content);
  if (ext === 'ass' || ext === 'ssa') return assToVtt(content);
  if (ext === 'srt') return srtToVtt(content);
  return null;
}

// --- Network stream probing ---------------------------------------------------

/** True when the URL or its content points at an HLS playlist (.m3u8/m3u). */
export function looksLikeHls(url: string, contentType?: string | null, body?: string | null): boolean {
  if (/\.m3u8?(\?|#|$)/i.test(url)) return true;
  if (contentType !== undefined && contentType !== null && /mpegurl/i.test(contentType)) return true;
  if (body !== undefined && body !== null) {
    const head = body.slice(0, 512);
    return /^\s*#EXTM3U/.test(head) || /^\s*#EXT-X-VERSION/.test(head);
  }
  return false;
}

/** True when an HLS playlist text describes a live stream (EVENT, no ENDLIST). */
export function isLiveHlsPlaylist(body: string): boolean {
  const head = body.slice(0, 64 * 1024);
  if (/#EXT-X-ENDLIST/i.test(head)) return false;
  if (/TYPE\s*=\s*(EVENT|LIVE)/i.test(head)) return true;
  // Master playlists (variant streams) can't tell liveness — not live.
  return !/^\s*#EXT-X-STREAM-INF/im.test(head) && /^\s*#EXTINF/m.test(head);
}

/** True when the URL points at a DASH manifest (.mpd). */
export function looksLikeDash(url: string, contentType?: string | null): boolean {
  if (/\.mpd(\?|#|$)/i.test(url)) return true;
  return contentType !== undefined && contentType !== null && /dash\+xml/i.test(contentType);
}

/** True when the MIME type is plain video/audio a <video> element can play. */
export function isDirectMediaType(contentType: string | null | undefined): boolean {
  if (contentType === undefined || contentType === null) return false;
  return /^(video|audio)\//i.test(contentType) || /matroska/i.test(contentType);
}
