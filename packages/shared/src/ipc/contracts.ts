/**
 * Typed IPC contract between renderer (preload bridge) and main process.
 * Every call is typed; the renderer never touches Electron APIs directly.
 */

import type { StreamObject } from '../stream';
export type { StreamObject } from '../stream';

export const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  appGetSystemStats: 'app:get-system-stats',
  appGetProcessStats: 'app:get-process-stats',
  appGetNetworkStats: 'app:get-network-stats',
  appGetHardwareProfile: 'app:get-hardware-profile',
  appGetPaths: 'app:get-paths',
  appOpenPath: 'app:open-path',
  appOpenUrl: 'app:open-url',
  appExtractFrame: 'app:extract-frame',
  appCopyImage: 'app:copy-image',
  appSaveImage: 'app:save-image',
  appGetMediaInfo: 'app:get-media-info',
  appFindSubtitle: 'app:find-subtitle',
  logsWrite: 'logs:write',
  logsList: 'logs:list',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',

  settingsGetAll: 'settings:get-all',
  settingsSet: 'settings:set',
  settingsReset: 'settings:reset',
  settingsValidate: 'settings:validate',
  settingsImport: 'settings:import',
  settingsExport: 'settings:export',

  licenseGetStatus: 'license:get-status',
  licenseActivate: 'license:activate',
  licenseDeactivate: 'license:deactivate',

  pluginsList: 'plugins:list',
  pluginsEnable: 'plugins:enable',
  pluginsDisable: 'plugins:disable',
  pluginsRemove: 'plugins:remove',
  pluginsUpdate: 'plugins:update',
  pluginsInstall: 'plugins:install',
  pluginsDiagnostics: 'plugins:diagnostics',
  pluginsHealth: 'plugins:health',
  pluginsSettingsGet: 'plugins:settings-get',
  pluginsSettingsSchema: 'plugins:settings-schema',
  pluginsSettingsSet: 'plugins:settings-set',
  pluginsEvent: 'plugins:event',

  notificationsList: 'notifications:list',
  notificationsMarkRead: 'notifications:mark-read',
  notificationsMarkAllRead: 'notifications:mark-all-read',
  notificationsUnreadCount: 'notifications:unread-count',
  notificationsEvent: 'notifications:event',

  creatorsList: 'creators:list',
  creatorsGet: 'creators:get',
  creatorsCreate: 'creators:create',
  creatorsUpdate: 'creators:update',
  creatorsRemove: 'creators:remove',
  creatorsSearch: 'creators:search',
  creatorsSetFavorite: 'creators:set-favorite',
  creatorsSetAutoRecord: 'creators:set-auto-record',
  creatorsSetUseProxy: 'creators:set-use-proxy',
  proxyGetStatus: 'proxy:get-status',
  proxyStart: 'proxy:start',
  proxyTest: 'proxy:test',
  proxyGetNetworkMode: 'proxy:get-network-mode',
  proxyEvent: 'proxy:event',
  creatorsGetTags: 'creators:get-tags',
  creatorsCreateTag: 'creators:create-tag',
  creatorsRemoveTag: 'creators:remove-tag',
  creatorsRenameTag: 'creators:rename-tag',
  creatorsAddTag: 'creators:add-tag',
  creatorsRemoveTagFromCreator: 'creators:remove-tag-from-creator',
  creatorsListCreatorTags: 'creators:list-creator-tags',
  creatorsGetCollections: 'creators:get-collections',
  creatorsCreateCollection: 'creators:create-collection',
  creatorsRemoveCollection: 'creators:remove-collection',
  creatorsExportJson: 'creators:export-json',
  creatorsExportCsv: 'creators:export-csv',
  creatorsImportJson: 'creators:import-json',
  creatorsImportCsv: 'creators:import-csv',
  creatorsBulkFavorite: 'creators:bulk-favorite',
  creatorsBulkSetAutoRecord: 'creators:bulk-set-auto-record',
  creatorsBulkRemove: 'creators:bulk-remove',
  creatorsBulkAddTag: 'creators:bulk-add-tag',
  creatorsGetAllTagAssignments: 'creators:get-all-tag-assignments',
  creatorsStats: 'creators:stats',

  recordingsList: 'recordings:list',
  recordingsRecent: 'recordings:recent',
  recordingsCountByStatus: 'recordings:count-by-status',

  monitoringStart: 'monitoring:start',
  monitoringStop: 'monitoring:stop',
  monitoringPause: 'monitoring:pause',
  monitoringResume: 'monitoring:resume',
  monitoringGetStatus: 'monitoring:get-status',
  monitoringGetJobs: 'monitoring:get-jobs',
  monitoringGetDashboard: 'monitoring:get-dashboard',
  monitoringAddCreator: 'monitoring:add-creator',
  monitoringRemoveCreator: 'monitoring:remove-creator',
  monitoringEvent: 'monitoring:event',

  recordingStart: 'recording:start',
  recordingStartForCreator: 'recording:start-for-creator',
  recordingPause: 'recording:pause',
  recordingResume: 'recording:resume',
  recordingCancel: 'recording:cancel',
  recordingRetry: 'recording:retry',
  recordingRestart: 'recording:restart',
  recordingRemoveJob: 'recording:remove-job',
  recordingClearFailed: 'recording:clear-failed',
  recordingGetJobs: 'recording:get-jobs',
  recordingGetSettings: 'recording:get-settings',
  recordingSetSettings: 'recording:set-settings',
  recordingEvent: 'recording:event',

  dashboardGetStats: 'dashboard:get-stats',

  // --- Library (Phase 8) ---
  librarySearch: 'library:search',
  libraryCount: 'library:count',
  libraryGetRecording: 'library:get-recording',
  librarySetFavorite: 'library:set-favorite',
  librarySetNotes: 'library:set-notes',
  libraryGetTags: 'library:get-tags',
  libraryCreateTag: 'library:create-tag',
  libraryRenameTag: 'library:rename-tag',
  libraryRemoveTag: 'library:remove-tag',
  libraryAddTag: 'library:add-tag',
  libraryRemoveTagFromRecording: 'library:remove-tag-from-recording',
  libraryListRecordingTags: 'library:list-recording-tags',
  libraryBulkFavorite: 'library:bulk-favorite',
  libraryBulkAddTag: 'library:bulk-add-tag',
  libraryBulkRemoveTag: 'library:bulk-remove-tag',
  libraryBulkDelete: 'library:bulk-delete',
  libraryBulkMove: 'library:bulk-move',
  libraryGetCollections: 'library:get-collections',
  libraryCreateCollection: 'library:create-collection',
  libraryRenameCollection: 'library:rename-collection',
  libraryRemoveCollection: 'library:remove-collection',
  libraryRevealInExplorer: 'library:reveal-in-explorer',
  libraryOpenFile: 'library:open-file',
  libraryCopyPath: 'library:copy-path',
  libraryDeleteFile: 'library:delete-file',
  libraryVerifyFile: 'library:verify-file',
  libraryRefreshMetadata: 'library:refresh-metadata',
  libraryRegenerateThumbnails: 'library:regenerate-thumbnails',
  libraryScanFolder: 'library:scan-folder',

  // --- Editor (built-in trim/cut/concat, Phase 10) ---
  editorTrim: 'editor:trim',
  editorCut: 'editor:cut',
  editorConcat: 'editor:concat',
  editorTimeline: 'editor:timeline',
  editorExtractAudio: 'editor:extract-audio',
  editorDetectSilence: 'editor:detect-silence',
  editorCancelExport: 'editor:cancel-export',
  editorExportProgress: 'editor:export-progress',

  // --- Downloads (Phase 9) ---
  downloadsList: 'downloads:list',
  downloadsGet: 'downloads:get',
  downloadsAdd: 'downloads:add',
  downloadsRemove: 'downloads:remove',
  downloadsPause: 'downloads:pause',
  downloadsResume: 'downloads:resume',
  downloadsCancel: 'downloads:cancel',
  downloadsRetry: 'downloads:retry',
  downloadsSetPriority: 'downloads:set-priority',
  downloadsPauseAll: 'downloads:pause-all',
  downloadsResumeAll: 'downloads:resume-all',
  downloadsClearCompleted: 'downloads:clear-completed',
  downloadsClearFailed: 'downloads:clear-failed',
  downloadsRetryAll: 'downloads:retry-all',
  downloadsCountByStatus: 'downloads:count-by-status',
  downloadsBulkRemove: 'downloads:bulk-remove',
  downloadsBulkRetry: 'downloads:bulk-retry',
  downloadsProbe: 'downloads:probe',
  downloadsEvent: 'downloads:event',

  // --- Uploads (Phase 9) ---
  uploadsList: 'uploads:list',
  uploadsGet: 'uploads:get',
  uploadsAdd: 'uploads:add',
  uploadsRemove: 'uploads:remove',
  uploadsPause: 'uploads:pause',
  uploadsResume: 'uploads:resume',
  uploadsCancel: 'uploads:cancel',
  uploadsRetry: 'uploads:retry',
  uploadsClearCompleted: 'uploads:clear-completed',
  uploadsClearFailed: 'uploads:clear-failed',
  uploadsCountByStatus: 'uploads:count-by-status',
  uploadsPickFile: 'uploads:pick-file',
  uploadsProviders: 'uploads:providers',
  uploadsProvidersMeta: 'uploads:providers-meta',
  uploadsTestProvider: 'uploads:test-provider',
  uploadsConnectGoogleDrive: 'uploads:connect-google-drive',
  uploadsEvent: 'uploads:event',

  // --- Storage (Phase 9) ---
  storageGetStats: 'storage:get-stats',
  storageScan: 'storage:scan',
  storageCleanup: 'storage:cleanup',
  storageGetLargestRecordings: 'storage:get-largest-recordings',
  storageGetLargestFolders: 'storage:get-largest-folders',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  electron: string;
  chrome: string;
  node: string;
}

