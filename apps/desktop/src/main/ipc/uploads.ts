import { dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import { getAllProviderMeta } from '@rekordly/core';
import type { IpcContext } from './context';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2000;
}

export function registerUploadsIpc({ getWindow, uploads }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.uploadsList, (event, status: unknown) => {
    trusted(event, getWindow);
    return uploads.listUploads(typeof status === 'string' ? status : undefined);
  });

  ipcMain.handle(IPC_CHANNELS.uploadsGet, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid upload id');
    return uploads.getUpload(id);
  });

  ipcMain.handle(IPC_CHANNELS.uploadsAdd, (event, item: unknown) => {
    trusted(event, getWindow);
    if (typeof item !== 'object' || item === null) throw new Error('Invalid upload item');
    const d = item as Record<string, unknown>;
    if (!isString(d['providerId']) || !isString(d['sourcePath'])) {
      throw new Error('Missing required fields');
    }
    return uploads.addUpload({
      recordingId: typeof d['recordingId'] === 'string' ? d['recordingId'] : undefined,
      providerId: d['providerId'] as string,
      sourcePath: d['sourcePath'] as string,
      destinationPath: typeof d['destinationPath'] === 'string' ? d['destinationPath'] : undefined,
      priority: typeof d['priority'] === 'number' ? d['priority'] : undefined,
    });
  });

  ipcMain.handle(IPC_CHANNELS.uploadsRemove, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid upload id');
    uploads.removeUpload(id);
  });

  ipcMain.handle(IPC_CHANNELS.uploadsPause, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid upload id');
    uploads.pauseUpload(id);
  });

  ipcMain.handle(IPC_CHANNELS.uploadsResume, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid upload id');
    uploads.resumeUpload(id);
  });

  ipcMain.handle(IPC_CHANNELS.uploadsCancel, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid upload id');
    uploads.cancelUpload(id);
  });

  ipcMain.handle(IPC_CHANNELS.uploadsRetry, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid upload id');
    uploads.retryUpload(id);
  });

  ipcMain.handle(IPC_CHANNELS.uploadsClearCompleted, (event) => {
    trusted(event, getWindow);
    uploads.clearCompleted();
  });

  ipcMain.handle(IPC_CHANNELS.uploadsClearFailed, (event) => {
    trusted(event, getWindow);
    uploads.clearFailed();
  });

  ipcMain.handle(IPC_CHANNELS.uploadsCountByStatus, (event) => {
    trusted(event, getWindow);
    return uploads.countByStatus();
  });

  ipcMain.handle(IPC_CHANNELS.uploadsProviders, (event) => {
    trusted(event, getWindow);
    return uploads.getProviderStatus();
  });

  ipcMain.handle(IPC_CHANNELS.uploadsProvidersMeta, (event) => {
    trusted(event, getWindow);
    return getAllProviderMeta();
  });

  ipcMain.handle(IPC_CHANNELS.uploadsTestProvider, async (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid provider id');
    return uploads.testProvider(id);
  });

  ipcMain.handle(IPC_CHANNELS.uploadsPickFile, async (event) => {
    trusted(event, getWindow);
    const win = getWindow();
    if (win === null) return null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose a file to upload',
      properties: ['openFile'],
      filters: [
        { name: 'Video', extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
