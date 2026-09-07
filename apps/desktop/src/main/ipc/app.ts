import { ipcMain, app, BrowserWindow, shell, type IpcMainInvokeEvent } from 'electron';
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { IPC_CHANNELS, type LogEntry } from '@rekordly/shared';
import type { IpcContext } from './context';
import type { ProcessMonitorService, NetworkMonitorService } from '@rekordly/core';

const ALLOWED_LEVELS: readonly LogEntry['level'][] = ['debug', 'info', 'warn', 'error', 'fatal'];

function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.scope === 'string' &&
    entry.scope.length <= 100 &&
    typeof entry.message === 'string' &&
    entry.message.length <= 2000 &&
    typeof entry.time === 'number' &&
    ALLOWED_LEVELS.includes(entry.level as LogEntry['level']) &&
    (entry.data === undefined || (typeof entry.data === 'object' && entry.data !== null))
  );
}

function trustedWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win === null || win.isDestroyed()) {
    throw new Error('Unauthorized IPC caller');
  }
  return win;
}

export function registerAppIpc({
  logger,
  getWindow,
  dirs,
  logRepo,
  hardware,
  processMonitor,
  networkMonitor,
  recording,
}: IpcContext & {
  processMonitor?: ProcessMonitorService;
  networkMonitor?: NetworkMonitorService;
}): void {
  const trusted = (event: IpcMainInvokeEvent): boolean => {
    const win = getWindow();
    return win !== null && !win.isDestroyed() && event.sender === win.webContents;
  };

  ipcMain.handle(IPC_CHANNELS.appGetInfo, (event) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    return {
      name: 'Rekordly',
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node,
    };
  });

  ipcMain.handle(IPC_CHANNELS.appGetSystemStats, async (event) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    // ponytail: probe the drive hosting the recordings vault so the
    // System Status "Disk Space" row shows real numbers. Best-effort —
    // a statfs failure degrades to nulls and the UI shows "—".
    let diskFreeBytes: number | null = null;
    let diskTotalBytes: number | null = null;
    try {
      const fsStats = await statfs(dirs.recordingsDir);
      diskFreeBytes = fsStats.bsize * fsStats.bavail;
      diskTotalBytes = fsStats.bsize * fsStats.blocks;
    } catch (error) {
      logger.debug({ error }, 'statfs failed for disk stats');
    }

    // Get child process stats
    const childStats = processMonitor?.getStats() ?? {
      totalCpuPercent: 0,
      totalMemoryBytes: 0,
      processCount: 0,
      processes: [],
    };

    // Get network stats
    const netStats = networkMonitor?.getStats() ?? {
      downloadSpeed: 0,
      uploadSpeed: 0,
    };

    // Count active recordings
    const activeJobs = recording.getJobs().filter((j) =>
      ['queued', 'preparing', 'recording', 'paused'].includes(j.status),
    );

    return {
      cpuUsage: process.getCPUUsage().percentCPUUsage,
      memoryRss: process.memoryUsage().rss,
      memoryTotal: os.totalmem(),
      diskFreeBytes,
      diskTotalBytes,
      childCpuUsage: childStats.totalCpuPercent,
      childMemoryBytes: childStats.totalMemoryBytes,
      activeRecordings: activeJobs.length,
      networkDownloadSpeed: netStats.downloadSpeed,
      networkUploadSpeed: netStats.uploadSpeed,
    };
  });

  ipcMain.handle(IPC_CHANNELS.appGetProcessStats, (event) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    return processMonitor?.getStats() ?? {
      totalCpuPercent: 0,
      totalMemoryBytes: 0,
      processCount: 0,
      processes: [],
    };
  });

  ipcMain.handle(IPC_CHANNELS.appGetNetworkStats, (event) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    return networkMonitor?.getStats() ?? {
      downloadSpeed: 0,
      uploadSpeed: 0,
    };
  });

  ipcMain.handle(IPC_CHANNELS.appGetHardwareProfile, (event) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    return hardware.getProfile();
  });

  ipcMain.handle(IPC_CHANNELS.appGetPaths, (event) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    return { ...dirs };
  });

  // ponytail: window.open('file://…') is blocked in Electron renderers —
  // opening folders/files must go through shell.openPath in the main process.
  ipcMain.handle(IPC_CHANNELS.appOpenPath, (event, targetPath: unknown) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    if (typeof targetPath !== 'string' || targetPath.length === 0 || targetPath.length > 1000) {
      throw new Error('Invalid path');
    }
    return shell.openPath(targetPath);
  });

  ipcMain.handle(IPC_CHANNELS.windowMinimize, (event) => {
    trustedWindow(event).minimize();
  });

  ipcMain.handle(IPC_CHANNELS.windowToggleMaximize, (event) => {
    const win = trustedWindow(event);
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  });

  ipcMain.handle(IPC_CHANNELS.windowClose, (event) => {
    trustedWindow(event).close();
  });

  ipcMain.handle(IPC_CHANNELS.windowIsMaximized, (event) => {
    return trustedWindow(event).isMaximized();
  });

  ipcMain.handle(IPC_CHANNELS.logsWrite, (event, entry: unknown) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    if (!isLogEntry(entry)) {
      throw new Error('Invalid log entry');
    }
    logRepo.insert(entry);
    const child = logger.child({ scope: entry.scope });
    const data = entry.data ?? {};
    switch (entry.level) {
      case 'debug':
        child.debug(data, entry.message);
        break;
      case 'info':
        child.info(data, entry.message);
        break;
      case 'warn':
        child.warn(data, entry.message);
        break;
      case 'error':
        child.error(data, entry.message);
        break;
      case 'fatal':
        child.fatal(data, entry.message);
        break;
    }
  });

  ipcMain.handle(IPC_CHANNELS.logsList, (event, limit: unknown) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    const max = typeof limit === 'number' && Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 1000) : 100;
    return logRepo.list(max);
  });
}
