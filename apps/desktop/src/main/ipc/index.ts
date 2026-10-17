import { registerAppIpc } from './app';
import { registerNotificationsIpc } from './notifications';
import { registerPluginsIpc } from './plugins';
import { registerProxyIpc } from './proxy';
import { registerSettingsIpc } from './settings';
import { registerCreatorsIpc } from './creators';
import { registerRecordingsIpc } from './recordings';
import { registerMonitoringIpc } from './monitoring';
import { registerRecordingIpc } from './recording';
import { registerDashboardIpc } from './dashboard';
import { registerEditorIpc } from './editor';
import { registerLibraryIpc } from './library';
import { registerDownloadsIpc } from './downloads';
import { registerUploadsIpc } from './uploads';
import { registerStorageIpc } from './storage';
import { registerPushIpc } from './push';
import type { IpcContext } from './context';

/** Registers every typed IPC handler; call once during bootstrap. */
export function registerIpcHandlers(context: IpcContext): void {
  registerAppIpc(context);
  registerSettingsIpc(context);
  registerPluginsIpc(context);
  registerProxyIpc(context);
  registerNotificationsIpc(context);
  registerCreatorsIpc(context);
  registerRecordingsIpc(context);
  registerMonitoringIpc(context);
  registerRecordingIpc(context);
  registerDashboardIpc(context);
  registerEditorIpc(context);
  registerLibraryIpc(context);
  registerDownloadsIpc(context);
  registerUploadsIpc(context);
  registerStorageIpc(context);
  registerPushIpc(context);
}

export type { IpcContext };
