import { ipcMain, dialog, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, type PluginHealthDto, type SettingDefDto } from '@rekordly/shared';
import type { SettingDef, PluginSettingValues } from '@rekordly/plugin-sdk';
import { toPluginDiagnostics, toPluginInfo } from '@rekordly/core';
import type { IpcContext } from './context';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

function isPluginId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 100;
}

function toSettingDefDto(key: string, def: SettingDef): SettingDefDto {
  return { key, ...def };
}

export function registerPluginsIpc({ getWindow, plugins, logger }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.pluginsList, (event) => {
    trusted(event, getWindow);
    return plugins.list().map(toPluginInfo);
  });

  ipcMain.handle(IPC_CHANNELS.pluginsEnable, async (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isPluginId(id)) {
      throw new Error('Invalid plugin id');
    }
    const managed = await plugins.enable(id);
    return toPluginInfo(managed);
  });

  ipcMain.handle(IPC_CHANNELS.pluginsDisable, async (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isPluginId(id)) {
      throw new Error('Invalid plugin id');
    }
    const managed = await plugins.disable(id);
    return toPluginInfo(managed);
  });

  ipcMain.handle(IPC_CHANNELS.pluginsUpdate, async (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isPluginId(id)) {
      throw new Error('Invalid plugin id');
    }
    const managed = await plugins.update(id);
    return toPluginInfo(managed);
  });

  ipcMain.handle(IPC_CHANNELS.pluginsRemove, async (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isPluginId(id)) {
      throw new Error('Invalid plugin id');
    }
    await plugins.remove(id);
  });

  ipcMain.handle(IPC_CHANNELS.pluginsInstall, async (event) => {
    trusted(event, getWindow);
    const win = getWindow();
    if (win === null) {
      return null;
    }
    const result = await dialog.showOpenDialog(win, {
      title: 'Install plugin from directory',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const managed = await plugins.install(result.filePaths[0]!);
    return toPluginInfo(managed);
  });

  ipcMain.handle(IPC_CHANNELS.pluginsDiagnostics, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isPluginId(id)) {
      throw new Error('Invalid plugin id');
    }
    return toPluginDiagnostics(plugins.getDiagnostics(id));
  });

  ipcMain.handle(IPC_CHANNELS.pluginsHealth, async (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isPluginId(id)) {
      throw new Error('Invalid plugin id');
    }
    const health = await plugins.checkHealth(id);
    const dto: PluginHealthDto = {
      healthy: health.healthy,
      message: health.message,
      latencyMs: health.latencyMs,
      checkedAt: health.checkedAt,
    };
    logger.info({ pluginId: id, healthy: dto.healthy }, 'plugin health check completed');
    return dto;
  });

  ipcMain.handle(IPC_CHANNELS.pluginsSettingsGet, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isPluginId(id)) {
      throw new Error('Invalid plugin id');
    }
    return plugins.getPluginSettings(id);
  });

  ipcMain.handle(IPC_CHANNELS.pluginsSettingsSchema, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isPluginId(id)) {
      throw new Error('Invalid plugin id');
    }
    const schema = plugins.getSettingsSchema(id);
    return Object.entries(schema).map(([key, def]) => toSettingDefDto(key, def));
  });

  ipcMain.handle(IPC_CHANNELS.pluginsSettingsSet, async (event, id: unknown, values: unknown) => {
    trusted(event, getWindow);
    if (!isPluginId(id)) {
      throw new Error('Invalid plugin id');
    }
    if (typeof values !== 'object' || values === null) {
      throw new Error('Invalid settings values');
    }
    await plugins.setPluginSettings(id, values as PluginSettingValues);
  });
}
