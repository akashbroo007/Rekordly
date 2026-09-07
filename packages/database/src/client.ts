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
    migrate: () => drizzleMigrate(orm, { migrationsFolder }),
    close: () => db.close(),
  };
}
