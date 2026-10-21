/**
 * check-native-selects.mjs — dropdown-system guardrail.
 *
 * Fails when a native `<select>` / `<option>` element appears in the desktop
 * renderer or the shared UI package. All dropdowns must go through the
 * shared components (packages/ui dropdown/: Select, Combobox, MultiSelect,
 * Menu) so the panel/trigger/keyboard/ARIA behavior stays in one place.
 *
 * Doc comments that merely MENTION `<select>` are ignored (comment lines are
 * stripped before matching). Run via `pnpm check:dropdowns` in apps/desktop.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

/** Anchor on the script location — immune to the caller's cwd. */
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DESKTOP_DIR = join(SCRIPT_DIR, '..');
const REPO_ROOT = join(DESKTOP_DIR, '..', '..');

const ROOTS = [join(DESKTOP_DIR, 'src'), join(REPO_ROOT, 'packages', 'ui', 'src')];

const EXTENSIONS = new Set(['.ts', '.tsx']);
/** `<select` / `<option` opening-tag starts (not `</select>`, not `<selected>`). */
const PATTERN = /<(select|option)(?=[\s/>]|$)/;

/** Recursively collect source files under `directory`. */
function collectFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      collectFiles(full, files);
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      files.push(full);
    }
  }
  return files;
}

const offenders = [];

for (const root of ROOTS) {
  let files;
  try {
    files = collectFiles(root);
  } catch {
    continue; // missing tree — nothing to guard there
  }
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      // Skip comment lines (docs may legitimately mention <select>).
      if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) return;
      if (PATTERN.test(line)) {
        offenders.push(`${relative(process.cwd(), file)}:${index + 1}: ${trimmed}`);
      }
    });
  }
}

if (offenders.length > 0) {
  console.error(
    [
      'Native <select>/<option> found — use the shared dropdown components',
      '(packages/ui dropdown: Select / Combobox / MultiSelect / Menu) instead:',
      '',
      ...offenders.map((entry) => `  ${entry}`),
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log('check-native-selects: OK — no native selects in the desktop renderer or packages/ui.');
