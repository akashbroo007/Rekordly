import type { BrowserWindow } from 'electron';
import type { LogRepo, CreatorRepo, RecordingRepo, DownloadQueueRepo, UploadQueueRepo, BackgroundJobRepo } from '@rekordly/database';
import type { Logger } from '@rekordly/shared';
import type {
  AppDirs,
  NotificationService,
  PluginManager,
  SettingsService,
  LicenseService,
  GateNotifier,
  MonitoringService,
  RecordingService,
  DownloadManager,
  UploadService,
  StorageService,
  BackgroundJobService,
  HardwareService,
  ProcessMonitorService,
  NetworkMonitorService,
  TorService,
} from '@rekordly/core';

export interface IpcContext {
  logger: Logger;
  getWindow: () => BrowserWindow | null;
  dirs: AppDirs;
  settings: SettingsService;
  license: LicenseService;
  gateNotifier: GateNotifier;
  notifications: NotificationService;
  plugins: PluginManager;
  monitoring: MonitoringService;
  recording: RecordingService;
  downloads: DownloadManager;
  uploads: UploadService;
  storage: StorageService;
  jobs: BackgroundJobService;
  hardware: HardwareService;
  processMonitor?: ProcessMonitorService;
  networkMonitor?: NetworkMonitorService;
  /** Embedded secure proxy (Tor) — status/retry/probe surface. */
  proxy?: TorService;
  logRepo: LogRepo;
  creatorRepo: CreatorRepo;
  recordingRepo: RecordingRepo;
  downloadRepo: DownloadQueueRepo;
  uploadRepo: UploadQueueRepo;
  jobRepo: BackgroundJobRepo;
}
