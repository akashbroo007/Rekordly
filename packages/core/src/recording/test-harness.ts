import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { vi } from 'vitest';
import { ExternalBinary } from '@rekordly/recorder';
import type { Logger, StreamObject } from '@rekordly/shared';
import type { RecordingJobRecord, RecordingRecord, RecordingRepo } from '@rekordly/database';
import { RecordingService } from './service';
import type { NotificationService } from '../services/notification-service';

/** Shared in-memory harness for RecordingService tests — no DB, no child processes. */
export function createRepo() {
  const jobs = new Map<string, RecordingJobRecord>();
  const recordings = new Map<string, RecordingRecord>();
  const repo = {
    createJob: (job: RecordingJobRecord): void => {
      jobs.set(job.id, { ...job });
    },
    updateJob: (id: string, patch: Partial<RecordingJobRecord>): void => {
      const existing = jobs.get(id);
      if (existing !== undefined) jobs.set(id, { ...existing, ...patch });
    },
    removeJob: (id: string): void => {
      jobs.delete(id);
    },
    listJobs: (status?: string): RecordingJobRecord[] =>
      [...jobs.values()].filter((j) => status === undefined || j.status === status),
    getJob: (id: string): RecordingJobRecord | undefined => jobs.get(id),
    createRecording: (recording: RecordingRecord): void => {
      recordings.set(recording.id, { ...recording });
    },
    updateRecording: (id: string, patch: Partial<RecordingRecord>): void => {
      const existing = recordings.get(id);
      if (existing !== undefined) recordings.set(id, { ...existing, ...patch });
    },
    listRecordings: (): RecordingRecord[] => [...recordings.values()],
    getRecording: (id: string): RecordingRecord | undefined => recordings.get(id),
    removeRecording: (id: string): void => {
      recordings.delete(id);
    },
  };
  return { repo: repo as unknown as RecordingRepo, jobs, recordings };
}

export const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
} as unknown as Logger;

export function createService(options: {
  repo: RecordingRepo;
  outputDir: string;
  resolveStream?: (job: RecordingJobRecord) => Promise<StreamObject | null>;
  progressFlushMs?: number;
  startGapMs?: number;
  admissionRetryMs?: number;
  getMinFreeBytes?: () => number;
  /** ponytail: CRF for derivative transcodes (Settings → Recording → Advanced). */
  getDerivativeCrf?: () => number;
  /** ponytail: instant-end floor (0 disables — fixture-backed tests opt out). */
  minMeaningfulCaptureSeconds?: number;
  /**
   * Phase H: keep the service's own YtDlpService (real ffmpeg spawns) instead
   * of the fake. Only for stress/torture tests with a local origin.
   */
  useRealDownloader?: boolean;
}) {
  const notifications = { send: vi.fn() } as unknown as NotificationService;
  const service = new RecordingService({
    repo: options.repo,
    notifications,
    logger: silentLogger,
    defaultOutputDir: options.outputDir,
    resolveStream: options.resolveStream,
    progressFlushMs: options.progressFlushMs,
    startGapMs: options.startGapMs,
    admissionRetryMs: options.admissionRetryMs,
    getMinFreeBytes: options.getMinFreeBytes,
    getDerivativeCrf: options.getDerivativeCrf,
    minMeaningfulCaptureSeconds: options.minMeaningfulCaptureSeconds,
  });
  class FakeYtDlp extends EventEmitter {
    download = vi.fn();
    stopDownload = vi.fn((): boolean => false);
    cancelDownload = vi.fn();
    stopPidTree = vi.fn();
    stopPidTreeAsync = vi.fn(async (): Promise<void> => undefined);
    getActivePids = vi.fn((): Array<{ pid: number; type: 'yt-dlp' | 'ffmpeg' }> => []);
  }
  const fakeYtDlp = new FakeYtDlp();
  // ponytail: the service subscribes to progress/spawned in its constructor —
  // keep the live instance so event-driven tests emit on the real subscription.
  const liveDownloader = (service as unknown as { ytDlp: EventEmitter }).ytDlp;
  if (options.useRealDownloader !== true) {
    (service as unknown as { ytDlp: unknown }).ytDlp = fakeYtDlp;
  }
  return { service, fakeYtDlp, liveDownloader, notifications };
}

export const baseStream: StreamObject = {
  creatorId: 'creator-1',
  creatorName: 'TestCreator',
  platformId: 'test-platform',
  title: 'Test Stream',
  streamUrl: 'https://expired.example/live.m3u8',
};

export async function mkOutputDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function waitForStatus(
  repo: RecordingRepo,
  jobId: string,
  states: string[],
  timeoutMs = 30_000,
): Promise<string> {
  const start = Date.now();
  for (;;) {
    const status = repo.getJob(jobId)?.status;
    if (status !== undefined && states.includes(status)) return status;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for ${states.join('/')} (last=${status})`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** True when a real ffmpeg binary is resolvable (fixture/adoption tests). */
export const ffmpegAvailable = new ExternalBinary('ffmpeg').resolve() !== null;
