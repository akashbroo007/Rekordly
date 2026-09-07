import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, asc, count, desc, eq, like, or, sql, inArray, type SQL } from 'drizzle-orm';
import { collectionRecordings, recordingJobs, recordings, recordingTags, tags } from '../schema';

export interface RecordingJobRecord {
  id: string;
  creatorId?: string | null;
  pluginId: string;
  streamUrl: string;
  title: string;
  platformId: string;
  thumbnail?: string | null;
  quality?: string | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  bytesDownloaded: number;
  speed: number;
  eta: number;
  percent: number;
  error?: string | null;
  /** ponytail: OS pid of the active downloader child (orphan adoption). */
  pid?: number | null;
  filePath?: string | null;
  thumbnailPath?: string | null;
  verified: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface RecordingRecord {
  id: string;
  creatorId?: string | null;
  jobId?: string | null;
  title: string;
  platformId: string;
  fileName?: string | null;
  filePath?: string | null;
  thumbnailPath?: string | null;
  status: string;
  quality?: string | null;
  resolution?: string | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  bitrate?: number | null;
  fps?: number | null;
  notes?: string | null;
  isFavorite: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LibrarySortField = 'title' | 'createdAt' | 'startedAt' | 'durationSeconds' | 'sizeBytes' | 'platformId' | 'resolution';
export type SortDirection = 'asc' | 'desc';

export interface LibraryFilters {
  search?: string;
  pluginId?: string;
  resolution?: string;
  minDuration?: number;
  maxDuration?: number;
  minSize?: number;
  maxSize?: number;
  status?: string;
  isFavorite?: boolean;
  collectionId?: string;
  tagIds?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface LibrarySort {
  field: LibrarySortField;
  direction: SortDirection;
}

export interface RecordingRepo {
  createJob(job: RecordingJobRecord): void;
  updateJob(id: string, patch: Partial<RecordingJobRecord>): void;
  removeJob(id: string): void;
  listJobs(status?: string): RecordingJobRecord[];
  getJob(id: string): RecordingJobRecord | undefined;
  createRecording(recording: RecordingRecord): void;
  updateRecording(id: string, patch: Partial<RecordingRecord>): void;
  removeRecording(id: string): void;
  listRecordings(limit?: number): RecordingRecord[];
  countByStatus(): Record<string, number>;
  recentRecordings(limit: number): RecordingRecord[];
  getRecording(id: string): RecordingRecord | undefined;
  searchLibrary(filters: LibraryFilters, sort: LibrarySort, offset: number, limit: number): RecordingRecord[];
  countLibrary(filters: LibraryFilters): number;
  setFavorite(id: string, favorite: boolean): void;
  setNotes(id: string, notes: string | null): void;
  createTag(name: string, color?: string): void;
  renameTag(id: string, name: string): void;
  removeTag(id: string): void;
  listTags(): typeof tags.$inferSelect[];
  addTagToRecording(recordingId: string, tagId: string): void;
  removeTagFromRecording(recordingId: string, tagId: string): void;
  listRecordingTags(recordingId: string): typeof tags.$inferSelect[];
  bulkSetFavorite(ids: string[], favorite: boolean): void;
  bulkAddTag(ids: string[], tagId: string): void;
  bulkRemoveTag(ids: string[], tagId: string): void;
  bulkDelete(ids: string[]): void;
  bulkMoveToCollection(ids: string[], collectionId: string): void;
}

export function createRecordingRepo(orm: BetterSQLite3Database): RecordingRepo {
  const now = (): string => new Date().toISOString();

  return {
    createJob(job: RecordingJobRecord): void {
      orm.insert(recordingJobs).values(job).run();
    },

    updateJob(id: string, patch: Partial<RecordingJobRecord>): void {
      orm.update(recordingJobs).set(patch).where(eq(recordingJobs.id, id)).run();
    },

    removeJob(id: string): void {
      orm.delete(recordingJobs).where(eq(recordingJobs.id, id)).run();
    },

    listJobs(status?: string): RecordingJobRecord[] {
      const query = orm.select().from(recordingJobs);
      if (status !== undefined) {
        return query.where(eq(recordingJobs.status, status)).all();
      }
      return query.all();
    },

    getJob(id: string): RecordingJobRecord | undefined {
      return orm.select().from(recordingJobs).where(eq(recordingJobs.id, id)).get();
    },

    createRecording(recording: RecordingRecord): void {
      orm.insert(recordings).values(recording).run();
    },

    updateRecording(id: string, patch: Partial<RecordingRecord>): void {
      orm
        .update(recordings)
        .set({ ...patch, updatedAt: now() })
        .where(eq(recordings.id, id))
        .run();
    },

    removeRecording(id: string): void {
      orm.delete(recordings).where(eq(recordings.id, id)).run();
    },

    listRecordings(limit?: number): RecordingRecord[] {
      const query = orm.select().from(recordings).orderBy(desc(recordings.startedAt));
      return (limit !== undefined ? query.limit(limit) : query).all();
    },

    countByStatus(): Record<string, number> {
      const rows = orm
        .select({ status: recordings.status, count: count() })
        .from(recordings)
        .groupBy(recordings.status)
        .all();
      const result: Record<string, number> = {};
      for (const row of rows) {
        result[row.status] = row.count;
      }
      return result;
    },

    recentRecordings(limit: number): RecordingRecord[] {
      return orm
        .select()
        .from(recordings)
        .orderBy(desc(recordings.startedAt))
        .limit(limit)
        .all();
    },

    getRecording(id: string): RecordingRecord | undefined {
      return orm.select().from(recordings).where(eq(recordings.id, id)).get();
    },

    searchLibrary(filters: LibraryFilters, sort: LibrarySort, offset: number, limit: number): RecordingRecord[] {
      const where = buildLibraryWhere(filters);
      const orderClause = buildSortClause(sort);

      if (where !== undefined) {
        return orm.select().from(recordings).where(where).orderBy(orderClause).limit(limit).offset(offset).all();
      }
      return orm.select().from(recordings).orderBy(orderClause).limit(limit).offset(offset).all();
    },

    countLibrary(filters: LibraryFilters): number {
      const where = buildLibraryWhere(filters);

      if (where !== undefined) {
        const result = orm.select({ count: count() }).from(recordings).where(where).get();
        return result?.count ?? 0;
      }
      const result = orm.select({ count: count() }).from(recordings).get();
      return result?.count ?? 0;
    },

    setFavorite(id: string, favorite: boolean): void {
      orm.update(recordings).set({ isFavorite: favorite, updatedAt: now() }).where(eq(recordings.id, id)).run();
    },

    setNotes(id: string, notes: string | null): void {
      orm.update(recordings).set({ notes, updatedAt: now() }).where(eq(recordings.id, id)).run();
    },

    createTag(name: string, color?: string): void {
      orm.insert(tags).values({ id: crypto.randomUUID(), name, color, createdAt: now() }).onConflictDoNothing().run();
    },

    renameTag(id: string, name: string): void {
      orm.update(tags).set({ name }).where(eq(tags.id, id)).run();
    },

    removeTag(id: string): void {
      orm.delete(tags).where(eq(tags.id, id)).run();
    },

    listTags(): typeof tags.$inferSelect[] {
      return orm.select().from(tags).orderBy(tags.name).all();
    },

    addTagToRecording(recordingId: string, tagId: string): void {
      orm.insert(recordingTags).values({ recordingId, tagId }).onConflictDoNothing().run();
    },

    removeTagFromRecording(recordingId: string, tagId: string): void {
      orm.delete(recordingTags).where(and(eq(recordingTags.recordingId, recordingId), eq(recordingTags.tagId, tagId))).run();
    },

    listRecordingTags(recordingId: string): typeof tags.$inferSelect[] {
      const rows = orm
        .select({ tag: tags })
        .from(recordingTags)
        .innerJoin(tags, eq(recordingTags.tagId, tags.id))
        .where(eq(recordingTags.recordingId, recordingId))
        .all();
      return rows.map((row) => row.tag);
    },

    bulkSetFavorite(ids: string[], favorite: boolean): void {
      if (ids.length === 0) return;
      orm.update(recordings).set({ isFavorite: favorite, updatedAt: now() }).where(inArray(recordings.id, ids)).run();
    },

    bulkAddTag(ids: string[], tagId: string): void {
      if (ids.length === 0) return;
      const values = ids.map((recordingId) => ({ recordingId, tagId }));
      orm.insert(recordingTags).values(values).onConflictDoNothing().run();
    },

    bulkRemoveTag(ids: string[], tagId: string): void {
      if (ids.length === 0) return;
      orm.delete(recordingTags).where(and(inArray(recordingTags.recordingId, ids), eq(recordingTags.tagId, tagId))).run();
    },

    bulkDelete(ids: string[]): void {
      if (ids.length === 0) return;
      orm.delete(recordings).where(inArray(recordings.id, ids)).run();
    },

    bulkMoveToCollection(ids: string[], collectionId: string): void {
      if (ids.length === 0) return;
      const values = ids.map((recordingId) => ({ collectionId, recordingId }));
      orm.insert(collectionRecordings).values(values).onConflictDoNothing().run();
    },
  };
}

function buildLibraryWhere(filters: LibraryFilters): SQL<unknown> | undefined {
  const conditions: SQL<unknown>[] = [];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        like(recordings.title, pattern),
        like(recordings.fileName, pattern),
        like(recordings.notes, pattern),
        like(recordings.platformId, pattern),
      )!,
    );
  }
  if (filters.pluginId) {
    conditions.push(eq(recordings.platformId, filters.pluginId));
  }
  if (filters.resolution) {
    conditions.push(eq(recordings.resolution, filters.resolution));
  }
  if (filters.status) {
    conditions.push(eq(recordings.status, filters.status));
  }
  if (filters.isFavorite !== undefined) {
    conditions.push(eq(recordings.isFavorite, filters.isFavorite));
  }
  if (filters.minDuration !== undefined) {
    conditions.push(sql`${recordings.durationSeconds} >= ${filters.minDuration}`);
  }
  if (filters.maxDuration !== undefined) {
    conditions.push(sql`${recordings.durationSeconds} <= ${filters.maxDuration}`);
  }
  if (filters.minSize !== undefined) {
    conditions.push(sql`${recordings.sizeBytes} >= ${filters.minSize}`);
  }
  if (filters.maxSize !== undefined) {
    conditions.push(sql`${recordings.sizeBytes} <= ${filters.maxSize}`);
  }
  if (filters.dateFrom) {
    conditions.push(sql`${recordings.createdAt} >= ${filters.dateFrom}`);
  }
  if (filters.dateTo) {
    conditions.push(sql`${recordings.createdAt} <= ${filters.dateTo}`);
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

/** ponytail: explicit allowlist — dynamic table indexing + raw sql templates
 *  silently degraded to the default order before; this guarantees every
 *  library sort field maps to a real column with a real direction. */
const LIBRARY_SORT_COLUMNS = {
  title: recordings.title,
  createdAt: recordings.createdAt,
  startedAt: recordings.startedAt,
  durationSeconds: recordings.durationSeconds,
  sizeBytes: recordings.sizeBytes,
  platformId: recordings.platformId,
  resolution: recordings.resolution,
} as const;

function buildSortClause(sort: LibrarySort): ReturnType<typeof desc> {
  const column = LIBRARY_SORT_COLUMNS[sort.field];
  if (column === undefined) {
    return desc(recordings.createdAt);
  }
  return sort.direction === 'asc' ? asc(column) : desc(column);
}
