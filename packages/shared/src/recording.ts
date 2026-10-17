/**
 * Recording engine types and constants.
 * The recording engine never knows anything about websites.
 * It receives only the Standard Stream Object.
 */

export const RECORDING_EVENTS = [
  'recording-queued',
  'recording-started',
  'recording-paused',
  'recording-resumed',
  'recording-completed',
  'recording-failed',
  'recording-cancelled',
  'recording-finalized',
  'verification-started',
  'verification-completed',
  /**
   * ponytail: a duration-capped segment finished cleanly (saved to Library).
   * Carries `data: { stream, options }` so the host can chain the next
   * segment after re-running its guardrails (pause switch, disk, liveness).
   */
  'recording-segment-finished',
] as const;

export type RecordingEventType = (typeof RECORDING_EVENTS)[number];

export const RECORDING_JOB_STATES = [
  'queued',
  'preparing',
  'recording',
  'paused',
  'stopping',
  'processing',
  'verifying',
  'completed',
  'failed',
  'cancelled',
] as const;

export type RecordingJobState = (typeof RECORDING_JOB_STATES)[number];

export interface RecordingEvent {
  type: RecordingEventType;
  jobId?: string;
  recordingId?: string;
  error?: string;
  /** Event-specific payload (e.g. stream + options for segment chaining). */
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface RecordingProgress {
  jobId: string;
  bytesDownloaded: number;
  speed: number;
  eta: number;
  percent: number;
}

export interface RecordingMetadata {
  title: string;
  duration: number;
  resolution: string;
  videoCodec: string;
  audioCodec: string;
  bitrate: number;
  fps: number;
  fileSize: number;
  recordedAt: string;
}

export interface FileVerificationResult {
  exists: boolean;
  sizeBytes: number;
  durationSeconds: number;
  playable: boolean;
  validMetadata: boolean;
  integrity: boolean;
  errors: string[];
}

export interface RecordingLog {
  jobId: string;
  time: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
}

export interface RecordingSettings {
  outputDir: string;
  defaultQuality: string;
  maxConcurrent: number;
  bandwidthLimit: number;
  retryCount: number;
  retryDelay: number;
  verifyEnabled: boolean;
  thumbnailEnabled: boolean;
  metadataEnabled: boolean;
  namingTemplate: string;
}
