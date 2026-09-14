import { statSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@rekordly/shared';
import type { RecordingRepo } from '@rekordly/database';
import type { AppDirs } from '../fs/paths';

export interface StorageStats {
  totalRecordings: number;
  totalSizeBytes: number;
  availableBytes: number;
  totalBytes: number;
  cacheSizeBytes: number;
  logSizeBytes: number;
  tempSizeBytes: number;
  largestRecordings: { id: string; title: string; sizeBytes: number; filePath: string }[];
  largestFolders: { path: string; sizeBytes: number; fileCount: number }[];
}

export interface StorageServiceOptions {
  repo: RecordingRepo;
  dirs: AppDirs;
  logger: Logger;
}

export class StorageService {
  private readonly repo: RecordingRepo;
  private readonly dirs: AppDirs;
  private readonly logger: Logger;

  constructor(options: StorageServiceOptions) {
    this.repo = options.repo;
    this.dirs = options.dirs;
    this.logger = options.logger;
  }

  getStats(): StorageStats {
    const recordings = this.repo.listRecordings();
    const totalSizeBytes = recordings.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);

    let availableBytes = 0;
    let totalBytes = 0;
    try {
      const stat = statSync(this.dirs.recordingsDir);
      totalBytes = stat.size;
      // statSync doesn't provide available space; use 0 as placeholder
      // In production, use a native module or shell command for disk space
      availableBytes = 0;
    } catch {
      this.logger.warn('failed to read disk stats');
    }

    const cacheSizeBytes = this.getDirSize(this.dirs.cacheDir);
    const logSizeBytes = this.getDirSize(this.dirs.logsDir);
    const tempSizeBytes = this.getDirSize(this.dirs.tempDir);

    const largestRecordings = recordings
      .filter((r) => r.sizeBytes && r.sizeBytes > 0)
      .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        title: r.title,
        sizeBytes: r.sizeBytes ?? 0,
        filePath: r.filePath ?? '',
      }));

    const largestFolders = this.getLargestFolders(this.dirs.recordingsDir, 10);

    return {
      totalRecordings: recordings.length,
      totalSizeBytes,
      availableBytes,
      totalBytes,
      cacheSizeBytes,
      logSizeBytes,
      tempSizeBytes,
      largestRecordings,
      largestFolders,
    };
  }

  cleanup(options: { cache?: boolean; temp?: boolean; logs?: boolean }): void {
    if (options.cache) this.cleanDir(this.dirs.cacheDir);
    if (options.temp) this.cleanDir(this.dirs.tempDir);
    if (options.logs) this.cleanDir(this.dirs.logsDir);
    this.logger.info({ options }, 'storage cleanup completed');
  }

  private getDirSize(dir: string): number {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      let size = 0;
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile()) {
          try { size += statSync(fullPath).size; } catch { /* skip */ }
        } else if (entry.isDirectory()) {
          size += this.getDirSize(fullPath);
        }
      }
      return size;
    } catch {
      return 0;
    }
  }

  /** ponytail: recurse into subdirectories — the cache dir holds nested trees
   * (e.g. cache/editor timeline images), so file-only deletion freed almost
   * nothing and stale entries kept growing. The dir itself is kept: other
   * services resolve it once at startup and recreate children on demand. */
  private cleanDir(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          rmSync(fullPath, { recursive: true, force: true });
        } else {
          rmSync(fullPath, { force: true });
        }
      }
    } catch {
      this.logger.warn({ dir }, 'failed to clean directory');
    }
  }

  private getLargestFolders(dir: string, limit: number): { path: string; sizeBytes: number; fileCount: number }[] {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      const folders: { path: string; sizeBytes: number; fileCount: number }[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = join(dir, entry.name);
          const { size, count } = this.getFolderStats(fullPath);
          folders.push({ path: fullPath, sizeBytes: size, fileCount: count });
        }
      }
      return folders.sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, limit);
    } catch {
      return [];
    }
  }

  private getFolderStats(dir: string): { size: number; count: number } {
    let size = 0;
    let count = 0;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile()) {
          try { size += statSync(fullPath).size; count++; } catch { /* skip */ }
        } else if (entry.isDirectory()) {
          const sub = this.getFolderStats(fullPath);
          size += sub.size;
          count += sub.count;
        }
      }
    } catch { /* skip */ }
    return { size, count };
  }
}
