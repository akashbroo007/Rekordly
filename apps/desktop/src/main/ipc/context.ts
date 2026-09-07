import type { BrowserWindow } from 'electron';
import type { LogRepo, CreatorRepo, RecordingRepo, DownloadQueueRepo, UploadQueueRepo, BackgroundJobRepo } from '@rekordly/database';
import type { Logger } from '@rekordly/shared';
import type {
  AppDirs,
  NotificationService,
  PluginManager,
  SettingsService,
  MonitoringService,
  RecordingService,
  DownloadManager,
  UploadService,
  StorageService,
  BackgroundJobService,
  HardwareService,
  ProcessMonitorService,
  NetworkMonitorService,
} from '@rekordly/core';

export interface IpcContext {
  logger: Logger;
  getWindow: () => BrowserWindow | null;
  dirs: AppDirs;
  settings: SettingsService;
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
  logRepo: LogRepo;
  creatorRepo: CreatorRepo;
  recordingRepo: RecordingRepo;
  downloadRepo: DownloadQueueRepo;
  uploadRepo: UploadQueueRepo;
  jobRepo: BackgroundJobRepo;
}
