import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const EXECUTABLE_EXTENSIONS = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];

/**
 * ponytail: directories holding the vendored yt-dlp/ffmpeg copies.
 * - Packaged: <install>/resources/binaries (electron-builder extraResources).
 * - Dev: apps/desktop/resources/binaries in the monorepo.
 * Referenced via process.resourcesPath (only defined inside Electron) so
 * this package stays free of any Electron import.
 */
function vendoredBinaryDirs(): string[] {
  const dirs: string[] = [];
  const resourcesPath = (process as { resourcesPath?: string }).resourcesPath;
  if (typeof resourcesPath === 'string' && resourcesPath.length > 0) {
    dirs.push(join(resourcesPath, 'binaries'));
  }
  // Dev layout: <repo>/apps/desktop/resources/binaries — walk up from cwd.
  dirs.push(join(process.cwd(), 'resources', 'binaries'));
  dirs.push(join(process.cwd(), '..', 'resources', 'binaries'));
  dirs.push(join(process.cwd(), 'apps', 'desktop', 'resources', 'binaries'));
  return dirs;
}

/**
 * Finds an executable on disk. Search order:
 * vendored binaries dir first, then every directory on PATH.
 * Returns null when the binary is not installed anywhere.
 */
export function resolveExecutable(name: string, extraPaths: string[] = []): string | null {
  const candidates: string[] = [];
  const searchDirs = [...vendoredBinaryDirs(), ...extraPaths, ...(process.env.PATH ?? '').split(delimiter)];
  for (const dir of searchDirs) {
    if (dir.length === 0) {
      continue;
    }
    for (const ext of EXECUTABLE_EXTENSIONS) {
      candidates.push(join(dir, `${name}${ext}`));
    }
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
