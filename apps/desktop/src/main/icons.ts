/**
 * ponytail: resolve brand icon paths for the main process. In dev the
 * assets live in <app>/resources/icons; when packaged they are copied to
 * <resourcesPath>/resources via electron-builder's extraResources.
 */
import { join } from 'node:path';
import { app } from 'electron';

export type IconSize = 16 | 32 | 48 | 64 | 128 | 256;

function iconsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icons')
    : join(app.getAppPath(), 'resources', 'icons');
}

/** Path to the multi-size .ico (window / taskbar icon). */
export function appIconIco(): string {
  return join(iconsDir(), 'icon-256x256px.ico');
}

/** Path to a sized PNG (tray, overlays). */
export function appIconPng(size: IconSize): string {
  return join(iconsDir(), `icon-${size}x${size}px.png`);
}
