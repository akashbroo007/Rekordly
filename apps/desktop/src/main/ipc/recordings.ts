import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { IpcContext } from './context';
import { pruneMissingRecordings } from './media-sync';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

export function registerRecordingsIpc({ getWindow, recordingRepo, logger }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.recordingsList, (event, limit: unknown) => {
    trusted(event, getWindow);
    pruneMissingRecordings(recordingRepo, logger);
    return recordingRepo.listRecordings(typeof limit === 'number' ? limit : undefined);
  });

  ipcMain.handle(IPC_CHANNELS.recordingsRecent, (event, limit: unknown) => {
    trusted(event, getWindow);
    pruneMissingRecordings(recordingRepo, logger);
    return recordingRepo.recentRecordings(typeof limit === 'number' ? limit : 10);
  });

  ipcMain.handle(IPC_CHANNELS.recordingsCountByStatus, (event) => {
    trusted(event, getWindow);
    return recordingRepo.countByStatus();
  });
}
