import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { count, desc, eq, inArray } from 'drizzle-orm';
import { uploadQueue } from '../schema';

export interface UploadQueueRecord {
  id: string;
  recordingId?: string | null;
  providerId: string;
  sourcePath: string;
  destinationPath?: string | null;
  status: string;
  priority: number;
  bytesUploaded: number;
  totalBytes: number;
  speed: number;
  eta: number;
  percent: number;
  retries: number;
  maxRetries: number;
  error?: string | null;
  checksum?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadQueueRepo {
  create(record: UploadQueueRecord): void;
  update(id: string, patch: Partial<UploadQueueRecord>): void;
  get(id: string): UploadQueueRecord | undefined;
  list(status?: string): UploadQueueRecord[];
  remove(id: string): void;
  clearCompleted(): void;
  clearFailed(): void;
  countByStatus(): Record<string, number>;
  bulkRemove(ids: string[]): void;
  bulkRetry(ids: string[]): void;
}

export function createUploadQueueRepo(orm: BetterSQLite3Database): UploadQueueRepo {
  const now = (): string => new Date().toISOString();

  return {
    create(record: UploadQueueRecord): void {
      orm.insert(uploadQueue).values(record).run();
    },

    update(id: string, patch: Partial<UploadQueueRecord>): void {
      orm.update(uploadQueue).set({ ...patch, updatedAt: now() }).where(eq(uploadQueue.id, id)).run();
    },

    get(id: string): UploadQueueRecord | undefined {
      return orm.select().from(uploadQueue).where(eq(uploadQueue.id, id)).get();
    },

    list(status?: string): UploadQueueRecord[] {
      const query = orm.select().from(uploadQueue);
      if (status !== undefined) {
        return query.where(eq(uploadQueue.status, status)).orderBy(desc(uploadQueue.createdAt)).all();
      }
      return query.orderBy(desc(uploadQueue.createdAt)).all();
    },

    remove(id: string): void {
      orm.delete(uploadQueue).where(eq(uploadQueue.id, id)).run();
    },

    clearCompleted(): void {
      orm.delete(uploadQueue).where(eq(uploadQueue.status, 'completed')).run();
    },

    clearFailed(): void {
      orm.delete(uploadQueue).where(eq(uploadQueue.status, 'failed')).run();
    },

    countByStatus(): Record<string, number> {
      const rows = orm.select({ status: uploadQueue.status, count: count() }).from(uploadQueue).groupBy(uploadQueue.status).all();
      const result: Record<string, number> = {};
      for (const row of rows) {
        result[row.status] = row.count;
      }
      return result;
    },

    bulkRemove(ids: string[]): void {
      if (ids.length === 0) return;
      orm.delete(uploadQueue).where(inArray(uploadQueue.id, ids)).run();
    },

    bulkRetry(ids: string[]): void {
      if (ids.length === 0) return;
      orm.update(uploadQueue).set({ status: 'queued', retries: 0, error: null, updatedAt: now() }).where(inArray(uploadQueue.id, ids)).run();
    },
  };
}
