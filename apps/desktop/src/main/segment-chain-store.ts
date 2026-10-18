import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ponytail: PERSISTED SEGMENT-CHAIN INTENTS.
 *
 * A `recording-segment-finished` event means a part just finalized cleanly and
 * the host must start the next one. The hand-off (guarded live check + plugin
 * re-extraction) can take a MINUTE or longer on some sites (Stripchat's
 * playlist proxy boots a browser), and it used to live only in process
 * memory: a quit, crash, update, or dev-mode rebuild during that window
 * silently killed the chain — the recording "just stopped after the split"
 * with no error anywhere.
 *
 * The intent is written to disk the moment the chain event arrives (BEFORE any
 * network work) and cleared once the next part actually starts or the chain
 * stops for a definitive reason. On boot, pending intents are recovered and
 * the next part is started with the same guardrails.
 */

/** The startRecording options a chained part must replay (all internally round-tripped). */
export interface ChainIntentOptions {
  quality?: string;
  /** Total stop-after budget for the whole session (minutes). */
  durationMinutes?: number;
  /** Epoch ms anchor of the session's first part — clamps every part to the same budget. */
  sessionStartedAt?: number;
  /** Per-part split length (minutes). */
  segmentMinutes?: number;
  /** Stream variant hint ('vr'/'2d', plugin-defined). */
  streamType?: string;
  /** True when the chain originated from auto-record (guardrails apply). */
  autoRecord?: boolean;
}

export interface ChainIntent {
  /** Creators-table uuid (recording jobs key). */
  creatorId: string;
  options: ChainIntentOptions;
  startedAt: string;
}

const STORE_FILE = 'segment-chain-pending.json';

interface StoreFile {
  version: 1;
  entries: ChainIntent[];
}

/** Read pending chain intents (missing/corrupt store = empty). */
export function readChainIntents(userDataDir: string): ChainIntent[] {
  try {
    const raw = readFileSync(join(userDataDir, STORE_FILE), 'utf8');
    const parsed = JSON.parse(raw) as StoreFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return [];
    return parsed.entries
      .filter(
        (entry): entry is ChainIntent =>
          typeof entry?.creatorId === 'string' &&
          entry.creatorId !== '' &&
          typeof entry?.options === 'object' &&
          entry.options !== null,
      )
  } catch {
    return [];
  }
}

/** Upsert the intent for one creator and flush the store atomically. */
export function persistChainIntent(
  userDataDir: string,
  entry: ChainIntent,
): void {
  const entries = readChainIntents(userDataDir).filter(
    (existing) => existing.creatorId !== entry.creatorId,
  );
  entries.push(entry);
  writeStore(userDataDir, { version: 1, entries });
}

/** Remove one creator's intent (next part started, or chain finished for good). */
export function clearChainIntent(userDataDir: string, creatorId: string): void {
  const remaining = readChainIntents(userDataDir).filter(
    (existing) => existing.creatorId !== creatorId,
  );
  if (remaining.length === 0) {
    try {
      writeFileSync(join(userDataDir, STORE_FILE), JSON.stringify({ version: 1, entries: [] }));
    } catch (error) {
      // Best-effort only — a stale file is harmless (boot recovery re-validates
      // everything: creator existence, duplicate guard, live check, budget).
      return;
    }
    return;
  }
  writeStore(userDataDir, { version: 1, entries: remaining });
}

function writeStore(userDataDir: string, contents: StoreFile): void {
  // Atomic-ish: temp file + rename so a crash mid-write cannot tear the JSON
  // (a torn file would just read as empty and lose the recovery hint).
  mkdirSync(userDataDir, { recursive: true });
  const finalPath = join(userDataDir, STORE_FILE);
  const tmpPath = `${finalPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(contents, null, 2));
  renameSync(tmpPath, finalPath);
}
