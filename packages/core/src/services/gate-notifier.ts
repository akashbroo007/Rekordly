import type { Logger } from '@rekordly/shared';
import type { NotificationService } from './notification-service';

/**
 * ponytail: single emission point for Pro-tier gate notifications.
 *
 * Every gate hit becomes a persistent bell entry (Notification Center) and
 * an OS notification (the main process forwards warn-level records and
 * honors the user's notifyWarnings preference). Cooldowns keep repeated
 * hits from nagging: the user was already told; the bell still records
 * every occurrence.
 */

export const UPGRADE_URL = 'https://rekordly.in/#pricing';

export type GateNotificationKind =
  | 'concurrency-limit'
  | 'auto-record-limit'
  | 'cap-warning'
  | 'cap-reached'
  | 'trial-expiring'
  | 'trial-expired';

interface GateNotification {
  kind: GateNotificationKind;
  title: string;
  message: string;
  /** Extra context stored on the record (jobId etc.) for the UI. */
  data?: Record<string, unknown>;
}

export interface GateNotifierDeps {
  notifications: NotificationService;
  logger: Logger;
  /** Injectable clock for tests. */
  now?: () => number;
}

/** Cooldowns per kind — repeated hits within the window stay bell-only. */
const COOLDOWN_MS: Record<GateNotificationKind, number> = {
  'concurrency-limit': 10 * 60_000,
  'auto-record-limit': 5 * 60_000,
  'cap-warning': Number.POSITIVE_INFINITY, // once per jobId (keyed separately)
  'cap-reached': Number.POSITIVE_INFINITY, // once per jobId (keyed separately)
  'trial-expiring': 24 * 60 * 60_000,
  'trial-expired': Number.POSITIVE_INFINITY, // latched until license changes
};

export class GateNotifier {
  private readonly lastSentAt = new Map<string, number>();
  private readonly latched = new Set<GateNotificationKind>();

  constructor(private readonly deps: GateNotifierDeps) {}

  concurrencyLimitReached(limit: number): void {
    this.send({
      kind: 'concurrency-limit',
      title: 'Recording limit reached',
      message: `You're already recording ${limit} streams — that's the free-tier maximum. Upgrade to Pro for unlimited recordings.`,
    });
  }

  autoRecordLimitReached(enabledCount: number, limit: number): void {
    this.send({
      kind: 'auto-record-limit',
      title: 'Auto-record limit reached',
      message: `Auto-record is already on for ${limit} creators — the free-tier maximum. Upgrade to Pro to add more.`,
    });
  }

  capWarning(jobId: string, title: string, minutesLeft: number): void {
    this.send(
      {
        kind: 'cap-warning',
        title: 'Recording ending soon',
        message: `"${title}" stops in ${minutesLeft} minutes on the free tier. Upgrade to Pro to keep recording.`,
        data: { jobId },
      },
      `cap-warning:${jobId}`,
    );
  }

  capReached(jobId: string, title: string, minutes: number): void {
    this.send(
      {
        kind: 'cap-reached',
        title: 'Recording saved',
        message: `Saved the first ${minutes} minutes of "${title}" (free-tier limit) — the file is ready in your Library. Upgrade to Pro to record full streams.`,
        data: { jobId },
      },
      `cap-reached:${jobId}`,
    );
  }

  trialExpiring(daysLeft: number): void {
    this.send({
      kind: 'trial-expiring',
      title: daysLeft <= 0 ? 'Your trial ends today' : 'Your trial ends tomorrow',
      message:
        daysLeft <= 0
          ? 'Enjoy Rekordly Pro? Upgrade now to keep unlimited recording.'
          : 'Upgrade to Pro to keep unlimited recording after the trial ends.',
    });
  }

  trialExpired(): void {
    // Latched: sent once until the license state changes.
    if (this.latched.has('trial-expired')) return;
    this.latched.add('trial-expired');
    this.send({
      kind: 'trial-expired',
      title: 'Your trial has ended',
      message:
        'Rekordly is back on the free tier — all your recordings are safe. Upgrade to Pro anytime to unlock everything again.',
    });
  }

  /** License state changed (activation/deactivation) — reset trial latches. */
  resetLatches(): void {
    this.latched.delete('trial-expired');
    this.lastSentAt.delete('trial-expiring');
    this.lastSentAt.delete('trial-expired');
  }

  private send(notification: GateNotification, cooldownKey?: string): void {
    const key = cooldownKey ?? notification.kind;
    const now = this.deps.now?.() ?? Date.now();
    const last = this.lastSentAt.get(key);
    if (last !== undefined && now - last < COOLDOWN_MS[notification.kind]) {
      this.deps.logger.debug({ kind: notification.kind }, 'gate notification suppressed by cooldown');
      return;
    }
    this.lastSentAt.set(key, now);

    this.deps.notifications.send({
      level: 'warn',
      title: notification.title,
      message: notification.message,
      data: {
        gate: true,
        kind: notification.kind,
        upgradeUrl: UPGRADE_URL,
        ...notification.data,
      },
    });
    this.deps.logger.info(
      { kind: notification.kind, key },
      'gate notification sent',
    );
  }
}
