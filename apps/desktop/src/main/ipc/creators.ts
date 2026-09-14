import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, AppError } from '@rekordly/shared';
import { getEntitlements } from '@rekordly/core';
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

/**
 * ponytail: latch the nav-visibility flag the moment any creator's secure
 * proxy is enabled — instant feedback ("first use") that survives restarts.
 * Purely cosmetic; the actual routing decision stays per-creator in the DB.
 */
function latchProxyUsedFlag(context: IpcContext, enabled: boolean): void {
  if (!enabled || context.settings.getAll().secureProxyUsed) return;
  try {
    context.settings.set({ secureProxyUsed: true });
  } catch {
    /* flag write must never fail creator operations */
  }
}

/**
 * Pro tier gate: the free tier may keep auto-record enabled on a limited
 * number of creators. Disabling is always allowed; enabling past the limit
 * throws AUTO_RECORD_LIMIT (the UI toggle stays off and shows the upgrade
 * CTA). Creators already over the limit (e.g. downgraded after enabling)
 * are grandfathered — they keep recording until turned off by the user.
 */
function enforceAutoRecordLimit(
  context: IpcContext,
  enabled: boolean,
  apply: () => void,
  newEnableCount = 1,
): void {
  const { creatorRepo, license } = context;
  // Disabling is always allowed — the gate only limits new enables.
  if (!enabled) {
    apply();
    return;
  }
  const limit = getEntitlements(license.getStatus()).maxAutoRecordCreators;
  if (!Number.isFinite(limit)) {
    apply();
    return;
  }
  const enabledCount = creatorRepo.list().filter((c) => c.autoRecord).length;
  if (enabledCount + newEnableCount > limit) {
    context.gateNotifier.autoRecordLimitReached(enabledCount, limit);
    throw new AppError({
      code: 'AUTO_RECORD_LIMIT',
      message: `Auto-record is already on for ${limit} creators — the free-tier maximum. Upgrade to Pro to add more.`,
      recoverable: true,
      details: { limit, enabledCount },
    });
  }
  apply();
}

export function registerCreatorsIpc(context: IpcContext): void {
  const { getWindow, creatorRepo, monitoring, recordingRepo } = context;
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
      // ponytail: per-creator secure-proxy opt-in (Add dialog switch) —
      // regional ISP blocks make this a user decision, never a plugin default.
      useProxy: d['useProxy'] === true,
      notes: (d['notes'] as string) ?? null,
      metadata: {} as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    };
    creatorRepo.create(record);
    latchProxyUsedFlag(context, record.useProxy);
    const creatorId = `${d['pluginId']}:${d['externalId']}`;
    monitoring.addCreator(creatorId, d['pluginId'] as string);
    return record;
  });

  ipcMain.handle(IPC_CHANNELS.creatorsUpdate, (event, id: unknown, patch: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid creator id');
    if (typeof patch !== 'object' || patch === null) throw new Error('Invalid patch');
    creatorRepo.update(id, patch as Record<string, unknown>);
    const p = patch as Record<string, unknown>;
    if (typeof p['useProxy'] === 'boolean') {
      latchProxyUsedFlag(context, p['useProxy']);
    }
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
    enforceAutoRecordLimit(context, enabled, () => {
      creatorRepo.setAutoRecord(id, enabled);
    });
  });

  ipcMain.handle(IPC_CHANNELS.creatorsSetUseProxy, (event, id: unknown, enabled: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid creator id');
    if (typeof enabled !== 'boolean') throw new Error('Invalid useProxy value');
    creatorRepo.setUseProxy(id, enabled);
    latchProxyUsedFlag(context, enabled);
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
            useProxy: false,
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
          useProxy: false,
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

  ipcMain.handle(IPC_CHANNELS.creatorsBulkFavorite, (event, ids: unknown, favorite: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids) || !ids.every(isString)) throw new Error('Invalid creator ids');
    if (typeof favorite !== 'boolean') throw new Error('Invalid favorite value');
    creatorRepo.bulkSetFavorite(ids, favorite);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsBulkSetAutoRecord, (event, ids: unknown, enabled: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids) || !ids.every(isString)) throw new Error('Invalid creator ids');
    if (typeof enabled !== 'boolean') throw new Error('Invalid autoRecord value');
    enforceAutoRecordLimit(
      context,
      enabled,
      () => {
        creatorRepo.bulkSetAutoRecord(ids, enabled);
      },
      ids.filter((id) => creatorRepo.get(id)?.autoRecord !== true).length,
    );
  });

  ipcMain.handle(IPC_CHANNELS.creatorsBulkAddTag, (event, ids: unknown, tagId: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids) || !ids.every(isString)) throw new Error('Invalid creator ids');
    if (!isString(tagId)) throw new Error('Invalid tag id');
    creatorRepo.bulkAddTag(ids, tagId);
  });

  // ponytail: bulk delete must also unwind monitoring jobs — fetch the
  // records first so the plugin:externalId monitor keys stay resolvable.
  ipcMain.handle(IPC_CHANNELS.creatorsBulkRemove, (event, ids: unknown) => {
    trusted(event, getWindow);
    if (!Array.isArray(ids) || !ids.every(isString)) throw new Error('Invalid creator ids');
    for (const id of ids) {
      const creator = creatorRepo.get(id);
      if (creator) {
        monitoring.removeCreator(`${creator.pluginId}:${creator.externalId}`);
      }
    }
    creatorRepo.bulkRemove(ids);
  });

  ipcMain.handle(IPC_CHANNELS.creatorsGetAllTagAssignments, (event) => {
    trusted(event, getWindow);
    return creatorRepo.listAllTagAssignments();
  });

  ipcMain.handle(IPC_CHANNELS.creatorsStats, (event, id: unknown) => {
    trusted(event, getWindow);
    if (!isString(id)) throw new Error('Invalid creator id');
    return recordingRepo.statsByCreator(id);
  });
}
