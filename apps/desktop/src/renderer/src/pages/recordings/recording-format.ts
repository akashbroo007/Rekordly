/**
 * Locale-aware formatting helpers for the Recordings page.
 * Dates/times always respect the user's system locale (Intl defaults —
 * no hard-coded US formats) and durations render with tabular figures.
 */
const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface DayGroup {
  /** Stable string key for React lists / sort. */
  key: string;
  /** "Today" / "Yesterday" / "15 Oct 2026" (locale-aware). */
  label: string;
  /** Sortable epoch of the day bucket start. */
  dayStart: number;
}

/** Day bucket for group headers. */
export function dayGroupOf(iso: string | null | undefined): DayGroup {
  const EMPTY: DayGroup = { key: 'unknown', label: 'Unknown date', dayStart: 0 };
  if (iso === null || iso === undefined || iso === '') return EMPTY;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return EMPTY;
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  if (day === today) return { key: 'today', label: 'Today', dayStart: day };
  if (day === today - DAY_MS) return { key: 'yesterday', label: 'Yesterday', dayStart: day };
  const label = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(ts);
  return { key: String(day), label, dayStart: day };
}

/** Compact per-row stamp: "Today, 12:47 PM" / "Yesterday" / "15 Oct". */
export function formatRowStamp(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '—';
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  if (day === today) {
    return `Today, ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(ts)}`;
  }
  if (day === today - DAY_MS) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(ts);
}

/** Full locale timestamp for tooltips / details ("18 Oct 2026, 12:47:03 PM"). */
export function formatFullStamp(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(ts);
}

/** "15m 20s" / "1h 05m" — compact, tabular-friendly. */
export function formatCompactDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor((total / 60) % 60);
  const h = Math.floor(total / 3600);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Big live timer "1:23:45" / "12:47" (h:mm:ss | mm:ss). */
export function formatTimer(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "5d 03h" / "132h 05m" for the strip's total recorded time. */
export function formatTotalDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

/**
 * Stream URL shown in the UI — query-string values and long random
 * session/path tokens are masked so nothing sensitive is on screen.
 * The Copy button next to it always copies the full, unmasked URL.
 */
export function maskStreamUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const params = new URLSearchParams(url.search);
    const maskedSearch =
      [...params.keys()].length > 0
        ? `${[...params.keys()].map((key) => `${key}=••••`).join('&')}`
        : '';
    // Long opaque path segments (session ids / stream tokens) get trimmed.
    const maskedPath = url.pathname.replace(/[A-Za-z0-9_-]{20,}/g, (segment) => `${segment.slice(0, 6)}••••`);
    return `${url.protocol}//${url.host}${maskedPath}${maskedSearch !== '' ? `?${maskedSearch}` : ''}`;
  } catch {
    // Not a parseable URL — mask everything past a short prefix.
    return raw.length > 30 ? `${raw.slice(0, 26)}••••` : raw;
  }
}

/**
 * Row title = creator display name. Job titles are '{creator}_{date}_{time}'
 * (same as the file name) — strip that stamp and de-underscore for humans.
 */
const TRAILING_STAMP = /[-_]?(\d{4}-\d{2}-\d{2})[-_](\d{2}-\d{2})((-\d+)?[-_]?[-_a-z0-9]{1,12})?$/i;

export function humanizeJobTitle(title: string): string {
  return title
    .replace(TRAILING_STAMP, '')
    .replace(/[_]+/g, ' ')
    .trim();
}

/** Elapsed seconds between startedAt and finishedAt (or now when live). */
export function jobElapsedSeconds(startedAt?: string | null, finishedAt?: string | null): number | null {
  if (startedAt === null || startedAt === undefined || startedAt === '') return null;
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const end = finishedAt !== null && finishedAt !== undefined && finishedAt !== '' ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 1000));
}
