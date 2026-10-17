/**
 * Platform-agnostic viewer-count extraction.
 *
 * Every platform names its live viewer count differently (Chaturbate's
 * `num_viewers`, Twitch's `viewer_count`, Rumble's `watching_now`,
 * CamSoda's `viewers`, …). Instead of each plugin hand-rolling a parser —
 * or omitting the count entirely so the UI falls back to a bare platform
 * name — plugins run this helper over ANY payload they already fetch
 * (JSON bodies, SSR preloaded state, HTML pages). No extra network
 * requests, no platform details leak into the host.
 */

/** Recognized field names, ordered most-canonical first. */
const VIEWER_KEYS: readonly string[] = [
  'viewer_count',
  'viewerCount',
  'concurrentViewers',
  'concurrent_viewers',
  'num_viewers',
  'numViewers',
  'viewers',
  'viewersCount',
  'viewers_count',
  'current_viewers',
  'currentViewers',
  'watching_now',
  'watchingNow',
  'watchingCount',
  'connectionCount',
];

/** Sanity ceiling — live rooms never reach this; bigger numbers are follower totals or ids. */
const MAX_PLAUSIBLE = 5_000_000;

/** Recursion guard for deeply-nested or hostile payloads. */
const MAX_DEPTH = 6;

function plausible(n: number): n is number {
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= MAX_PLAUSIBLE;
}

function fromValue(value: unknown, depth: number): number | undefined {
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = fromValue(item, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of VIEWER_KEYS) {
    const raw = record[key];
    if (typeof raw === 'number' && plausible(raw)) return raw;
    if (
      typeof raw === 'string' &&
      raw.trim() !== '' &&
      Number.isInteger(Number(raw)) &&
      plausible(Number(raw))
    ) {
      return Number(raw);
    }
  }
  for (const child of Object.values(record)) {
    if (child === null || typeof child !== 'object') continue;
    const found = fromValue(child, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** `"viewers":123`, `"num_viewers": "123"`, `data-viewers="123"`, `1,234 watching now`. */
function fromText(text: string): number | undefined {
  for (const key of VIEWER_KEYS) {
    const quoted = new RegExp(`"${key}"\\s*:\\s*("?)((\\d[\\d,]*)\\1)`, 'i').exec(text);
    if (quoted) {
      const n = Number(quoted[3]!.replace(/,/g, ''));
      if (plausible(n)) return n;
    }
    const attr = new RegExp(`${key}\\s*=\\s*"?(\\d[\\d,]*)`, 'i').exec(text);
    if (attr) {
      const n = Number(attr[1]!.replace(/,/g, ''));
      if (plausible(n)) return n;
    }
  }
  const prose = /(\d[\d,.]*)\s*(?:k|m)?\s*(?:viewers?|watching)/i.exec(text);
  if (prose) {
    const raw = prose[1]!.replace(/,/g, '');
    const n = /k/i.test(prose[0])
      ? Math.round(Number(raw) * 1_000)
      : /m/i.test(prose[0])
        ? Math.round(Number(raw) * 1_000_000)
        : Number(raw);
    if (plausible(n)) return n;
  }
  return undefined;
}

/**
 * Extract the live viewer count from any JSON-shaped value (parsed payload,
 * SSR preloaded state) or raw text (HTML page, JSON string).
 * Returns the first plausible count found, or undefined when the payload
 * carries none — callers omit `viewerCount` rather than show a wrong number.
 */
export function extractViewerCount(source: unknown): number | undefined {
  if (typeof source === 'string') return fromText(source);
  return fromValue(source, 0);
}
