import { join } from 'node:path';
import { readdir, rm, stat, statfs } from 'node:fs/promises';
import type { Logger } from '@rekordly/shared';
import type { RecordingRepo } from '@rekordly/database';
import type { AppDirs } from '../fs/paths';

export interface StorageStats {
  totalRecordings: number;
  totalSizeBytes: number;
  /** Free disk space in bytes; null when the filesystem stats are unreadable. */
  availableBytes: number | null;
  /** Total disk capacity in bytes; null when the filesystem stats are unreadable. */
  totalBytes: number | null;
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

/**
 * ponytail: how long a computed stats snapshot stays fresh. The dashboard
 * re-polls storage stats every 10s and EVERY recording lifecycle event
 * invalidates the query — the old implementation responded with a recursive
 * SYNCHRONOUS walk of the recordings/cache/log/temp trees (statSync per
 * file) on the Electron main thread, which froze the window for hundreds of
 * ms per call once the library grew. The walk itself is now async; this TTL
 * additionally coalesces bursts (event invalidations need not each rewalk).
 */
const STATS_TTL_MS = 30_000;

export class StorageService {
  private readonly repo: RecordingRepo;
  private readonly dirs: AppDirs;
  private readonly logger: Logger;
  /** Last fresh snapshot + its compute time (TTL cache). */
  private cache: { stats: StorageStats; at: number } | null = null;
  /** In-flight computation — concurrent polls share one walk. */
  private inflight: Promise<StorageStats> | null = null;

  constructor(options: StorageServiceOptions) {
    this.repo = options.repo;
    this.dirs = options.dirs;
    this.logger = options.logger;
  }

  /**
   * ponytail: full stats via an ASYNC file walk — never blocks the main
   * event loop — behind a ~30s TTL cache with in-flight coalescing. Bloated
   * synchronous walks used to freeze the whole app while recordings ran.
   */
  async getStats(): Promise<StorageStats> {
    const now = Date.now();
    if (this.cache !== null && now - this.cache.at < STATS_TTL_MS) {
      return this.cache.stats;
    }
    if (this.inflight !== null) return this.inflight;

    this.inflight = this.computeStats()
      .then((stats) => {
        this.cache = { stats, at: Date.now() };
        return stats;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  async cleanup(options: { cache?: boolean; temp?: boolean; logs?: boolean }): Promise<void> {
    if (options.cache) await this.cleanDir(this.dirs.cacheDir);
    if (options.temp) await this.cleanDir(this.dirs.tempDir);
    if (options.logs) await this.cleanDir(this.dirs.logsDir);
    // The walk may have covered directories that were just emptied.
    this.cache = null;
    this.logger.info({ options }, 'storage cleanup completed');
  }

  private async computeStats(): Promise<StorageStats> {
    const recordings = this.repo.listRecordings();
    const totalSizeBytes = recordings.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);

    let availableBytes: number | null = null;
    let totalBytes: number | null = null;
    try {
      const fsStats = await statfs(this.dirs.recordingsDir);
      availableBytes = fsStats.bsize * fsStats.bavail;
      totalBytes = fsStats.bsize * fsStats.blocks;
    } catch (error) {
      this.logger.warn({ error }, 'failed to read disk filesystem stats');
    }

    const [cacheSizeBytes, logSizeBytes, tempSizeBytes, largestFolders] = await Promise.all([
      this.getDirSize(this.dirs.cacheDir),
      this.getDirSize(this.dirs.logsDir),
      this.getDirSize(this.dirs.tempDir),
      this.getLargestFolders(this.dirs.recordingsDir, 10),
    ]);

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

  private async getDirSize(dir: string): Promise<number> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      let size = 0;
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile()) {
          try {
            size += (await stat(fullPath)).size;
          } catch {
            /* skip */
          }
        } else if (entry.isDirectory()) {
          size += await this.getDirSize(fullPath);
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
  private async cleanDir(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await rm(fullPath, { recursive: true, force: true });
        } else {
          await rm(fullPath, { force: true });
        }
      }
    } catch {
      this.logger.warn({ dir }, 'failed to clean directory');
    }
  }

  private async getLargestFolders(
    dir: string,
    limit: number,
  ): Promise<{ path: string; sizeBytes: number; fileCount: number }[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      const folders: { path: string; sizeBytes: number; fileCount: number }[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = join(dir, entry.name);
          const { size, count } = await this.getFolderStats(fullPath);
          folders.push({ path: fullPath, sizeBytes: size, fileCount: count });
        }
      }
      return folders.sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, limit);
    } catch {
      return [];
    }
  }

  private async getFolderStats(dir: string): Promise<{ size: number; count: number }> {
    let size = 0;
    let count = 0;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile()) {
          try {
            size += (await stat(fullPath)).size;
            count++;
          } catch {
            /* skip */
          }
        } else if (entry.isDirectory()) {
          const sub = await this.getFolderStats(fullPath);
          size += sub.size;
          count += sub.count;
        }
      }
    } catch {
      /* skip */
    }
    return { size, count };
  }
}
