/**
 * Presentation helpers for the Uploads page — locale-aware stamps and
 * relative times, filename → creator parsing, provider retention text and
 * dropped-file path recovery. Everything is pure; no behavior here.
 */
import { humanizeJobTitle } from '../recordings/recording-format';

/** "C:\\Users\\you\\Recordings\\creator_2026-10-15.mp4" → "creator_2026-10-15" */
export function fileBaseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

const EXTENSION = /\.[a-z0-9]{1,5}$/i;

/**
 * Row title = the creator's name parsed out of the recording file name
 * ("bellabrooks_2026-10-15_14-22.mp4" → "bellabrooks"). Recording
 * files are always "{creator}_{date}_{time}", so the recordings page's
 * humanizeJobTitle() does the heavy lifting. Falls back to
 * "Uploaded file" when nothing usable parses out.
 */
export function creatorFromFileName(sourcePath: string): string {
  const base = fileBaseName(sourcePath).replace(EXTENSION, '');
  const parsed = humanizeJobTitle(base);
  return parsed !== '' ? parsed : 'Uploaded file';
}

/* --- relative time ---------------------------------------------------------- */

/** "just now" · "3m ago" · "2h ago" · "5d ago" · "15 Oct" (older stays a date). */
export function formatRelativeTime(iso: string | null | undefined): string | null {
  if (iso === null || iso === undefined || iso === '') return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 0) return 'just now';
  if (diffSec < 60) return 'just now';
  if (diffSec < 3_600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3_600)}h ago`;
  if (diffSec < 7 * 86_400) return `${Math.floor(diffSec / 86_400)}d ago`;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(ts);
}

/* --- provider metadata → copy ------------------------------------------------ */

/** "1024 MB"-style max file size, or "Unlimited" (null). Hidden when unknown. */
export function formatMaxSize(bytes: number | null): string {
  if (bytes === null) return 'Unlimited';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${bytes} B`;
}

/** "unthrottled" → Normal, "throttled" → Throttled (amber downside). */
export function speedLabel(downloadSpeed: 'unthrottled' | 'throttled'): string {
  return downloadSpeed === 'unthrottled' ? 'Normal' : 'Throttled';
}

export interface RetentionInfo {
  /** Short row hint: "Expires after 10 days inactive" / "Kept forever". */
  hint: string;
  /** Longer info-card line: "Deleted after 10 days of inactivity". */
  card: string;
  /** True when the host keeps files permanently. */
  permanent: boolean;
}

/**
 * Retention copy derived ONLY from the provider's fileExpiry metadata
 * (e.g. "10 days of inactivity", "Never"). Returns null when the metadata
 * is absent/empty so unknown items are hidden instead of guessed.
 */
export function retentionInfo(fileExpiry: string | null | undefined): RetentionInfo | null {
  const text = (fileExpiry ?? '').trim();
  if (text === '') return null;
  if (/never|permanent/i.test(text)) {
    return { hint: 'Kept forever', card: 'Files stay until you delete them', permanent: true };
  }
  return {
    hint: `Expires after ${text.replace(/\s+of\s+inactivity/i, ' inactive')}`,
    card: `Deleted after ${text}`,
    permanent: false,
  };
}

/** One-line limit summary for picker rows: "Unlimited size · no account". */
export function providerLimitSummary(
  meta: { maxFileSize: number | null; requiresAccount: boolean; requiresApiKey: boolean } | null | undefined,
): string {
  if (meta === null || meta === undefined) return 'Setup details unknown';
  const size =
    meta.maxFileSize === null || !Number.isFinite(meta.maxFileSize)
      ? 'Unlimited size'
      : `${formatMaxSize(meta.maxFileSize)} max`;
  const account = meta.requiresAccount || meta.requiresApiKey ? 'account required' : 'no account needed';
  return `${size} · ${account}`;
}

/* --- dropped files -------------------------------------------------------------- */

/** Convert a `file:///…` URI from a drag into an OS path. */
function fileUriToPath(uri: string): string | null {
  try {
    const url = new URL(uri.trim());
    if (url.protocol !== 'file:') return null;
    const pathname = decodeURIComponent(url.pathname);
    // Windows drive form "/C:/foo/bar.mp4" → "C:\\foo\\bar.mp4"; POSIX keeps slashes.
    const drive = /^\/([A-Za-z]:)(.*)$/.exec(pathname);
    if (drive !== null) {
      return `${drive[1] ?? ''}${(drive[2] ?? '').replace(/\//g, '\\')}`;
    }
    return pathname;
  } catch {
    return null;
  }
}

/**
 * Recover absolute file paths from a DataTransfer drop. Electron ≥32 no
 * longer exposes File.path, so we first try it when present and fall back
 * to the uri-list/text flavours Chromium puts on OS file drags.
 */
export function filePathsFromDrop(dt: DataTransfer): string[] {
  const paths: string[] = [];
  for (const file of Array.from(dt.files)) {
    const raw = (file as File & { path?: string }).path;
    if (typeof raw === 'string' && raw !== '') paths.push(raw);
  }
  if (paths.length === 0) {
    const list =
      dt.getData('text/uri-list') !== '' ? dt.getData('text/uri-list') : dt.getData('text/plain');
    for (const line of list.split(/[\r\n]+/)) {
      const path = fileUriToPath(line);
      if (path !== null && path !== '') paths.push(path);
    }
  }
  // De-duplicate while keeping order.
  const seen = new Set<string>();
  return paths.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
}
