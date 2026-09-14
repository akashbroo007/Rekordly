import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { IpcContext } from './context';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

export function registerLicenseIpc(context: IpcContext): void {
  const { getWindow, license } = context;

  ipcMain.handle(IPC_CHANNELS.licenseGetStatus, (event) => {
    trusted(event, getWindow);
    return license.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.licenseActivate, (event, key: unknown) => {
    trusted(event, getWindow);
    if (typeof key !== 'string') {
      return { ok: false, error: 'Invalid license key.' };
    }
    return license.activate(key);
  });

  ipcMain.handle(IPC_CHANNELS.licenseDeactivate, (event) => {
    trusted(event, getWindow);
    return license.deactivate();
  });
}
