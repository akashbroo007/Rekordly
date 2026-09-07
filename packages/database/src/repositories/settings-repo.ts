import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { settings } from '../schema';
import { parseJson, toJson } from './json';

export interface SettingsRepo {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  getAll(): Record<string, unknown>;
  reset(): void;
}

/** Key-value settings store. Values are JSON-encoded; typing is the caller's job. */
export function createSettingsRepo(orm: BetterSQLite3Database): SettingsRepo {
  const now = (): string => new Date().toISOString();

  return {
    get<T>(key: string): T | undefined {
      const row = orm.select().from(settings).where(eq(settings.key, key)).get();
      return row ? (parseJson(row.value, undefined) as T | undefined) : undefined;
    },

    set(key: string, value: unknown): void {
      orm
        .insert(settings)
        .values({ key, value: toJson(value), updatedAt: now() })
        .onConflictDoUpdate({ target: settings.key, set: { value: toJson(value), updatedAt: now() } })
        .run();
    },

    delete(key: string): void {
      orm.delete(settings).where(eq(settings.key, key)).run();
    },

    getAll(): Record<string, unknown> {
      const rows = orm.select().from(settings).all();
      const result: Record<string, unknown> = {};
      for (const row of rows) {
        result[row.key] = parseJson(row.value, undefined);
      }
      return result;
    },

    reset(): void {
      orm.delete(settings).run();
    },
  };
}
