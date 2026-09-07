import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { count, desc, eq, inArray } from 'drizzle-orm';
import { downloadQueue } from '../schema';

export interface DownloadQueueRecord {
  id: string;
  url: string;
  destination: string;
  fileName: string;
  title?: string | null;
  pluginId?: string | null;
  creatorId?: string | null;
  status: string;
  /** Which engine performed the transfer: 'http' (direct file) or 'ytdlp' (site extraction). */
  engine: string;
  /** Extract audio only (MP3) instead of the full video (yt-dlp engine). */
  audioOnly: boolean;
  /** Requested quality: 'best' or a height like '1080p'. */
  quality: string;
  priority: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number;
  eta: number;
  percent: number;
  retries: number;
  maxRetries: number;
  error?: string | null;
  /** Absolute path of the finished file (or partial .part file while downloading). */
  filePath?: string | null;
  /** Absolute path of the downloaded thumbnail image (when available). */
  thumbnailPath?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DownloadQueueRepo {
  create(record: DownloadQueueRecord): void;
  update(id: string, patch: Partial<DownloadQueueRecord>): void;
  get(id: string): DownloadQueueRecord | undefined;
  list(status?: string): DownloadQueueRecord[];
  listQueued(): DownloadQueueRecord[];
  listActive(): DownloadQueueRecord[];
  remove(id: string): void;
  removeCompleted(): void;
  removeFailed(): void;
  clearCompleted(): void;
  clearFailed(): void;
  countByStatus(): Record<string, number>;
  bulkRemove(ids: string[]): void;
  bulkRetry(ids: string[]): void;
}

export function createDownloadQueueRepo(orm: BetterSQLite3Database): DownloadQueueRepo {
  const now = (): string => new Date().toISOString();

  return {
    create(record: DownloadQueueRecord): void {
      orm.insert(downloadQueue).values(record).run();
    },

    update(id: string, patch: Partial<DownloadQueueRecord>): void {
      orm.update(downloadQueue).set({ ...patch, updatedAt: now() }).where(eq(downloadQueue.id, id)).run();
    },

    get(id: string): DownloadQueueRecord | undefined {
      return orm.select().from(downloadQueue).where(eq(downloadQueue.id, id)).get();
    },

    list(status?: string): DownloadQueueRecord[] {
      const query = orm.select().from(downloadQueue);
      if (status !== undefined) {
        return query.where(eq(downloadQueue.status, status)).orderBy(desc(downloadQueue.createdAt)).all();
      }
      return query.orderBy(desc(downloadQueue.createdAt)).all();
    },

    listQueued(): DownloadQueueRecord[] {
      return orm.select().from(downloadQueue).where(eq(downloadQueue.status, 'queued')).orderBy(downloadQueue.priority).all();
    },

    listActive(): DownloadQueueRecord[] {
      return orm.select().from(downloadQueue).where(eq(downloadQueue.status, 'downloading')).all();
    },

    remove(id: string): void {
      orm.delete(downloadQueue).where(eq(downloadQueue.id, id)).run();
    },

    removeCompleted(): void {
      orm.delete(downloadQueue).where(eq(downloadQueue.status, 'completed')).run();
    },

    removeFailed(): void {
      orm.delete(downloadQueue).where(eq(downloadQueue.status, 'failed')).run();
    },

    clearCompleted(): void {
      orm.delete(downloadQueue).where(eq(downloadQueue.status, 'completed')).run();
    },

    clearFailed(): void {
      orm.delete(downloadQueue).where(eq(downloadQueue.status, 'failed')).run();
    },

    countByStatus(): Record<string, number> {
      const rows = orm.select({ status: downloadQueue.status, count: count() }).from(downloadQueue).groupBy(downloadQueue.status).all();
      const result: Record<string, number> = {};
      for (const row of rows) {
        result[row.status] = row.count;
      }
      return result;
    },

    bulkRemove(ids: string[]): void {
      if (ids.length === 0) return;
      orm.delete(downloadQueue).where(inArray(downloadQueue.id, ids)).run();
    },

    bulkRetry(ids: string[]): void {
      if (ids.length === 0) return;
      orm.update(downloadQueue).set({ status: 'queued', retries: 0, error: null, updatedAt: now() }).where(inArray(downloadQueue.id, ids)).run();
    },
  };
}
