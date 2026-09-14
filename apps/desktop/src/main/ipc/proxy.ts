import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { IpcContext } from './context';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

/** Handlers for the embedded secure proxy (status / retry / probe). */
export function registerProxyIpc({ getWindow, proxy }: IpcContext): void {
  if (proxy === undefined) return;
  ipcMain.handle(IPC_CHANNELS.proxyGetStatus, (event) => {
    trusted(event, getWindow);
    return proxy.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.proxyStart, (event) => {
    trusted(event, getWindow);
    void proxy.start().catch(() => {
      /* status event already surfaces the error to the renderer */
    });
  });

  ipcMain.handle(IPC_CHANNELS.proxyTest, async (event) => {
    trusted(event, getWindow);
    return proxy.testConnection();
  });

  ipcMain.handle(IPC_CHANNELS.proxyGetNetworkMode, async (event) => {
    trusted(event, getWindow);
    return proxy.detectSystemVpn();
  });
}
