import { ipcMain } from 'electron';
import { IPC_CHANNELS, type StreamObject } from '@rekordly/shared';
import type { IpcContext } from './context';

export function registerRecordingIpc(context: IpcContext): void {
  const { recording, monitoring, creatorRepo, plugins } = context;

  ipcMain.handle(IPC_CHANNELS.recordingStart, async (_event, stream: StreamObject) => {
    return recording.startRecording(stream);
  });

  ipcMain.handle(
    IPC_CHANNELS.recordingStartForCreator,
    async (
      _event,
      payload: string | { creatorId: string; options?: { durationMinutes?: number; quality?: string; segmentMinutes?: number } },
    ) => {
      const creatorDbId = typeof payload === 'string' ? payload : payload.creatorId;
      const startOptions = typeof payload === 'string' ? {} : (payload.options ?? {});
      const creator = creatorRepo.get(creatorDbId);
    if (creator === undefined) throw new Error(`Creator ${creatorDbId} not found`);

    const monitorId = `${creator.pluginId}:${creator.externalId}`;
    const jobs = monitoring.getJobs();
    const job = jobs.find((j) => j.creatorId === monitorId);

    // ponytail: the plugin is the source of truth for live state. The stored
    // check result (job.lastResult.streamUrl) is a cache that can legitimately
    // be missing or stale — a creator added seconds ago has never been
    // checked, and a live status can lack a resolvable URL at the moment of
    // the last poll. Ask the plugin directly instead of refusing to record.
    const managed = plugins.get(creator.pluginId);
    const liveDetection = managed?.instance?.capabilities.liveDetection;
    let lastResult = job?.lastResult;
    if (lastResult?.streamUrl === undefined) {
      if (liveDetection === undefined) {
        throw new Error(`${creator.displayName} is not live or has no stream URL`);
      }
      const status = await liveDetection.getLiveStatus(monitorId);
      if (!status.isLive) {
        throw new Error(`${creator.displayName} is not live or has no stream URL`);
      }
      lastResult = {
        isLive: true,
        title: status.title,
        thumbnail: status.thumbnail,
        viewerCount: status.viewerCount,
        streamUrl: status.streamUrl,
        startedAt: status.startedAt,
        checkedAt: new Date().toISOString(),
        durationMs: 0,
      };
    }

    // ponytail: prefer the plugin's extractStream — for platforms like
    // Stripchat the live-check URL is not directly recordable (MOUFLON-
    // obfuscated segments); extractStream returns a prepared StreamObject
    // (local de-obfuscating proxy URL, headers, cookies).
    let stream: StreamObject | null = null;
    const extract = managed?.instance?.capabilities.streamExtraction;
    if (extract !== undefined) {
      try {
        stream = await extract.extractStream(monitorId);
      } catch {
        /* fall back to the live-check URL below */
      }
    }
    if (stream === null) {
      if (lastResult.streamUrl === undefined) {
        throw new Error(`${creator.displayName} is not live or has no stream URL`);
      }
      stream = {
        creatorId: creator.id,
        creatorName: creator.displayName,
        platformId: job?.pluginId ?? creator.pluginId,
        title: lastResult.title ?? `${creator.displayName} live`,
        streamUrl: lastResult.streamUrl,
        thumbnail: lastResult.thumbnail,
        startedAt: lastResult.startedAt,
      };
    } else {
      // ponytail: extractStream returns the monitor id ("plugin:username")
      // as creatorId, but recording_jobs.creator_id is a FK to creators.id
      // (a DB uuid) — always use the tracked creator row's id.
      stream = { ...stream, creatorId: creator.id, creatorName: creator.displayName };
    }

      return recording.startRecording(stream, startOptions);
    },
  );

  ipcMain.handle(IPC_CHANNELS.recordingPause, async (_event, jobId: string) => {
    await recording.pauseRecording(jobId);
  });

  ipcMain.handle(IPC_CHANNELS.recordingResume, async (_event, jobId: string) => {
    await recording.resumeRecording(jobId);
  });

  ipcMain.handle(IPC_CHANNELS.recordingCancel, async (_event, jobId: string) => {
    await recording.cancelRecording(jobId);
  });

  ipcMain.handle(IPC_CHANNELS.recordingRetry, async (_event, jobId: string) => {
    await recording.retryRecording(jobId);
  });

  ipcMain.handle(IPC_CHANNELS.recordingRestart, async (_event, jobId: string) => {
    await recording.retryRecording(jobId);
  });

  ipcMain.handle(IPC_CHANNELS.recordingRemoveJob, async (_event, jobId: string) => {
    recording.removeJob(jobId);
  });

  ipcMain.handle(IPC_CHANNELS.recordingClearFailed, async () => {
    return recording.clearFailedJobs();
  });

  ipcMain.handle(IPC_CHANNELS.recordingGetJobs, () => {
    return recording.getJobs();
  });

  ipcMain.handle(IPC_CHANNELS.recordingGetSettings, () => {
    return recording.getSettings();
  });

  ipcMain.handle(
    IPC_CHANNELS.recordingSetSettings,
    async (_event, settings: Record<string, unknown>) => {
      return recording.updateSettings(settings);
    },
  );

  // Forward recording events to renderer
  recording.on('event', (event) => {
    const { getWindow } = context;
    const win = getWindow();
    if (win !== null && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.recordingEvent, event);
    }
  });
}
