// Verifies the full migration chain applies cleanly and the new download
// queue columns exist. Run: node scripts/migration-verify.cjs
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { createDatabase } = require('../packages/database/dist/index.js');

const dir = mkdtempSync(join(tmpdir(), 'sf-migrate-'));
const dbPath = join(dir, 'test.sqlite');

try {
  const db = createDatabase(dbPath);
  db.migrate();

  // ponytail: run migrate twice — second call must be a no-op (already applied).
  db.migrate();

  const cols = db.orm.$client.prepare("PRAGMA table_info('download_queue')").all();
  const names = cols.map((c) => c.name);
  const required = ['engine', 'file_path', 'audio_only', 'status', 'priority'];
  const missing = required.filter((c) => !names.includes(c));
  if (missing.length > 0) {
    throw new Error(`Missing columns after migration: ${missing.join(', ')}`);
  }

  // Insert + read back through drizzle to prove the schema matches the repo.
  db.orm.insert(require('../packages/database/dist/schema.js').downloadQueue).values({
    id: 'test-1',
    url: 'https://example.com/video.mp4',
    destination: '.',
    fileName: 'video.mp4',
    status: 'queued',
    engine: 'auto',
    audioOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run();
  const row = db.orm.$client.prepare('SELECT engine, file_path, audio_only FROM download_queue WHERE id = ?').get('test-1');
  console.log('Migrations OK. Row:', JSON.stringify(row));

  db.close();
  require('node:fs').writeFileSync(join(__dirname, 'verify-result.txt'), 'PASS\n');
} catch (error) {
  require('node:fs').writeFileSync(
    join(__dirname, 'verify-result.txt'),
    `FAIL: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
