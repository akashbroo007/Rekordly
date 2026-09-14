import { ipcMain, app, BrowserWindow, shell, clipboard, nativeImage, dialog, type IpcMainInvokeEvent } from 'electron';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { IPC_CHANNELS, type LogEntry } from '@rekordly/shared';
import type {
  AppCopyImageRequestDto,
  AppExtractFrameRequestDto,
  AppExtractFrameResultDto,
  AppSaveImageRequestDto,
  AppSaveImageResultDto,
  AppSubtitleResultDto,
} from '@rekordly/shared';
import type { IpcContext } from './context';
import type { ProcessMonitorService, NetworkMonitorService } from '@rekordly/core';
import { FfmpegService } from '@rekordly/core';

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

  // ponytail: gate CTAs (Upgrade to Pro) open in the default browser —
  // renderers cannot shell out themselves, and only http/https is allowed.
  ipcMain.handle(IPC_CHANNELS.appOpenUrl, (event, url: unknown) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    if (typeof url !== 'string' || url.length === 0 || url.length > 2000) {
      throw new Error('Invalid URL');
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Only http/https URLs can be opened');
    }
    void shell.openExternal(parsed.toString());
  });

  // --- Player screenshots ----------------------------------------------------
  // ponytail: the sf-media:// video taints a renderer-side canvas, so frame
  // grabs run through ffmpeg in the main process instead (pixel-exact frame
  // at the requested time, source resolution).

  const DATA_URL_RE = /^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/;

  ipcMain.handle(IPC_CHANNELS.appExtractFrame, async (event, request: unknown): Promise<AppExtractFrameResultDto> => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    const req = (typeof request === 'object' && request !== null ? request : {}) as Partial<AppExtractFrameRequestDto>;
    if (typeof req.filePath !== 'string' || req.filePath.length === 0 || req.filePath.length > 2000) {
      throw new Error('Invalid file path');
    }
    if (typeof req.seconds !== 'number' || !Number.isFinite(req.seconds) || req.seconds < 0) {
      throw new Error('Invalid timestamp');
    }
    const ffmpeg = new FfmpegService();
    const tempPath = join(dirs.tempDir, `frame-${randomUUID().slice(0, 8)}.png`);
    try {
      await mkdir(dirs.tempDir, { recursive: true });
      await ffmpeg.extractFrame(req.filePath, tempPath, req.seconds);
      const bytes = await readFile(tempPath);
      return { dataUrl: `data:image/png;base64,${bytes.toString('base64')}` };
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }
  });

  ipcMain.handle(IPC_CHANNELS.appCopyImage, (event, request: unknown) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    const req = (typeof request === 'object' && request !== null ? request : {}) as Partial<AppCopyImageRequestDto>;
    if (typeof req.dataUrl !== 'string' || !DATA_URL_RE.test(req.dataUrl)) {
      throw new Error('Invalid image data URL');
    }
    clipboard.writeImage(nativeImage.createFromDataURL(req.dataUrl));
  });

  ipcMain.handle(IPC_CHANNELS.appSaveImage, async (event, request: unknown): Promise<AppSaveImageResultDto> => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    const req = (typeof request === 'object' && request !== null ? request : {}) as Partial<AppSaveImageRequestDto>;
    if (typeof req.dataUrl !== 'string' || !DATA_URL_RE.test(req.dataUrl)) {
      throw new Error('Invalid image data URL');
    }
    if (typeof req.suggestedName !== 'string' || req.suggestedName.length === 0 || req.suggestedName.length > 300) {
      throw new Error('Invalid file name');
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win ?? new BrowserWindow({ show: false }), {
      title: 'Save screenshot',
      // ponytail: strip any path the renderer sent — the dialog decides the
      // directory; only the file name survives.
      defaultPath: req.suggestedName.split(/[\\/]/).pop(),
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
    if (result.canceled || result.filePath === undefined) {
      return { canceled: true };
    }
    const base64 = req.dataUrl.slice(req.dataUrl.indexOf(',') + 1);
    await writeFile(result.filePath, Buffer.from(base64, 'base64'));
    logger.info({ filePath: result.filePath }, 'screenshot saved');
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle(IPC_CHANNELS.appGetMediaInfo, async (event, request: unknown) => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    const req = (typeof request === 'object' && request !== null ? request : {}) as { filePath?: unknown };
    if (typeof req.filePath !== 'string' || req.filePath.length === 0 || req.filePath.length > 2000) {
      throw new Error('Invalid file path');
    }
    return new FfmpegService().getMetadata(req.filePath);
  });

  // #11 subtitles — look for a .srt/.vtt sidecar next to the video and hand
  // the renderer a VTT data URL (<track> needs same-origin-safe content).
  ipcMain.handle(IPC_CHANNELS.appFindSubtitle, async (event, request: unknown): Promise<AppSubtitleResultDto | null> => {
    if (!trusted(event)) {
      throw new Error('Unauthorized IPC caller');
    }
    const req = (typeof request === 'object' && request !== null ? request : {}) as { filePath?: unknown };
    if (typeof req.filePath !== 'string' || req.filePath.length === 0 || req.filePath.length > 2000) {
      throw new Error('Invalid file path');
    }
    const dot = req.filePath.lastIndexOf('.');
    const base = dot > 0 ? req.filePath.slice(0, dot) : req.filePath;
    const candidates = [`${base}.vtt`, `${base}.en.vtt`, `${base}.srt`, `${base}.en.srt`];
    for (const candidate of candidates) {
      if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
      const content = await readFile(candidate, 'utf8');
      const vtt = candidate.endsWith('.srt')
        ? `WEBVTT\n\n${content.replace(/\r+/g, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`
        : content;
      logger.debug({ candidate }, 'subtitle sidecar found');
      return { dataUrl: `data:text/vtt;base64,${Buffer.from(vtt, 'utf8').toString('base64')}` };
    }
    return null;
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
