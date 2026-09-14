
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
  ConfigManager,
  EventBus,
  NotificationService,
  PluginManager,
  SettingsService,
  LicenseService,
  createEntitlementsSource,
  getEntitlements,
  GateNotifier,
  MonitoringService,
  RecordingService,
  StorageService,
  DownloadManager,
  UploadService,
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

  // Pro tier: offline Ed25519 license verification. The private signing key
  // never ships with the app; the public key is embedded in LicenseService.
  const license = new LicenseService({ settings, logger });
  const entitlementsSource = createEntitlementsSource(license);
  const bus = new EventBus<CoreEvents>();
  const notifications = new NotificationService({ logRepo, logger, bus });
  // Gate hits become persistent bell entries + OS notifications (cooldowns
  // inside GateNotifier keep repeat hits from nagging).
  const gateNotifier = new GateNotifier({ notifications, logger });

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

  // Pro tier: trial lifecycle alerts — fire once per state change (boot and
  // every activation/deactivation), never per gate hit.
  const notifyTrialLifecycle = (): void => {
    const status = license.getStatus();
    gateNotifier.resetLatches();
    if (status.tier === 'trial' && status.trialDaysLeft !== undefined) {
      if (status.trialDaysLeft <= 1) {
        gateNotifier.trialExpiring(status.trialDaysLeft);
      }
    } else if (status.expired) {
      gateNotifier.trialExpired();
    }
  };
  notifyTrialLifecycle();
  license.onChanged(notifyTrialLifecycle);

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
    // Pro tier gates: live entitlements clamp concurrency and per-recording
    // duration on the free tier (read live on every decision).
    getEntitlements: () => getEntitlements(entitlementsSource.getLicenseStatus()),
    getGateNotifier: () => gateNotifier,
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
      return await extraction.extractStream(identifier);
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
  // ponytail: a changed upload concurrency limit (or Low-Resource toggle)
  // must wake the queue so waiting uploads start under the new limit.
  settings.onChanged(() => uploads.notifyLimitsChanged());

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

    // Resolve the tracked creator FIRST — auto-record requires the per-creator
    // opt-in; untracked creators (not in the DB) are never auto-recorded.
    const [pluginId, externalId] = (event.creatorId ?? '').split(':');
    const tracked =
      pluginId !== undefined && externalId !== undefined
        ? creatorRepo.getByExternal(pluginId, externalId)
        : undefined;
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
          stream = await extract.extractStream(event.creatorId!);
        } catch (err) {
          logger.warn({ creatorId: event.creatorId, error: err }, 'extractStream failed for auto-record');
        } finally {
          releaseSlot();
        }
      }
      if (stream === null) {
        if (event.data?.streamUrl === undefined) {
          notifications.send({
            level: 'warn',
            title: 'Auto-record failed',
            message: `${tracked.displayName} went live, but the stream could not be extracted.`,
            data: { creatorId: event.creatorId },
          });
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
        segmentMinutes: settingsNow.autoRecordSegmentMinutes > 0 ? settingsNow.autoRecordSegmentMinutes : undefined,
      });
      notifications.send({
        level: 'info',
        title: 'Auto-record started',
        message: `${tracked.displayName} went live — recording automatically.`,
        data: { creatorId: event.creatorId },
      });
    })().catch((err) => {
      logger.error({ creatorId: event.creatorId, error: err }, 'auto-recording failed');
      notifications.send({
        level: 'error',
        title: 'Auto-record failed',
        message: err instanceof Error ? err.message : 'Unknown error',
        data: { creatorId: event.creatorId },
      });
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

  // ponytail: segment chaining — a duration-capped auto-record segment just
  // finished cleanly (split setting). Re-run every guardrail (master pause,
  // disk, still-live) and start the next part with a fresh timestamped file.
  // Always re-extract a fresh stream (new proxy + fresh signed playlist URL)
  // before starting the next segment — the old proxy URL is stale by the time
  // the next segment starts (proxy idle timeout or signed URL expiration).
  recording.on('event', (event) => {
    if (event.type !== 'recording-segment-finished') return;
    const stream = event.data?.['stream'] as StreamObject | undefined;
    const opts = event.data?.['options'] as
      | { quality?: string; segmentMinutes?: number }
      | undefined;
    if (stream === undefined || opts === undefined) return;
    if (settings.getAll().autoRecordPaused) return;

    void (async () => {
      const tracked = stream.creatorId !== '' ? creatorRepo.get(stream.creatorId) : undefined;
      if (tracked === undefined || !tracked.autoRecord) return;

      // disk guardrail (same as the auto-record entry path)
      const minFreeGb = settings.getAll().autoRecordMinFreeDiskGb;
      if (minFreeGb > 0) {
        const stats = await statfs(dirs.recordingsDir);
        const freeBytes = stats.bavail * stats.bsize;
        if (freeBytes < minFreeGb * 1024 ** 3) {
          notifications.send({
            level: 'warn',
            title: 'Auto-record paused — low disk space',
            message: `Segment chain for ${tracked.displayName} stopped: free space is below the ${minFreeGb} GB limit.`,
            data: { creatorId: tracked.id, freeBytes },
          });
          return;
        }
      }

      // still live? if the stream ended, the chain stops cleanly here.
      const monitorId = `${tracked.pluginId}:${tracked.externalId}`;
      const managed = pluginManager.get(tracked.pluginId);
      const detection = managed?.instance?.capabilities.liveDetection;
      if (detection === undefined) return;
      const live = await detection.getLiveStatus(monitorId).catch(() => ({ isLive: false }));
      if (!live.isLive) {
        logger.info({ creatorId: monitorId }, 'segment chain stopped — stream ended');
        return;
      }

      // duplicate-session guard (a manual recording may be running instead)
      const ACTIVE_JOB_STATUSES = ['queued', 'preparing', 'recording', 'paused', 'stopping'];
      if (recording.getJobs().some((j) => ACTIVE_JOB_STATUSES.includes(j.status) && j.creatorId === tracked.id)) {
        return;
      }

      const startOpts = { quality: opts.quality, segmentMinutes: opts.segmentMinutes };
      try {
        await reExtractAndStart(tracked, monitorId, managed, startOpts);
      } catch (err) {
        logger.error({ creatorId: monitorId, error: err }, 'segment chain re-extract failed');
        notifications.send({
          level: 'error',
          title: 'Auto-record stopped',
          message: `${tracked.displayName}'s segmented recording could not continue: ${err instanceof Error ? err.message : 'unknown error'}`,
          data: { creatorId: tracked.id },
        });
      }
    })().catch((err) => {
      logger.error({ error: err }, 'segment chain failed');
    });
  });

  /** Re-resolve a live stream through the plugin and start the next segment. */
  async function reExtractAndStart(
    tracked: { id: string; displayName: string },
    monitorId: string,
    managed: ReturnType<typeof pluginManager.get>,
    startOpts: { quality?: string; segmentMinutes?: number },
  ): Promise<string> {
    const extract = managed?.instance?.capabilities.streamExtraction;
    if (extract === undefined) throw new Error('Plugin has no stream extraction');
    let fresh = await extract.extractStream(monitorId);
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
    license,
    gateNotifier,
    notifications,
    plugins: pluginManager,
    monitoring,
    recording,
    downloads,
    uploads,
    storage,
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
