import { setTimeout as schedule } from 'node:timers';
import type { Logger } from '@rekordly/shared';

/**
 * ponytail: lightweight main-thread responsiveness probe — measures how far
 * behind schedule 10s timers fire. A healthy Electron main loop drifts a few
 * ms; a blocked loop (sync subprocess, sync fs walk, SQLite under pressure)
 * drifts hundreds of ms to seconds. This is the "why is the window stuck"
 * instrument: with the async kill path landed, any residual spike in the
 * logs pinpoints surviving blockers instead of guesswork. Zero UI impact.
 *
 * ponytail (2026-10-24): the first production report was `driftMs: 1282242`
 * — 21.4 MINUTES. That was not loop lag: the system was suspended while
 * recordings ran (no power-save block existed) and Node timers freeze with
 * the OS. The probe now classifies suspension-sized drifts separately and
 * accepts a context callback (wired to powerMonitor's last-resume time) so
 * the warn self-attributes.
 *
 * Warn threshold is deliberately generous (250ms above the sample window) so
 * idle noise never logs; a working recording session should log NOTHING.
 *
 * ponytail: scheduled with timers so the timer handle can be unref'd — the
 * probe must never keep the app alive or add work beyond one Date.now() per
 * 10s.
 */
const SAMPLE_MS = 10_000;
const WARN_THRESHOLD_MS = 250;
/** Drifts longer than this are a system suspension, not event-loop lag. */
const SYSTEM_SLEEP_DRIFT_MS = 60_000;

export type LagProbeContext = () => Record<string, unknown>;

export function startLagProbe(logger: Logger, context?: LagProbeContext): void {
  let scheduledAt = Date.now();
  const sample = (): void => {
    const drift = Date.now() - scheduledAt - SAMPLE_MS;
    if (drift > WARN_THRESHOLD_MS) {
      const extra = context?.() ?? {};
      if (drift > SYSTEM_SLEEP_DRIFT_MS) {
        logger.warn(
          { driftMs: Math.round(drift), suspensionSized: true, ...extra },
          'timers stalled — the system was likely suspended under the app (see powerMonitor suspend/resume logs)',
        );
      } else {
        logger.warn({ driftMs: Math.round(drift), ...extra }, 'main-process event loop lagged');
      }
    }
    scheduledAt = Date.now();
    const timer = schedule(sample, SAMPLE_MS);
    timer.unref?.();
  };
  const timer = schedule(sample, SAMPLE_MS);
  timer.unref?.();
  logger.debug({ sampleMs: SAMPLE_MS }, 'event-loop lag probe started');
}
