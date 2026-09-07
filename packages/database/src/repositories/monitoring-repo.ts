import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, lte, asc } from 'drizzle-orm';
import { monitoringJobs } from '../schema';

export interface MonitoringJobRecord {
  id: string;
  creatorId: string;
  pluginId: string;
  state: string;
  priority: number;
  intervalMs: number;
  nextCheckAt: number;
  lastCheckAt?: number | null;
  lastResult?: string | null;
  attempts: number;
  maxAttempts: number;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonitoringRepo {
  create(job: MonitoringJobRecord): void;
  update(id: string, patch: Partial<MonitoringJobRecord>): void;
  remove(id: string): void;
  get(id: string): MonitoringJobRecord | undefined;
  getByCreatorId(creatorId: string): MonitoringJobRecord | undefined;
  list(status?: string): MonitoringJobRecord[];
  listDue(limit?: number): MonitoringJobRecord[];
  listByState(state: string): MonitoringJobRecord[];
  setState(id: string, state: string): void;
  incrementAttempts(id: string): void;
  setError(id: string, error: string): void;
  setLastCheck(id: string, result: string, durationMs: number, nextCheckAt?: number): void;
  countByState(): Record<string, number>;
}

export function createMonitoringRepo(orm: BetterSQLite3Database): MonitoringRepo {
  const now = (): string => new Date().toISOString();

  return {
    create(job: MonitoringJobRecord): void {
      orm.insert(monitoringJobs).values(job).run();
    },

    update(id: string, patch: Partial<MonitoringJobRecord>): void {
      orm
        .update(monitoringJobs)
        .set({ ...patch, updatedAt: now() })
        .where(eq(monitoringJobs.id, id))
        .run();
    },

    remove(id: string): void {
      orm.delete(monitoringJobs).where(eq(monitoringJobs.id, id)).run();
    },

    get(id: string): MonitoringJobRecord | undefined {
      return orm.select().from(monitoringJobs).where(eq(monitoringJobs.id, id)).get();
    },

    getByCreatorId(creatorId: string): MonitoringJobRecord | undefined {
      return orm
        .select()
        .from(monitoringJobs)
        .where(eq(monitoringJobs.creatorId, creatorId))
        .get();
    },

    list(status?: string): MonitoringJobRecord[] {
      if (status !== undefined) {
        return orm
          .select()
          .from(monitoringJobs)
          .where(eq(monitoringJobs.state, status))
          .all();
      }
      return orm.select().from(monitoringJobs).all();
    },

    listDue(limit = 10): MonitoringJobRecord[] {
      const now = Date.now();
      return orm
        .select()
        .from(monitoringJobs)
        .where(
          and(
            eq(monitoringJobs.state, 'queued'),
            lte(monitoringJobs.nextCheckAt, now),
          ),
        )
        .orderBy(asc(monitoringJobs.priority), asc(monitoringJobs.nextCheckAt))
        .limit(limit)
        .all();
    },

    listByState(state: string): MonitoringJobRecord[] {
      return orm
        .select()
        .from(monitoringJobs)
        .where(eq(monitoringJobs.state, state))
        .all();
    },

    setState(id: string, state: string): void {
      orm
        .update(monitoringJobs)
        .set({ state, updatedAt: now() })
        .where(eq(monitoringJobs.id, id))
        .run();
    },

    incrementAttempts(id: string): void {
      const job = orm.select().from(monitoringJobs).where(eq(monitoringJobs.id, id)).get();
      if (job !== undefined) {
        orm
          .update(monitoringJobs)
          .set({ attempts: job.attempts + 1, updatedAt: now() })
          .where(eq(monitoringJobs.id, id))
          .run();
      }
    },

    setError(id: string, error: string): void {
      orm
        .update(monitoringJobs)
        .set({ error, updatedAt: now() })
        .where(eq(monitoringJobs.id, id))
        .run();
    },

    setLastCheck(id: string, result: string, durationMs: number, nextCheckAt?: number): void {
      orm
        .update(monitoringJobs)
        .set({
          lastCheckAt: Date.now(),
          lastResult: result,
          ...(nextCheckAt !== undefined ? { nextCheckAt } : {}),
          updatedAt: now(),
        })
        .where(eq(monitoringJobs.id, id))
        .run();
    },

    countByState(): Record<string, number> {
      const rows = orm
        .select({ state: monitoringJobs.state })
        .from(monitoringJobs)
        .all();
      const counts: Record<string, number> = {};
      for (const row of rows) {
        counts[row.state] = (counts[row.state] ?? 0) + 1;
      }
      return counts;
    },
  };
}
