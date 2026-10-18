#!/usr/bin/env node
/**
 * Migration integrity gate.
 *
 * ponytail: drizzle splits each migration file on `--> statement-breakpoint`
 * and runs every piece as a SINGLE better-sqlite3 statement. A hand-written
 * file that forgets the marker (0013_recording_stream_type.sql did) is passed
 * through whole, better-sqlite3 rejects "more than one statement", and because
 * drizzle wraps the whole chain in one BEGIN/COMMIT the failure rolls every
 * migration back — a brand-new profile cannot start the app at all, and
 * nothing is logged because the logger is created after the database opens.
 *
 * This check is pure Node (no native modules, no database), so it can run on
 * CI before packaging. It verifies:
 *   1. every journal entry has its .sql file,
 *   2. no .sql file is missing from the journal,
 *   3. every chunk produced by the breakpoint split holds at most one
 *      statement (one trailing semicolon, none in the middle).
 *
 * Run: node scripts/check-migrations.cjs
 */
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const MIGRATIONS_DIR = join(__dirname, '..', 'packages', 'database', 'drizzle');
const JOURNAL = join(MIGRATIONS_DIR, 'meta', '_journal.json');
const BREAKPOINT = '--> statement-breakpoint';

/** Strip `--` line comments and `/* *\/` block comments (string literals are
 * not expected inside migration DDL; a `--` inside one would be pathological). */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const problems = [];

const journal = JSON.parse(readFileSync(JOURNAL, 'utf8'));
const tags = new Set();
const sqlFiles = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'));

for (const entry of journal.entries ?? []) {
  const fileName = `${entry.tag}.sql`;
  tags.add(fileName);
  const filePath = join(MIGRATIONS_DIR, fileName);
  let sql;
  try {
    sql = readFileSync(filePath, 'utf8');
  } catch {
    problems.push(`${fileName}: journal entry #${entry.idx} has no .sql file`);
    continue;
  }

  const chunks = sql.split(BREAKPOINT);
  chunks.forEach((chunk, index) => {
    const clean = stripComments(chunk).trim();
    if (clean === '') {
      // A comments-only chunk means the breakpoint marker was written INSIDE a
      // comment (or the file ends with a stray marker). drizzle still hands
      // that chunk to better-sqlite3, which fails the whole migration run.
      problems.push(
        `${fileName}: chunk ${index + 1} contains only comments — the breakpoint marker ` +
          `must sit between statements, never inside a comment`,
      );
      return;
    }
    const semicolons = (clean.match(/;/g) ?? []).length;
    if (semicolons > 1) {
      problems.push(
        `${fileName}: chunk ${index + 1} holds ${semicolons} statements — better-sqlite3 ` +
          `rejects that with "more than one statement"; separate them with the breakpoint marker`,
      );
      return;
    }
    // A single statement with a trailing terminator may not have SQL after it.
    // A statement WITHOUT a terminator is fine (0012 ships as bare UPDATE).
    if (semicolons === 1 && !clean.endsWith(';')) {
      problems.push(`${fileName}: chunk ${index + 1} has text after its statement terminator`);
    }
  });
}

for (const file of sqlFiles) {
  if (!tags.has(file)) problems.push(`${file}: not listed in meta/_journal.json`);
}

if (problems.length > 0) {
  console.error('Migration check FAILED:\n');
  for (const problem of problems) console.error('  ✗ ' + problem);
  console.error(
    '\nEvery migration must be one statement per chunk, chunks separated by ' +
      `"${BREAKPOINT}". A broken migration rolls the entire chain back and the app cannot start.`,
  );
  process.exit(1);
}

console.log(`Migration check OK — ${tags.size} migrations, ${sqlFiles.length} files, all single-statement.`);
