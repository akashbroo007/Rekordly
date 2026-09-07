import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { pluginData, plugins, pluginSettings } from '../schema';
import { parseJson, toJson } from './json';

export interface PluginRecord {
  id: string;
  name: string;
  version: string;
  manifest: Record<string, unknown>;
  entry: string;
  installPath: string;
  enabled: boolean;
  permissionsGranted: string[];
  installedAt: string;
  updatedAt: string;
}

export interface PluginRepo {
  upsert(record: PluginRecord): void;
  list(): PluginRecord[];
  get(id: string): PluginRecord | undefined;
  remove(id: string): void;
  setEnabled(id: string, enabled: boolean): void;
  setPermissionsGranted(id: string, permissions: string[]): void;
  getData(pluginId: string, key: string): unknown;
  setData(pluginId: string, key: string, value: unknown): void;
  getSettings(pluginId: string): Record<string, unknown>;
  getSetting(pluginId: string, key: string): unknown;
  setSetting(pluginId: string, key: string, value: unknown): void;
  deleteSetting(pluginId: string, key: string): void;
}

function mapRow(
  row: (typeof plugins.$inferSelect) & { permissionsGranted: string; manifest: string },
): PluginRecord {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    manifest: parseJson(row.manifest, {}),
    entry: row.entry,
    installPath: row.installPath,
    enabled: row.enabled,
    permissionsGranted: parseJson(row.permissionsGranted, [] as string[]),
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
}

export function createPluginRepo(orm: BetterSQLite3Database): PluginRepo {
  const now = (): string => new Date().toISOString();

  return {
    upsert(record: PluginRecord): void {
      orm
        .insert(plugins)
        .values({
          id: record.id,
          name: record.name,
          version: record.version,
          manifest: toJson(record.manifest),
          entry: record.entry,
          installPath: record.installPath,
          enabled: record.enabled,
          permissionsGranted: toJson(record.permissionsGranted),
          installedAt: record.installedAt,
          updatedAt: now(),
        })
        .onConflictDoUpdate({
          target: plugins.id,
          set: {
            name: record.name,
            version: record.version,
            manifest: toJson(record.manifest),
            entry: record.entry,
            installPath: record.installPath,
            permissionsGranted: toJson(record.permissionsGranted),
            updatedAt: now(),
          },
        })
        .run();
    },

    list(): PluginRecord[] {
      return orm.select().from(plugins).all().map(mapRow);
    },

    get(id: string): PluginRecord | undefined {
      const row = orm.select().from(plugins).where(eq(plugins.id, id)).get();
      return row ? mapRow(row) : undefined;
    },

    remove(id: string): void {
      orm.delete(plugins).where(eq(plugins.id, id)).run();
    },

    setEnabled(id: string, enabled: boolean): void {
      orm.update(plugins).set({ enabled, updatedAt: now() }).where(eq(plugins.id, id)).run();
    },

    setPermissionsGranted(id: string, permissions: string[]): void {
      orm
        .update(plugins)
        .set({ permissionsGranted: toJson(permissions), updatedAt: now() })
        .where(eq(plugins.id, id))
        .run();
    },

    getData(pluginId: string, key: string): unknown {
      const row = orm
        .select()
        .from(pluginData)
        .where(and(eq(pluginData.pluginId, pluginId), eq(pluginData.key, key)))
        .get();
      return row ? parseJson(row.value, undefined) : undefined;
    },

    setData(pluginId: string, key: string, value: unknown): void {
      orm
        .insert(pluginData)
        .values({ pluginId, key, value: toJson(value), updatedAt: now() })
        .onConflictDoUpdate({
          target: [pluginData.pluginId, pluginData.key],
          set: { value: toJson(value), updatedAt: now() },
        })
        .run();
    },

    getSettings(pluginId: string): Record<string, unknown> {
      const rows = orm
        .select()
        .from(pluginSettings)
        .where(eq(pluginSettings.pluginId, pluginId))
        .all();
      const result: Record<string, unknown> = {};
      for (const row of rows) {
        result[row.key] = parseJson(row.value, undefined);
      }
      return result;
    },

    getSetting(pluginId: string, key: string): unknown {
      const row = orm
        .select()
        .from(pluginSettings)
        .where(and(eq(pluginSettings.pluginId, pluginId), eq(pluginSettings.key, key)))
        .get();
      return row ? parseJson(row.value, undefined) : undefined;
    },

    setSetting(pluginId: string, key: string, value: unknown): void {
      orm
        .insert(pluginSettings)
        .values({ pluginId, key, value: toJson(value), updatedAt: now() })
        .onConflictDoUpdate({
          target: [pluginSettings.pluginId, pluginSettings.key],
          set: { value: toJson(value), updatedAt: now() },
        })
        .run();
    },

    deleteSetting(pluginId: string, key: string): void {
      orm
        .delete(pluginSettings)
        .where(and(eq(pluginSettings.pluginId, pluginId), eq(pluginSettings.key, key)))
        .run();
    },
  };
}
