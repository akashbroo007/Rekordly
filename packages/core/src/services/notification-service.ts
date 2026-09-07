import type { LogRepo, NotificationRecord } from '@rekordly/database';
import type { Logger } from '@rekordly/shared';
import type { EventBus } from '../events/event-bus';

export interface NotificationPayload {
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface CoreEvents {
  /** Fired for every notification; desktop main forwards it to the renderer. */
  notification: NotificationRecord;
}

export interface NotificationServiceDeps {
  logRepo: LogRepo;
  logger: Logger;
  bus: EventBus<CoreEvents>;
}

/**
 * Centralized notification system.
 * Every notification is persisted (in-app Notification Center), broadcast to
 * the renderer (toasts) and exposed for native desktop display (desktop main
 * subscribes via `onNotification`).
 */
export class NotificationService {
  private readonly bus: EventBus<CoreEvents>;

  constructor(private readonly deps: NotificationServiceDeps) {
    this.bus = deps.bus;
  }

  send(payload: NotificationPayload): NotificationRecord {
    const record: NotificationRecord = {
      id: 0,
      time: Date.now(),
      level: payload.level,
      title: payload.title,
      message: payload.message,
      read: false,
      data: payload.data,
    };
    this.deps.logRepo.insertNotification(record);
    const persisted = this.deps.logRepo.listNotifications(1)[0];
    if (persisted !== undefined) {
      record.id = persisted.id;
    }
    this.bus.emit('notification', record);
    this.deps.logger.info({ title: payload.title }, 'notification sent');
    return record;
  }

  list(limit = 50): NotificationRecord[] {
    return this.deps.logRepo.listNotifications(limit);
  }

  markRead(id: number): void {
    this.deps.logRepo.markNotificationRead(id);
  }

  markAllRead(): void {
    this.deps.logRepo.markAllNotificationsRead();
  }

  unreadCount(): number {
    return this.deps.logRepo.unreadNotificationCount();
  }

  onNotification(listener: (notification: NotificationRecord) => void): () => void {
    return this.bus.on('notification', listener);
  }
}
