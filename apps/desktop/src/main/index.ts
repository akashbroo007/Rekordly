
import { existsSync, renameSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, nativeTheme, Notification as ElectronNotification } from 'electron';
import {
  createDatabase,
  createLogRepo,
  createPluginRepo,
  createSettingsRepo,
  createCreatorRepo,
  createRecordingRepo,
  createMonitoringRepo,
  createDownloadQueueRepo,
  createUploadQueueRepo,
  createBackgroundJobRepo,
} from '@rekordly/database';
import { IPC_CHANNELS, createLogger, type StreamObject } from '@rekordly/shared';
import {
  clearChainIntent,
  persistChainIntent,
  readChainIntents,
  type ChainIntentOptions,
} from './segment-chain-store';
import {
  ConfigManager,
  EventBus,
  NotificationService,
  PluginManager,
  SettingsService,
  MonitoringService,
  RecordingService,
  StorageService,
  DownloadManager,
  UploadService,
  PushNotifier,
  TelegramCommandService,
  isActiveJobStatus,
  AutomationService,
  FfmpegService,
  GofileProvider,
  CatboxProvider,
  MixDropProvider,
  GoogleDriveProvider,
  BackgroundJobService,
  HardwareService,
  ProcessMonitorService,
  NetworkMonitorService,
  TorService,
  buildAppDirs,
  ensureAppDirs,
  type CoreEvents,
} from '@rekordly/core';
import { registerIpcHandlers } from './ipc';
import { refreshCreatorAvatar } from './creator-avatars';
import { registerMediaScheme, registerMediaProtocolHandler } from './media-protocol';

// ponytail: privileged schemes must be registered before app ready.
registerMediaScheme();
import { loadWindowState, saveWindowState } from './state';
import { createMainWindow } from './window';
import { TrayController } from './tray';

let mainWindow: BrowserWindow | null = null;
let quitting = false;
/**
 * ponytail: set when a second launch arrives before bootstrap finished
 * creating the window — the window is shown immediately once it exists
 * instead of dropping the request (which looked like "won't open").
 */
let pendingFocusRequest = false;
/** Logger available to early helpers (window recreate on second-instance). */
let earlyLogger: { info: (...a: never[]) => void; warn: (...a: never[]) => void; error: (...a: never[]) => void } | null = null;
let trayController: TrayController | null = null;
/** Settings snapshot needed to re-attach the close-to-tray behavior on recreate. */
let closeToTrayEnabled = true;
/** before-quit is registered once per process (bootstrap runs once). */
let quitHandlerRegistered = false;

function isWindowUsable(win: BrowserWindow | null): win is BrowserWindow {
  return win !== null && !win.isDestroyed();
}

/**
 * ponytail: bring the main window forward no matter how it was hidden.
 * focus() alone cannot un-hide a window hidden via close-to-tray (hide()),
 * and restore() alone cannot un-hide it either — without show() here a
 * relaunch while the app sits in the tray does nothing visible, leaving
 * the app "running in the background but not able to open".
 */
function focusMainWindow(): void {
  if (!isWindowUsable(mainWindow)) {
    pendingFocusRequest = true;
    return;
  }
  try {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
    mainWindow.moveTop();
  } catch (err) {
    earlyLogger?.warn?.({ err } as never, 'focusMainWindow failed' as never);
  }
}

/**
 * ponytail: attach the close-to-tray behavior to the current main window.
 * Extracted so both the normal boot path and the fatal-error fallback (or a
 * second-instance recreate) share the same behavior — closing hides instead
 * of quitting when enabled, and the reference is cleared on destroy so a
 * later relaunch recreates instead of focusing a dead handle.
 */
