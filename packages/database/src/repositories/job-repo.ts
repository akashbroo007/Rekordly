import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { count, desc, eq, and } from 'drizzle-orm';
import { backgroundJobs } from '../schema';

export interface BackgroundJobRecord {
  id: string;
  type: string;
  status: string;
  priority: number;
  payload?: string | null;
  result?: string | null;
  error?: string | null;
  progress: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackgroundJobRepo {
  create(record: BackgroundJobRecord): void;
  update(id: string, patch: Partial<BackgroundJobRecord>): void;
  get(id: string): BackgroundJobRecord | undefined;
  list(type?: string, status?: string): BackgroundJobRecord[];
  listDue(): BackgroundJobRecord[];
  remove(id: string): void;
  clearCompleted(): void;
  countByStatus(): Record<string, number>;
}

export function createBackgroundJobRepo(orm: BetterSQLite3Database): BackgroundJobRepo {
  const now = (): string => new Date().toISOString();

  return {
    create(record: BackgroundJobRecord): void {
      orm.insert(backgroundJobs).values(record).run();
    },

    update(id: string, patch: Partial<BackgroundJobRecord>): void {
      orm.update(backgroundJobs).set({ ...patch, updatedAt: now() }).where(eq(backgroundJobs.id, id)).run();
    },

    get(id: string): BackgroundJobRecord | undefined {
      return orm.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)).get();
    },

    list(type?: string, status?: string): BackgroundJobRecord[] {
      if (type !== undefined && status !== undefined) {
        return orm.select().from(backgroundJobs).where(and(eq(backgroundJobs.type, type), eq(backgroundJobs.status, status))).orderBy(desc(backgroundJobs.createdAt)).all();
      }
      if (type !== undefined) {
        return orm.select().from(backgroundJobs).where(eq(backgroundJobs.type, type)).orderBy(desc(backgroundJobs.createdAt)).all();
      }
      if (status !== undefined) {
        return orm.select().from(backgroundJobs).where(eq(backgroundJobs.status, status)).orderBy(desc(backgroundJobs.createdAt)).all();
      }
      return orm.select().from(backgroundJobs).orderBy(desc(backgroundJobs.createdAt)).all();
    },

    listDue(): BackgroundJobRecord[] {
      return orm.select().from(backgroundJobs).where(eq(backgroundJobs.status, 'queued')).orderBy(backgroundJobs.priority).all();
    },

    remove(id: string): void {
      orm.delete(backgroundJobs).where(eq(backgroundJobs.id, id)).run();
    },

    clearCompleted(): void {
      orm.delete(backgroundJobs).where(eq(backgroundJobs.status, 'completed')).run();
    },

    countByStatus(): Record<string, number> {
      const rows = orm.select({ status: backgroundJobs.status, count: count() }).from(backgroundJobs).groupBy(backgroundJobs.status).all();
      const result: Record<string, number> = {};
      for (const row of rows) {
        result[row.status] = row.count;
      }
      return result;
    },
  };
}
