import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { IpcContext } from './context';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

export function registerNotificationsIpc({ getWindow, notifications }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.notificationsList, (event) => {
    trusted(event, getWindow);
    return notifications.list();
  });

  ipcMain.handle(IPC_CHANNELS.notificationsMarkRead, (event, id: unknown) => {
    trusted(event, getWindow);
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new Error('Invalid notification id');
    }
    notifications.markRead(id);
  });

  ipcMain.handle(IPC_CHANNELS.notificationsMarkAllRead, (event) => {
    trusted(event, getWindow);
    notifications.markAllRead();
  });

  ipcMain.handle(IPC_CHANNELS.notificationsUnreadCount, (event) => {
    trusted(event, getWindow);
    return notifications.unreadCount();
  });
}
