/**
 * Timecode helpers for the built-in editor's in/out fields.
 * Display format is `MM:SS.t` (or `H:MM:SS.t` past an hour); parsing accepts
 * plain seconds (`90`, `90.5`), `MM:SS`, and `H:MM:SS`, each with an optional
 * fractional part. Pure functions — no React, no DOM.
 */

/** Format seconds as `MM:SS.t` (tenths), e.g. 65.25 → `01:05.2`. */
export function formatTimecode(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00.0';
  const tenths = Math.floor(totalSeconds * 10) % 10;
  const seconds = Math.floor(totalSeconds) % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const body = hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  return `${body}.${tenths}`;
}

/**
 * Parse a timecode string into seconds. Returns null when invalid.
 * Accepts: `90`, `90.5`, `01:30`, `01:30.5`, `1:02:03`.
 */
export function parseTimecode(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  if (/^\d+(\.\d+)?$/.test(text)) {
    const seconds = Number(text);
    return Number.isFinite(seconds) ? seconds : null;
  }
  const parts = text.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isFinite(n)) return null;
    numbers.push(n);
  }
  // ponytail: only the last (seconds) component may carry a fraction, and
  // minutes/seconds must be < 60 — otherwise `1:75` silently becomes 2:15.
  for (let i = 0; i < numbers.length - 1; i++) {
    if (!Number.isInteger(numbers[i]!) || numbers[i]! >= 60) return null;
  }
  const seconds = numbers[numbers.length - 1]!;
  if (seconds >= 60) return null;
  let total = seconds;
  if (numbers.length === 3) total += numbers[0]! * 3600 + numbers[1]! * 60;
  else total += numbers[0]! * 60;
  return total;
}

/** Clamp seconds into [0, max]; NaN → fallback. */
export function clampSeconds(value: number, max: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(0, value), Math.max(0, max));
}