function attachWindowCloseBehavior(userDataPath: string, getCloseToTray: () => boolean): void {
  const win = mainWindow;
  if (!isWindowUsable(win)) return;
  closeToTrayEnabled = getCloseToTray();
  win.on('close', (event) => {
    if (isWindowUsable(mainWindow)) {
      try {
        saveWindowState(userDataPath, mainWindow);
      } catch {
        /* a corrupt userData path must never block close */
      }
    }
    // ponytail: with close-to-tray enabled, closing the window hides it and
    // keeps monitoring/recording running in the background.
    if (!quitting && getCloseToTray()) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
}

/**
 * ponytail: open SQLite with corruption recovery. A force-kill mid-download
 * can leave Rekordly.db torn (WAL mid-transaction); without this the next
 * migrate() throws, bootstrap dies before creating any window, and the app
 * sits headless holding the single-instance lock — every later launch quits
 * instantly ("running in Task Manager but won't open"). On corruption
 * signatures the torn file is backed up next to the original and a fresh DB
 * is created so the app always reaches a visible window; media files on disk
 * are never touched.
 */
function openDatabaseWithRecovery(dbPath: string): ReturnType<typeof createDatabase> {
  try {
    const handle = createDatabase(dbPath);
    handle.migrate();
    return handle;
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    const corrupt = /malform|corrupt|not a database|disk image|database is locked|SQLITE_CORRUPT|SQLITE_NOTADB/i.test(message);
    if (!corrupt) throw err;
    // eslint-disable-next-line no-console
    console.error('Database appears corrupt, backing up and recreating:', message);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${dbPath}.corrupt-${stamp}.bak`;
    try {
      if (existsSync(dbPath)) renameSync(dbPath, backupPath);
      for (const suffix of ['-wal', '-shm', '-journal']) {
        try {
          if (existsSync(`${dbPath}${suffix}`)) renameSync(`${dbPath}${suffix}`, `${backupPath}${suffix}`);
        } catch {
          /* best-effort sidecar cleanup */
        }
      }
    } catch (backupErr) {
      // eslint-disable-next-line no-console
      console.error('Database backup failed:', backupErr);
    }
    const fresh = createDatabase(dbPath);
    fresh.migrate();
    return fresh;
  }
}

/**
 * ponytail: counting semaphore limiting how many auto-record stream
 * extractions run at once. When several creators go live simultaneously,
 * each extraction used to fire immediately — every Stripchat one launches
 * a headless Chromium — which could spawn 5-10 browser processes in seconds
 * and stall low-spec machines. Excess extractions queue here instead.
 */
class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  /** Acquire a slot; resolves with the release function. */
  async acquire(): Promise<() => void> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const next = this.waiters.shift();
      if (next !== undefined) next();
    };
  }
}

// Two parallel extractions max — enough to not miss live windows, few enough
// that Chromium spawns stay bounded on smaller systems.
const extractionSlots = new Semaphore(2);

// ponytail: name drives the userData folder (%APPDATA%\Rekordly) — must be
// set before requestSingleInstanceLock(), which resolves the userData path.
app.setName('Rekordly');

// ponytail: a dev run MUST NOT share userData with the installed app. Both
// used %APPDATA%\Rekordly, so running `pnpm dev` on the same machine wrote
// test creators, recordings, logs and settings into the exact database the
// packaged build opens — a freshly installed copy then booted looking like
// the developer's workspace ("the installed app opens with my dev data").
// Development gets its own folder; installed builds keep the real one, and
// neither can ever contaminate the other. Resolved before the single-instance
// lock so the lock itself is per-profile.
if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'Rekordly (dev)'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('com.rekordly.app');

  app.on('second-instance', () => {
    focusMainWindow();
  });

  void bootstrap().catch((err) => {
    // ponytail: bootstrap must never leave the app running headless holding
    // the single-instance lock (every later launch would quit instantly and
    // the user sees "running in Task Manager but won't open"). As a last
    // resort, surface the error instead of hanging in the background.
    // eslint-disable-next-line no-console
    console.error('Fatal bootstrap error:', err);
    void app.whenReady().then(() => {
      if (!isWindowUsable(mainWindow)) {
        try {
          const userDataPath = app.getPath('userData');
          const fallbackState = loadWindowState(userDataPath);
          mainWindow = createMainWindow(fallbackState, (earlyLogger ?? console) as never);
          attachWindowCloseBehavior(userDataPath, () => closeToTrayEnabled);
          if (trayController === null) {
            trayController = new TrayController({ getWindow: () => mainWindow, logger: (earlyLogger ?? console) as never });
            trayController.create();
          }
          // ponytail: bootstrap died before registering its own app-level
          // handlers — register minimal ones so the fallback window can still
          // quit cleanly and a later dock/tray activate still shows it.
          // Otherwise closing this window leaves a headless lock holder again.
          app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') app.quit();
          });
          app.on('activate', () => focusMainWindow());
          if (!quitHandlerRegistered) {
            quitHandlerRegistered = true;
            app.on('before-quit', () => {
              quitting = true;
              try {
                trayController?.destroy();
              } catch {
                /* already gone */
              }
            });
          }
          focusMainWindow();
        } catch {
          /* window creation itself failed — nothing more we can show */
        }
      } else {
        focusMainWindow();
      }
      const showError = (): void => {
        const detail = err instanceof Error ? err.message.slice(0, 1000) : String(err).slice(0, 1000);
        const show = (): Promise<{ response: number }> =>
          isWindowUsable(mainWindow)
            ? dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Rekordly failed to start',
                message: 'Rekordly could not finish starting. Your recordings and downloads on disk are untouched.',
                detail,
                buttons: ['Quit', 'Continue anyway'],
                defaultId: 1,
              })
            : dialog.showMessageBox({
                type: 'error',
                title: 'Rekordly failed to start',
                message: 'Rekordly could not finish starting. Your recordings and downloads on disk are untouched.',
                detail,
                buttons: ['Quit'],
              });
        void show()
          .then(({ response }) => {
            if (response === 0) {
              quitting = true;
              app.quit();
            }
          })
          .catch(() => undefined);
      };
      showError();
    });
  });
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  registerMediaProtocolHandler();

  const userDataPath = app.getPath('userData');
  const mediaDirs = defaultMediaDirs();
  const dirs = buildAppDirs(userDataPath, mediaDirs.recordings);
  ensureAppDirs(dirs);

  const database = openDatabaseWithRecovery(dirs.dbPath);

  const settingsRepo = createSettingsRepo(database.orm);

  const config = new ConfigManager({ defaults: {}, user: settingsRepo });
  const initialLogLevel = (config.getAll()['logLevel'] as string) ?? 'info';

  const logger = await createLogger('main', {
    rotatingFile: { dir: dirs.logsDir },
    level: initialLogLevel,
    console: true,
  });
  earlyLogger = logger as never;
  logger.info({ dirs, logLevel: initialLogLevel }, 'application starting');
  logger.info({ dbPath: dirs.dbPath }, 'database initialized');

  const pluginRepo = createPluginRepo(database.orm);
  const logRepo = createLogRepo(database.orm);
  const creatorRepo = createCreatorRepo(database.orm);
  const recordingRepo = createRecordingRepo(database.orm);
  const monitoringRepo = createMonitoringRepo(database.orm);
  const downloadRepo = createDownloadQueueRepo(database.orm);
  const uploadRepo = createUploadQueueRepo(database.orm);
  const jobRepo = createBackgroundJobRepo(database.orm);

  const settings = new SettingsService({
    config,
    logger,
    defaultRecordingsDir: mediaDirs.recordings,
    defaultDownloadsDir: mediaDirs.downloads,
  });

  const bus = new EventBus<CoreEvents>();
  const notifications = new NotificationService({ logRepo, logger, bus });

  // Push notifications to phone/chat apps (Discord webhook + Telegram bot).
  // Settings are read live per send — changes apply without a restart.
  const push = new PushNotifier({
    logger,
    getSettings: () => settings.getAll().pushNotifications,
    onSendFailure: (channel, error) => {
      notifications.send({
        level: 'warn',
        title: `Push notification failed (${channel})`,
        message: `Could not deliver to ${channel}: ${error} — check Settings → Notifications.`,
      });
    },
  });

  // ponytail: shared "record this creator now" used by BOTH the renderer's
  // Record dialog (via IPC) and Telegram button taps — one implementation so  // plugin extraction, FK-safe creator ids and duplicate guards stay in sync.
  const startRecordingForCreator: (creatorDbId: string, options: {
    quality?: string;
    durationMinutes?: number;
    segmentMinutes?: number;
    streamType?: string;
  }) => Promise<string> = async (creatorDbId, startOptions) => {
    const creator = creatorRepo.get(creatorDbId);
    if (creator === undefined) throw new Error('Creator not found');
    const monitorId = `${creator.pluginId}:${creator.externalId}`;
    const managed = pluginManager.get(creator.pluginId);
    const jobs = monitoring.getJobs();
    const job = jobs.find((j) => j.creatorId === monitorId);
    let lastResult = job?.lastResult;
    const liveDetection = managed?.instance?.capabilities.liveDetection;
    if (lastResult?.streamUrl === undefined) {
      if (liveDetection === undefined) {
        throw new Error(`${creator.displayName} is not live or has no stream URL`);
      }
      const status = await liveDetection.getLiveStatus(monitorId);
      if (!status.isLive) {
        throw new Error(`${creator.displayName} is not live or has no stream URL`);
      }
      lastResult = {
        isLive: true,
        title: status.title,
        thumbnail: status.thumbnail,
        viewerCount: status.viewerCount,
        streamUrl: status.streamUrl,
        startedAt: status.startedAt,
        checkedAt: new Date().toISOString(),
        durationMs: 0,
      };
    }
    let stream: StreamObject | null = null;
    const extract = managed?.instance?.capabilities.streamExtraction;
    if (extract !== undefined) {
      try {
        stream = await extract.extractStream(monitorId, { streamType: startOptions.streamType });
      } catch {
        /* fall back to the live-check URL below */
      }
    }
    if (stream === null) {
      if (lastResult.streamUrl === undefined) {
        throw new Error(`${creator.displayName} is not live or has no stream URL`);
      }
      stream = {
        creatorId: creator.id,
        creatorName: creator.displayName,
        platformId: job?.pluginId ?? creator.pluginId,
        title: lastResult.title ?? `${creator.displayName} live`,
        streamUrl: lastResult.streamUrl,
        thumbnail: lastResult.thumbnail,
        startedAt: lastResult.startedAt,
      };
    } else {
      stream = { ...stream, creatorId: creator.id, creatorName: creator.displayName };
    }
    // Duplicate guard — same as the auto-record path.
    const ACTIVE_STATUSES = ['queued', 'preparing', 'recording', 'paused', 'stopping'];
    const hasActive = recording
        .getJobs()
      .some(
        (j) => ACTIVE_STATUSES.includes(j.status) && j.creatorId !== null && j.creatorId === creator.id,
      );
    if (hasActive) {
      throw new Error(`${creator.displayName} already has an active recording.`);
    }
    return recording.startRecording(stream, startOptions);
  };

  // ponytail: Telegram two-way control — button taps on the bot's pushes can
  // start (with the full Record-dialog option wizard) and stop/pause/resume
  // recordings. Only listens to the configured chat; no token = inert.
  const telegramCommands = new TelegramCommandService({
    logger,
    getSettings: () => settings.getAll().pushNotifications,
    getAllowedChatIds: () => [settings.getAll().pushNotifications.telegramChatId],
    startRecording: (target, options) => startRecordingForCreator(target.creatorDbId, options),
    findActiveJob: (creatorDbId) => {
      const job = recording
        .getJobs()
        .find((j) => j.creatorId === creatorDbId && isActiveJobStatus(j.status));
      return job !== undefined ? { jobId: job.id, status: job.status, title: job.title } : undefined;
    },
    pauseRecording: (jobId) => recording.pauseRecording(jobId),
    resumeRecording: (jobId) => recording.resumeRecording(jobId),
    stopRecording: (jobId) => recording.cancelRecording(jobId),
  });
  telegramCommands.start();

  // ponytail: embedded secure proxy (Tor). Reachability of a cam site is a
  // USER-network property (ISP/DNS blocks are regional), so routing is a
  // per-creator opt-in (`creators.use_proxy`, Add/Edit dialog) — the service
  // starts lazily only when a flagged creator is checked/recorded and never
  // touches traffic for anyone else. Download of the runtime happens once,
  // on first use (zero user configuration).
  const tor = new TorService({
    rootDir: join(userDataPath, 'tor'),
    logger,
    isProxied: (identifier) => {
      const [pluginId, externalId] = identifier.split(':');
      if (pluginId === undefined || externalId === undefined) return false;
      try {
        return creatorRepo.getByExternal(pluginId, externalId)?.useProxy === true;
      } catch {
        return false;
      }
    },
  });
  tor.onStatusChanged((status) => {
    if (status.state === 'error') {
      notifications.send({
        level: 'error',
        title: 'Secure proxy failed',
        message: status.message ?? 'The secure proxy could not be started.',
      });
    }
    sendToRenderer(IPC_CHANNELS.proxyEvent, {
      state: status.state,
      message: status.message,
    });
  });

  const pluginManager = new PluginManager({
    searchDirs: [dirs.pluginsDir, ...devPluginDirs(), ...bundledPluginDirs()],
    installDir: dirs.pluginsDir,
    dataRootDir: dirs.pluginDataDir,
    appVersion: app.getVersion(),
    repo: pluginRepo,
    logger,
    notifications,
    proxyNetwork: tor,
  });

  // ponytail: OS-level autostart follows the launchAtStartup setting
  const applyLaunchAtStartup = (enabled: boolean): void => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: enabled && settings.getAll().startMinimized,
    });
  };
  applyLaunchAtStartup(settings.getAll().launchAtStartup);
  // ponytail: keep the OS-level theme (native title bar, menus, dialogs) in
  // sync with the in-app theme setting.
  const applyNativeTheme = (theme: string): void => {
    nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark';
  };
  applyNativeTheme(settings.getAll().theme);
  settings.onChanged((next) => {
    applyLaunchAtStartup(next.launchAtStartup);
    applyNativeTheme(next.theme);
  });

  const sendToRenderer = (channel: string, payload: unknown): void => {
    if (isWindowUsable(mainWindow)) {
      try {
        mainWindow.webContents.send(channel, payload);
      } catch {
        /* renderer gone — event dropped */
      }
    }
  };

  notifications.onNotification((record) => {
    const prefs = settings.getAll();
    // ponytail: honor the per-level notification switches — previously these
    // toggles were saved but every notification was always forwarded/shown.
    const levelAllowed =
      record.level === 'error' || record.level === 'fatal'
        ? prefs.notifyFailures
        : record.level === 'warn'
          ? prefs.notifyWarnings
          : prefs.notifyCompletion;
    if (!levelAllowed) {
      return;
    }
    sendToRenderer(IPC_CHANNELS.notificationsEvent, record);
    if (prefs.desktopNotificationsEnabled && ElectronNotification.isSupported()) {
      new ElectronNotification({ title: record.title, body: record.message }).show();
    }
  });

  for (const type of [
    'loaded',
    'enabled',
    'disabled',
    'failed',
    'updated',
    'installed',
    'removed',
    'unloaded',
    'health-changed',
  ] as const) {
    pluginManager.on(type, (payload) => {
      sendToRenderer(IPC_CHANNELS.pluginsEvent, {
        type,
        pluginId: payload.pluginId,
        version: 'version' in payload ? payload.version : undefined,
        error: 'error' in payload ? { code: payload.error.code, message: payload.error.message } : undefined,
        healthy: 'healthy' in payload ? payload.healthy : undefined,
      });
    });
  }

  // ponytail: a single bad plugin row / missing folder must never block boot
  // (window creation happens much later — a throw here used to leave the app
  // headless holding the single-instance lock).
  try {
    await pluginManager.initialize();
  } catch (err) {
    logger.error({ err }, 'plugin initialization failed — continuing without plugins');
  }

  const monitoring = new MonitoringService({
    repo: monitoringRepo,
    pluginManager,
    notifications,
    logger,
    baseIntervalMs: settings.getAll().checkIntervalSeconds * 1000,
    // ponytail: Low-Resource Mode also throttles parallel live checks —
    // each check can hit the network hard, and 5 simultaneous checks
    // contributed to system-wide stalls on smaller machines.
    maxConcurrent: settings.getAll().lowResourceMode ? 2 : 5,
  });

  const recording = new RecordingService({
    repo: recordingRepo,
    notifications,
    logger,
    defaultOutputDir: settings.getAll().recordingsDir,
    // ponytail: resume support — re-resolve the live stream through the
    // plugin when a cancelled recording is resumed. Returning null means
    // the broadcast is no longer live and resume fails with STREAM_OFFLINE.
    // ponytail: Low-Resource Mode caps concurrent recordings to a single
    // slot and skips thumbnail generation (read live on every decision).
    isLowResourceMode: () => settings.getAll().lowResourceMode,
    // ponytail: launch-time disk guard for the staggered-start pump (plan §9)
    // — reuses the existing Settings → Recording floor, so queued starts park
    // instead of filling the drive.
    getMinFreeBytes: () => {
      const gb = settings.getAll().autoRecordMinFreeDiskGb;
      return gb > 0 ? gb * 1024 ** 3 : 0;
    },
    // ponytail: Settings → Recording → Advanced compression knob for the
    // "(480p)" derivative transcodes. Read live per transcode so changing
    // the setting applies to the next recording without a restart.
    // quality → best fidelity; size → roughly half the bitrate at 480p.
    getDerivativeCrf: () => {
      switch (settings.getAll().recordingCompression) {
        case 'quality':
          return 22;
        case 'size':
          return 27;
        default:
          return 23;
      }
    },
    resolveStream: async (job) => {
      const managed = pluginManager.get(job.platformId);
      const detection = managed?.instance?.capabilities.liveDetection;
      const extraction = managed?.instance?.capabilities.streamExtraction;
      if (extraction === undefined) return null;

      // Resolve the plugin-facing identifier ("plugin:username") for the job.
      let identifier: string | null = null;
      const jobCreatorId = job.creatorId;
      if (typeof jobCreatorId === 'string' && jobCreatorId !== '') {
        const creator = creatorRepo.get(jobCreatorId);
        if (creator !== undefined) {
          identifier = `${job.platformId}:${creator.externalId}`;
        }
      }
      if (identifier === null) return null;

      try {
        const status = await detection?.getLiveStatus(identifier);
        if (status !== undefined && !status.isLive) return null;
      } catch (err) {
        logger.warn({ jobId: job.id, err }, 'live check failed during resume — attempting extraction');
      }
      // ponytail: re-extractions must stay on the variant the user picked —
      // a resumed VR recording would otherwise come back as 2D.
      return await extraction.extractStream(identifier, { streamType: job.streamType ?? undefined });
    },
  });

  // ponytail: jobs left non-terminal by a previous crash/restart are
  // reconciled on boot — recordings whose yt-dlp/ffmpeg child kept running
  // while the app was closed are re-adopted and finalized when they finish
  // (autonomous recorder); the rest are marked failed so no zombie
  // recording cards linger after boot.
  // ponytail: never let a torn row / dead-pid scan block boot — a force-kill
  // mid-recording is exactly when this runs, and a throw here used to leave
  // the app headless ("running in Task Manager but won't open").
  try {
    await recording.recoverStaleJobs();
  } catch (err) {
    logger.error({ err }, 'stale recording recovery failed — continuing with jobs as-is');
  }

  const downloads = new DownloadManager({
    repo: downloadRepo,
    notifications,
    logger,
    // ponytail: generic downloads get their own root folder; each website is
    // auto-organized into a subfolder (see DownloadManager.addDownload).
    defaultDestinationDir: () => settings.getAll().downloadsDir,
    getLimits: () => {
      const prefs = settings.getAll();
      return {
        // ponytail: Low-Resource Mode forces one download at a time so an
        // HDD is never hit with parallel writes.
        maxConcurrentDownloads: prefs.lowResourceMode
          ? Math.min(1, prefs.maxConcurrentDownloads)
          : prefs.maxConcurrentDownloads,
        downloadBandwidthLimit: prefs.downloadBandwidthLimit,
      };
    },
  });

  const uploads = new UploadService({
    repo: uploadRepo,
    notifications,
    logger,
    // ponytail: concurrency is user-configurable (Settings → Cloud Storage);
    // Low-Resource Mode forces one upload at a time, same as downloads.
    getLimits: () => {
      const prefs = settings.getAll();
      return {
        maxConcurrentUploads: prefs.lowResourceMode
          ? 1
          : prefs.maxConcurrentUploads,
      };
    },
  });

  const uploadProviderSettings = settings.getAll().uploadProviders;

  uploads.registerProvider(new GofileProvider({
    logger,
    getToken: () => uploadProviderSettings.gofile?.token,
  }));

  uploads.registerProvider(new CatboxProvider({
    logger,
    getUserhash: () => uploadProviderSettings.catbox?.userhash,
  }));

  // ponytail: credential providers (MixDrop, Google Drive) must react to
  // settings saves — previously they were registered once at startup, so
  // credentials entered in Settings had no effect until the app restarted.
  const syncCredentialProviders = (): void => {
    const prefs = settings.getAll().uploadProviders;
    const mixdropReady =
      prefs.mixdrop?.enabled !== false && !!prefs.mixdrop?.email && !!prefs.mixdrop?.apiKey;
    const driveReady =
      prefs['google-drive']?.enabled !== false &&
      !!prefs['google-drive']?.clientId &&
      !!prefs['google-drive']?.clientSecret &&
      !!prefs['google-drive']?.refreshToken;

    if (mixdropReady && !uploads.getProviders().some((p) => p.id === 'mixdrop')) {
      uploads.registerProvider(new MixDropProvider({
        logger,
        getEmail: () => settings.getAll().uploadProviders.mixdrop?.email,
        getKey: () => settings.getAll().uploadProviders.mixdrop?.apiKey,
      }));
    } else if (!mixdropReady) {
      uploads.unregisterProvider('mixdrop');
    }

    if (driveReady && !uploads.getProviders().some((p) => p.id === 'google-drive')) {
      uploads.registerProvider(new GoogleDriveProvider({
        logger,
        getClientId: () => settings.getAll().uploadProviders['google-drive']?.clientId,
        getClientSecret: () => settings.getAll().uploadProviders['google-drive']?.clientSecret,
        getRefreshToken: () => settings.getAll().uploadProviders['google-drive']?.refreshToken,
        setRefreshToken: (token: string) => {
          const current = settings.getAll().uploadProviders;
          settings.set({
            uploadProviders: {
              ...current,
              'google-drive': {
                enabled: current['google-drive']?.enabled ?? true,
                clientId: current['google-drive']?.clientId,
                clientSecret: current['google-drive']?.clientSecret,
                refreshToken: token,
              },
            },
          });
        },
      }));
    } else if (!driveReady) {
      uploads.unregisterProvider('google-drive');
    }
  };
  syncCredentialProviders();
  settings.onChanged(() => syncCredentialProviders());

  // ponytail: post-recording automation pipeline (tag → compress → move →
  // upload → delete-after-upload). Runs in the background on every finished
  // recording; failures are logged and pushed, never fatal.
  const ffmpeg = new FfmpegService();
  const automation = new AutomationService({
    repo: recordingRepo,
    ffmpeg,
    uploads,
    push,
    logger,
    getSettings: () => settings.getAll().autoActions,
    // Low-Resource Mode keeps a single pipeline slot — no parallel ffmpeg.
    maxConcurrent: 1,
  });
  // ponytail: a changed upload concurrency limit (or Low-Resource toggle)
  // must wake the queue so waiting uploads start under the new limit.
  settings.onChanged(() => uploads.notifyLimitsChanged());

  // Push notification when a cloud upload finishes (link included when the
  // provider returns one — e.g. Gofile/Catbox).
  uploads.on('upload-completed', ({ uploadId }) => {
    const item = uploads.getUpload(uploadId);
    if (item === undefined) return;
    push.uploadCompleted(
      item.destinationPath ?? item.sourcePath,
      item.providerId,
      item.destinationPath?.startsWith('http') === true ? item.destinationPath : undefined,
    );
  });

  const storage = new StorageService({
    repo: recordingRepo,
    dirs,
    logger,
  });

  const jobs = new BackgroundJobService({
    repo: jobRepo,
    logger,
  });

  const hardware = new HardwareService({ logger, probeDir: dirs.recordingsDir });

  // ponytail: mass-capture gate (plan §10) — at 5+ live recordings both
  // resource monitors drop to a ~10s cadence so tasklist/powershell spawns
  // stop stealing CPU from the capture workers themselves.
  const isMassRecordingLoad = (): boolean =>
    recording.getJobs().filter((job) => job.status === 'recording').length >= 5;

  // ponytail: process monitor polls child process (yt-dlp/ffmpeg) PIDs for
  // CPU/memory usage, giving the UI visibility into recording resource impact.
  const processMonitor = new ProcessMonitorService({
    logger,
    getActivePids: () => recording.getActiveChildPids(),
    pollIntervalMs: 2000,
    massPollIntervalMs: 10_000,
    isMassLoad: isMassRecordingLoad,
  });

  // ponytail: network monitor polls network interface counters to calculate
  // real-time bandwidth usage across all active recordings.
  const networkMonitor = new NetworkMonitorService({
    logger,
    pollIntervalMs: 1500,
    massPollIntervalMs: 10_000,
    isMassLoad: isMassRecordingLoad,
  });

  trayController = new TrayController({ getWindow: () => mainWindow, logger });
  const tray = trayController;

  // Start monitoring on app ready
  // ponytail: stale rows from a force-killed session must not block boot —
  // a throw here used to prevent window creation entirely (headless lock holder).
  try {
    await monitoring.start();
  } catch (err) {
    logger.error({ err }, 'monitoring failed to start — continuing without live checks');
  }

  // Start resource monitors
  try {
    processMonitor.start();
  } catch (err) {
    logger.error({ err }, 'process monitor failed to start');
  }
  try {
    networkMonitor.start();
  } catch (err) {
    logger.error({ err }, 'network monitor failed to start');
  }

  // Start the generic download engine and forward its events to the renderer.
  // ponytail: transfers die with the process — anything still 'downloading'
  // is re-queued inside start(); a torn row there must not block the window.
  try {
    downloads.start();
  } catch (err) {
    logger.error({ err }, 'download scheduler failed to start — downloads paused until restart');
  }
  // Start the cloud upload worker (Gofile and any registered providers).
  try {
    uploads.start();
  } catch (err) {
    logger.error({ err }, 'upload worker failed to start');
  }
  uploads.on('upload-queued', ({ uploadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.uploadsEvent, { type: 'upload-queued', uploadId, timestamp });
  });
  uploads.on('upload-started', ({ uploadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.uploadsEvent, { type: 'upload-started', uploadId, timestamp });
  });
  uploads.on('upload-progress', ({ uploadId, percent, speed, eta, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.uploadsEvent, { type: 'upload-progress', uploadId, percent, speed, eta, timestamp });
  });
  uploads.on('upload-completed', ({ uploadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.uploadsEvent, { type: 'upload-completed', uploadId, timestamp });
  });
  uploads.on('upload-failed', ({ uploadId, error, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.uploadsEvent, { type: 'upload-failed', uploadId, error, timestamp });
  });
  uploads.on('upload-cancelled', ({ uploadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.uploadsEvent, { type: 'upload-cancelled', uploadId, timestamp });
  });
  uploads.on('upload-removed', ({ uploadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.uploadsEvent, { type: 'upload-removed', uploadId, timestamp });
  });
  uploads.on('upload-paused', ({ uploadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.uploadsEvent, { type: 'upload-paused', uploadId, timestamp });
  });
  uploads.on('upload-resumed', ({ uploadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.uploadsEvent, { type: 'upload-resumed', uploadId, timestamp });
  });
  downloads.on('download-queued', ({ downloadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.downloadsEvent, { type: 'download-queued', downloadId, timestamp });
  });
  downloads.on('download-started', ({ downloadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.downloadsEvent, { type: 'download-started', downloadId, timestamp });
  });
  downloads.on('download-progress', ({ downloadId, percent, speed, eta, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.downloadsEvent, { type: 'download-progress', downloadId, percent, speed, eta, timestamp });
  });
  downloads.on('download-paused', ({ downloadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.downloadsEvent, { type: 'download-paused', downloadId, timestamp });
  });
  downloads.on('download-resumed', ({ downloadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.downloadsEvent, { type: 'download-resumed', downloadId, timestamp });
  });
  downloads.on('download-completed', ({ downloadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.downloadsEvent, { type: 'download-completed', downloadId, timestamp });
  });
  downloads.on('download-failed', ({ downloadId, error, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.downloadsEvent, { type: 'download-failed', downloadId, error, timestamp });
  });
  downloads.on('download-cancelled', ({ downloadId, timestamp }) => {
    sendToRenderer(IPC_CHANNELS.downloadsEvent, { type: 'download-cancelled', downloadId, timestamp });
  });

  // ponytail: auto-record is OPT-IN PER CREATOR (creators.auto_record) — a
  // global default would silently record every live creator and pile up
  // storage. Two safety layers remain: the Settings master pause switch and
  // the free-disk guardrail.
  monitoring.on('event', (event) => {
    if (event.type !== 'creator-live' || event.creatorId === undefined) return;
    const settingsNow = settings.getAll();
    if (settingsNow.autoRecordPaused) return;

    // ponytail: DEGRADED-CHECK RETRY — the monitoring service re-emits
    // creator-live during unknown (site-unreachable) checks when the creator
    // is believed live. The stream was not re-verified, so: no repeat
    // "X is live" pushes, extraction failures stay quiet (a warn log), and
    // every failed attempt re-arms the edge — the pipeline retries itself
    // each retry window until a clean check lands. This is what makes
    // auto-record fire for a live creator even while the site's transport
    // keeps erroring (ECONNRESET / TLS resets).
    const degradedRetry = event.retryable === true;

    // Resolve the tracked creator FIRST — auto-record requires the per-creator
    // opt-in; untracked creators (not in the DB) are never auto-recorded.
    const [pluginId, externalId] = (event.creatorId ?? '').split(':');
    const tracked =
      pluginId !== undefined && externalId !== undefined
        ? creatorRepo.getByExternal(pluginId, externalId)
        : undefined;

    // Push notification fires for any tracked creator going live — the
    // auto-record opt-in below must not gate "X is live" pushes. The text is
    // honest about auto-record state, and Telegram gets interactive
    // Record/Stop buttons driven by TelegramCommandService.
    if (tracked !== undefined && !degradedRetry) {
      const autoRecord = tracked.autoRecord && !settingsNow.autoRecordPaused;
      push.creatorLive(tracked.displayName, tracked.pluginId, {
        autoRecord,
      });
      void telegramCommands
        .sendLiveMessage({
          creatorName: tracked.displayName,
          platformId: tracked.pluginId,
          title: event.data?.title,
          autoRecord,
          creatorDbId: tracked.id,
        })
        .catch((err) => logger.debug?.({ error: err }, 'telegram live push failed'));
    }

    if (tracked === undefined || !tracked.autoRecord) return;

    void (async () => {
      // Storage guardrail: never fill the user's disk silently.
      const minFreeGb = settingsNow.autoRecordMinFreeDiskGb;
      if (minFreeGb > 0) {
        try {
          const stats = await statfs(dirs.recordingsDir);
          const freeBytes = stats.bavail * stats.bsize;
          if (freeBytes < minFreeGb * 1024 ** 3) {
            notifications.send({
              level: 'warn',
              title: 'Auto-record skipped — low disk space',
              message: `${tracked.displayName} is live, but free space is below the ${minFreeGb} GB limit (Settings → Recording).`,
              data: { creatorId: event.creatorId, freeBytes },
            });
            logger.warn({ creatorId: event.creatorId, freeBytes }, 'auto-record skipped — disk guardrail');
            // Re-arm the live edge so a later check retries once space frees up.
            monitoring.rearmLive(event.creatorId!);
            return;
          }
        } catch (err) {
          logger.warn({ err }, 'disk guardrail check failed — continuing with auto-record');
        }
      }

      // ponytail: resolve the stream through the plugin's extractStream — for
      // platforms like Stripchat the raw live-check URL is not directly
      // recordable (MOUFLON-obfuscated segments); extractStream returns a
      // properly prepared StreamObject (local de-obfuscating proxy URL,
      // headers, cookies).
      let stream: StreamObject | null = null;
      const managed = event.pluginId !== undefined ? pluginManager.get(event.pluginId) : undefined;
      const extract = managed?.instance?.capabilities.streamExtraction;
      if (extract !== undefined) {
        // ponytail: bounded concurrency — see extractionSlots above.
        const releaseSlot = await extractionSlots.acquire();
        try {
          stream = await extract.extractStream(event.creatorId!, {
            // ponytail: no per-creator stream type for auto-record yet — the
            // plugin's own default (its "Preferred stream type" setting)
            // applies. The hint stays undefined here by design.
            streamType: undefined,
          });
        } catch (err) {
          logger.warn({ creatorId: event.creatorId, error: err }, 'extractStream failed for auto-record');
        } finally {
          releaseSlot();
        }
      }
      if (stream === null) {
        if (event.data?.streamUrl === undefined) {
          // ponytail: degraded retries stay quiet — a notification per retry
          // window would spam while the site is unreachable; the next check
          // retries automatically.
          if (degradedRetry) {
            logger.warn(
              { creatorId: event.creatorId },
              'auto-record degraded retry — stream not extractable yet, will retry',
            );
          } else {
            notifications.send({
              level: 'warn',
              title: 'Auto-record failed',
              message: `${tracked.displayName} went live, but the stream could not be extracted.`,
              data: { creatorId: event.creatorId },
            });
          }
          // Re-arm: the next monitoring poll retries extraction for this session.
          monitoring.rearmLive(event.creatorId!);
          return;
        }
        stream = {
          creatorId: event.creatorId ?? '',
          creatorName: event.creatorId?.split(':').pop() ?? '',
          platformId: event.pluginId ?? '',
          title: event.data.title ?? `${event.creatorId} live`,
          streamUrl: event.data.streamUrl,
          thumbnail: event.data.thumbnail,
          startedAt: event.data.startedAt,
        };
      }
      // ponytail: recording_jobs.creator_id is a FK to creators.id (a DB
      // uuid) — the monitor id ("plugin:username") would violate it.
      stream = { ...stream, creatorId: tracked.id, creatorName: tracked.displayName };
      // ponytail: never start a duplicate recording for a creator that
      // already has an active session — a second extractStream tears down
      // the Mouflon proxy the running recorder depends on (ffmpeg
      // "Connection refused" on 127.0.0.1), e.g. right after a resume.
      const ACTIVE_JOB_STATUSES = ['queued', 'preparing', 'recording', 'paused', 'stopping'];
      const hasActiveSession = recording.getJobs().some((j) =>
        ACTIVE_JOB_STATUSES.includes(j.status) &&
        (stream.creatorId !== '' ? j.creatorId === stream.creatorId : j.title === stream.title),
      );
      if (hasActiveSession) {
        logger.debug({ creatorId: event.creatorId }, 'auto-record skipped — session already active');
        return;
      }
      await recording.startRecording(stream, {
        quality: tracked.autoRecordQuality ?? 'best',
        // ponytail: persist which variant the plugin chose so segment chains
        // and resumes re-request the same one.
        streamType: stream.metadata?.streamType,
        segmentMinutes: settingsNow.autoRecordSegmentMinutes > 0 ? settingsNow.autoRecordSegmentMinutes : undefined,
        // ponytail: mark the chain origin — `recording-segment-finished`
        // round-trips this so the chain handler knows which guardrails
        // apply. Manual/Telegram starts leave it unset (ungated chaining).
        autoRecord: true,
      });
      notifications.send({
        level: 'info',
        title: 'Auto-record started',
        message: `${tracked.displayName} went live — recording automatically.`,
        data: { creatorId: event.creatorId },
      });
    })().catch((err) => {
      logger.error({ creatorId: event.creatorId, error: err }, 'auto-recording failed');
      // ponytail: degraded retries fail quietly — the retry loop already
      // surfaces persistent problems via logs; a toast per attempt would
      // spam on flaky networks.
      if (!degradedRetry) {
        notifications.send({
          level: 'error',
          title: 'Auto-record failed',
          message: err instanceof Error ? err.message : 'Unknown error',
          data: { creatorId: event.creatorId },
        });
      }
      // Re-arm the live edge so the next poll retries the failed auto-record.
      if (event.creatorId !== undefined) monitoring.rearmLive(event.creatorId);
    });
  });

  // ponytail: when a monitored stream ends, gracefully finalize its recording
  // instead of letting the downloader run until it errors out. Recording jobs
  // are keyed by the creators-table uuid (see startRecording), so resolve the
  // monitor id ("plugin:username") to the DB uuid first.
  monitoring.on('event', (event) => {
    if (event.type !== 'creator-offline' || event.creatorId === undefined) return;
    const [pluginId, externalId] = (event.creatorId ?? '').split(':');
    const tracked =
      pluginId !== undefined && externalId !== undefined
        ? creatorRepo.getByExternal(pluginId, externalId)
        : undefined;
    const creatorKey = tracked !== undefined ? tracked.id : event.creatorId;
    recording.stopForCreator(creatorKey).catch((err) => {
      logger.error({ creatorId: event.creatorId, error: err }, 'failed to finalize recording');
    });
  });

  // ponytail: PROFILE PHOTOS — the Add form may have added a creator with no
  // avatar (manual entry). On every successful check AND whenever a creator
  // goes live (a moment we know the platform answers), ask the plugin for the
  // upstream profile and backfill missing/stale photos into the DB. Rate-
  // limited inside refreshCreatorAvatar (≈2 min retry / 7d refresh), so this
  // cheap listener can fire on each event.
  monitoring.on('event', (event) => {
    if (event.creatorId === undefined) return;
    if (event.type !== 'creator-checked' && event.type !== 'creator-live') return;
    const [pluginId, externalId] = (event.creatorId ?? '').split(':');
    const tracked =
      pluginId !== undefined && externalId !== undefined
        ? creatorRepo.getByExternal(pluginId, externalId)
        : undefined;
    if (tracked === undefined) return;
    void refreshCreatorAvatar({ plugins: pluginManager, creatorRepo, logger }, tracked).catch((err) => {
      logger.warn({ creatorId: tracked.id, error: err }, 'creator avatar refresh crashed');
    });
  });

  // ponytail: segment chaining — a duration-capped segment just finished
  // cleanly (split setting, manual OR auto-record). Re-run the guardrails and
  // start the next part with a fresh timestamped file. Always re-extract a
  // fresh stream (new proxy + fresh signed playlist URL) before starting the
  // next segment — the old proxy URL is stale by the time the next segment
  // starts (proxy idle timeout or signed URL expiration).
  //
  // ponytail: MANUAL segments chain too. The old handler required
  // `tracked.autoRecord` and returned SILENTLY otherwise — a recording
  // started from the Record dialog (or Telegram) with the split option saved
  // its first part and then just stopped, with no error anywhere (the exact
  // "splitting silently stops" report). Chains now remember their origin
  // (options.autoRecord, round-tripped by the recording service): auto-record
  // chains keep every guardrail (master pause, opt-in), manual chains only
  // require the creator to still be tracked.
  //
  // ponytail: the hand-off is PERSISTED (segment-chain-store) — the live
  // check + plugin re-extraction can take a minute or longer, and a quit,
  // crash, update or dev-mode rebuild during that window used to silently
  // kill the chain (the plumhaze 15-min/5-part report: one part, then
  // "stopped" with zero errors — the app closed before the stripchat
  // re-extraction ever landed). The intent is on disk before any network
  // work, and boot recovery picks it back up.
  recording.on('event', (event) => {
    if (event.type !== 'recording-segment-finished') return;
    const stream = event.data?.['stream'] as StreamObject | undefined;
    const opts = event.data?.['options'] as ChainIntentOptions | undefined;
    if (stream === undefined || opts === undefined) return;
    void (async () => {
      const tracked = stream.creatorId !== '' ? creatorRepo.get(stream.creatorId) : undefined;
      if (tracked === undefined) {
        logger.info({ creatorId: stream.creatorId }, 'segment chain stopped — creator no longer tracked');
        return;
      }
      // Auto-record chains stop cleanly when the opt-in was revoked
      // mid-stream; manual chains have no auto-record dependency.
      const isAutoChain = opts.autoRecord === true;
      if (isAutoChain && !tracked.autoRecord) return;

      // ponytail: PERSIST BEFORE ANY NETWORK WORK — the exact moment a
      // restart during the extraction window stops losing the chain.
      persistChainIntent(dirs.userData, {
        creatorId: tracked.id,
        options: {
          quality: opts.quality,
          durationMinutes: opts.durationMinutes,
          sessionStartedAt: typeof opts.sessionStartedAt === 'number' ? opts.sessionStartedAt : undefined,
          segmentMinutes: opts.segmentMinutes,
          streamType: opts.streamType,
          autoRecord: isAutoChain || undefined,
        },
        startedAt: new Date().toISOString(),
      });
      try {
        await startNextChainPart(tracked, opts, isAutoChain);
      } finally {
        // The attempt RESOLVED (part started, or the chain stopped for a
        // definitive reason) — drop the disk hint so a later crash recovery
        // does not re-launch a finished chain. A crash mid-attempt leaves the
        // pending entry for boot recovery, which re-validates everything.
        clearChainIntent(dirs.userData, tracked.id);
      }
    })().catch((err) => {
      logger.error({ error: err }, 'segment chain failed');
    });
  });

  // ponytail: BOOT RECOVERY — any chain that a restart or crash interrupted
  // mid-hand-off resumes here instead of dying silently.
  const recoverChainIntents = async (): Promise<void> => {
    const pending = readChainIntents(dirs.userData);
    if (pending.length === 0) return;
    logger.info({ count: pending.length }, 'persisted segment chains found — recovering interrupted part hand-offs');
    for (const intent of pending) {
      try {
        const tracked = creatorRepo.get(intent.creatorId);
        if (tracked === undefined) {
          clearChainIntent(dirs.userData, intent.creatorId);
          continue;
        }
        // Give plugins/monitoring a beat to settle after boot before the
        // live check + re-extraction (which may boot a site's browser).
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 5000);
          timer.unref?.();
        });
        await startNextChainPart(tracked, intent.options, intent.options.autoRecord === true);
        clearChainIntent(dirs.userData, intent.creatorId);
      } catch (err) {
        logger.warn({ creatorId: intent.creatorId, error: err }, 'segment chain recovery failed');
        clearChainIntent(dirs.userData, intent.creatorId);
      }
    }
  };
  void recoverChainIntents().catch((err) => {
    logger.error({ error: err }, 'segment chain crash recovery crashed');
  });

  /** Re-run guardrails, live-check and extraction to start the next part. */
  async function startNextChainPart(
    tracked: {
      id: string;
      displayName: string;
      pluginId: string;
      externalId: string;
      autoRecord: boolean;
    },
    opts: ChainIntentOptions,
    isAutoChain: boolean,
  ): Promise<void> {
    // The master pause switch pauses AUTO-RECORD — a manually started
    // segmented recording must keep recording through it.
    if (isAutoChain && settings.getAll().autoRecordPaused) return;
    // Auto-record chains stop cleanly when the opt-in was revoked
    // mid-stream; manual chains have no auto-record dependency.
    if (isAutoChain && !tracked.autoRecord) return;

    // duplicate-session guard FIRST (no network work while a capture runs —
    // a manual recording may have started in the meantime)
    const ACTIVE_JOB_STATUSES = ['queued', 'preparing', 'recording', 'paused', 'stopping'];
    if (recording.getJobs().some((j) => ACTIVE_JOB_STATUSES.includes(j.status) && j.creatorId === tracked.id)) {
      return;
    }

    // disk guardrail (same as the auto-record entry path)
    const minFreeGb = settings.getAll().autoRecordMinFreeDiskGb;
    if (minFreeGb > 0) {
      const stats = await statfs(dirs.recordingsDir);
      const freeBytes = stats.bavail * stats.bsize;
      if (freeBytes < minFreeGb * 1024 ** 3) {
        notifications.send({
          level: 'warn',
          title: 'Recording split paused — low disk space',
          message: `Segment chain for ${tracked.displayName} stopped: free space is below the ${minFreeGb} GB limit.`,
          data: { creatorId: tracked.id, freeBytes },
        });
        return;
      }
    }

    // still live? if the stream ended, the chain stops cleanly here.
    // ponytail: the live check is RETRIED — a flaky site used to kill the
    // whole chain silently right here: `.catch(() => ({ isLive: false }))`
    // fed a degraded check into the "stream ended" branch even though the
    // broadcast was fine (the monitor module hit and verified the same
    // class of bug against BongaCams). A degraded/unknown answer is NEITHER
    // live nor ended; only a DEFINITIVE offline answer ends the chain.
    const monitorId = `${tracked.pluginId}:${tracked.externalId}`;
    const managed = pluginManager.get(tracked.pluginId);

    const detection = managed?.instance?.capabilities.liveDetection;
    if (detection === undefined) {
      logger.warn({ creatorId: monitorId }, 'segment chain stopped — plugin has no live detection');
      return;
    }
    let liveStatus: { isLive: boolean } | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 3000);
          timer.unref?.();
        });
      }
      const status = await detection
        .getLiveStatus(monitorId)
        .catch((err: unknown) => {
          logger.warn({ creatorId: monitorId, error: err, attempt }, 'segment chain live-check failed — retrying');
          return undefined;
        });
      if (status === undefined) continue;
      if (status.unknown === true) {
        logger.info(
          { creatorId: monitorId, attempt },
          'segment chain live-check degraded (site unreachable) — retrying',
        );
        continue;
      }
      liveStatus = status;
      break;
    }
    if (liveStatus === null) {
      // ponytail: degraded through every attempt — that is NOT "stream
      // ended". Treat the creator as live and restart capture: the
      // re-extraction below decides whether the broadcast is actually
      // reachable, and its failure surfaces visibly (notification) instead
      // of this chain dying silently.
      logger.warn(
        { creatorId: monitorId },
        'segment chain live-check stayed degraded — restarting capture anyway',
      );
    } else if (!liveStatus.isLive) {
      logger.info({ creatorId: monitorId }, 'segment chain stopped — stream ended');
      if (!isAutoChain) {
        notifications.send({
          level: 'info',
          title: 'Recording split finished',
          message: `${tracked.displayName}'s stream ended — the split recording chain stopped. All finished parts were saved to your Library.`,
          data: { creatorId: tracked.id },
        });
      }
      return;
    }

    // ponytail: VISIBLE HAND-OFF — the stripchat re-extraction boots a
    // browser and can take a minute or longer; with no signal the user
    // reads the app as "stopped after the split" and closes it (which then
    // DOES kill the pending part). Announce the continuation before the
    // first slow step, and log the carried options so a mis-carried quality
    // / budget / variant is traceable from the log alone.
    logger.info(
      {
        creatorId: monitorId,
        quality: opts.quality,
        durationMinutes: opts.durationMinutes,
        sessionStartedAt: opts.sessionStartedAt,
        segmentMinutes: opts.segmentMinutes,
        streamType: opts.streamType,
        autoRecord: isAutoChain,
      },
      'segment chain — starting next part with the same options (live check passed, re-extracting)',
    );
    notifications.send({
      level: 'info',
      title: 'Recording split continuing',
      message: `${tracked.displayName}'s recording was split at ${opts.segmentMinutes} minutes — preparing the next part…`,
      data: { creatorId: tracked.id },
    });

    // ponytail: keep the stream variant across segment chains — a VR pick
    // must not silently degrade to 2D on the next part. The chain origin is
    // carried too, so later parts keep the same guardrail policy. The
    // stop-after budget rides along as well: durationMinutes is the TOTAL
    // session length and sessionStartedAt is part 1's anchor, so every
    // chained part clamps to the same budget (30-min recording split every
    // 15 min = exactly 2 parts, not a forever chain).
    const startOpts = {
      quality: opts.quality,
      durationMinutes: opts.durationMinutes,
      segmentMinutes: opts.segmentMinutes,
      sessionStartedAt:
        typeof opts.sessionStartedAt === 'number' ? opts.sessionStartedAt : undefined,
      streamType: opts.streamType,
      autoRecord: isAutoChain,
    };
    try {
      await reExtractAndStart(tracked, monitorId, managed, startOpts);
    } catch (err) {
      logger.error({ creatorId: monitorId, error: err }, 'segment chain re-extract failed');
      notifications.send({
        level: 'error',
        title: isAutoChain ? 'Auto-record stopped' : 'Recording split stopped',
        message: `${tracked.displayName}'s segmented recording could not continue: ${err instanceof Error ? err.message : 'unknown error'}`,
        data: { creatorId: tracked.id },
      });
    }
  }

  // Push notifications (Discord/Telegram) + post-recording automation
  // pipeline, driven off the recording event stream.
  // ponytail: "recording started" push with Pause/Resume/Stop buttons — the
  // user can control an active capture from Telegram. Also feeds the
  // previously-dead notifyOnRecordingStarted setting.
  recording.on('event', (event) => {
    if (event.type !== 'recording-started') return;
    const job = recording.getJobs().find((j) => j.id === event.jobId);
    if (job === undefined) return;
    // recording_jobs has no creator name column — resolve via the tracked row.
    const creatorRow =
      job.creatorId !== null && job.creatorId !== undefined ? creatorRepo.get(job.creatorId) : undefined;
    const name = creatorRow?.displayName ?? job.title;
    push.recordingStarted(name, job.title);
    if (creatorRow !== undefined) {
      void telegramCommands
        .sendRecordingStartedMessage({
          creatorName: name,
          title: job.title,
          jobId: job.id,
          creatorDbId: creatorRow.id,
        })
        .catch((err) => logger.debug?.({ error: err }, 'telegram recording-started push failed'));
    }
  });

  recording.on('event', (event) => {
    if (event.type !== 'recording-completed' && event.type !== 'recording-failed') return;
    const jobId = event.jobId;
    const job = jobId !== undefined ? recording.getJobs().find((j) => j.id === jobId) : undefined;
    const jobTitle = job?.title ?? 'Recording';

    if (event.type === 'recording-completed') {
      const size = event.recordingId !== undefined
        ? recordingRepo.getRecording(event.recordingId)?.sizeBytes ?? undefined
        : undefined;
      push.recordingCompleted(jobTitle, jobTitle, size);
      // Post-recording automation — only for successful finishes.
      if (event.recordingId !== undefined) {
        automation.onRecordingCompleted(event.recordingId);
      }
    } else {
      push.recordingFailed(jobTitle, jobTitle, event.error ?? 'unknown error');
    }
  });

  /** Re-resolve a live stream through the plugin and start the next segment. */
  async function reExtractAndStart(
    tracked: { id: string; displayName: string },
    monitorId: string,
    managed: ReturnType<typeof pluginManager.get>,
    startOpts: {
      quality?: string;
      durationMinutes?: number;
      sessionStartedAt?: number;
      segmentMinutes?: number;
      streamType?: string;
      autoRecord?: boolean;
    },
  ): Promise<string> {
    const extract = managed?.instance?.capabilities.streamExtraction;
    if (extract === undefined) throw new Error('Plugin has no stream extraction');
    let fresh = await extract.extractStream(monitorId, { streamType: startOpts.streamType });
    fresh = { ...fresh, creatorId: tracked.id, creatorName: tracked.displayName };
    return recording.startRecording(fresh, startOpts);
  }

  // Keep the tray tooltip in sync with live/recording activity
  const updateTrayStatus = (): void => {
    try {
      const recordingCount = recording.getJobs().filter((job) => job.status === 'recording').length;
      const { liveCreators } = monitoring.getDashboard();
      tray.setStatus(`${liveCreators} live · ${recordingCount} recording${recordingCount === 1 ? '' : 's'}`);
    } catch {
      /* dashboard reads must never crash the main process */
    }
  };
  monitoring.on('event', () => {
    updateTrayStatus();
  });
  recording.on('event', () => {
    updateTrayStatus();
  });

  registerIpcHandlers({
    logger,
    getWindow: () => mainWindow,
    dirs,
    settings,
    notifications,
    plugins: pluginManager,
    monitoring,
    recording,
    downloads,
    uploads,
    storage,
    push,
    automation,
    jobs,
    hardware,
    processMonitor,
    networkMonitor,
    proxy: tor,
    logRepo,
    creatorRepo,
    recordingRepo,
    downloadRepo,
    uploadRepo,
    jobRepo,
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      const devUrl = process.env['ELECTRON_RENDERER_URL'];
      if (!url.startsWith(devUrl ?? 'file://')) {
        event.preventDefault();
      }
    });
  });

  mainWindow = createMainWindow(loadWindowState(userDataPath), logger, {
    startHidden: settings.getAll().startMinimized || process.argv.includes('--hidden'),
  });
  attachWindowCloseBehavior(userDataPath, () => {
    try {
      return settings.getAll().closeToTray;
    } catch {
      return closeToTrayEnabled;
    }
  });

  tray.create();

  // ponytail: a relaunch that arrived while bootstrap was still running set
  // pendingFocusRequest — honor it now so the app always opens visibly.
  // An explicit user launch also overrides startMinimized/--hidden.
  if (pendingFocusRequest) {
    pendingFocusRequest = false;
    focusMainWindow();
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // ponytail: with close-to-tray the close event is prevented (window is
      // hidden, not closed), so this only fires on a real quit — quitting
      // here is correct and releases the single-instance lock.
      app.quit();
    }
  });

  app.on('activate', () => {
    if (!isWindowUsable(mainWindow)) {
      mainWindow = createMainWindow(loadWindowState(userDataPath), logger);
      attachWindowCloseBehavior(userDataPath, () => {
        try {
          return settings.getAll().closeToTray;
        } catch {
          return closeToTrayEnabled;
        }
      });
    }
    focusMainWindow();
  });

  // ponytail: register once — bootstrap runs once per process, but
  // second-instance recreates never re-run bootstrap, so a duplicate
  // registration here would double-stop services on quit.
  if (!quitHandlerRegistered) {
    quitHandlerRegistered = true;
    app.on('before-quit', () => {
      quitting = true;
      try {
        trayController?.destroy();
      } catch {
        /* tray may already be gone */
      }
      // ponytail: stop schedulers synchronously so child transfers are
      // signalled before the DB handle closes; the async monitoring stop is
      // fire-and-forget because before-quit does not await listeners.
      try {
        downloads.stop();
      } catch {
        /* stopping transfers must not block quit */
      }
      try {
        uploads.stop();
      } catch {
        /* see above */
      }
      void monitoring.stop().catch(() => undefined);
      try {
        tor.stop();
      } catch {
        /* stopping the proxy must not block quit */
      }
      try {
        database.close();
      } catch {
        /* closing twice / torn WAL must not block quit */
      }
    });
  }
}

