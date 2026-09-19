import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { IpcContext } from './context';

function trusted(event: Electron.IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

/** Push-notification test + manual automation run handlers. */
export function registerPushIpc({ getWindow, push, automation }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.pushTest, async (event) => {
    trusted(event, getWindow);
    return push.test();
  });

  ipcMain.handle(IPC_CHANNELS.pushDetectTelegramChatId, async (event, token: unknown) => {
    trusted(event, getWindow);
    if (typeof token !== 'string') throw new Error('Invalid bot token');
    return push.detectTelegramChatIds(token);
  });

  ipcMain.handle(IPC_CHANNELS.automationRunForRecording, async (event, recordingId: string) => {
    trusted(event, getWindow);
    if (typeof recordingId !== 'string' || recordingId === '') {
      throw new Error('Invalid recording id');
    }
    return automation.runForRecording(recordingId);
  });
}
