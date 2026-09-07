import { readFileSync, writeFileSync } from 'node:fs';
import { ipcMain, dialog, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, type AppSettings } from '@rekordly/shared';
import type { IpcContext } from './context';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

function isPartialSettings(value: unknown): value is Partial<AppSettings> {
  return typeof value === 'object' && value !== null;
}

export function registerSettingsIpc({ getWindow, settings, logger, monitoring }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.settingsGetAll, (event) => {
    trusted(event, getWindow);
    return settings.getAll();
  });

  ipcMain.handle(IPC_CHANNELS.settingsSet, (event, patch: unknown) => {
    trusted(event, getWindow);
    if (!isPartialSettings(patch)) {
      throw new Error('Invalid settings patch');
    }
    const result = settings.set(patch);
    if ('logLevel' in result) {
      logger.level = result.logLevel;
      logger.info({ logLevel: result.logLevel }, 'log level changed');
    }
    // ponytail: apply the monitoring interval live — previously this setting
    // was saved but never fed to the running monitoring service.
    if ('checkIntervalSeconds' in result && typeof result.checkIntervalSeconds === 'number') {
      monitoring.setBaseIntervalMs(result.checkIntervalSeconds * 1000);
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.settingsReset, (event) => {
    trusted(event, getWindow);
    return settings.reset();
  });

  ipcMain.handle(IPC_CHANNELS.settingsValidate, (event, values: unknown) => {
    trusted(event, getWindow);
    return settings.validate(values);
  });

  ipcMain.handle(IPC_CHANNELS.settingsImport, async (event) => {
    trusted(event, getWindow);
    const win = getWindow();
    if (win === null) {
      return null;
    }
    const result = await dialog.showOpenDialog(win, {
      title: 'Import settings',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const file = result.filePaths[0]!;
    return settings.importFromJson(readFileSync(file, 'utf8'));
  });

  ipcMain.handle(IPC_CHANNELS.settingsExport, async (event) => {
    trusted(event, getWindow);
    const win = getWindow();
    if (win === null) {
      return false;
    }
    const result = await dialog.showSaveDialog(win, {
      title: 'Export settings',
      defaultPath: 'Rekordly-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || result.filePath === '') {
      return false;
    }
    writeFileSync(result.filePath, settings.exportToJson(), 'utf8');
    return true;
  });
}
