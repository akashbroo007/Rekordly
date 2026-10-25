import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type RecordAllLiveOptionsDto,
  type RecordingEventDto,
  type StreamObject,
} from '@rekordly/shared';
import type { IpcContext } from './context';
import {
  startAllLive,
  startRecordingForCreator,
  type PerCreatorRecordOptions,
  type RecordStartDeps,
} from '../record-start';

export function registerRecordingIpc(context: IpcContext): void {
  const { recording, monitoring, creatorRepo, plugins } = context;

  // ponytail: single starts and the batch share ONE implementation (main/
  // record-start.ts) so plugin extraction, FK-safe creator ids and the
  // duplicate-session guard cannot drift between the IPC and Telegram paths.
  const deps: RecordStartDeps = { creatorRepo, pluginManager: plugins, monitoring, recording };

  const sendRecordingEvent = (event: RecordingEventDto): void => {
    const win = context.getWindow();
    if (win !== null && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.recordingEvent, event);
    }
  };

  ipcMain.handle(IPC_CHANNELS.recordingStart, async (_event, stream: StreamObject) => {
    return recording.startRecording(stream);
  });

  ipcMain.handle(
    IPC_CHANNELS.recordingStartForCreator,
    async (
      _event,
      payload: string | {
        creatorId: string;
        options?: PerCreatorRecordOptions;
      },
    ) => {
      const creatorDbId = typeof payload === 'string' ? payload : payload.creatorId;
      const startOptions = typeof payload === 'string' ? {} : (payload.options ?? {});
      return startRecordingForCreator(deps, creatorDbId, startOptions);
    },
  );

  // ponytail: master "Record All Live" — starts a recording for every selected
  // creator that is live right now (omit creatorIds = all live). One creator
  // failing never aborts the batch; heartbeat pulses go out over the regular
  // recording event channel so the dialog can show progress while it fans out.
  ipcMain.handle(
    IPC_CHANNELS.recordingStartAllLive,
    async (_event, options?: RecordAllLiveOptionsDto) => {
      return startAllLive(deps, options ?? {}, (progress) => {
        sendRecordingEvent({
          type: 'record-all-progress',
          // RecordingEventDto.data is a loose Record; consumers cast back to
          // RecordAllLiveProgressDto (see the Record All Live dialog).
          data: progress as unknown as Record<string, unknown>,
          timestamp: new Date().toISOString(),
        });
      });
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
    sendRecordingEvent(event);
  });
}
