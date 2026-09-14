import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, inArray, like, or } from 'drizzle-orm';
import { collectionRecordings, collections, creatorTags, creators, tags } from '../schema';
import { parseJson, toJson } from './json';

export interface CreatorRecord {
  id: string;
  pluginId: string;
  externalId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  isFavorite: boolean;
  /** ponytail: per-creator auto-record opt-in (see schema). */
  autoRecord: boolean;
  /** Quality for this creator's auto-recordings ('best' | '1080p' | …). */
  autoRecordQuality: string;
  /** ponytail: per-creator secure-proxy opt-in (see schema). */
  useProxy: boolean;
  notes?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorRepo {
  create(record: CreatorRecord): void;
  update(id: string, patch: Partial<CreatorRecord>): void;
  remove(id: string): void;
  get(id: string): CreatorRecord | undefined;
  getByExternal(pluginId: string, externalId: string): CreatorRecord | undefined;
  list(): CreatorRecord[];
  search(query: string): CreatorRecord[];
  setFavorite(id: string, favorite: boolean): void;
  setAutoRecord(id: string, enabled: boolean): void;
  setUseProxy(id: string, enabled: boolean): void;
  createTag(name: string, color?: string): void;
  renameTag(id: string, name: string): void;
  listTags(): typeof tags.$inferSelect[];
  removeTag(id: string): void;
  addTagToCreator(creatorId: string, tagId: string): void;
  removeTagFromCreator(creatorId: string, tagId: string): void;
  listCreatorTags(creatorId: string): typeof tags.$inferSelect[];
  /** All creator→tag assignments in one query, keyed by creatorId. */
  listAllTagAssignments(): Record<string, (typeof tags.$inferSelect)[]>;
  bulkSetFavorite(ids: string[], favorite: boolean): void;
  bulkSetAutoRecord(ids: string[], enabled: boolean): void;
  bulkRemove(ids: string[]): void;
  bulkAddTag(ids: string[], tagId: string): void;
  createCollection(name: string, description?: string): void;
  listCollections(): typeof collections.$inferSelect[];
  removeCollection(id: string): void;
  addRecordingToCollection(collectionId: string, recordingId: string): void;
  removeRecordingFromCollection(collectionId: string, recordingId: string): void;
}

function mapCreator(
  row: typeof creators.$inferSelect,
): CreatorRecord {
  return {
    ...row,
    metadata: parseJson(row.metadata, {}),
  };
}

export function createCreatorRepo(orm: BetterSQLite3Database): CreatorRepo {
  const now = (): string => new Date().toISOString();

  return {
    create(record: CreatorRecord): void {
      orm.insert(creators).values({ ...record, metadata: toJson(record.metadata) }).run();
    },

    update(id: string, patch: Partial<CreatorRecord>): void {
      const values: Record<string, unknown> = { ...patch, updatedAt: now() };
      if (patch.metadata !== undefined) {
        values['metadata'] = toJson(patch.metadata);
      }
      orm.update(creators).set(values).where(eq(creators.id, id)).run();
    },

    remove(id: string): void {
      orm.delete(creators).where(eq(creators.id, id)).run();
    },

    get(id: string): CreatorRecord | undefined {
      const row = orm.select().from(creators).where(eq(creators.id, id)).get();
      return row ? mapCreator(row) : undefined;
    },

    getByExternal(pluginId: string, externalId: string): CreatorRecord | undefined {
      const row = orm
        .select()
        .from(creators)
        .where(and(eq(creators.pluginId, pluginId), eq(creators.externalId, externalId)))
        .get();
      return row ? mapCreator(row) : undefined;
    },

    list(): CreatorRecord[] {
      return orm.select().from(creators).all().map(mapCreator);
    },

    search(query: string): CreatorRecord[] {
      const pattern = `%${query}%`;
      return orm
        .select()
        .from(creators)
        .where(
          or(like(creators.username, pattern), like(creators.displayName, pattern)),
        )
        .all()
        .map(mapCreator);
    },

    setFavorite(id: string, favorite: boolean): void {
      orm.update(creators).set({ isFavorite: favorite, updatedAt: now() }).where(eq(creators.id, id)).run();
    },

    setAutoRecord(id: string, enabled: boolean): void {
      orm.update(creators).set({ autoRecord: enabled, updatedAt: now() }).where(eq(creators.id, id)).run();
    },

    setUseProxy(id: string, enabled: boolean): void {
      orm.update(creators).set({ useProxy: enabled, updatedAt: now() }).where(eq(creators.id, id)).run();
    },

    createTag(name: string, color?: string): void {
      orm
        .insert(tags)
        .values({ id: crypto.randomUUID(), name, color, createdAt: now() })
        .onConflictDoNothing()
        .run();
    },

    renameTag(id: string, name: string): void {
      orm.update(tags).set({ name }).where(eq(tags.id, id)).run();
    },

    listTags(): typeof tags.$inferSelect[] {
      return orm.select().from(tags).orderBy(tags.name).all();
    },

    removeTag(id: string): void {
      orm.delete(tags).where(eq(tags.id, id)).run();
    },

    addTagToCreator(creatorId: string, tagId: string): void {
      orm.insert(creatorTags).values({ creatorId, tagId }).onConflictDoNothing().run();
    },

    removeTagFromCreator(creatorId: string, tagId: string): void {
      orm
        .delete(creatorTags)
        .where(and(eq(creatorTags.creatorId, creatorId), eq(creatorTags.tagId, tagId)))
        .run();
    },

    listCreatorTags(creatorId: string): typeof tags.$inferSelect[] {
      const rows = orm
        .select({ tag: tags })
        .from(creatorTags)
        .innerJoin(tags, eq(creatorTags.tagId, tags.id))
        .where(eq(creatorTags.creatorId, creatorId))
        .all();
      return rows.map((row) => row.tag);
    },

    listAllTagAssignments(): Record<string, (typeof tags.$inferSelect)[]> {
      const rows = orm
        .select({ creatorId: creatorTags.creatorId, tag: tags })
        .from(creatorTags)
        .innerJoin(tags, eq(creatorTags.tagId, tags.id))
        .all();
      const map: Record<string, (typeof tags.$inferSelect)[]> = {};
      for (const row of rows) {
        (map[row.creatorId] ??= []).push(row.tag);
      }
      return map;
    },

    bulkSetFavorite(ids: string[], favorite: boolean): void {
      if (ids.length === 0) return;
      orm
        .update(creators)
        .set({ isFavorite: favorite, updatedAt: now() })
        .where(inArray(creators.id, ids))
        .run();
    },

    bulkSetAutoRecord(ids: string[], enabled: boolean): void {
      if (ids.length === 0) return;
      orm
        .update(creators)
        .set({ autoRecord: enabled, updatedAt: now() })
        .where(inArray(creators.id, ids))
        .run();
    },

    bulkRemove(ids: string[]): void {
      if (ids.length === 0) return;
      orm.delete(creators).where(inArray(creators.id, ids)).run();
    },

    bulkAddTag(ids: string[], tagId: string): void {
      if (ids.length === 0) return;
      const values = ids.map((creatorId) => ({ creatorId, tagId }));
      orm.insert(creatorTags).values(values).onConflictDoNothing().run();
    },

    createCollection(name: string, description?: string): void {
      orm
        .insert(collections)
        .values({ id: crypto.randomUUID(), name, description, createdAt: now() })
        .run();
    },

    listCollections(): typeof collections.$inferSelect[] {
      return orm.select().from(collections).orderBy(collections.name).all();
    },

    removeCollection(id: string): void {
      orm.delete(collections).where(eq(collections.id, id)).run();
    },

    addRecordingToCollection(collectionId: string, recordingId: string): void {
      orm.insert(collectionRecordings).values({ collectionId, recordingId }).onConflictDoNothing().run();
    },

    removeRecordingFromCollection(collectionId: string, recordingId: string): void {
      orm
        .delete(collectionRecordings)
        .where(
          and(
            eq(collectionRecordings.collectionId, collectionId),
            eq(collectionRecordings.recordingId, recordingId),
          ),
        )
        .run();
    },
  };
}
