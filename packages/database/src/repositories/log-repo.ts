import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { count, desc, eq } from 'drizzle-orm';
import { logs, notifications } from '../schema';
import { parseJson, toJson } from './json';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogRecord {
  id: number;
  time: number;
  level: LogLevel;
  scope: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface NotificationRecord {
  id: number;
  time: number;
  level: LogLevel;
  title: string;
  message: string;
  read: boolean;
  data?: Record<string, unknown>;
}

export interface LogRepo {
  insert(entry: Omit<LogRecord, 'id'>): void;
  list(limit: number): LogRecord[];
  insertNotification(entry: Omit<NotificationRecord, 'id' | 'read'>): void;
  listNotifications(limit: number): NotificationRecord[];
  markNotificationRead(id: number): void;
  markAllNotificationsRead(): void;
  unreadNotificationCount(): number;
}

export function createLogRepo(orm: BetterSQLite3Database): LogRepo {
  return {
    insert(entry: Omit<LogRecord, 'id'>): void {
      orm
        .insert(logs)
        .values({
          time: entry.time,
          level: entry.level,
          scope: entry.scope,
          message: entry.message,
          data: entry.data === undefined ? undefined : toJson(entry.data),
        })
        .run();
    },

    list(limit: number): LogRecord[] {
      return orm
        .select()
        .from(logs)
        .orderBy(desc(logs.time))
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          time: row.time,
          level: row.level as LogLevel,
          scope: row.scope,
          message: row.message,
          data: parseJson(row.data, undefined as Record<string, unknown> | undefined),
        }));
    },

    insertNotification(entry: Omit<NotificationRecord, 'id' | 'read'>): void {
      orm
        .insert(notifications)
        .values({
          time: entry.time,
          level: entry.level,
          title: entry.title,
          message: entry.message,
          data: entry.data === undefined ? undefined : toJson(entry.data),
        })
        .run();
    },

    listNotifications(limit: number): NotificationRecord[] {
      return orm
        .select()
        .from(notifications)
        .orderBy(desc(notifications.time))
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          time: row.time,
          level: row.level as LogLevel,
          title: row.title,
          message: row.message,
          read: row.read,
          data: parseJson(row.data, undefined as Record<string, unknown> | undefined),
        }));
    },

    markNotificationRead(id: number): void {
      orm.update(notifications).set({ read: true }).where(eq(notifications.id, id)).run();
    },

    markAllNotificationsRead(): void {
      orm.update(notifications).set({ read: true }).run();
    },

    unreadNotificationCount(): number {
      const row = orm
        .select({ total: count() })
        .from(notifications)
        .where(eq(notifications.read, false))
        .get();
      return row?.total ?? 0;
    },
  };
}
