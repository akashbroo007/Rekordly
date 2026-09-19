import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';

export interface DatabaseHandle {
  db: Database.Database;
  orm: BetterSQLite3Database;
  /** Applies all pending migrations from the drizzle/ folder. */
  migrate(): void;
  close(): void;
}

/**
 * Opens (or creates) the SQLite database and applies migrations.
 * Only this package touches the database directly.
 */
export function createDatabase(dbPath: string): DatabaseHandle {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const orm = drizzle(db);
  const migrationsFolder = join(__dirname, '..', 'drizzle');

  return {
    db,
    orm,
    migrate: () => {
      drizzleMigrate(orm, { migrationsFolder });
      ensureRequiredColumns(db);
    },
    close: () => db.close(),
  };
}

/**
 * ponytail: half-applied migration repair.
 *
 * drizzle records a migration as applied by its journal row alone — if a
 * migration containing MULTIPLE ALTER TABLE statements ever lands partially
 * (app open holding a lock, crash mid-migration, or the .sql file edited
 * after being applied during development), the journal says "done" while the
 * schema is missing a column, and the migrator will never re-run it. Every
 * write to that column then fails with `SqliteError: no such column`.
 *
 * This list states the columns every database MUST have after migration and
 * re-applies any that are missing. Idempotent: present columns are skipped,
 * so it is safe to run on every boot.
 */
const REQUIRED_COLUMNS: Record<string, { name: string; ddl: string }[]> = {
  recordings: [{ name: 'stream_type', ddl: 'ALTER TABLE `recordings` ADD COLUMN `stream_type` text' }],
  recording_jobs: [{ name: 'stream_type', ddl: 'ALTER TABLE `recording_jobs` ADD COLUMN `stream_type` text' }],
};

function ensureRequiredColumns(db: Database.Database): void {
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    let existing: string[];
    try {
      existing = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    } catch {
      continue; // table missing entirely — migration state is the real problem
    }
    for (const column of columns) {
      if (existing.includes(column.name)) continue;
      try {
        db.exec(column.ddl);
        // eslint-disable-next-line no-console
        console.warn(`[database] repaired missing column ${table}.${column.name}`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[database] failed to add missing column ${table}.${column.name}:`, error);
      }
    }
  }
}
