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
    if (job === undefined || job.lastResult?.streamUrl === undefined) {
      throw new Error(`${creator.displayName} is not live or has no stream URL`);
    }

    // ponytail: prefer the plugin's extractStream — for platforms like
    // Stripchat the live-check URL is not directly recordable (MOUFLON-
    // obfuscated segments); extractStream returns a prepared StreamObject
    // (local de-obfuscating proxy URL, headers, cookies).
    let stream: StreamObject | null = null;
    const managed = plugins.get(job.pluginId);
    const extract = managed?.instance?.capabilities.streamExtraction;
    if (extract !== undefined) {
      try {
        stream = await extract.extractStream(monitorId);
      } catch {
        /* fall back to the live-check URL below */
      }
    }
    if (stream === null) {
      stream = {
        creatorId: creator.id,
        creatorName: creator.displayName,
        platformId: job.pluginId,
        title: job.lastResult.title ?? `${creator.displayName} live`,
        streamUrl: job.lastResult.streamUrl,
        thumbnail: job.lastResult.thumbnail,
        startedAt: job.lastResult.startedAt,
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
