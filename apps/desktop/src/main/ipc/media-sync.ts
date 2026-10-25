import { access } from 'node:fs/promises';
import type { Logger } from '@rekordly/shared';
import type { RecordingRepo, DownloadQueueRepo } from '@rekordly/database';

/**
 * ponytail: files can be deleted outside the app (file manager, disk cleanup).
 * The database keeps stale rows in that case — the Library shows dead cards
 * and dashboard numbers never change. These helpers reconcile the database
 * with what is actually on disk.
 *
 * NEVER blocking: every read handler (Library list, dashboard recent, counts)
 * used to run one synchronous existsSync PER library row on the Electron main
 * thread before answering — with a few hundred recordings each poll froze the
 * window for hundreds of ms. Now: async existence checks, throttled to one
 * reconcile per RECONCILE_MIN_INTERVAL_MS, fire-and-forget (stale rows may be
 * answered once briefly; the next 60s pass cleans them without anyone
 * waiting on disk I/O).
 */

const RECONCILE_MIN_INTERVAL_MS = 60_000;

const recordingsState = newPruneState();
const downloadsState = newPruneState();

interface PruneState {
  lastRunAt: number;
  inflight: Promise<void> | null;
}

function newPruneState(): PruneState {
  return { lastRunAt: 0, inflight: null };
}

/** True when the prune never ran or errored — always resolve quietly. */
async function fileMissing(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

export function pruneMissingRecordings(repo: RecordingRepo, logger: Logger): void {
  if (Date.now() - recordingsState.lastRunAt < RECONCILE_MIN_INTERVAL_MS) return;
  recordingsState.lastRunAt = Date.now();
  if (recordingsState.inflight !== null) return;
  recordingsState.inflight = (async () => {
    try {
      const recordings = repo.listRecordings();
      for (const rec of recordings) {
        if (rec.filePath && rec.filePath.length > 0 && (await fileMissing(rec.filePath))) {
          repo.removeRecording(rec.id);
          logger.info(
            { recordingId: rec.id, filePath: rec.filePath },
            'pruned recording whose file was deleted externally',
          );
        }
      }
    } catch (error) {
      logger.warn({ error }, 'failed to prune missing recordings');
    } finally {
      recordingsState.inflight = null;
    }
  })();
}

export function pruneMissingDownloads(repo: DownloadQueueRepo, logger: Logger): void {
  if (Date.now() - downloadsState.lastRunAt < RECONCILE_MIN_INTERVAL_MS) return;
  downloadsState.lastRunAt = Date.now();
  if (downloadsState.inflight !== null) return;
  downloadsState.inflight = (async () => {
    try {
      const items = repo.list('completed');
      for (const item of items) {
        if (item.filePath && item.filePath.length > 0 && (await fileMissing(item.filePath))) {
          repo.remove(item.id);
          logger.info(
            { downloadId: item.id, filePath: item.filePath },
            'pruned download whose file was deleted externally',
          );
        }
      }
    } catch (error) {
      logger.warn({ error }, 'failed to prune missing downloads');
    } finally {
      downloadsState.inflight = null;
    }
  })();
}
