/**
 * mapDownloadError() — the shared "mapError" helper for download rows, built
 * on the Uploads page's mapped-error grammar (same unwrap + first-line +
 * retryable/missingFile shape). It only reads the error string stored on the
 * queue record — no retry/cancel logic lives here; the engine keeps retrying
 * exactly as before, this decides what the user sees.
 *
 * Download-specific failure families (a link can expire, be region-locked
 * or need sign-in — unlike a file upload):
 *   • transport blips → retryable, resume-friendly
 *   • gone/expired links, auth walls, geo/age restrictions → not retryable
 *   • everything unknown → surface the first honest line, keep Retry
 */
import { firstErrorLine } from '../uploads/upload-errors';

export interface MappedDownloadError {
  /** One-line, human-readable reason (what the row shows). */
  reason: string;
  /** False when retrying cannot fix this without a new link/access. */
  retryable: boolean;
}

/** Electron IPC wrappers ("Error invoking remote method 'x': AppError: …"). */
function unwrap(raw: string): string {
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^AppError:\s*/i, '')
    .trim();
}

const RETRYABLE = { retryable: true };
const NOT_RETRYABLE = { retryable: false };

export function mapDownloadError(raw: string | null | undefined, status?: string): MappedDownloadError {
  const text = unwrap(raw ?? '');
  const lower = text.toLowerCase();

  // The user cancelled this attempt — say so plainly regardless of any
  // transport noise recorded alongside it. Retry re-queues cancelled rows.
  if (status === 'cancelled') {
    return { reason: 'Cancelled by user.', ...RETRYABLE };
  }

  // The link itself died: 404/410, "removed"/"gone", yt-dlp
  // "unavailable"/"not exist" phrasing. A retry hits the same dead link.
  if (
    /\b(404|410)\b/.test(lower) ||
    /\bgone\b/.test(lower) ||
    /no longer (exists|available)/.test(lower) ||
    /(video|file|page|content|recording).{0,24}(unavailable|removed|deleted)/.test(lower) ||
    /((was|has been) )?(removed|taken down|terminated)/.test(lower)
  ) {
    return { reason: 'The page or file is no longer available.', ...NOT_RETRYABLE };
  }

  // Access walls: sign-in, paywall, cookies, protected members content.
  if (
    /\b(401|403)\b/.test(lower) ||
    /unauthori[sz]ed|forbidden|access denied|access blocked/.test(lower) ||
    /sign(ed)? in|login required|authentication required|requires authentication|cookies required|members only|private account|paywall/.test(lower)
  ) {
    return { reason: 'This link needs access — it may require sign-in or a paid account.', ...NOT_RETRYABLE };
  }

  // Region / age restrictions (yt-dlp wording included).
  if (
    /geo-?(block|restrict)/.test(lower) ||
    /blocked it in your country|not available in your country|age[- ]restricted|age verification|confirm your age/.test(lower)
  ) {
    return { reason: 'Restricted content — unavailable from this region or account.', ...NOT_RETRYABLE };
  }

  // Local write problems: disk errors on the destination folder. Freeing
  // space or moving the folder can fix it — Retry is worth another try.
  if (
    /\benospc\b/.test(lower) ||
    /\beacces\b/.test(lower) ||
    /\berofs\b/.test(lower) ||
    /disk (full|space)|no space left|permission denied|read-only/.test(lower)
  ) {
    return { reason: 'Could not write the file — check the destination folder and free disk space.', ...RETRYABLE };
  }

  // Transport: aborted/reset/refused sockets, DNS failures, TCP timeouts,
  // gateway hiccups, lost connections — retry picks up where it stopped.
  if (
    /\beconn(reset|refused|aborted)?\b/.test(lower) ||
    /\benotfound\b/.test(lower) ||
    /\benet(unreach|down)\b/.test(lower) ||
    /\behostunreach\b/.test(lower) ||
    /\betimedout?\b/.test(lower) ||
    /getaddrinfo/.test(lower) ||
    /socket hang up|aborted|interrupted|network|offline|dns/.test(lower) ||
    /\b(502|503|504)\b/.test(lower) ||
    /bad gateway|service unavailable/.test(lower)
  ) {
    return { reason: 'Connection lost mid-download. Retry picks up where it stopped.', ...RETRYABLE };
  }

  // The site itself acted up.
  if (/\b500\b/.test(lower) || /internal server error/.test(lower)) {
    return { reason: 'The site had a problem. Try again in a minute.', ...RETRYABLE };
  }

  // Unknown shape: surface the first non-boilerplate line and assume a
  // one-off failure — Retry is harmless even when it fails again.
  const line = firstErrorLine(text);
  return line !== ''
    ? { reason: line, ...RETRYABLE }
    : { reason: 'The download failed unexpectedly.', ...RETRYABLE };
}
