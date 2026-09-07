/* Debug: verify library sort clause generates correct SQL + results */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { recordings } from '../packages/database/src/schema';
import { desc, sql } from 'drizzle-orm';

const db = drizzle(new Database(':memory:'));
db.run(sql`CREATE TABLE recordings (id TEXT PRIMARY KEY, title TEXT NOT NULL, platform_id TEXT NOT NULL DEFAULT '', size_bytes INTEGER, duration_seconds INTEGER, started_at TEXT, created_at TEXT NOT NULL)`);

db.insert(recordings).values([
  { id: '1', title: 'Zebra live', platformId: 'x', createdAt: '2026-01-01' },
  { id: '2', title: 'Apple live', platformId: 'x', createdAt: '2026-01-02' },
  { id: '3', title: 'Mango live', platformId: 'x', createdAt: '2026-01-03' },
]).run();

function buildSortClause(sort: { field: string; direction: string }) {
  const column = (recordings as never as Record<string, unknown>)[sort.field];
  console.log('column for', sort.field, '=>', typeof column, column && Object.getPrototypeOf(column)?.constructor?.name);
  if (!column || typeof column !== 'object' || !('asc' in column)) {
    console.log('FALLBACK to createdAt desc');
    return desc((recordings as never as Record<string, unknown>).createdAt);
  }
  return sort.direction === 'asc' ? sql`${column}` : desc(column as never);
}

for (const s of [
  { field: 'title', direction: 'asc' },
  { field: 'title', direction: 'desc' },
  { field: 'createdAt', direction: 'asc' },
]) {
  const rows = db.select().from(recordings).orderBy(buildSortClause(s)).all() as { title: string }[];
  console.log(s, '->', rows.map((r) => r.title).join(', '));
}