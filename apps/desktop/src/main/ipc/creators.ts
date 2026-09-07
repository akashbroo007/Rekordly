import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@rekordly/shared';
import type { IpcContext } from './context';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 500;
}

export function registerCreatorsIpc({ getWindow, creatorRepo, monitoring }: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.creatorsList, (event) => {
    trusted(event, getWindow);
    return creatorRepo.list();
  });

  ipcMain.handle(IPC_CHANNELS.creatorsGet, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid creator id');
    return creatorRepo.get(id);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsCreate, (event, data: unknown) => {
    trusted(event, getWindow);
    if (typeof data !== 'object' || data === null) throw new Error('Invalid creator data');
    const d = data as Record<string, unknown>;
    if (!isString(d['pluginId']) || !isString(d['externalId']) || !isString(d['username']) || !isString(d['displayName'])) {
      throw new Error('Missing required creator fields');
    }
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      pluginId: d['pluginId'] as string,
      externalId: d['externalId'] as string,
      username: d['username'] as string,
      displayName: d['displayName'] as string,
      avatarUrl: (d['avatarUrl'] as string) ?? null,
      profileUrl: (d['profileUrl'] as string) ?? null,
      isFavorite: false,
      // ponytail: per-creator auto-record opt-in, chosen in the Add dialog
      // (default OFF — auto-recording is opt-in per creator, never global).
      autoRecord: d['autoRecord'] === true,
      autoRecordQuality:
        typeof d['autoRecordQuality'] === 'string' && d['autoRecordQuality'].length > 0
          ? (d['autoRecordQuality'] as string)
          : 'best',
      notes: (d['notes'] as string) ?? null,
      metadata: {} as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    };
    creatorRepo.create(record);
    const creatorId = `${d['pluginId']}:${d['externalId']}`;
    monitoring.addCreator(creatorId, d['pluginId'] as string);
    return record;
  });

  ipcMain.handle(IPC_CHANNELS.creatorsUpdate, (event, id: unknown, patch: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid creator id');
    if (typeof patch !== 'object' || patch === null) throw new Error('Invalid patch');
    creatorRepo.update(id, patch as Record<string, unknown>);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsRemove, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid creator id');
    const creator = creatorRepo.get(id);
    if (creator) {
      const creatorId = `${creator.pluginId}:${creator.externalId}`;
      monitoring.removeCreator(creatorId);
    }
    creatorRepo.remove(id);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsSearch, (event, query: unknown) => {
    trusted(event, getWindow);
    if (!isString(query)) throw new Error('Invalid search query');
    return creatorRepo.search(query);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsSetFavorite, (event, id: unknown, favorite: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid creator id');
    if (typeof favorite !== 'boolean') throw new Error('Invalid favorite value');
    creatorRepo.setFavorite(id, favorite);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsSetAutoRecord, (event, id: unknown, enabled: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid creator id');
    if (typeof enabled !== 'boolean') throw new Error('Invalid autoRecord value');
    creatorRepo.setAutoRecord(id, enabled);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsGetTags, (event) => {
    trusted(event, getWindow);
    return creatorRepo.listTags();
  });

  ipcMain.handle(IPC_CHANNELS.creatorsCreateTag, (event, name: unknown, color: unknown) => {
    trusted(event, getWindow);
    if (!isString(name)) throw new Error('Invalid tag name');
    creatorRepo.createTag(name, typeof color === 'string' ? color : undefined);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsRemoveTag, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid tag id');
    creatorRepo.removeTag(id);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsRenameTag, (event, id: unknown, name: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid tag id');
    if (!isString(name)) throw new Error('Invalid tag name');
    creatorRepo.renameTag(id, name);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsAddTag, (event, creatorId: unknown, tagId: unknown) => {
    trusted(event, getWindow);
    if (!isString(creatorId)) throw new Error('Invalid creator id');
    if (!isString(tagId)) throw new Error('Invalid tag id');
    creatorRepo.addTagToCreator(creatorId, tagId);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsRemoveTagFromCreator, (event, creatorId: unknown, tagId: unknown) => {
    trusted(event, getWindow);
    if (!isString(creatorId)) throw new Error('Invalid creator id');
    if (!isString(tagId)) throw new Error('Invalid tag id');
    creatorRepo.removeTagFromCreator(creatorId, tagId);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsListCreatorTags, (event, creatorId: unknown) => {
    trusted(event, getWindow);
    if (!isString(creatorId)) throw new Error('Invalid creator id');
    return creatorRepo.listCreatorTags(creatorId);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsGetCollections, (event) => {
    trusted(event, getWindow);
    return creatorRepo.listCollections();
  });

  ipcMain.handle(IPC_CHANNELS.creatorsCreateCollection, (event, name: unknown, description: unknown) => {
    trusted(event, getWindow);
    if (!isString(name)) throw new Error('Invalid collection name');
    creatorRepo.createCollection(name, typeof description === 'string' ? description : undefined);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsRemoveCollection, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid collection id');
    creatorRepo.removeCollection(id);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsExportJson, (event) => {
    trusted(event, getWindow);
    const creators = creatorRepo.list();
    return JSON.stringify(creators, null, 2);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsExportCsv, (event) => {
    trusted(event, getWindow);
    const creators = creatorRepo.list();
    const headers = ['pluginId', 'externalId', 'username', 'displayName', 'avatarUrl', 'profileUrl', 'notes'];
    const rows = creators.map((c) =>
      headers.map((h) => {
        const val = c[h as keyof typeof c];
        return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : '';
      }).join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  });

  ipcMain.handle(IPC_CHANNELS.creatorsImportJson, (event, data: unknown) => {
    trusted(event, getWindow);
    if (!isString(data)) throw new Error('Invalid import data');
    const errors: string[] = [];
    let imported = 0;
    try {
      const items = JSON.parse(data) as Array<Record<string, unknown>>;
      for (const item of items) {
        try {
          if (!isString(item['pluginId']) || !isString(item['externalId']) || !isString(item['username']) || !isString(item['displayName'])) {
            errors.push(`Skipping item: missing required fields`);
            continue;
          }
          const existing = creatorRepo.getByExternal(item['pluginId'] as string, item['externalId'] as string);
          if (existing) {
            errors.push(`Creator ${item['username']} already exists`);
            continue;
          }
          const now = new Date().toISOString();
          const newId = crypto.randomUUID();
          creatorRepo.create({
            id: newId,
            pluginId: item['pluginId'] as string,
            externalId: item['externalId'] as string,
            username: item['username'] as string,
            displayName: item['displayName'] as string,
            avatarUrl: (item['avatarUrl'] as string) ?? null,
            profileUrl: (item['profileUrl'] as string) ?? null,
            isFavorite: false,
            // ponytail: imports default to auto-record OFF — opt in per card
            autoRecord: false,
            autoRecordQuality: 'best',
            notes: (item['notes'] as string) ?? null,
            metadata: {},
            createdAt: now,
            updatedAt: now,
          });
          const monitorId = `${item['pluginId']}:${item['externalId']}`;
          monitoring.addCreator(monitorId, item['pluginId'] as string);
          imported++;
        } catch (err) {
          errors.push(`Error importing creator: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }
    } catch {
      errors.push('Invalid JSON format');
    }
    return { imported, errors };
  });

  ipcMain.handle(IPC_CHANNELS.creatorsImportCsv, (event, data: unknown) => {
    trusted(event, getWindow);
    if (!isString(data)) throw new Error('Invalid import data');
    const errors: string[] = [];
    let imported = 0;
    const lines = data.split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) {
      return { imported: 0, errors: ['CSV file is empty or has no data rows'] };
    }
    const headers = lines[0]!.split(',').map((h) => h.trim());
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i]!.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
        if (!row['pluginId'] || !row['externalId'] || !row['username'] || !row['displayName']) {
          errors.push(`Row ${i}: missing required fields`);
          continue;
        }
        const existing = creatorRepo.getByExternal(row['pluginId'], row['externalId']);
        if (existing) {
          errors.push(`Row ${i}: creator ${row['username']} already exists`);
          continue;
        }
        const now = new Date().toISOString();
        const newId = crypto.randomUUID();
        creatorRepo.create({
          id: newId,
          pluginId: row['pluginId'],
          externalId: row['externalId'],
          username: row['username'],
          displayName: row['displayName'],
          avatarUrl: row['avatarUrl'] || null,
          profileUrl: row['profileUrl'] || null,
          isFavorite: false,
          // ponytail: imports default to auto-record OFF — opt in per card
          autoRecord: false,
          autoRecordQuality: 'best',
          notes: row['notes'] || null,
          metadata: {},
          createdAt: now,
          updatedAt: now,
        });
        const monitorId = `${row['pluginId']}:${row['externalId']}`;
        monitoring.addCreator(monitorId, row['pluginId']);
        imported++;
      } catch (err) {
        errors.push(`Row ${i}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    return { imported, errors };
  });
}
