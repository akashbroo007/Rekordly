import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { IpcContext } from './context';

export function registerMonitoringIpc(context: IpcContext): void {
  const { monitoring } = context;

  ipcMain.handle(IPC_CHANNELS.monitoringStart, async () => {
    await monitoring.start();
  });

  ipcMain.handle(IPC_CHANNELS.monitoringStop, async () => {
    await monitoring.stop();
  });

  ipcMain.handle(IPC_CHANNELS.monitoringPause, async (_event, creatorId: string) => {
    monitoring.pauseCreator(creatorId);
  });

  ipcMain.handle(IPC_CHANNELS.monitoringResume, async (_event, creatorId: string) => {
    monitoring.resumeCreator(creatorId);
  });

  ipcMain.handle(IPC_CHANNELS.monitoringGetStatus, () => {
    return monitoring.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.monitoringGetJobs, () => {
    return monitoring.getJobs();
  });

  ipcMain.handle(IPC_CHANNELS.monitoringGetDashboard, () => {
    return monitoring.getDashboard();
  });

  ipcMain.handle(
    IPC_CHANNELS.monitoringAddCreator,
    async (_event, creatorId: string, pluginId: string, intervalMs?: number) => {
      return monitoring.addCreator(creatorId, pluginId, intervalMs);
    },
  );

  ipcMain.handle(IPC_CHANNELS.monitoringRemoveCreator, async (_event, creatorId: string) => {
    monitoring.removeCreator(creatorId);
  });

  // Forward monitoring events to renderer
  monitoring.on('event', (event) => {
    const { getWindow } = context;
    const win = getWindow();
    if (win !== null && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.monitoringEvent, event);
    }
  });
}
