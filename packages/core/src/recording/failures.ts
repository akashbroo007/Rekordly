/**
 * Failure classification for live capture (CONCURRENT_CAPTURE_PLAN §4).
 *
 * Phase B: pure helpers only — no behavior change. The service wires these into
 * the re-resolve loop in a follow-up step. Every network/FFmpeg failure must map
 * to exactly one class so reconnect, re-resolve, and finalize are never conflated:
 *
 * - TRANSIENT: same URL is still valid → FFmpeg `-reconnect`, same capture.
 * - URL_EXPIRED: token/403/401 → re-resolve via `plugin.extractStream`, new capture.
 * - STREAM_ENDED: broadcast genuinely over → finalize normally, no retry.
 * - FATAL: local/config error (missing binary, bad output path) → fail fast, no loop.
 *
 * A nonzero capture exit with NO recognizable signature (e.g. SIGKILLed worker)
 * is TRANSIENT, not FATAL: for live capture an unexplained death is far more
 * likely a crash/blip than a permanent condition, and `retryCount` bounds the
 * cost of being wrong. Only positively-local failures are FATAL.
 */

export type FailureClass = 'TRANSIENT' | 'URL_EXPIRED' | 'STREAM_ENDED' | 'FATAL';

export interface ClassifiableFailure {
  code?: string;
  message?: string;
}

const URL_EXPIRED_PATTERNS = [
  /\b40[13]\b/, // HTTP 401 / 403
  /\b410\b/, // Gone (expired token URLs)
  /forbidden/i,
  /unauthorized/i,
  /access denied/i,
  /token[^.]{0,40}(expir|invalid|revoked)/i,
  /(expir|invalid)[^.]{0,40}token/i,
  /url[^.]{0,40}expir/i,
  /signature[^.]{0,40}(expir|mismatch|invalid)/i,
];

const TRANSIENT_PATTERNS = [
  /timed?\s?out/i,
  /etimedout/i,
  /econn(reset|aborted|refused)/i,
  /connection (reset|refused|aborted|closed)/i,
  /network (is )?(unreachable|down|reset)/i,
  /temporary failure/i,
  /socket (hang up|reset|closed)/i,
  /eai_again/i, // transient DNS
  /econnreset/i,
  /broken pipe/i,
  /got nothing|empty reply/i,
  // ponytail: live-HLS stall watchdog signature — a dead playlist window
  // (no new media while the process still runs) is a transient edge
  // failure, not a stream end: restarting the capture is the only way to
  // keep recording once the edge recovers.
  /stalled/i,
];

const STREAM_ENDED_PATTERNS = [
  /live (event|stream) (has |is )?(ended|over)/i,
  /stream (has |is )?(ended|offline|finished)/i,
  /no longer live/i,
  /broadcaster (is |went )?offline/i,
  /room (is |went )?offline/i,
];

/**
 * A connection failure against a LOOPBACK host means the site plugin's local
 * proxy (e.g. Stripchat's MouflonProxy on 127.0.0.1:<port>) died — evicted,
 * idle-timed-out, or crashed. Same-URL retry would hammer a dead port, so
 * this routes to re-resolution: only a fresh extraction mints a new proxy.
 * Requires BOTH a loopback host AND connection-failure wording to avoid
 * misrouting remote errors that merely mention localhost.
 */
const LOOPBACK_HOST_PATTERN = /(127\.\d+\.\d+\.\d+|\[?::1\]?|localhost)/i;
const CONNECTION_FAILURE_PATTERN =
  /connect|refus|failed|reset|closed|timed?\s?out|econn|etimedout|socket|eai_again/i;

function isLoopbackProxyFailure(text: string): boolean {
  return LOOPBACK_HOST_PATTERN.test(text) && CONNECTION_FAILURE_PATTERN.test(text);
}

/** Local errors that retrying will never fix — fail fast instead of burning attempts. */
const FATAL_CODES = new Set([
  'YTDLP_NOT_FOUND',
  'FFMPEG_NOT_FOUND',
  'YTDLP_SPAWN_FAILED',
  'FFMPEG_SPAWN_FAILED',
]);

/**
 * Classify a capture failure. Pure and total — every input yields a class,
 * so callers can switch exhaustively with no fallthrough retry.
 */
export function classifyCaptureFailure(error: ClassifiableFailure): FailureClass {
  if (error.code !== undefined && FATAL_CODES.has(error.code)) return 'FATAL';
  const text = `${error.code ?? ''} ${error.message ?? ''}`;
  if (URL_EXPIRED_PATTERNS.some((re) => re.test(text))) return 'URL_EXPIRED';
  // ponytail: dead loopback proxy — re-resolve mints a fresh one (same-URL
  // retry would hammer a closed port until the bound burns out).
  if (isLoopbackProxyFailure(text)) return 'URL_EXPIRED';
  if (STREAM_ENDED_PATTERNS.some((re) => re.test(text))) return 'STREAM_ENDED';
  if (TRANSIENT_PATTERNS.some((re) => re.test(text))) return 'TRANSIENT';
  // plan §4A/§25: unexplained mid-capture death (crash, SIGKILL, edge drop
  // with no signature) retries bounded on the same URL — see docstring.
  return 'TRANSIENT';
}

/**
 * Jittered exponential backoff for reconnect/re-resolve waits.
 * Pure: `baseMs * 2^attempt` capped at `maxMs`, ±25% jitter. Respects the existing
 * retryDelay/offline-wait/error-wait settings supplied by the caller as `baseMs`.
 */
export function computeBackoffMs(
  attempt: number,
  baseMs: number,
  maxMs = 60_000,
  random: () => number = Math.random,
): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const exponential = baseMs * 2 ** Math.min(safeAttempt, 10);
  const capped = Math.min(exponential, Math.max(0, maxMs));
  const jitter = capped * (0.75 + random() * 0.5);
  return Math.floor(jitter);
}
