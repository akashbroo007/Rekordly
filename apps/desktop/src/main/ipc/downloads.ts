import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { IpcContext } from './context';
import { pruneMissingDownloads } from './media-sync';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2000;
}

export function registerDownloadsIpc({ getWindow, downloads, downloadRepo, logger }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.downloadsList, (event, status: unknown) => {
    trusted(event, getWindow);
    // ponytail: drop completed rows whose files were deleted outside the app.
    pruneMissingDownloads(downloadRepo, logger);
    return downloads.listDownloads(typeof status === 'string' ? status : undefined);
  });

  ipcMain.handle(IPC_CHANNELS.downloadsGet, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid download id');
    return downloads.getDownload(id);
  });

  ipcMain.handle(IPC_CHANNELS.downloadsAdd, (event, item: unknown) => {
    trusted(event, getWindow);
    if (typeof item !== 'object' || item === null) throw new Error('Invalid download item');
    const d = item as Record<string, unknown>;
    if (!isString(d['url']) || !isString(d['fileName'])) {
      throw new Error('Missing required fields');
    }
    // ponytail: an empty destination means "auto-organize" — DownloadManager
    // puts the file into <downloadsDir>/<website>/. Explicit values pass
    // through untouched (relative ones resolve against the downloads dir).
    const destination = isString(d['destination']) ? d['destination'] : '';
    return downloads.addDownload({
      url: d['url'] as string,
      destination,
      fileName: d['fileName'] as string,
      title: typeof d['title'] === 'string' ? d['title'] : undefined,
      pluginId: typeof d['pluginId'] === 'string' ? d['pluginId'] : undefined,
      creatorId: typeof d['creatorId'] === 'string' ? d['creatorId'] : undefined,
      priority: typeof d['priority'] === 'number' ? d['priority'] : undefined,
      audioOnly: d['audioOnly'] === true,
      quality: typeof d['quality'] === 'string' && d['quality'].length > 0 ? d['quality'] : 'best',
    });
  });

  ipcMain.handle(IPC_CHANNELS.downloadsProbe, async (event, url: unknown) => {
    trusted(event, getWindow);
    if (!isString(url)) throw new Error('Invalid URL');
    try {
      return await downloads.probeDownload(url);
    } catch (error) {
      // ponytail: surface a friendly message instead of a raw yt-dlp dump.
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not inspect this link: ${message.slice(0, 200)}`);
    }
  });

  ipcMain.handle(IPC_CHANNELS.downloadsRemove, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid download id');
    downloads.removeDownload(id);
  });

  ipcMain.handle(IPC_CHANNELS.downloadsPause, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid download id');
    downloads.pauseDownload(id);
  });

  ipcMain.handle(IPC_CHANNELS.downloadsResume, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid download id');
    downloads.resumeDownload(id);
  });

  ipcMain.handle(IPC_CHANNELS.downloadsCancel, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid download id');
    downloads.cancelDownload(id);
  });

  ipcMain.handle(IPC_CHANNELS.downloadsRetry, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid download id');
    downloads.retryDownload(id);
  });

  ipcMain.handle(IPC_CHANNELS.downloadsSetPriority, (event, id: unknown, priority: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid download id');
    if (typeof priority !== 'number') throw new Error('Invalid priority');
    downloads.setPriority(id, priority);
  });

  ipcMain.handle(IPC_CHANNELS.downloadsPauseAll, (event) => {
    trusted(event, getWindow);
    downloads.pauseAll();
  });

  ipcMain.handle(IPC_CHANNELS.downloadsResumeAll, (event) => {
    trusted(event, getWindow);
    downloads.resumeAll();
  });

  ipcMain.handle(IPC_CHANNELS.downloadsClearCompleted, (event) => {
    trusted(event, getWindow);
    downloads.clearCompleted();
  });

  ipcMain.handle(IPC_CHANNELS.downloadsClearFailed, (event) => {
    trusted(event, getWindow);
    downloads.clearFailed();
  });

  ipcMain.handle(IPC_CHANNELS.downloadsRetryAll, (event) => {
    trusted(event, getWindow);
    downloads.retryAll();
  });

  ipcMain.handle(IPC_CHANNELS.downloadsCountByStatus, (event) => {
    trusted(event, getWindow);
    return downloads.countByStatus();
  });

  ipcMain.handle(IPC_CHANNELS.downloadsBulkRemove, (event, ids: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids)) throw new Error('Invalid ids');
    downloads.bulkRemove(ids.filter(isString));
  });

  ipcMain.handle(IPC_CHANNELS.downloadsBulkRetry, (event, ids: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids)) throw new Error('Invalid ids');
    downloads.bulkRetry(ids.filter(isString));
  });
}