// --- App: image/frame helpers (player screenshots) ---------------------------

export interface AppExtractFrameRequestDto {
  filePath: string;
  seconds: number;
}

export interface AppExtractFrameResultDto {
  /** `data:image/png;base64,…` — full-resolution PNG of the frame. */
  dataUrl: string;
}

export interface AppCopyImageRequestDto {
  /** `data:image/png;base64,…` or `data:image/jpeg;base64,…`. */
  dataUrl: string;
}

export interface AppSaveImageRequestDto {
  dataUrl: string;
  suggestedName: string;
}

export interface AppSaveImageResultDto {
  canceled: boolean;
  filePath?: string | null;
}

/** Probed media facts for the player's stats-for-nerds overlay. */
export interface AppMediaInfoDto {
  duration: number;
  resolution: string;
  videoCodec: string;
  audioCodec: string;
  bitrate: number;
  fps: number;
}

export interface AppSubtitleResultDto {
  /** `data:text/vtt;base64,…` — SRT sidecars are converted to VTT. */
  dataUrl: string;
}

export interface SystemStats {
  cpuUsage: number;
  memoryRss: number;
  memoryTotal: number;
  /** Free bytes on the drive hosting the recordings vault (null when unavailable). */
  diskFreeBytes: number | null;
  /** Total bytes of that drive (null when unavailable). */
  diskTotalBytes: number | null;
  /** CPU usage of child processes (yt-dlp/ffmpeg) as percentage. */
  childCpuUsage: number;
  /** Memory RSS of child processes in bytes. */
  childMemoryBytes: number;
  /** Number of active recording jobs (queued/preparing/recording/paused). */
  activeRecordings: number;
  /** Network download speed in bytes/s. */
  networkDownloadSpeed: number;
  /** Network upload speed in bytes/s. */
  networkUploadSpeed: number;
}

/** Per-child-process resource metrics. */
export interface ChildProcessStats {
  pid: number;
  type: 'yt-dlp' | 'ffmpeg' | 'chromium';
  cpuPercent: number;
  memoryBytes: number;
}

