import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Main-process directory layout (File Storage). */
export interface AppDirs {
  userData: string;
  logsDir: string;
  recordingsDir: string;
  cacheDir: string;
  tempDir: string;
  pluginsDir: string;
  pluginDataDir: string;
  dbPath: string;
}

/** Builds the layout; `recordingsDir` is the user-configurable setting. */
export function buildAppDirs(userDataPath: string, recordingsDir: string): AppDirs {
  return {
    userData: userDataPath,
    logsDir: join(userDataPath, 'logs'),
    recordingsDir,
    cacheDir: join(userDataPath, 'cache'),
    tempDir: join(userDataPath, 'tmp'),
    pluginsDir: join(userDataPath, 'plugins'),
    pluginDataDir: join(userDataPath, 'plugin-data'),
    dbPath: join(userDataPath, 'Rekordly.db'),
  };
}

export function ensureAppDirs(dirs: AppDirs): void {
  for (const dir of [dirs.logsDir, dirs.recordingsDir, dirs.cacheDir, dirs.tempDir, dirs.pluginsDir, dirs.pluginDataDir]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function pluginDataDir(root: string, pluginId: string): string {
  return join(root, pluginId);
}
