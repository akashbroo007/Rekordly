import { existsSync } from 'node:fs';
import type { Logger } from '@rekordly/shared';
import type { RecordingRepo, DownloadQueueRepo } from '@rekordly/database';

/**
 * ponytail: files can be deleted outside the app (file manager, disk cleanup).
 * The database keeps stale rows in that case — the Library shows dead cards
 * and dashboard numbers never change. These helpers reconcile the database
 * with what is actually on disk before read-heavy IPC handlers respond.
 */

export function pruneMissingRecordings(repo: RecordingRepo, logger: Logger): void {
  try {
    const recordings = repo.listRecordings();
    for (const rec of recordings) {
      if (rec.filePath && rec.filePath.length > 0 && !existsSync(rec.filePath)) {
        repo.removeRecording(rec.id);
        logger.info({ recordingId: rec.id, filePath: rec.filePath }, 'pruned recording whose file was deleted externally');
      }
    }
  } catch (error) {
    logger.warn({ error }, 'failed to prune missing recordings');
  }
}

export function pruneMissingDownloads(repo: DownloadQueueRepo, logger: Logger): void {
  try {
    const items = repo.list('completed');
    for (const item of items) {
      if (item.filePath && item.filePath.length > 0 && !existsSync(item.filePath)) {
        repo.remove(item.id);
        logger.info({ downloadId: item.id, filePath: item.filePath }, 'pruned download whose file was deleted externally');
      }
    }
  } catch (error) {
    logger.warn({ error }, 'failed to prune missing downloads');
  }
}