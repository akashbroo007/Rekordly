export { YtDlpService } from './yt-dlp';
export { FfmpegService } from './ffmpeg';
export { FileVerifier } from './verifier';
export { RecordingService } from './service';
export type { RecordingServiceOptions, RecordingResourceUsage } from './service';
export {
  FfmpegCopyBackend,
  classifyResourceCost,
  isDirectHlsUrl,
  requiresLiveTranscode,
  resolveStreamObject,
} from './backend';
export { classifyCaptureFailure, computeBackoffMs } from './failures';
export type { ClassifiableFailure, FailureClass } from './failures';
export { WorkerStateMachine, allowedWorkerTransitions } from './worker-state';
export { WorkQueue } from './post-queue';
export type { QueuedTask } from './post-queue';
export type {
  CaptureDownloader,
  CaptureOptions,
  RecorderBackend,
  RecordingHandle,
  RecordingProgress as BackendRecordingProgress,
  RecordingResourceCost,
  RecordingResult,
  ResolvedStream,
  StopReason,
  StreamInput,
  WorkerState,
} from './backend';