/** In development, also scan the monorepo plugins/ folder. */
function devPluginDirs(): string[] {
  if (app.isPackaged) {
    return [];
  }
  return [join(app.getAppPath(), '..', '..', 'plugins')];
}

/**
 * ponytail: in packaged builds the built-in plugins ship as extraResources
 * (electron-builder.yml copies <plugins>/{manifest.json,dist} into
 * resources/plugins). Without this the packaged app has ZERO plugins —
 * every monitoring check fails with "Monitoring check failed".
 */
function bundledPluginDirs(): string[] {
  if (!app.isPackaged) {
    return [];
  }
  return [join(process.resourcesPath, 'plugins')];
}

/**
 * Default media locations. In development these live inside the repository
 * so test recordings stay with the project; an installed build always uses
 * the current user's own Videos/Downloads folders — never a developer path.
 */
function defaultMediaDirs(): { recordings: string; downloads: string } {
  if (app.isPackaged) {
    const home = app.getPath('home');
    return {
      recordings: join(home, 'Videos', 'Rekordly'),
      downloads: join(home, 'Downloads', 'Rekordly'),
    };
  }
  const repoRoot = join(app.getAppPath(), '..', '..');
  return {
    recordings: join(repoRoot, 'recordings'),
    downloads: join(repoRoot, 'downloads'),
  };
}
