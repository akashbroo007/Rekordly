import { randomUUID } from 'node:crypto';
import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { EditorService } from '@rekordly/core';
import { IPC_CHANNELS } from '@rekordly/shared';
import type {
  EditorCancelExportRequestDto,
  EditorConcatRequestDto,
  EditorCutRequestDto,
  EditorDetectSilenceRequestDto,
  EditorExtractAudioRequestDto,
  EditorExportProgressDto,
  EditorSilenceSpanDto,
  EditorTimelineRequestDto,
  EditorTrimRequestDto,
} from '@rekordly/shared';
import type { IpcContext } from './context';
import { toMediaUrl } from '../media-protocol';

function trusted(event: IpcMainInvokeEvent, getWindow: IpcContext['getWindow']): void {
  const win = getWindow();
  if (win === null || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Unauthorized IPC caller');
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2000;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTimeRange(value: unknown): value is { startSeconds: number; endSeconds: number } {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return isFiniteNumber(r['startSeconds']) && isFiniteNumber(r['endSeconds']);
}

/** ponytail: one cancellable export — kill handle + progress sender. */
interface ActiveExport {
  cancelled: boolean;
  child: { kill: () => void } | null;
  sender: WebContents;
}

export function registerEditorIpc({ getWindow, recordingRepo, logger, dirs }: IpcContext): void {
  const editor = new EditorService({
    repo: recordingRepo,
    logger,
    recordingsDir: dirs.recordingsDir,
    cacheDir: dirs.cacheDir,
  });
  const activeExports = new Map<string, ActiveExport>();

  /**
   * ponytail: the renderer generates the opId so it can match progress
   * events and cancel this specific run. If the caller never sends one we
   * mint one anyway so cancellation stays possible (just unaddressable).
   */
  const beginExportOp = (sender: WebContents, requestedOpId: unknown): {
    opId: string;
    isCancelled: () => boolean;
    onSpawned: (child: { kill: () => void }) => void;
    onProgress: (seconds: number, percent?: number) => void;
  } => {
    const opId = isString(requestedOpId) ? requestedOpId : randomUUID();
    const op: ActiveExport = { cancelled: false, child: null, sender };
    activeExports.set(opId, op);
    return {
      opId,
      isCancelled: () => op.cancelled,
      onSpawned: (child) => {
        op.child = child;
        // ponytail: cancel may arrive between ffmpeg steps — kill the next
        // spawn immediately instead of waiting for another click.
        if (op.cancelled) child.kill();
      },
      onProgress: (seconds, percent) => {
        if (op.cancelled) return;
        const payload: EditorExportProgressDto = { opId, seconds, percent };
        op.sender.send(IPC_CHANNELS.editorExportProgress, payload);
      },
    };
  };

  ipcMain.handle(IPC_CHANNELS.editorTrim, async (event, request: unknown) => {
    trusted(event, getWindow);
    const req = (typeof request === 'object' && request !== null ? request : {}) as Partial<EditorTrimRequestDto>;
    if (!isString(req.recordingId)) throw new Error('Invalid recording id');
    if (!isFiniteNumber(req.startSeconds) || !isFiniteNumber(req.endSeconds)) throw new Error('Invalid trim range');
    const hooks = beginExportOp(event.sender, req.opId);
    try {
      return await editor.trimRecording({
        recordingId: req.recordingId,
        startSeconds: req.startSeconds,
        endSeconds: req.endSeconds,
        accurate: req.accurate === true,
        isCancelled: hooks.isCancelled,
        onSpawned: hooks.onSpawned,
        onProgress: hooks.onProgress,
      });
    } finally {
      activeExports.delete(hooks.opId);
    }
  });

  ipcMain.handle(IPC_CHANNELS.editorCut, async (event, request: unknown) => {
    trusted(event, getWindow);
    const req = (typeof request === 'object' && request !== null ? request : {}) as Partial<EditorCutRequestDto>;
    if (!isString(req.recordingId)) throw new Error('Invalid recording id');
    if (!Array.isArray(req.cuts) || req.cuts.length === 0 || !req.cuts.every(isTimeRange)) {
      throw new Error('Invalid cut ranges');
    }
    if (req.cuts.length > 50) throw new Error('Too many cut ranges (max 50)');
    const hooks = beginExportOp(event.sender, req.opId);
    try {
      return await editor.cutRecording({
        recordingId: req.recordingId,
        cuts: req.cuts.map((c) => ({ startSeconds: c.startSeconds, endSeconds: c.endSeconds })),
        accurate: req.accurate === true,
        isCancelled: hooks.isCancelled,
        onSpawned: hooks.onSpawned,
        onProgress: hooks.onProgress,
      });
    } finally {
      activeExports.delete(hooks.opId);
    }
  });

  ipcMain.handle(IPC_CHANNELS.editorConcat, async (event, request: unknown) => {
    trusted(event, getWindow);
    const req = (typeof request === 'object' && request !== null ? request : {}) as Partial<EditorConcatRequestDto>;
    if (!Array.isArray(req.recordingIds) || req.recordingIds.length < 2 || !req.recordingIds.every(isString)) {
      throw new Error('Select at least two recordings to combine');
    }
    if (req.recordingIds.length > 50) throw new Error('Too many recordings (max 50)');
    if (req.title !== undefined && (typeof req.title !== 'string' || req.title.length > 200)) {
      throw new Error('Invalid title');
    }
    return editor.concatRecordings({ recordingIds: req.recordingIds, title: req.title });
  });

  ipcMain.handle(IPC_CHANNELS.editorTimeline, async (event, request: unknown) => {
    trusted(event, getWindow);
    const req = (typeof request === 'object' && request !== null ? request : {}) as Partial<EditorTimelineRequestDto>;
    if (isString(req.recordingId)) {
      if (req.thumbCount !== undefined && !isFiniteNumber(req.thumbCount)) throw new Error('Invalid thumb count');
      const assets = await editor.generateTimelineAssets({
        recordingId: req.recordingId,
        thumbCount: req.thumbCount,
        includeWaveform: req.includeWaveform,
      });
      return {
        stripUrl: toMediaUrl(assets.stripPath),
        waveformUrl: assets.waveformPath === null ? null : toMediaUrl(assets.waveformPath),
        thumbCount: assets.thumbCount,
      };
    }
    // ponytail: bare file path — the player's hover preview also serves
    // downloads, which have no library row. Same trusted() gate as above.
    if (isString(req.filePath)) {
      if (req.thumbCount !== undefined && !isFiniteNumber(req.thumbCount)) throw new Error('Invalid thumb count');
      const assets = await editor.generateTimelineAssets({
        filePath: req.filePath,
        thumbCount: req.thumbCount,
        includeWaveform: req.includeWaveform,
      });
      return {
        stripUrl: toMediaUrl(assets.stripPath),
        waveformUrl: assets.waveformPath === null ? null : toMediaUrl(assets.waveformPath),
        thumbCount: assets.thumbCount,
      };
    }
    throw new Error('Timeline needs a recordingId or a filePath');
  });

  ipcMain.handle(IPC_CHANNELS.editorExtractAudio, async (event, request: unknown) => {
    trusted(event, getWindow);
    const req = (typeof request === 'object' && request !== null ? request : {}) as Partial<EditorExtractAudioRequestDto>;
    if (!isString(req.recordingId)) throw new Error('Invalid recording id');
    if (req.format !== 'mp3' && req.format !== 'm4a') throw new Error('Invalid audio format');
    if (req.startSeconds !== undefined && !isFiniteNumber(req.startSeconds)) throw new Error('Invalid audio range');
    if (req.endSeconds !== undefined && !isFiniteNumber(req.endSeconds)) throw new Error('Invalid audio range');
    const hooks = beginExportOp(event.sender, req.opId);
    try {
      return await editor.extractAudioRecording({
        recordingId: req.recordingId,
        format: req.format,
        startSeconds: req.startSeconds,
        endSeconds: req.endSeconds,
        isCancelled: hooks.isCancelled,
        onSpawned: hooks.onSpawned,
        onProgress: hooks.onProgress,
      });
    } finally {
      activeExports.delete(hooks.opId);
    }
  });

  ipcMain.handle(IPC_CHANNELS.editorDetectSilence, async (event, request: unknown): Promise<EditorSilenceSpanDto[]> => {
    trusted(event, getWindow);
    const req = (typeof request === 'object' && request !== null ? request : {}) as Partial<EditorDetectSilenceRequestDto>;
    if (req.recordingId !== undefined && !isString(req.recordingId)) throw new Error('Invalid recording id');
    if (req.filePath !== undefined && !isString(req.filePath)) throw new Error('Invalid file path');
    if (req.recordingId === undefined && req.filePath === undefined) throw new Error('Silence detection needs a recordingId or a filePath');
    if (req.thresholdDb !== undefined && !isFiniteNumber(req.thresholdDb)) throw new Error('Invalid threshold');
    if (req.minSeconds !== undefined && !isFiniteNumber(req.minSeconds)) throw new Error('Invalid minimum span');
    const spans = await editor.detectSilences({
      recordingId: req.recordingId,
      filePath: req.filePath,
      thresholdDb: req.thresholdDb,
      minSeconds: req.minSeconds,
    });
    return spans.map((s) => ({ startSeconds: s.startSeconds, endSeconds: s.endSeconds }));
  });

  ipcMain.handle(IPC_CHANNELS.editorCancelExport, async (event, request: unknown) => {
    trusted(event, getWindow);
    const req = (typeof request === 'object' && request !== null ? request : {}) as Partial<EditorCancelExportRequestDto>;
    if (!isString(req.opId)) throw new Error('Invalid operation id');
    const op = activeExports.get(req.opId);
    if (op !== undefined) {
      op.cancelled = true;
      op.child?.kill();
    }
  });
}
