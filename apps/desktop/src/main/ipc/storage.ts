import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { IpcContext } from './context';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

export function registerStorageIpc({ getWindow, storage }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.storageGetStats, (event) => {
    trusted(event, getWindow);
    return storage.getStats();
  });

  ipcMain.handle(IPC_CHANNELS.storageScan, (event) => {
    trusted(event, getWindow);
    return storage.getStats();
  });

  ipcMain.handle(IPC_CHANNELS.storageCleanup, (event, options: unknown) => {
    trusted(event, getWindow);
    const opts = (typeof options === 'object' && options !== null ? options : {}) as { cache?: boolean; temp?: boolean; logs?: boolean };
    storage.cleanup(opts);
  });

  ipcMain.handle(IPC_CHANNELS.storageGetLargestRecordings, (event, limit: unknown) => {
    trusted(event, getWindow);
    const stats = storage.getStats();
    return stats.largestRecordings.slice(0, typeof limit === 'number' ? limit : 10);
  });

  ipcMain.handle(IPC_CHANNELS.storageGetLargestFolders, (event, limit: unknown) => {
    trusted(event, getWindow);
    const stats = storage.getStats();
    return stats.largestFolders.slice(0, typeof limit === 'number' ? limit : 10);
  });
}
