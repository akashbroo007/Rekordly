import { app, Menu, nativeImage, Tray, type BrowserWindow } from 'electron';
import type { Logger } from '@rekordly/shared';
import { appIconPng } from './icons';

export interface TrayControllerOptions {
  getWindow: () => BrowserWindow | null;
  logger: Logger;
}

/**
 * System tray controller: keeps Rekordly alive in the background when the
 * main window is closed, and gives quick access to show/quit actions.
 */
export class TrayController {
  private tray: Tray | null = null;

  constructor(private readonly options: TrayControllerOptions) {}

  create(): void {
    if (this.tray !== null) return;

    const icon = createTrayIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('Rekordly');
    this.tray.setContextMenu(this.buildMenu());

    // Left-click toggles the main window
    this.tray.on('click', () => {
      this.showMainWindow();
    });

    this.options.logger.info('system tray created');
  }

  /** Update the tooltip, e.g. "Rekordly — 2 live · 1 recording". */
  setStatus(status: string): void {
    if (this.tray === null) return;
    this.tray.setToolTip(status.length > 0 ? `Rekordly — ${status}` : 'Rekordly');
  }

  destroy(): void {
    if (this.tray === null) return;
    this.tray.destroy();
    this.tray = null;
    this.options.logger.info('system tray destroyed');
  }

  private buildMenu(): Menu {
    return Menu.buildFromTemplate([
      {
        label: 'Show Rekordly',
        click: () => {
          this.showMainWindow();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);
  }

  private showMainWindow(): void {
    const win = this.options.getWindow();
    if (win === null || win.isDestroyed()) return;
    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
  }
}

/**
 * ponytail: use the real brand logo for the tray, DPI-aware: Windows
 * renders tray icons at 16x16 CSS px but samples 32x32 pixels on high-DPI
 * displays — so supply both representations instead of a single downscaled
 * bitmap (a 16px-only icon looks blurry/tiny on 150-200% scaling).
 * Falls back to the runtime-generated "record dot" if assets are missing.
 */
function createTrayIcon(): Electron.NativeImage {
  const icon16 = nativeImage.createFromPath(appIconPng(16));
  const icon32 = nativeImage.createFromPath(appIconPng(32));

  if (!icon32.isEmpty()) {
    if (!icon16.isEmpty()) {
      const combined = nativeImage.createEmpty();
      combined.addRepresentation({ scaleFactor: 1, buffer: icon16.toPNG() });
      combined.addRepresentation({ scaleFactor: 2, buffer: icon32.toPNG() });
      return combined;
    }
    return icon32;
  }
  if (!icon16.isEmpty()) return icon16;

  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 1.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (Math.hypot(x - center, y - center) <= radius) {
        // Brand purple (#7C6CF0) as BGRA
        buffer[i] = 240; // B
        buffer[i + 1] = 108; // G
        buffer[i + 2] = 124; // R
        buffer[i + 3] = 255; // A
      }
    }
  }

  return nativeImage.createFromBitmap(buffer, { width: size, height: size });
}