
import { statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, nativeTheme, Notification as ElectronNotification } from 'electron';
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
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  void bootstrap();
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  registerMediaProtocolHandler();

  const userDataPath = app.getPath('userData');
  const mediaDirs = defaultMediaDirs();
  const dirs = buildAppDirs(userDataPath, mediaDirs.recordings);
  ensureAppDirs(dirs);

  const database = createDatabase(dirs.dbPath);
  database.migrate();

  const settingsRepo = createSettingsRepo(database.orm);

  const config = new ConfigManager({ defaults: {}, user: settingsRepo });
  const initialLogLevel = (config.getAll()['logLevel'] as string) ?? 'info';

  const logger = await createLogger('main', {
    rotatingFile: { dir: dirs.logsDir },
    level: initialLogLevel,
    console: true,
  });
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

  const pluginManager = new PluginManager({
    searchDirs: [dirs.pluginsDir, ...devPluginDirs(), ...bundledPluginDirs()],
    installDir: dirs.pluginsDir,
    dataRootDir: dirs.pluginDataDir,
    appVersion: app.getVersion(),
    repo: pluginRepo,
    logger,
    notifications,
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
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
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

  await pluginManager.initialize();

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
  recording.recoverStaleJobs();

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
    maxConcurrentUploads: 1,
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

  if (uploadProviderSettings.mixdrop?.enabled && uploadProviderSettings.mixdrop.email && uploadProviderSettings.mixdrop.apiKey) {
    uploads.registerProvider(new MixDropProvider({
      logger,
      getEmail: () => settings.getAll().uploadProviders.mixdrop?.email,
      getKey: () => settings.getAll().uploadProviders.mixdrop?.apiKey,
    }));
  }

  if (uploadProviderSettings['google-drive']?.enabled && uploadProviderSettings['google-drive'].clientId && uploadProviderSettings['google-drive'].clientSecret && uploadProviderSettings['google-drive'].refreshToken) {
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
  }

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

  // ponytail: process monitor polls child process (yt-dlp/ffmpeg) PIDs for
  // CPU/memory usage, giving the UI visibility into recording resource impact.
  const processMonitor = new ProcessMonitorService({
    logger,
    getActivePids: () => recording.getActiveChildPids(),
    pollIntervalMs: 2000,
  });

  // ponytail: network monitor polls network interface counters to calculate
  // real-time bandwidth usage across all active recordings.
  const networkMonitor = new NetworkMonitorService({
    logger,
    pollIntervalMs: 1500,
  });

  const tray = new TrayController({ getWindow: () => mainWindow, logger });

  // Start monitoring on app ready
  await monitoring.start();

  // Start resource monitors
  processMonitor.start();
  networkMonitor.start();

  // Start the generic download engine and forward its events to the renderer.
  downloads.start();
  // Start the cloud upload worker (Gofile and any registered providers).
  uploads.start();
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
    const recordingCount = recording.getJobs().filter((job) => job.status === 'recording').length;
    const { liveCreators } = monitoring.getDashboard();
    tray.setStatus(`${liveCreators} live · ${recordingCount} recording${recordingCount === 1 ? '' : 's'}`);
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
    jobs,
    hardware,
    processMonitor,
    networkMonitor,
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
  mainWindow.on('close', (event) => {
    if (mainWindow !== null) {
      saveWindowState(userDataPath, mainWindow);
    }
    // ponytail: with close-to-tray enabled, closing the window hides it and
    // keeps monitoring/recording running in the background.
    if (!quitting && settings.getAll().closeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  tray.create();

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow(loadWindowState(userDataPath), logger);
    }
  });

  app.on('before-quit', async () => {
    quitting = true;
    tray.destroy();
    downloads.stop();
    uploads.stop();
    await monitoring.stop();
    database.close();
  });
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
