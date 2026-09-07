import { registerAppIpc } from './app';
import { registerNotificationsIpc } from './notifications';
import { registerPluginsIpc } from './plugins';
import { registerSettingsIpc } from './settings';
import { registerCreatorsIpc } from './creators';
import { registerRecordingsIpc } from './recordings';
import { registerMonitoringIpc } from './monitoring';
import { registerRecordingIpc } from './recording';
import { registerDashboardIpc } from './dashboard';
import { registerLibraryIpc } from './library';
import { registerDownloadsIpc } from './downloads';
import { registerUploadsIpc } from './uploads';
import { registerStorageIpc } from './storage';
import type { IpcContext } from './context';

/** Registers every typed IPC handler; call once during bootstrap. */
export function registerIpcHandlers(context: IpcContext): void {
  registerAppIpc(context);
  registerSettingsIpc(context);
  registerPluginsIpc(context);
  registerNotificationsIpc(context);
  registerCreatorsIpc(context);
  registerRecordingsIpc(context);
  registerMonitoringIpc(context);
  registerRecordingIpc(context);
  registerDashboardIpc(context);
  registerLibraryIpc(context);
  registerDownloadsIpc(context);
  registerUploadsIpc(context);
  registerStorageIpc(context);
}

export type { IpcContext };
