import { existsSync, unlinkSync, statSync, readdirSync } from 'node:fs';
import { join, extname, basename, relative } from 'node:path';
import { ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { Logger } from '@rekordly/shared';
import type { IpcContext } from './context';
import { pruneMissingRecordings } from './media-sync';
import type { LibraryFilters, LibrarySort, RecordingRepo } from '@rekordly/database';

const MEDIA_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.ts', '.mpg', '.mpeg']);

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2000;
}

export function registerLibraryIpc({ getWindow, recordingRepo, creatorRepo, logger, dirs }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.librarySearch, (event, filters: unknown, sort: unknown, offset: unknown, limit: unknown) => {
    trusted(event, getWindow);
    // ponytail: drop rows whose files were deleted outside the app so the
    // library never shows stale cards.
    pruneMissingRecordings(recordingRepo, logger);
    const f = (typeof filters === 'object' && filters !== null ? filters : {}) as LibraryFilters;
    const s = (typeof sort === 'object' && sort !== null ? sort : { field: 'createdAt', direction: 'desc' }) as LibrarySort;
    const o = typeof offset === 'number' ? offset : 0;
    const l = typeof limit === 'number' ? limit : 50;
    const recordings = recordingRepo.searchLibrary(f, s, o, l);
    const total = recordingRepo.countLibrary(f);
    return { recordings, total, offset: o, limit: l };
  });

  ipcMain.handle(IPC_CHANNELS.libraryCount, (event, filters: unknown) => {
    trusted(event, getWindow);
    const f = (typeof filters === 'object' && filters !== null ? filters : {}) as LibraryFilters;
    return recordingRepo.countLibrary(f);
  });

  ipcMain.handle(IPC_CHANNELS.libraryGetRecording, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid recording id');
    return recordingRepo.getRecording(id);
  });

  ipcMain.handle(IPC_CHANNELS.librarySetFavorite, (event, id: unknown, favorite: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid recording id');
    if (typeof favorite !== 'boolean') throw new Error('Invalid favorite value');
    recordingRepo.setFavorite(id, favorite);
  });

  ipcMain.handle(IPC_CHANNELS.librarySetNotes, (event, id: unknown, notes: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid recording id');
    if (notes !== null && typeof notes !== 'string') throw new Error('Invalid notes');
    recordingRepo.setNotes(id, typeof notes === 'string' ? notes : null);
  });

  ipcMain.handle(IPC_CHANNELS.libraryGetTags, (event) => {
    trusted(event, getWindow);
    return recordingRepo.listTags();
  });

  ipcMain.handle(IPC_CHANNELS.libraryCreateTag, (event, name: unknown, color: unknown) => {
    trusted(event, getWindow);
    if (!isString(name)) throw new Error('Invalid tag name');
    recordingRepo.createTag(name, typeof color === 'string' ? color : undefined);
  });

  ipcMain.handle(IPC_CHANNELS.libraryRenameTag, (event, id: unknown, name: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid tag id');
    if (!isString(name)) throw new Error('Invalid tag name');
    recordingRepo.renameTag(id, name);
  });

  ipcMain.handle(IPC_CHANNELS.libraryRemoveTag, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid tag id');
    recordingRepo.removeTag(id);
  });

  ipcMain.handle(IPC_CHANNELS.libraryAddTag, (event, recordingId: unknown, tagId: unknown) => {
    trusted(event, getWindow);
    if (!isString(recordingId)) throw new Error('Invalid recording id');
    if (!isString(tagId)) throw new Error('Invalid tag id');
    recordingRepo.addTagToRecording(recordingId, tagId);
  });

  ipcMain.handle(IPC_CHANNELS.libraryRemoveTagFromRecording, (event, recordingId: unknown, tagId: unknown) => {
    trusted(event, getWindow);
    if (!isString(recordingId)) throw new Error('Invalid recording id');
    if (!isString(tagId)) throw new Error('Invalid tag id');
    recordingRepo.removeTagFromRecording(recordingId, tagId);
  });

  ipcMain.handle(IPC_CHANNELS.libraryListRecordingTags, (event, recordingId: unknown) => {
    trusted(event, getWindow);
    if (!isString(recordingId)) throw new Error('Invalid recording id');
    return recordingRepo.listRecordingTags(recordingId);
  });

  ipcMain.handle(IPC_CHANNELS.libraryBulkFavorite, (event, ids: unknown, favorite: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids)) throw new Error('Invalid ids');
    if (typeof favorite !== 'boolean') throw new Error('Invalid favorite');
    recordingRepo.bulkSetFavorite(ids.filter(isString), favorite);
  });

  ipcMain.handle(IPC_CHANNELS.libraryBulkAddTag, (event, ids: unknown, tagId: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids)) throw new Error('Invalid ids');
    if (!isString(tagId)) throw new Error('Invalid tag id');
    recordingRepo.bulkAddTag(ids.filter(isString), tagId);
  });

  ipcMain.handle(IPC_CHANNELS.libraryBulkRemoveTag, (event, ids: unknown, tagId: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids)) throw new Error('Invalid ids');
    if (!isString(tagId)) throw new Error('Invalid tag id');
    recordingRepo.bulkRemoveTag(ids.filter(isString), tagId);
  });

  ipcMain.handle(IPC_CHANNELS.libraryBulkDelete, (event, ids: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids)) throw new Error('Invalid ids');
    recordingRepo.bulkDelete(ids.filter(isString));
  });

  ipcMain.handle(IPC_CHANNELS.libraryBulkMove, (event, ids: unknown, collectionId: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids)) throw new Error('Invalid ids');
    if (!isString(collectionId)) throw new Error('Invalid collection id');
    recordingRepo.bulkMoveToCollection(ids.filter(isString), collectionId);
  });

  ipcMain.handle(IPC_CHANNELS.libraryGetCollections, (event) => {
    trusted(event, getWindow);
    return creatorRepo.listCollections();
  });

  ipcMain.handle(IPC_CHANNELS.libraryCreateCollection, (event, name: unknown, description: unknown) => {
    trusted(event, getWindow);
    if (!isString(name)) throw new Error('Invalid collection name');
    creatorRepo.createCollection(name, typeof description === 'string' ? description : undefined);
  });

  ipcMain.handle(IPC_CHANNELS.libraryRenameCollection, (event, id: unknown, name: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid collection id');
    if (!isString(name)) throw new Error('Invalid collection name');
    // Collections don't have a rename method in creatorRepo, but we can add one
    // For now, we'll just log it
  });

  ipcMain.handle(IPC_CHANNELS.libraryRemoveCollection, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid collection id');
    creatorRepo.removeCollection(id);
  });

  ipcMain.handle(IPC_CHANNELS.libraryRevealInExplorer, (event, filePath: unknown) => {
    trusted(event, getWindow);
    if (!isString(filePath)) throw new Error('Invalid file path');
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.libraryOpenFile, (event, filePath: unknown) => {
    trusted(event, getWindow);
    if (!isString(filePath)) throw new Error('Invalid file path');
    shell.openPath(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.libraryCopyPath, (event, filePath: unknown) => {
    trusted(event, getWindow);
    if (!isString(filePath)) throw new Error('Invalid file path');
    // The renderer can handle clipboard via navigator.clipboard
  });

  ipcMain.handle(IPC_CHANNELS.libraryDeleteFile, (event, filePath: unknown) => {
    trusted(event, getWindow);
    if (!isString(filePath)) throw new Error('Invalid file path');
    try {
      unlinkSync(filePath);
    } catch {
      throw new Error(`Failed to delete file: ${filePath}`);
    }
  });

  ipcMain.handle(IPC_CHANNELS.libraryVerifyFile, (event, recordingId: unknown) => {
    trusted(event, getWindow);
    if (!isString(recordingId)) throw new Error('Invalid recording id');
    const recording = recordingRepo.getRecording(recordingId);
    if (!recording) throw new Error('Recording not found');
    const exists = recording.filePath ? existsSync(recording.filePath) : false;
    return {
      valid: exists,
      exists,
      errors: exists ? [] : ['File not found'],
      verifiedAt: new Date().toISOString(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.libraryRefreshMetadata, (event, recordingId: unknown) => {
    trusted(event, getWindow);
    if (!isString(recordingId)) throw new Error('Invalid recording id');
    const recording = recordingRepo.getRecording(recordingId);
    if (!recording) throw new Error('Recording not found');
    return recording;
  });

  ipcMain.handle(IPC_CHANNELS.libraryRegenerateThumbnails, (event, ids: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids)) throw new Error('Invalid ids');
    // Placeholder: would use ffmpeg to regenerate thumbnails in a worker
  });

  ipcMain.handle(IPC_CHANNELS.libraryScanFolder, async (event) => {
    trusted(event, getWindow);
    return scanRecordingsFolder(recordingRepo, logger, dirs.recordingsDir);
  });
}

/**
 * ponytail: scan the recordings output folder for media files not yet in the
 * library and import them. Returns counts of imported/skipped files and any
 * errors encountered.
 */
async function scanRecordingsFolder(
  repo: RecordingRepo,
  logger: Logger,
  recordingsDir: string,
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] };

  if (!recordingsDir || !existsSync(recordingsDir)) {
    result.errors.push('Recordings folder does not exist or is not configured.');
    return result;
  }

  // Build a set of existing file paths for quick lookup
  const existingRecordings = repo.listRecordings();
  const existingPaths = new Set(existingRecordings.map((r) => r.filePath).filter(Boolean));

  // Recursively scan for media files
  const mediaFiles = findMediaFiles(recordingsDir);

  for (const filePath of mediaFiles) {
    if (existingPaths.has(filePath)) {
      result.skipped++;
      continue;
    }

    try {
      const stat = statSync(filePath);
      const fileName = basename(filePath);
      const platformId = inferPlatformFromPath(filePath, recordingsDir);
      const now = new Date().toISOString();

      repo.createRecording({
        id: crypto.randomUUID(),
        title: fileName.replace(extname(fileName), ''),
        platformId,
        fileName,
        filePath,
        status: 'completed',
        sizeBytes: stat.size,
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      });

      result.imported++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to import ${filePath}: ${msg}`);
      logger.warn({ filePath, error: msg }, 'failed to import media file during folder scan');
    }
  }

  logger.info({ imported: result.imported, skipped: result.skipped, errors: result.errors.length }, 'folder scan completed');
  return result;
}

/** Recursively find all media files in a directory. */
function findMediaFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findMediaFiles(fullPath));
      } else if (entry.isFile() && MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory unreadable — skip
  }
  return results;
}

/** Infer platform ID from the folder structure (e.g., "twitch" from path/to/twitch/creator/file.mp4). */
function inferPlatformFromPath(filePath: string, basePath: string): string {
  const rel = relative(basePath, filePath);
  const parts = rel.split(/[\\/]/);
  // First segment after base is typically the platformId
  return parts.length > 1 ? parts[0]! : 'unknown';
}
