import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { Logger } from '@rekordly/shared';
import { appIconIco } from './icons';
import type { WindowState } from './state';

export interface MainWindowOptions {
  /** Start hidden (monitoring runs in the background from login). */
  startHidden?: boolean;
}

export function createMainWindow(
  state: WindowState,
  logger: Logger,
  options: MainWindowOptions = {},
): BrowserWindow {
  const win = new BrowserWindow({
    ...state.bounds,
    // ponytail: the renderer is fully responsive now (auto-collapsing
    // sidebar, adaptive toolbar, wrapping headers) — allow small windows.
    minWidth: 380,
    minHeight: 480,
    show: false,
    title: ' ',
    frame: false,
    // ponytail: brand icon for the window + Windows taskbar (dev mode; the
    // packaged exe uses the embedded icon from build/icon.ico).
    icon: appIconIco(),
    backgroundColor: '#0F1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => {
    if (options.startHidden === true) {
      // Stay hidden; the user can bring it up from the tray.
      if (state.maximized) {
        win.maximize();
      }
      return;
    }
    win.show();
    if (state.maximized) {
      win.maximize();
    }
  });

  const sendMaximized = (maximized: boolean): void => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.windowMaximizedChanged, maximized);
    }
  };
  win.on('maximize', () => sendMaximized(true));
  win.on('unmaximize', () => sendMaximized(false));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl).catch((error: unknown) => {
      logger.error({ error }, 'failed to load renderer dev server');
    });
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html')).catch((error: unknown) => {
      logger.error({ error }, 'failed to load renderer file');
    });
  }

  // ponytail: if the renderer never becomes ready (corrupt bundle, GPU crash,
  // killed mid-write update), ready-to-show never fires and the window stays
  // hidden forever — the app looks "running in Task Manager but won't open".
  // Force it visible so the user always gets a window (even a blank one)
  // instead of a headless background process.
  win.webContents.on('did-fail-load', (_event, code, desc) => {
    logger.error({ code, desc }, 'renderer failed to load — showing window anyway');
    if (!win.isDestroyed() && options.startHidden !== true && !win.isVisible()) {
      win.show();
    }
  });
  const showFallback = setTimeout(() => {
    if (!win.isDestroyed() && options.startHidden !== true && !win.isVisible()) {
      logger.warn('renderer not ready after 15s — showing window anyway');
      win.show();
    }
  }, 15_000);
  showFallback.unref?.();
  win.once('ready-to-show', () => clearTimeout(showFallback));
  win.on('closed', () => clearTimeout(showFallback));

  win.on('closed', () => {
    logger.info('main window closed');
  });

  return win;
}
