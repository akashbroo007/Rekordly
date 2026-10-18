import type { BrowserWindow } from 'electron';
import { app, ipcMain } from 'electron';
import type { UpdateInfo } from 'electron-updater';
import { autoUpdater } from 'electron-updater';
import type { Logger } from '@rekordly/shared';
import { IPC_CHANNELS } from '@rekordly/shared/contracts';
import type { UpdateStatusDto } from '@rekordly/shared/contracts';

/**
 * ponytail: the runtime half of the GitHub-Releases distribution story.
 * electron-builder.yml already publishes every release (latest.yml + NSIS
 * setup) to GitHub Releases — this module lets the packaged NSIS app
 * notice them:
 *
 *  • checks ~30s after startup and every 6h afterwards (never on app boot,
 *    so the monitoring pipeline is not delayed by a network call)
 *  • NOTHING downloads automatically — the privacy policy only promises
 *    "checking for updates"; a release shows up as an in-app banner and
 *    the user clicks download, then restarts
 *  • unsupported runtimes (dev mode, the portable exe — no install
 *    location for the updater to patch) just report supported:false so
 *    the UI stays quiet instead of promising an update that cannot be
 *    installed
 *  • background check failures only log — a flaky network must not turn
 *    a perfectly shown "available" banner into an error strip
 */

const BG_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BG_FIRST_CHECK_MS = 30_000;

export interface AppUpdaterDeps {
  logger: Logger;
  getWindow: () => BrowserWindow | null;
}

export interface AppUpdaterHandle {
  getStatus(): UpdateStatusDto;
  dispose(): void;
}

function detectSupported(): boolean {
  if (!app.isPackaged) return false;
  // electron-builder's portable build identifies itself through these env
  // vars; there is no installed location to patch, so self-updates are off.
  return (
    process.env['PORTABLE_EXECUTABLE_DIR'] === undefined &&
    process.env['PORTABLE_EXECUTABLE_FILE'] === undefined
  );
}

export function initAppUpdater(deps: AppUpdaterDeps): AppUpdaterHandle {
  const { logger, getWindow } = deps;
  const supported = detectSupported();
  let state: UpdateStatusDto['state'] = 'idle';
  let version: string | undefined;
  let downloadPercent: number | undefined;
  let error: string | undefined;
  let startedAt = 0;

  const emit = (): void => {
    const snapshot = snapshotNow();
    getWindow()?.webContents.send(IPC_CHANNELS.updatesEvent, snapshot);
  };

  function snapshotNow(): UpdateStatusDto {
    return {
      state,
      version,
      downloadPercent,
      error,
      supported,
    };
  }

  const set = (next: UpdateStatusDto['state']): void => {
    state = next;
    if (next !== 'downloading') downloadPercent = next === 'downloaded' ? downloadPercent : undefined;
    emit();
  };

  if (!supported) {
    logger.debug({ updater: { supported: false } }, 'auto-update unsupported runtime (dev or portable) — updater idle');
    registerIpc(logger, {
      getStatus: snapshotNow,
      check: async () => snapshotNow(),
      download: async () => undefined,
      install: () => undefined,
    });
    return { getStatus: snapshotNow, dispose: () => undefined };
  }

  // electron-updater's own logger adapter → the app's pino log file.
  autoUpdater.logger = {
    debug: (msg: unknown) => logger.debug({ updater: { msg: String(msg) } }, 'updater debug'),
    info: (msg: unknown) => logger.info({ updater: { msg: String(msg) } }, 'updater'),
    warn: (msg: unknown) => logger.warn({ updater: { msg: String(msg) } }, 'updater warn'),
    error: (msg: unknown) => logger.error({ updater: { msg: String(msg) } }, 'updater error'),
  };
  // ponytail: the user decides when to download — see the privacy-policy
  // promise ("checking for application updates"). Once downloaded, quitting
  // naturally applies it even if the banner was missed.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    startedAt = Date.now();
    error = undefined;
    set('checking');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    version = info.version;
    logger.info({ updater: { version: info.version } }, 'app update available');
    set('available');
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    logger.info({ updater: { version: info.version } }, 'app up to date');
    set('not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    state = 'downloading';
    downloadPercent = Number.isFinite(progress.percent) ? Math.round(progress.percent) : undefined;
    emit();
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    version = info.version;
    logger.info({ updater: { version: info.version } }, 'app update downloaded');
    set('downloaded');
  });

  autoUpdater.on('error', (err: Error) => {
    const msg = err.message;
    logger.warn({ updater: { error: msg, ms: Date.now() - startedAt } }, 'app update check failed');
    // ponytail: only surfaces as an error state when the result was the
    // user-visible replacement of an in-flight operation — background
    // network hiccups must not wipe a working "Update available" banner.
    if (state === 'checking' || state === 'downloading') {
      error = msg;
      set('error');
    }
  });

  // ponytail: the check RESULT is never read — the state machine follows
  // the emitted events — so no electron-updater result type is needed.
  let checking: Promise<unknown> | null = null;

  const checkForUpdates = async (): Promise<UpdateStatusDto> => {
    if (checking !== null) return snapshotNow();
    checking = autoUpdater.checkForUpdates().catch((err: unknown) => {
      // logged through the 'error' listener; swallowed here — the promise
      // result is informational, the UI follows the emitted state.
      logger.debug({ updater: { err: err instanceof Error ? err.message : String(err) } }, 'checkForUpdates rejected');
      return null;
    });
    try {
      await checking;
    } finally {
      checking = null;
    }
    return snapshotNow();
  };

  registerIpc(logger, {
    getStatus: snapshotNow,
    check: checkForUpdates,
    download: async () => {
      // fire-and-forget: the IPC response must resolve immediately, the
      // download reports through emitted states (downloading → downloaded).
      autoUpdater
        .downloadUpdate()
        .catch((err: unknown) => logger.warn({ updater: { err: String(err) } }, 'downloadUpdate failed'));
    },
    install: () => {
      // ponytail: small delay so the click's IPC response reaches the
      // renderer before the process tears down around it.
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 300);
    },
  });

  // First check 30s after app start, then every 6 hours. Checks stop when
  // dispose() runs on quit.
  const timer = setInterval(() => void checkForUpdates(), BG_CHECK_INTERVAL_MS);
  setTimeout(() => void checkForUpdates(), BG_FIRST_CHECK_MS).unref?.();

  return {
    getStatus: snapshotNow,
    dispose: () => clearInterval(timer),
  };
}

interface UpdaterOps {
  getStatus(): UpdateStatusDto;
  check(): Promise<UpdateStatusDto>;
  download(): Promise<void>;
  install(): void;
}

function registerIpc(_logger: Logger, ops: UpdaterOps): void {
  ipcMain.handle(IPC_CHANNELS.updatesGetStatus, () => ops.getStatus());
  ipcMain.handle(IPC_CHANNELS.updatesCheck, () => ops.check());
  ipcMain.handle(IPC_CHANNELS.updatesDownload, async () => ops.download());
  ipcMain.handle(IPC_CHANNELS.updatesInstall, () => ops.install());
}
