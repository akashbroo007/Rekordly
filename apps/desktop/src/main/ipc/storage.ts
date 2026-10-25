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
  // ponytail: getStats is async now (file walk moved off the event loop) —
  // handlers await; the renderer always invoked promises via ipcRenderer.
  ipcMain.handle(IPC_CHANNELS.storageGetStats, async (event) => {
    trusted(event, getWindow);
    return storage.getStats();
  });

  ipcMain.handle(IPC_CHANNELS.storageScan, async (event) => {
    trusted(event, getWindow);
    return storage.getStats();
  });

  ipcMain.handle(IPC_CHANNELS.storageCleanup, async (event, options: unknown) => {
    trusted(event, getWindow);
    const opts = (typeof options === 'object' && options !== null ? options : {}) as { cache?: boolean; temp?: boolean; logs?: boolean };
    await storage.cleanup(opts);
  });

  ipcMain.handle(IPC_CHANNELS.storageGetLargestRecordings, async (event, limit: unknown) => {
    trusted(event, getWindow);
    const stats = await storage.getStats();
    return stats.largestRecordings.slice(0, typeof limit === 'number' ? limit : 10);
  });

  ipcMain.handle(IPC_CHANNELS.storageGetLargestFolders, async (event, limit: unknown) => {
    trusted(event, getWindow);
    const stats = await storage.getStats();
    return stats.largestFolders.slice(0, typeof limit === 'number' ? limit : 10);
  });
}