/** Aggregated child process metrics. */
export interface ProcessStats {
  totalCpuPercent: number;
  totalMemoryBytes: number;
  processCount: number;
  processes: ChildProcessStats[];
}

/** Network bandwidth metrics. */
export interface NetworkStats {
  downloadSpeed: number;
  uploadSpeed: number;
}

/** Overall hardware capability tier detected on first launch. */
export type HardwareTier = 'low' | 'moderate' | 'high';

/** Auto-detected machine profile used to recommend Low-Resource Mode. */
export interface HardwareProfileDto {
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  /** Physical disk medium of the recordings drive, when detectable. */
  diskType: 'ssd' | 'hdd' | 'unknown';
  freeDiskBytes: number;
  tier: HardwareTier;
  /** True when the machine would benefit from Low-Resource Mode. */
  recommendedLowResourceMode: boolean;
}

/** Main-process managed directory layout (File Storage). */
export interface AppPaths {
  userData: string;
  logsDir: string;
  recordingsDir: string;
  cacheDir: string;
  tempDir: string;
  pluginsDir: string;
  dbPath: string;
}

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
  scope: string;
  level: LogLevel;
  message: string;
  time: number;
  data?: Record<string, unknown>;
}

// --- Settings ---------------------------------------------------------------

export interface AppSettings {
  recordingsDir: string;
  checkIntervalSeconds: number;
  theme: 'dark' | 'light';
  notificationsEnabled: boolean;
  desktopNotificationsEnabled: boolean;
  logLevel: LogLevel;
  /** Master kill-switch: pauses ALL auto-recording (per-creator flags stay). */
  autoRecordPaused: boolean;
  /** Skip auto-recording when free disk space drops below this (GB, 0 = off). */
  autoRecordMinFreeDiskGb: number;
  /** Whether the storage warning on first auto-record enable was acknowledged. */
  autoRecordWarningAcknowledged: boolean;
  /** Split auto-recordings into parts every N minutes (0 = single file). */
  autoRecordSegmentMinutes: number;
  /** Hide to the system tray instead of quitting when the window is closed. */
  closeToTray: boolean;
  /** Start with the main window hidden (monitoring runs in the background). */
  startMinimized: boolean;
  /** Launch Rekordly automatically on system login. */
  launchAtStartup: boolean;
  /** Show a notification when a recording completes successfully. */
  notifyCompletion: boolean;
  /** Show a notification when a recording fails. */
  notifyFailures: boolean;
  /** Show warnings and non-critical notifications. */
  notifyWarnings: boolean;
  /** How long toast notifications stay visible (ms). */
  toastDurationMs: number;
  /** Maximum number of simultaneous generic downloads. */
  maxConcurrentDownloads: number;
  /** Maximum number of simultaneous cloud uploads. */
  maxConcurrentUploads: number;
  /** Global download speed cap in bytes/s. 0 = unlimited. */
  downloadBandwidthLimit: number;
  /** Root folder for generic downloads; each website gets its own subfolder. */
  downloadsDir: string;
  /** Caps recordings/downloads to 1 concurrent job and disables UI animations. */
  lowResourceMode: boolean;
  /** Whether the first-launch welcome + guided tour has been completed. */
  onboardingCompleted: boolean;
  /** ponytail: latched once any creator's secure-proxy flag is enabled —
   * controls the conditional "Secure Proxy" nav item. Visibility only. */
  secureProxyUsed: boolean;
  /**
   * ponytail: compression preset for quality-selected recordings (the
   * background transcode that produces "(480p)" files). 'quality' favors
   * fidelity, 'size' trades a little quality for much smaller files.
   */
  recordingCompression: 'quality' | 'balanced' | 'size';
  /** Upload provider configuration (credentials, defaults). */
  uploadProviders: UploadProvidersSettings;
}

export interface UploadProvidersSettings {
  defaultProvider: string;
  gofile?: { enabled: boolean; token?: string };
  mixdrop?: { enabled: boolean; email?: string; apiKey?: string };
  'google-drive'?: { enabled: boolean; clientId?: string; clientSecret?: string; refreshToken?: string };
  catbox?: { enabled: boolean; userhash?: string };
}

export interface SettingsValidationResult {
  valid: boolean;
  errors: string[];
}

// --- Secure Proxy -------------------------------------------------------------

export interface ProxyStatusDto {
  state: 'idle' | 'downloading' | 'connecting' | 'active' | 'error';
  message?: string;
}

export interface ProxyTestResultDto {
  /** Apparent public IP as seen through the proxy exit node. */
  ip: string;
  /** Round-trip time of the probe in milliseconds. */
  latencyMs: number;
}

export interface ProxyNetworkModeDto {
  /** A system-level VPN (e.g. Cloudflare WARP) is active on this machine. */
  systemVpnDetected: boolean;
  /** Product name when identified (e.g. "Cloudflare WARP"). */
  product?: string;
}

// --- Plugins ----------------------------------------------------------------

export type PluginStateDto =
  | 'installed'
  | 'loading'
  | 'loaded'
  | 'initializing'
  | 'ready'
  | 'error'
  | 'disabled'
  | 'uninstalled';

export interface PluginErrorDto {
  code: string;
  message: string;
}

export interface PluginHealthDto {
  healthy: boolean;
  message?: string;
  latencyMs?: number;
  checkedAt?: string;
}

export interface PluginInfoDto {
  id: string;
  name: string;
  version: string;
  description?: string;
  author: string;
  license?: string;
  homepage?: string;
  setupHint?: string;
  minAppVersion: string;
  state: PluginStateDto;
  enabled: boolean;
  capabilities: string[];
  permissionsRequested: string[];
  permissionsGranted: string[];
  health?: PluginHealthDto;
  lastError?: PluginErrorDto;
  installedAt: string;
  updatedAt: string;
}

export type PluginEventTypeDto =
  | 'loaded'
  | 'enabled'
  | 'disabled'
  | 'failed'
  | 'updated'
  | 'installed'
  | 'removed'
  | 'unloaded'
  | 'health-changed';

