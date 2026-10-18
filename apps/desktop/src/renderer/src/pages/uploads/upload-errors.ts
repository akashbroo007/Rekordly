/**
 * mapUploadError() — pure presentation helper that turns the raw error text
 * stored on an upload record into (a) a one-line human reason, (b) a
 * "retryable" flag for the Retry button and (c) a "missingFile" flag that
 * demotes Retry and promotes Remove.
 *
 * It only ever reads the existing error string — no error objects, no
 * provider logic: the upload pipeline keeps failing exactly as before, this
 * just decides what the user sees. The original text stays available for the
 * collapsible "Technical details" section (run it through maskHomeDir()).
 */

export interface MappedUploadError {
  /** One-line, human-readable reason (what the row shows). */
  reason: string;
  /** False when retrying cannot fix this without setup/cleanup. */
  retryable: boolean;
  /** The source file is gone — Remove becomes the primary action. */
  missingFile: boolean;
}

const NOT_RETRYABLE: MappedUploadError = { reason: '', retryable: false, missingFile: false };

/** Electron IPC wrappers ("Error invoking remote method 'x': AppError: …"). */
function unwrap(raw: string): string {
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^AppError:\s*/i, '')
    .trim();
}

/** First meaningful line of a (possibly multi-line) raw error. */
export function firstErrorLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== '') ?? ''
  );
}

const MISSING_FILE = { ...NOT_RETRYABLE, reason: 'File not found. The recording was moved or deleted.', missingFile: true };
const CONNECTION_LOST = { reason: 'Connection lost. The transfer was interrupted mid-upload.', retryable: true, missingFile: false };
const HOST_REJECTED = { ...NOT_RETRYABLE, reason: 'The host rejected the upload. Check setup.' };
const TOO_LARGE = { ...NOT_RETRYABLE, reason: 'The file is too large for this host.', missingFile: false };

/** Map a raw upload error string to its presentation facts. */
export function mapUploadError(raw: string | null | undefined, status?: string): MappedUploadError {
  const text = unwrap(raw ?? '');
  const lower = text.toLowerCase();

  // The user (or automation) cancelled this attempt — say so plainly
  // regardless of any transport noise the service recorded with it.
  if (status === 'cancelled') {
    return { reason: 'Cancelled by you.', retryable: true, missingFile: false };
  }

  // Missing source: fs errno (ENOENT), "no such file", Windows wording and
  // the service's own "not a valid source file" phrasing. Retrying cannot
  // bring the file back — Remove is the way out.
  if (
    /\benoent\b/.test(lower) ||
    /\beisdir\b/.test(lower) ||
    /\bis a directory\b/.test(lower) ||
    /no such file/.test(lower) ||
    /system cannot find/.test(lower) ||
    /(file|source|path)\s+(does not exist|is missing|not found|no longer exists|is not a valid)/.test(lower)
  ) {
    return /\beisdir\b|\bis a directory\b/.test(lower)
      ? { ...NOT_RETRYABLE, reason: 'That item is a folder — drop video files instead.', missingFile: true }
      : MISSING_FILE;
  }

  // Size limits (checked before the generic 4xx net so "HTTP 413" reads as
  // a size problem, not a setup problem).
  if (/\b413\b/.test(lower) || /too large|too big|exceeds the|exceeds file/.test(lower)) {
    return TOO_LARGE;
  }

  // Transport: aborted/reset/refused sockets, DNS failures, TCP timeouts,
  // gateway hiccups — brief blips worth another attempt.
  if (
    /\beconn(reset|refused|aborted)?\b/.test(lower) ||
    /\benotconn\b/.test(lower) ||
    /\benet(unreach|down)\b/.test(lower) ||
    /\behostunreach\b/.test(lower) ||
    /\betimedout\b/.test(lower) ||
    /getaddrinfo/.test(lower) ||
    /socket hang up|aborted|interrupted|network|offline|dns/.test(lower) ||
    /\b(502|503|504)\b/.test(lower) ||
    /bad gateway|service unavailable/.test(lower)
  ) {
    return CONNECTION_LOST;
  }

  // Server acted up on its own side.
  if (/\b500\b/.test(lower) || /internal server error/.test(lower)) {
    return { reason: 'The host had a problem. Try again in a minute.', retryable: true, missingFile: false };
  }

  // Auth / quota / rejected by policy / forbidden — needs a setup fix.
  if (
    /\b(401|403)\b/.test(lower) ||
    /\bhttp 4\d\d\b/i.test(text) ||
    /unauthori[sz]ed|forbidden|not authorized|access denied|access blocked/.test(lower) ||
    /(invalid|missing|bad|failed)\s+(api\s*(key|email|token)|credentials?)/.test(lower) ||
    /credentials? (not|missing|invalid|expired)|not configured/.test(lower) ||
    /token refresh failed|sign(ed)? in|api key/.test(lower) ||
    /quota|exceeded/.test(lower)
  ) {
    return HOST_REJECTED;
  }

  // Provider plug-in missing entirely (upload code unchanged; this surfaces
  // where to fix it instead of a raw stack line).
  if (/provider\s+"[^"]+"\s+is not registered/.test(lower)) {
    return { reason: 'That upload host is not available. Check Settings → Cloud Storage.', retryable: true, missingFile: false };
  }

  // Unknown shape: surface the first non-boilerplate line, and assume a
  // one-off failure — Retry is harmless even when it will fail again.
  const line = firstErrorLine(text);
  return line !== ''
    ? { reason: line, retryable: true, missingFile: false }
    : { reason: 'The upload failed unexpectedly.', retryable: true, missingFile: false };
}

/**
 * Replace the user's home-directory prefix with "—" style "~" so shared
 * technical details (logs, stack traces) never leak the Windows/Unix
 * account name.
 */
export function maskHomeDir(text: string): string {
  return text
    .replace(/[A-Za-z]:\\+(Users|Documents and Settings)\\+[^\\/"'|\n\r]+/g, '~')
    .replace(/(\/Users|\/home)\/[^/'"|\n\r\s]+/g, '~');
}
