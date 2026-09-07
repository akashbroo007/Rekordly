import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { IpcContext } from './context';
import { pruneMissingRecordings, pruneMissingDownloads } from './media-sync';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

export function registerDashboardIpc({ getWindow, creatorRepo, recordingRepo, downloadRepo, plugins, logger }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.dashboardGetStats, (event) => {
    trusted(event, getWindow);
    // ponytail: reconcile with disk first so externally deleted files don't
    // keep stale rows alive in the stats.
    pruneMissingRecordings(recordingRepo, logger);
    const creators = creatorRepo.list();
    const statusCounts = recordingRepo.countByStatus();
    // ponytail: same set the UI counts as "Active" (recordings.tsx
    // ACTIVE_STATUSES) — otherwise the header says "No active recording"
    // while an Active card is still on screen.
    const ACTIVE_JOB_STATUSES = ['queued', 'preparing', 'recording', 'paused', 'verifying', 'processing', 'stopping'];
    const activeJobs = ACTIVE_JOB_STATUSES.reduce((sum, s) => sum + recordingRepo.listJobs(s).length, 0);
    const pluginList = plugins.list();
    let recordingStorage = 0;
    for (const rec of recordingRepo.listRecordings()) {
      if (rec.sizeBytes) recordingStorage += rec.sizeBytes;
    }
    // ponytail: completed downloads count toward storage too — drop rows
    // whose files were deleted outside the app before summing.
    pruneMissingDownloads(downloadRepo, logger);
    let downloadStorage = 0;
    for (const dl of downloadRepo.list('completed')) {
      if (dl.totalBytes > 0) downloadStorage += dl.totalBytes;
    }
    // ponytail: analytics must reflect real session outcomes — the library
    // only stores finished FILES, so failed/cancelled jobs never showed up.
    // Count the actual recording jobs per status instead.
    const allJobs = recordingRepo.listJobs();
    const jobStatusCounts: Record<string, number> = {};
    for (const job of allJobs) {
      jobStatusCounts[job.status] = (jobStatusCounts[job.status] ?? 0) + 1;
    }
    return {
      totalCreators: creators.length,
      totalRecordings: Object.values(statusCounts).reduce((a, b) => a + b, 0),
      totalPlugins: pluginList.length,
      totalStorageBytes: recordingStorage + downloadStorage,
      recordingStorageBytes: recordingStorage,
      downloadStorageBytes: downloadStorage,
      successfulRecordings: statusCounts['completed'] ?? 0,
      failedRecordings: (jobStatusCounts['failed'] ?? 0) + (jobStatusCounts['cancelled'] ?? 0),
      activeJobs,
      liveCreators: 0,
      jobStatusCounts,
    };
  });
}