export interface PluginEventDto {
  type: PluginEventTypeDto;
  pluginId: string;
  version?: string;
  error?: PluginErrorDto;
  healthy?: boolean;
}

export interface SettingDefDto {
  key: string;
  type: 'text' | 'password' | 'number' | 'boolean' | 'select' | 'guide';
  label: string;
  description?: string;
  defaultValue?: string | number | boolean;
  options?: readonly { value: string; label: string }[];
  required?: boolean;
  /** Ordered instructions rendered for settings of type 'guide'. */
  steps?: readonly string[];
}

export interface PluginDiagnosticsDto {
  id: string;
  state: PluginStateDto;
  version: string;
  entry: string;
  installPath: string;
  dataDir: string;
  healthy: boolean;
  lastError?: PluginErrorDto;
  lastHealthCheck?: string;
}

// --- Creators ---------------------------------------------------------------

export interface CreatorDto {
  id: string;
  pluginId: string;
  externalId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  isFavorite: boolean;
  /** ponytail: per-creator auto-record opt-in — the engine records this
   * creator's live sessions without manual action when true. */
  autoRecord: boolean;
  /** Quality used for this creator's auto-recordings ('best' | '1080p' | …). */
  autoRecordQuality: string;
  /** ponytail: per-creator secure-proxy opt-in — routes this creator's
   * plugin traffic and recording through the host's embedded proxy. */
  useProxy: boolean;
  notes?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorTagDto {
  id: string;
  name: string;
  color?: string | null;
  createdAt: string;
}

/** ponytail: per-creator library aggregates for the details dialog. */
export interface CreatorStatsDto {
  recordingCount: number;
  totalDurationSeconds: number;
  totalSizeBytes: number;
  lastRecordedAt?: string | null;
}

export interface CollectionDto {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
}

export interface CreatorImportItem {
  pluginId: string;
  externalId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  notes?: string | null;
  tags?: string[];
}

// --- Monitoring -------------------------------------------------------------

export type MonitoringStateDto =
  | 'queued'
  | 'waiting'
  | 'checking'
  | 'live'
  | 'offline'
  | 'paused'
  | 'retrying'
  | 'failed'
  | 'disabled';

export interface MonitoringJobDto {
  id: string;
  creatorId: string;
  pluginId: string;
  state: MonitoringStateDto;
  priority: number;
  intervalMs: number;
  nextCheckAt: number;
  lastCheckAt?: number;
  lastResult?: MonitoringCheckResultDto;
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonitoringCheckResultDto {
  isLive: boolean;
  title?: string;
  thumbnail?: string;
  viewerCount?: number;
  streamUrl?: string;
  startedAt?: string;
  checkedAt: string;
  durationMs: number;
}

export interface MonitoringDashboardDto {
  currentlyChecking: number;
  queuedJobs: number;
  liveCreators: number;
  offlineCreators: number;
  averageCheckDurationMs: number;
  nextScheduledCheck: number;
  totalJobs: number;
  activeJobs: number;
  failedJobs: number;
}

export type MonitoringEventTypeDto =
  | 'creator-checked'
  | 'creator-live'
  | 'creator-offline'
  | 'plugin-error'
  | 'authentication-failed'
  | 'retry-scheduled'
  | 'worker-started'
  | 'worker-stopped'
  | 'scheduler-started'
  | 'scheduler-stopped'
  | 'stats-updated';

export interface MonitoringEventDto {
  type: MonitoringEventTypeDto;
  creatorId?: string;
  pluginId?: string;
  jobId?: string;
  isLive?: boolean;
  error?: string;
  data?: {
    isLive: boolean;
    title?: string;
    thumbnail?: string;
    viewerCount?: number;
    streamUrl?: string;
    startedAt?: string;
    checkedAt: string;
    durationMs: number;
  };
  timestamp: string;
}

// --- Recordings -------------------------------------------------------------

export interface RecordingDto {
  id: string;
  creatorId?: string | null;
  jobId?: string | null;
  title: string;
  platformId: string;
  fileName?: string | null;
  filePath?: string | null;
  thumbnailPath?: string | null;
  status: string;
  quality?: string | null;
  resolution?: string | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  bitrate?: number | null;
  fps?: number | null;
  notes?: string | null;
  isFavorite: boolean;
  /** ponytail: built-in editor — id of the recording this row was cut from (null for originals). */
  sourceRecordingId?: string | null;
  /** ponytail: built-in editor — JSON-encoded edit history. */
  editHistory?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordingJobDto {
  id: string;
  creatorId?: string | null;
  pluginId: string;
  streamUrl: string;
  title: string;
  platformId: string;
  thumbnail?: string | null;
  quality?: string | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  bytesDownloaded: number;
  speed: number;
  eta: number;
  percent: number;
  error?: string | null;
  filePath?: string | null;
  thumbnailPath?: string | null;
  verified: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export type RecordingEventTypeDto =
  | 'recording-queued'
  | 'recording-started'
  | 'recording-paused'
  | 'recording-resumed'
  | 'recording-completed'
  | 'recording-failed'
  | 'recording-cancelled'
  | 'recording-finalized'
  | 'verification-started'
  | 'verification-completed'
  | 'recording-segment-finished'
  | 'recording-cap-warning'
  | 'recording-cap-reached';

export interface RecordingEventDto {
  type: RecordingEventTypeDto;
  jobId?: string;
  recordingId?: string;
  error?: string;
  /** Event-specific payload (e.g. minutesLeft for cap warnings). */
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface RecordingSettingsDto {
  outputDir: string;
  defaultQuality: string;
  maxConcurrent: number;
  bandwidthLimit: number;
  retryCount: number;
  retryDelay: number;
  verifyEnabled: boolean;
  thumbnailEnabled: boolean;
  metadataEnabled: boolean;
  namingTemplate: string;
}

// --- License / Pro tier -----------------------------------------------------

export type LicenseTierDto = 'free' | 'trial' | 'pro';

export interface LicenseStatusDto {
  /** Resolved tier: 'pro'/'trial' only when a valid (unexpired) license exists. */
  tier: LicenseTierDto;
  /** Email bound into the license key, when present. */
  email?: string;
  /** ISO expiry for trial keys; lifetime Pro has none. */
  expiresAt?: string;
  /** Whole days left on a trial (0 on the final day). */
  trialDaysLeft?: number;
  /** True when a key is stored but invalid/expired (shown in Settings). */
  expired: boolean;
  /** Entitlement limits for the resolved tier (drives UI display + gates). */
  limits: LicenseLimitsDto;
}

export interface LicenseLimitsDto {
  /** Max simultaneous recordings. Infinity serializes as null over IPC. */
  maxConcurrent: number | null;
  /** Max creators with auto-record enabled. null = unlimited. */
  maxAutoRecordCreators: number | null;
  /** Max minutes per recording. null = unlimited. */
  maxRecordingMinutes: number | null;
}

export interface LicenseActivateResultDto {
  ok: boolean;
  status?: LicenseStatusDto;
  error?: string;
}

// --- Dashboard --------------------------------------------------------------

export interface DashboardStats {
  totalCreators: number;
  totalRecordings: number;
  totalPlugins: number;
  /** Combined storage: recordings + completed downloads. */
  totalStorageBytes: number;
  recordingStorageBytes: number;
  downloadStorageBytes: number;
  successfulRecordings: number;
  failedRecordings: number;
  activeJobs: number;
  liveCreators: number;
  /**
   * ponytail: full recording-job outcome counts (completed / failed /
   * cancelled / …). The library only ever holds finished files, so failed
   * sessions were invisible to analytics — these are the real attempts.
   */
  jobStatusCounts: Record<string, number>;
}

// --- Notifications ----------------------------------------------------------

export interface NotificationDto {
  id: number;
  time: number;
  level: LogLevel;
  title: string;
  message: string;
  read: boolean;
  data?: Record<string, unknown>;
}

// --- Library (Phase 8) ------------------------------------------------------

export type LibrarySortFieldDto = 'title' | 'createdAt' | 'startedAt' | 'durationSeconds' | 'sizeBytes' | 'platformId' | 'resolution';
export type SortDirectionDto = 'asc' | 'desc';

export interface LibraryFiltersDto {
  search?: string;
  pluginId?: string;
  resolution?: string;
  minDuration?: number;
  maxDuration?: number;
  minSize?: number;
  maxSize?: number;
  status?: string;
  isFavorite?: boolean;
  collectionId?: string;
  tagIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  /**
   * ponytail: Edited tab — true = only editor outputs (source_recording_id
   * IS NOT NULL), false = only originals. Omit = both (back-compat).
   */
  isEdited?: boolean;
}

export interface LibrarySortDto {
  field: LibrarySortFieldDto;
  direction: SortDirectionDto;
}

export interface LibrarySearchResultDto {
  recordings: RecordingDto[];
  total: number;
  offset: number;
  limit: number;
}

export interface StorageStatsDto {
  totalRecordings: number;
  totalSizeBytes: number;
  availableBytes: number;
  totalBytes: number;
  cacheSizeBytes: number;
  logSizeBytes: number;
  tempSizeBytes: number;
  largestRecordings: { id: string; title: string; sizeBytes: number; filePath: string }[];
  largestFolders: { path: string; sizeBytes: number; fileCount: number }[];
}

// --- Editor (built-in trim/cut/concat, Phase 10) ----------------------------

/** Trim a single [startSeconds, endSeconds) window into a new library entry. */
export interface EditorTrimRequestDto {
  recordingId: string;
  startSeconds: number;
  endSeconds: number;
  /** Frame-accurate re-encode instead of fast stream copy. */
  accurate?: boolean;
  /**
   * Client-generated operation id — lets the renderer cancel this specific
   * export via `editor.cancelExport` and match its progress events.
   */
  opId?: string;
}

/** Remove `cuts` ranges; the kept segments are joined into a new entry. */
export interface EditorCutRequestDto {
  recordingId: string;
  cuts: { startSeconds: number; endSeconds: number }[];
  /** Frame-accurate re-encode instead of fast stream copy. */
  accurate?: boolean;
  /** Client-generated operation id (see EditorTrimRequestDto). */
  opId?: string;
}

/** Join recordings (in order) into a new library entry. */
export interface EditorConcatRequestDto {
  recordingIds: string[];
  title?: string;
}

/** Build (or fetch cached) filmstrip + waveform images for the editor timeline. */
export interface EditorTimelineRequestDto {
  /** Library recording — the common case (editor panel). */
  recordingId?: string;
  /**
   * ponytail: bare file path variant — the video player wants hover
   * previews for library recordings AND downloads (no recording row), so
   * the cache is keyed by file, not by recording. Exactly one of
   * recordingId/filePath must be provided.
   */
  filePath?: string;
  /** Approximate filmstrip cell count — clamped server-side to 8–60. */
  thumbCount?: number;
  /** False to skip the (slower) waveform pass — the player only needs frames. */
  includeWaveform?: boolean;
}

export interface EditorTimelineDto {
  /** sf-media:// URL of the filmstrip image (cells laid out left→right in time order). */
  stripUrl: string;
  /** sf-media:// URL of the whole-file waveform PNG, or null when the source has no audio. */
  waveformUrl: string | null;
  thumbCount: number;
}

/** Extract the (optionally ranged) audio track into a new library entry. */
export interface EditorExtractAudioRequestDto {
  recordingId: string;
  format: 'mp3' | 'm4a';
  startSeconds?: number;
  endSeconds?: number;
  /** Client-generated operation id (see EditorTrimRequestDto). */
  opId?: string;
}

/** One quiet span (dead air) detected in the source audio. */
export interface EditorSilenceSpanDto {
  startSeconds: number;
  endSeconds: number;
}

export interface EditorDetectSilenceRequestDto {
  /** Library recording (editor panel) — or a bare file path (player). */
  recordingId?: string;
  filePath?: string;
  /** Loudness threshold in dB (default -40). */
  thresholdDb?: number;
  /** Minimum span length in seconds. */
  minSeconds?: number;
}

/** Progress event for a running editor export (matched by opId). */
export interface EditorExportProgressDto {
  opId: string;
  /** Processed output seconds. */
  seconds: number;
  /** 0–100 when the total length is known. */
  percent?: number;
}

export interface EditorCancelExportRequestDto {
  opId: string;
}

// --- Downloads (Phase 9) ----------------------------------------------------

export interface DownloadQueueItemDto {
  id: string;
  url: string;
  destination: string;
  fileName: string;
  title?: string | null;
  pluginId?: string | null;
  creatorId?: string | null;
  status: string;
  /** Which engine performed the transfer: 'http' (direct file) or 'ytdlp' (site extraction). */
  engine: string;
  /** Extract audio only (MP3) instead of the full video (yt-dlp engine). */
  audioOnly: boolean;
  /** Requested quality: 'best' or a height like '1080p'. */
  quality: string;
  priority: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number;
  eta: number;
  percent: number;
  retries: number;
  maxRetries: number;
  error?: string | null;
  /** Absolute path of the finished file (or partial .part file while downloading). */
  filePath?: string | null;
  /** Absolute path of the downloaded thumbnail image (when available). */
  thumbnailPath?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Result of probing a download URL for available qualities. */
export interface DownloadProbeResultDto {
  /** Which engine will handle this URL: direct file or site extraction. */
  engine: 'http' | 'ytdlp';
  title?: string;
  durationSeconds?: number;
  /** Available qualities, best first. For direct files this is a single entry. */
  formats: { value: string; label: string }[];
}

export type DownloadEventTypeDto =
  | 'download-queued'
  | 'download-started'
  | 'download-progress'
  | 'download-paused'
  | 'download-resumed'
  | 'download-completed'
  | 'download-failed'
  | 'download-cancelled'
  | 'download-retried';

export interface DownloadEventDto {
  type: DownloadEventTypeDto;
  downloadId: string;
  percent?: number;
  speed?: number;
  eta?: number;
  error?: string;
  timestamp: string;
}

// --- Uploads (Phase 9) ------------------------------------------------------

export interface UploadQueueItemDto {
  id: string;
  recordingId?: string | null;
  providerId: string;
  sourcePath: string;
  destinationPath?: string | null;
  status: string;
  priority: number;
  bytesUploaded: number;
  totalBytes: number;
  speed: number;
  eta: number;
  percent: number;
  retries: number;
  maxRetries: number;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type UploadEventTypeDto =
  | 'upload-queued'
  | 'upload-started'
  | 'upload-progress'
  | 'upload-completed'
  | 'upload-failed'
  | 'upload-cancelled'
  | 'upload-paused'
  | 'upload-resumed';

export interface UploadEventDto {
  type: UploadEventTypeDto;
  uploadId: string;
  percent?: number;
  speed?: number;
  eta?: number;
  error?: string;
  timestamp: string;
}

export interface UploadProviderDto {
  id: string;
  name: string;
  authenticated: boolean;
  healthy: boolean;
}

export interface UploadProviderMetaDto {
  id: string;
  name: string;
  description: string;
  requiresAccount: boolean;
  requiresApiKey: boolean;
  maxFileSize: number | null;
  storageQuota: string;
  downloadSpeed: 'unthrottled' | 'throttled';
  fileExpiry: string;
  adsOnDownload: boolean;
  pros: string[];
  cons: string[];
  setupInstructions: string[];
}

export interface ProviderCredentialsDto {
  email?: string;
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  token?: string;
  userhash?: string;
}

export interface ProviderConnectResultDto {
  ok: boolean;
  error?: string;
}

export interface FileVerificationResultDto {
  valid: boolean;
  exists: boolean;
  checksum?: string;
  errors: string[];
  verifiedAt: string;
}

/** The surface exposed to the renderer through the preload bridge. */
export interface DesktopApi {
  app: {
    getInfo(): Promise<AppInfo>;
    getSystemStats(): Promise<SystemStats>;
    getProcessStats(): Promise<ProcessStats>;
    getNetworkStats(): Promise<NetworkStats>;
    getPaths(): Promise<AppPaths>;
    /** Open a file or directory with the OS default handler (Explorer/Finder). */
    openPath(path: string): Promise<string>;
    /** Open an http/https URL in the default browser (gate CTAs etc.). */
    openUrl(url: string): Promise<void>;
    /** Detects CPU/RAM/disk profile and recommends Low-Resource Mode when weak. */
    getHardwareProfile(): Promise<HardwareProfileDto>;
    /** Grab a full-resolution frame from a local video file as a PNG data URL. */
    extractFrame(request: AppExtractFrameRequestDto): Promise<AppExtractFrameResultDto>;
    /** Write an image data URL to the OS clipboard. */
    copyImage(request: AppCopyImageRequestDto): Promise<void>;
    /** Ask the user where to save an image data URL (native Save dialog). */
    saveImage(request: AppSaveImageRequestDto): Promise<AppSaveImageResultDto>;
    /** Probe codecs/resolution/bitrate for the stats overlay. */
    getMediaInfo(request: { filePath: string }): Promise<AppMediaInfoDto>;
    /** Find a .srt/.vtt sidecar next to the video; returns a VTT data URL or null. */
    findSubtitle(request: { filePath: string }): Promise<AppSubtitleResultDto | null>;
  };
  windowControls: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<boolean>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizedChanged(callback: (maximized: boolean) => void): () => void;
  };
  logs: {
    write(entry: LogEntry): Promise<void>;
    list(limit?: number): Promise<LogEntry[]>;
  };
  settings: {
    getAll(): Promise<AppSettings>;
    set(patch: Partial<AppSettings>): Promise<AppSettings>;
    reset(): Promise<AppSettings>;
    validate(values: unknown): Promise<SettingsValidationResult>;
    /** Opens a file picker; returns the imported settings or null on cancel. */
    importFromFile(): Promise<AppSettings | null>;
    /** Opens a save dialog; returns false on cancel. */
    exportToFile(): Promise<boolean>;
  };
  license: {
    getStatus(): Promise<LicenseStatusDto>;
    /** Activates a license/trial key; never throws — returns ok:false + error. */
    activate(key: string): Promise<LicenseActivateResultDto>;
    deactivate(): Promise<LicenseStatusDto>;
  };
  plugins: {
    list(): Promise<PluginInfoDto[]>;
    enable(id: string): Promise<PluginInfoDto>;
    disable(id: string): Promise<PluginInfoDto>;
    remove(id: string): Promise<void>;
    update(id: string): Promise<PluginInfoDto>;
    /** Opens a directory picker for a plugin folder; returns null on cancel. */
    installFromDirectory(): Promise<PluginInfoDto | null>;
    getDiagnostics(id: string): Promise<PluginDiagnosticsDto>;
    getHealth(id: string): Promise<PluginHealthDto>;
    getSettings(id: string): Promise<Record<string, unknown>>;
    getSettingsSchema(id: string): Promise<SettingDefDto[]>;
    setSettings(id: string, values: Record<string, unknown>): Promise<void>;
    onEvent(callback: (event: PluginEventDto) => void): () => void;
  };
  notifications: {
    list(): Promise<NotificationDto[]>;
    markRead(id: number): Promise<void>;
    markAllRead(): Promise<void>;
    unreadCount(): Promise<number>;
    onNotification(callback: (notification: NotificationDto) => void): () => void;
  };
  creators: {
    list(): Promise<CreatorDto[]>;
    get(id: string): Promise<CreatorDto | undefined>;
    create(data: {
      pluginId: string;
      externalId: string;
      username: string;
      displayName: string;
      avatarUrl?: string | null;
      profileUrl?: string | null;
      autoRecord?: boolean;
      autoRecordQuality?: string;
      useProxy?: boolean;
      notes?: string | null;
    }): Promise<CreatorDto>;
    update(id: string, patch: Partial<CreatorDto>): Promise<void>;
    remove(id: string): Promise<void>;
    search(query: string): Promise<CreatorDto[]>;
    setFavorite(id: string, favorite: boolean): Promise<void>;
    setAutoRecord(id: string, enabled: boolean): Promise<void>;
    setUseProxy(id: string, enabled: boolean): Promise<void>;
    getTags(): Promise<CreatorTagDto[]>;
    createTag(name: string, color?: string): Promise<void>;
    removeTag(id: string): Promise<void>;
    renameTag(id: string, name: string): Promise<void>;
    addTag(creatorId: string, tagId: string): Promise<void>;
    removeTagFromCreator(creatorId: string, tagId: string): Promise<void>;
    listCreatorTags(creatorId: string): Promise<CreatorTagDto[]>;
    getCollections(): Promise<CollectionDto[]>;
    createCollection(name: string, description?: string): Promise<void>;
    removeCollection(id: string): Promise<void>;
    exportJson(): Promise<string>;
    exportCsv(): Promise<string>;
    importJson(data: string): Promise<{ imported: number; errors: string[] }>;
    importCsv(data: string): Promise<{ imported: number; errors: string[] }>;
    bulkFavorite(ids: string[], favorite: boolean): Promise<void>;
    bulkSetAutoRecord(ids: string[], enabled: boolean): Promise<void>;
    bulkRemove(ids: string[]): Promise<void>;
    bulkAddTag(ids: string[], tagId: string): Promise<void>;
    /** All tag assignments at once: creatorId -> its tags (for filtering/cards). */
    getAllTagAssignments(): Promise<Record<string, CreatorTagDto[]>>;
    /** Library aggregates (count/duration/size/last recorded) for one creator. */
    stats(creatorId: string): Promise<CreatorStatsDto>;
  };
  proxy: {
    getStatus(): Promise<ProxyStatusDto>;
    /** Manual (re)start — the Retry button / error recovery path. */
    start(): Promise<void>;
    /** Probe through the active proxy: exit IP + round-trip latency. */
    test(): Promise<ProxyTestResultDto>;
    /** Best-effort system VPN detection for the Secure Proxy page banner. */
    getNetworkMode(): Promise<ProxyNetworkModeDto>;
    onEvent(callback: (status: ProxyStatusDto) => void): () => void;
  };
  recordings: {
    list(limit?: number): Promise<RecordingDto[]>;
    recent(limit: number): Promise<RecordingDto[]>;
    countByStatus(): Promise<Record<string, number>>;
  };
  library: {
    search(filters: LibraryFiltersDto, sort: LibrarySortDto, offset: number, limit: number): Promise<LibrarySearchResultDto>;
    count(filters: LibraryFiltersDto): Promise<number>;
    getRecording(id: string): Promise<RecordingDto | undefined>;
    setFavorite(id: string, favorite: boolean): Promise<void>;
    setNotes(id: string, notes: string | null): Promise<void>;
    getTags(): Promise<CreatorTagDto[]>;
    createTag(name: string, color?: string): Promise<void>;
    renameTag(id: string, name: string): Promise<void>;
    removeTag(id: string): Promise<void>;
    addTag(recordingId: string, tagId: string): Promise<void>;
    removeTagFromRecording(recordingId: string, tagId: string): Promise<void>;
    listRecordingTags(recordingId: string): Promise<CreatorTagDto[]>;
    bulkFavorite(ids: string[], favorite: boolean): Promise<void>;
    bulkAddTag(ids: string[], tagId: string): Promise<void>;
    bulkRemoveTag(ids: string[], tagId: string): Promise<void>;
    bulkDelete(ids: string[]): Promise<void>;
    bulkMove(ids: string[], collectionId: string): Promise<void>;
    getCollections(): Promise<CollectionDto[]>;
    createCollection(name: string, description?: string): Promise<void>;
    renameCollection(id: string, name: string): Promise<void>;
    removeCollection(id: string): Promise<void>;
    revealInExplorer(filePath: string): Promise<void>;
    openFile(filePath: string): Promise<void>;
    copyPath(filePath: string): Promise<void>;
    deleteFile(filePath: string): Promise<void>;
    verifyFile(recordingId: string): Promise<FileVerificationResultDto>;
    refreshMetadata(recordingId: string): Promise<RecordingDto>;
    regenerateThumbnails(ids: string[]): Promise<void>;
    /** Scan the recordings output folder and import any media files not yet in the library. */
    scanFolder(): Promise<{ imported: number; skipped: number; errors: string[] }>;
  };
  editor: {
    /** Trim a selection into a new library entry (original untouched). */
    trim(request: EditorTrimRequestDto): Promise<RecordingDto>;
    /** Remove segments and join the rest into a new library entry. */
    cut(request: EditorCutRequestDto): Promise<RecordingDto>;
    /** Combine recordings in order into a new library entry. */
    concat(request: EditorConcatRequestDto): Promise<RecordingDto>;
    /** Cached filmstrip + waveform images for the editor timeline. */
    timeline(request: EditorTimelineRequestDto): Promise<EditorTimelineDto>;
    /** Extract the (optionally ranged) audio track into a new library entry. */
    extractAudio(request: EditorExtractAudioRequestDto): Promise<RecordingDto>;
    /** Detect quiet spans (dead air) in the source audio. */
    detectSilence(request: EditorDetectSilenceRequestDto): Promise<EditorSilenceSpanDto[]>;
    /** Kill a running export started with the given opId. */
    cancelExport(request: EditorCancelExportRequestDto): Promise<void>;
    onExportProgress(callback: (event: EditorExportProgressDto) => void): () => void;
  };
  monitoring: {
    start(): Promise<void>;
    stop(): Promise<void>;
    pause(creatorId: string): Promise<void>;
    resume(creatorId: string): Promise<void>;
    getStatus(): Promise<{ running: boolean; uptime: number }>;
    getJobs(): Promise<MonitoringJobDto[]>;
    getDashboard(): Promise<MonitoringDashboardDto>;
    addCreator(creatorId: string, pluginId: string, intervalMs?: number): Promise<MonitoringJobDto>;
    removeCreator(creatorId: string): Promise<void>;
    onEvent(callback: (event: MonitoringEventDto) => void): () => void;
  };
  recording: {
    start(stream: StreamObject): Promise<string>;
    startForCreator(
      creatorId: string,
      options?: { durationMinutes?: number; quality?: string; segmentMinutes?: number },
    ): Promise<string>;
    pause(jobId: string): Promise<void>;
    resume(jobId: string): Promise<void>;
    cancel(jobId: string): Promise<void>;
    retry(jobId: string): Promise<void>;
    restart(jobId: string): Promise<void>;
    /** Removes a finished (failed/completed/cancelled) job from the queue history. */
    removeJob(jobId: string): Promise<void>;
    /** Removes every failed job. Returns the number removed. */
    clearFailed(): Promise<number>;
    getJobs(): Promise<RecordingJobDto[]>;
    getSettings(): Promise<RecordingSettingsDto>;
    setSettings(settings: Partial<RecordingSettingsDto>): Promise<RecordingSettingsDto>;
    onEvent(callback: (event: RecordingEventDto) => void): () => void;
  };
  dashboard: {
    getStats(): Promise<DashboardStats>;
  };
  downloads: {
    list(status?: string): Promise<DownloadQueueItemDto[]>;
    get(id: string): Promise<DownloadQueueItemDto | undefined>;
    add(item: { url: string; destination: string; fileName: string; title?: string; pluginId?: string; creatorId?: string; priority?: number; audioOnly?: boolean; quality?: string }): Promise<DownloadQueueItemDto>;
    /** Inspects a URL and returns the qualities actually available for it. */
    probe(url: string): Promise<DownloadProbeResultDto>;
    remove(id: string): Promise<void>;
    pause(id: string): Promise<void>;
    resume(id: string): Promise<void>;
    cancel(id: string): Promise<void>;
    retry(id: string): Promise<void>;
    setPriority(id: string, priority: number): Promise<void>;
    pauseAll(): Promise<void>;
    resumeAll(): Promise<void>;
    clearCompleted(): Promise<void>;
    clearFailed(): Promise<void>;
    retryAll(): Promise<void>;
    countByStatus(): Promise<Record<string, number>>;
    bulkRemove(ids: string[]): Promise<void>;
    bulkRetry(ids: string[]): Promise<void>;
    onEvent(callback: (event: DownloadEventDto) => void): () => void;
  };
  uploads: {
    list(status?: string): Promise<UploadQueueItemDto[]>;
    get(id: string): Promise<UploadQueueItemDto | undefined>;
    add(item: { recordingId?: string; providerId: string; sourcePath: string; destinationPath?: string; priority?: number }): Promise<UploadQueueItemDto>;
    remove(id: string): Promise<void>;
    pause(id: string): Promise<void>;
    resume(id: string): Promise<void>;
    cancel(id: string): Promise<void>;
    retry(id: string): Promise<void>;
    clearCompleted(): Promise<void>;
    clearFailed(): Promise<void>;
    countByStatus(): Promise<Record<string, number>>;
    pickFile(): Promise<string | null>;
    providers(): Promise<UploadProviderDto[]>;
    providersMeta(): Promise<UploadProviderMetaDto[]>;
    testProvider(id: string): Promise<boolean>;
    connectGoogleDrive(clientId: string, clientSecret: string): Promise<ProviderConnectResultDto>;
    onEvent(callback: (event: UploadEventDto) => void): () => void;
  };
  storage: {
    getStats(): Promise<StorageStatsDto>;
    scan(): Promise<StorageStatsDto>;
    cleanup(options: { cache?: boolean; temp?: boolean; logs?: boolean }): Promise<void>;
    getLargestRecordings(limit: number): Promise<{ id: string; title: string; sizeBytes: number; filePath: string }[]>;
    getLargestFolders(limit: number): Promise<{ path: string; sizeBytes: number; fileCount: number }[]>;
  };
}
