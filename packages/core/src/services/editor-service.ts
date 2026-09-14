import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { access, mkdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Logger } from '@rekordly/shared';
import { AppError } from '@rekordly/shared';
import type { RecordingRepo, RecordingRecord } from '@rekordly/database';
import { FfmpegService, type TimeRange } from '../recording/ffmpeg';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface EditorServiceOptions {
  repo: RecordingRepo;
  logger: Logger;
  /** User's recordings vault — edited copies land next to their source. */
  recordingsDir: string;
  /** Writable cache dir for derived timeline images (filmstrip/waveform). */
  cacheDir?: string;
}

/** Hooks forwarded from the IPC layer into the ffmpeg runs of one export. */
export interface ExportHooks {
  onProgress?: (seconds: number, percent?: number) => void;
  onSpawned?: (child: ChildProcessWithoutNullStreams) => void;
  isCancelled?: () => boolean;
}

export interface TrimRequest extends ExportHooks {
  recordingId: string;
  startSeconds: number;
  endSeconds: number;
  accurate?: boolean;
  opId?: string;
}

export interface CutRequest extends ExportHooks {
  recordingId: string;
  cuts: TimeRange[];
  accurate?: boolean;
  opId?: string;
}

export interface ConcatRequest {
  recordingIds: string[];
  title?: string;
}

export interface TimelineAssetsRequest {
  recordingId?: string;
  filePath?: string;
  thumbCount?: number;
  includeWaveform?: boolean;
}

export interface TimelineAssets {
  stripPath: string;
  waveformPath: string | null;
  thumbCount: number;
}

export interface ExtractAudioRequest extends ExportHooks {
  recordingId: string;
  format: 'mp3' | 'm4a';
  startSeconds?: number;
  endSeconds?: number;
  opId?: string;
}

export interface SilenceRequest {
  recordingId?: string;
  filePath?: string;
  thresholdDb?: number;
  minSeconds?: number;
}

/**
 * EditorService: non-destructive video editing (trim / cut / concat).
 * The original recording file and row are never modified — every operation
 * exports a NEW file and inserts a NEW library row linked via
 * `sourceRecordingId` + `editHistory`.
 */
export class EditorService {
  private readonly repo: RecordingRepo;
  private readonly logger: Logger;
  private readonly ffmpeg: FfmpegService;
  private readonly recordingsDir: string;
  private readonly cacheDir: string | undefined;
  /** ponytail: concurrent timeline calls for the same file share one generation. */
  private readonly inflightTimelines = new Map<string, Promise<TimelineAssets>>();

  constructor(options: EditorServiceOptions) {
    this.repo = options.repo;
    this.logger = options.logger;
    this.ffmpeg = new FfmpegService();
    this.recordingsDir = options.recordingsDir;
    this.cacheDir = options.cacheDir;
  }

  async trimRecording(request: TrimRequest): Promise<RecordingRecord> {
    const { recordingId, accurate = false } = request;
    let { startSeconds, endSeconds } = request;
    const source = this.requireRecording(recordingId);
    const sourcePath = this.requireFile(source);
    const duration = await this.requireDuration(sourcePath);

    ({ startSeconds, endSeconds } = clampRange(startSeconds, endSeconds, duration, 'Trim'));
    if (endSeconds - startSeconds < 0.5) {
      throw new AppError({ code: 'EDIT_RANGE_TOO_SHORT', message: 'Trim selection must be at least 0.5 seconds', recoverable: true });
    }

    const tag = `${fmtSec(startSeconds)}-${fmtSec(endSeconds)}`;
    const outputPath = await this.uniqueOutputPath(dirname(sourcePath), `${stripExt(basename(sourcePath))}_trim_${tag}`, '.mp4');
    this.logger.info({ recordingId, startSeconds, endSeconds, outputPath }, 'editor trim started');
    await this.ffmpeg.trim(sourcePath, outputPath, {
      startSeconds,
      endSeconds,
      accurate,
      onProgress: request.onProgress,
      onSpawned: request.onSpawned,
      isCancelled: request.isCancelled,
    });
    return this.saveEditedRecording({
      source,
      outputPath,
      title: `${source.title} (trimmed)`,
      sourceRecordingId: source.id,
      editHistory: [{ op: 'trim', startSeconds, endSeconds, accurate, sourceRecordingId: source.id, createdAt: new Date().toISOString() }],
      expectedSeconds: endSeconds - startSeconds,
    });
  }

  async cutRecording(request: CutRequest): Promise<RecordingRecord> {
    const { recordingId, cuts, accurate = false } = request;
    if (cuts.length === 0) {
      throw new AppError({ code: 'EDIT_NO_CUTS', message: 'At least one cut range is required', recoverable: true });
    }
    const source = this.requireRecording(recordingId);
    const sourcePath = this.requireFile(source);
    const duration = await this.requireDuration(sourcePath);
    const clamped = cuts.map((c) => {
      const r = clampRange(c.startSeconds, c.endSeconds, duration, 'Cut');
      return { startSeconds: r.startSeconds, endSeconds: r.endSeconds };
    });

    const outputPath = await this.uniqueOutputPath(dirname(sourcePath), `${stripExt(basename(sourcePath))}_cut_${clamped.length}x`, '.mp4');
    this.logger.info({ recordingId, cuts: clamped, outputPath }, 'editor cut started');
    const keptSeconds = clamped.reduce((sum, c, i) => {
      const prevEnd = i === 0 ? 0 : clamped[i - 1]!.endSeconds;
      return sum + Math.max(0, c.startSeconds - prevEnd);
    }, 0) + Math.max(0, duration - clamped[clamped.length - 1]!.endSeconds);
    await this.ffmpeg.cut(sourcePath, outputPath, clamped, {
      accurate,
      onProgress: request.onProgress
        ? (seconds) => request.onProgress!(seconds, Math.min(100, (seconds / Math.max(0.5, keptSeconds)) * 100))
        : undefined,
      onSpawned: request.onSpawned,
      isCancelled: request.isCancelled,
    });
    return this.saveEditedRecording({
      source,
      outputPath,
      title: `${source.title} (edited)`,
      sourceRecordingId: source.id,
      editHistory: [{ op: 'cut', cuts: clamped, accurate, sourceRecordingId: source.id, createdAt: new Date().toISOString() }],
      expectedSeconds: keptSeconds,
    });
  }

  async concatRecordings(request: ConcatRequest): Promise<RecordingRecord> {
    const { recordingIds } = request;
    if (recordingIds.length < 2) {
      throw new AppError({ code: 'EDIT_CONCAT_NEEDS_TWO', message: 'Select at least two recordings to combine', recoverable: true });
    }
    const sources = recordingIds.map((id) => this.requireRecording(id));
    const inputPaths = sources.map((s) => this.requireFile(s));
    const first = sources[0]!;

    const outDir = first.filePath ? dirname(first.filePath) : this.recordingsDir;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = await this.uniqueOutputPath(outDir, `combined_${sources.length}clips_${stamp}`, '.mp4');
    this.logger.info({ recordingIds, outputPath }, 'editor concat started');
    await this.ffmpeg.concatMultiple(inputPaths, outputPath);
    return this.saveEditedRecording({
      source: first,
      outputPath,
      title: request.title?.trim() || `Combined clip (${sources.length} videos)`,
      sourceRecordingId: first.id,
      editHistory: [{ op: 'concat', sources: recordingIds, createdAt: new Date().toISOString() }],
    });
  }

  /**
   * Filmstrip + waveform images for the editor timeline, cached under the
   * app cache dir keyed by (file path, mtime, size, cell count) so repeated
   * opens and edits are instant and stale caches invalidate themselves.
   * Generation is best-effort: failures degrade to a plain timeline, never
   * break the editor.
   */
  async generateTimelineAssets(request: TimelineAssetsRequest): Promise<TimelineAssets> {
    if (request.filePath !== undefined && request.filePath !== '') {
      return this.buildTimelineAssets(request.filePath, request);
    }
    if (request.recordingId !== undefined && request.recordingId !== '') {
      const source = this.requireRecording(request.recordingId);
      return this.buildTimelineAssets(this.requireFile(source), request);
    }
    throw new AppError({ code: 'EDIT_TIMELINE_NO_SOURCE', message: 'Timeline needs a recordingId or a filePath', recoverable: true });
  }

  private async buildTimelineAssets(
    sourcePath: string,
    request: { thumbCount?: number; includeWaveform?: boolean },
  ): Promise<TimelineAssets> {
    const duration = await this.requireDuration(sourcePath);
    if (this.cacheDir === undefined) {
      throw new AppError({ code: 'EDIT_TIMELINE_NO_CACHE', message: 'Timeline cache directory is not configured', recoverable: true });
    }
    const cells = Math.round(Math.min(60, Math.max(8, request.thumbCount ?? 24)));
    const stat_ = await stat(sourcePath);
    // ponytail: include mtime+size so an updated/re-downloaded file gets a
    // fresh strip instead of serving stale imagery.
    const hash = createHash('sha1')
      .update(`${sourcePath}|${stat_.size}|${Math.floor(stat_.mtimeMs)}|${cells}`)
      .digest('hex')
      .slice(0, 16);
    const cacheSubdir = join(this.cacheDir, 'editor');
    await mkdir(cacheSubdir, { recursive: true });
    const stripPath = join(cacheSubdir, `strip-${hash}.jpg`);
    const wavePath = join(cacheSubdir, `wave-${hash}.png`);

    // ponytail: the player's hover preview and the editor panel both hit
    // this on open — dedupe concurrent generations so a double decode
    // doesn't run for the same file.
    const inflightKey = stripPath;
    const inflight = this.inflightTimelines.get(inflightKey);
    if (inflight !== undefined) return inflight;

    const task = (async (): Promise<TimelineAssets> => {
      if (!(await fileExists(stripPath))) {
        await this.ffmpeg.generateFilmstrip(sourcePath, stripPath, { cells, durationSeconds: duration });
      }
      let waveformPath: string | null = null;
      if (request.includeWaveform !== false) {
        if (await fileExists(wavePath)) {
          waveformPath = wavePath;
        } else {
          try {
            await this.ffmpeg.generateWaveform(sourcePath, wavePath);
            waveformPath = (await fileExists(wavePath)) ? wavePath : null;
          } catch (error) {
            // No audio track (or an exotic codec) — the timeline just omits
            // the waveform row.
            this.logger.warn({ sourcePath, error }, 'editor waveform generation failed');
          }
        }
      }
      return { stripPath, waveformPath, thumbCount: cells };
    })();
    this.inflightTimelines.set(inflightKey, task);
    try {
      return await task;
    } finally {
      this.inflightTimelines.delete(inflightKey);
    }
  }

  /** Extract the (optionally ranged) audio track as a new library entry. */
  async extractAudioRecording(request: ExtractAudioRequest): Promise<RecordingRecord> {
    const source = this.requireRecording(request.recordingId);
    const sourcePath = this.requireFile(source);
    const duration = await this.requireDuration(sourcePath);
    const start = Math.max(0, Math.min(request.startSeconds ?? 0, duration));
    const end = Math.min(request.endSeconds ?? duration, duration);
    const clamped = clampRange(start, end, duration, 'Audio');
    if (clamped.endSeconds - clamped.startSeconds < 0.5) {
      throw new AppError({ code: 'EDIT_RANGE_TOO_SHORT', message: 'Audio selection must be at least 0.5 seconds', recoverable: true });
    }

    const ranged = clamped.startSeconds > 0.05 || clamped.endSeconds < duration - 0.05;
    const tag = ranged ? `_audio_${fmtSec(clamped.startSeconds)}-${fmtSec(clamped.endSeconds)}` : '_audio';
    const outputPath = await this.uniqueOutputPath(dirname(sourcePath), `${stripExt(basename(sourcePath))}${tag}`, `.${request.format}`);
    this.logger.info({ recordingId: request.recordingId, format: request.format, range: clamped, outputPath }, 'editor audio extraction started');
    await this.ffmpeg.extractAudio(sourcePath, outputPath, {
      startSeconds: clamped.startSeconds,
      endSeconds: clamped.endSeconds,
      format: request.format,
      onProgress: request.onProgress,
      onSpawned: request.onSpawned,
      isCancelled: request.isCancelled,
    });
    return this.saveEditedRecording({
      source,
      outputPath,
      title: `${source.title} (audio)`,
      sourceRecordingId: source.id,
      editHistory: [{ op: 'extract-audio', format: request.format, startSeconds: clamped.startSeconds, endSeconds: clamped.endSeconds, sourceRecordingId: source.id, createdAt: new Date().toISOString() }],
      expectedSeconds: clamped.endSeconds - clamped.startSeconds,
      expectVideo: false,
    });
  }

  /** Detect quiet spans (dead air) the user can queue as cuts. */
  async detectSilences(request: SilenceRequest): Promise<TimeRange[]> {
    let sourcePath: string;
    let label: string;
    if (request.filePath !== undefined && request.filePath !== '') {
      sourcePath = request.filePath;
      label = request.filePath;
    } else if (request.recordingId !== undefined && request.recordingId !== '') {
      const source = this.requireRecording(request.recordingId);
      sourcePath = this.requireFile(source);
      label = request.recordingId;
    } else {
      throw new AppError({ code: 'EDIT_SILENCE_NO_SOURCE', message: 'Silence detection needs a recordingId or a filePath', recoverable: true });
    }
    const duration = await this.requireDuration(sourcePath);
    const spans = await this.ffmpeg.detectSilence(sourcePath, {
      thresholdDb: request.thresholdDb ?? -40,
      minSeconds: request.minSeconds ?? 2,
      durationHint: duration,
    });
    this.logger.info({ recordingId: label, spans: spans.length }, 'editor silence detection finished');
    return spans;
  }

  // --- Internals ------------------------------------------------------------

  private requireRecording(id: string): RecordingRecord {
    const recording = this.repo.getRecording(id);
    if (recording === undefined) {
      throw new AppError({ code: 'EDIT_SOURCE_NOT_FOUND', message: `Recording ${id} not found`, recoverable: true });
    }
    return recording;
  }

  private requireFile(source: RecordingRecord): string {
    if (source.filePath === null || source.filePath === undefined || source.filePath === '') {
      throw new AppError({ code: 'EDIT_SOURCE_NO_FILE', message: `Recording "${source.title}" has no file to edit`, recoverable: true });
    }
    return source.filePath;
  }

  private async requireDuration(sourcePath: string): Promise<number> {
    if (!(await fileExists(sourcePath))) {
      throw new AppError({ code: 'EDIT_SOURCE_FILE_MISSING', message: `Source file not found: ${sourcePath}`, recoverable: true });
    }
    const metadata = await this.ffmpeg.getMetadata(sourcePath).catch(() => null);
    const duration = metadata?.duration ?? 0;
    if (duration <= 0) {
      throw new AppError({ code: 'EDIT_SOURCE_NO_DURATION', message: 'Could not read source duration — the file may be corrupt', recoverable: true });
    }
    return duration;
  }

  /** Unique sibling path; appends _1, _2 … when the name is taken. */
  private async uniqueOutputPath(dir: string, baseName: string, ext: string): Promise<string> {
    await mkdir(dir, { recursive: true });
    const safe = baseName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    for (let i = 0; i < 100; i++) {
      const candidate = join(dir, i === 0 ? `${safe}${ext}` : `${safe}_${i}${ext}`);
      if (!(await fileExists(candidate))) return candidate;
    }
    return join(dir, `${safe}_${randomUUID().slice(0, 8)}${ext}`);
  }

  /**
   * Export bookkeeping shared by trim/cut/concat: verify the ffmpeg output,
   * write a thumbnail + metadata, and insert the new library row. The source
   * row and file are never touched.
   */
  private async saveEditedRecording(args: {
    source: RecordingRecord;
    outputPath: string;
    title: string;
    sourceRecordingId: string;
    editHistory: Array<Record<string, unknown>>;
    /** Approximate expected output length — used only for a keyframe-snap warning. */
    expectedSeconds?: number;
    /** False for audio-only outputs — skip the (impossible) thumbnail step. */
    expectVideo?: boolean;
  }): Promise<RecordingRecord> {
    const { source, outputPath, title } = args;
    if (!(await fileExists(outputPath))) {
      throw new AppError({ code: 'EDIT_EXPORT_FAILED', message: 'Export produced no file', recoverable: true });
    }
    const size = await stat(outputPath).then((s) => s.size).catch(() => 0);
    if (size === 0) {
      throw new AppError({ code: 'EDIT_EXPORT_FAILED', message: 'Export produced an empty file', recoverable: true });
    }
    const metadata = await this.ffmpeg.getMetadata(outputPath).catch(() => null);
    if (metadata === null || metadata.duration <= 0) {
      throw new AppError({ code: 'EDIT_EXPORT_UNPLAYABLE', message: 'Export is not playable — try Accurate mode', recoverable: true });
    }
    // ponytail: fast stream-copy trims snap to keyframes, so the export can
    // run long by up to a GOP. Log it (don't fail) so deviations are visible.
    if (args.expectedSeconds !== undefined && Math.abs(metadata.duration - args.expectedSeconds) > 3) {
      this.logger.warn(
        { outputPath, expectedSeconds: args.expectedSeconds, actualSeconds: metadata.duration },
        'editor export duration deviates from selection (keyframe snap?) — suggest Accurate mode',
      );
    }

    let thumbnailPath: string | null = null;
    if (args.expectVideo !== false) {
      try {
        const candidate = `${outputPath}.thumb.jpg`;
        await this.ffmpeg.generateThumbnail(outputPath, candidate, Math.min(10, Math.max(1, metadata.duration / 2)));
        if (await fileExists(candidate)) thumbnailPath = candidate;
      } catch (error) {
        this.logger.warn({ outputPath, error }, 'editor thumbnail generation failed');
      }
    }

    const now = new Date().toISOString();
    const recording: RecordingRecord = {      id: randomUUID(),
      creatorId: source.creatorId ?? null,
      jobId: null,
      title,
      platformId: source.platformId,
      fileName: basename(outputPath),
      filePath: outputPath,
      thumbnailPath: thumbnailPath ?? null,
      status: 'completed',
      quality: source.quality ?? null,
      resolution: metadata.resolution,
      sizeBytes: size,
      durationSeconds: Math.round(metadata.duration),
      videoCodec: metadata.videoCodec,
      audioCodec: metadata.audioCodec,
      bitrate: metadata.bitrate,
      fps: metadata.fps,
      notes: null,
      isFavorite: false,
      sourceRecordingId: args.sourceRecordingId,
      editHistory: JSON.stringify(args.editHistory),
      startedAt: source.startedAt ?? null,
      endedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.repo.createRecording(recording);
    this.logger.info({ id: recording.id, outputPath, size }, 'editor export saved to library');
    return recording;
  }
}

/** Clamp a [start, end) range into [0, duration]; throw when out of bounds. */
function clampRange(
  startSeconds: number,
  endSeconds: number,
  duration: number,
  label: string,
): { startSeconds: number; endSeconds: number } {
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    throw new AppError({ code: 'EDIT_RANGE_INVALID', message: `${label} range must be numbers`, recoverable: true });
  }
  if (startSeconds < 0 || endSeconds <= startSeconds) {
    throw new AppError({ code: 'EDIT_RANGE_INVALID', message: `Invalid ${label.toLowerCase()} range`, recoverable: true });
  }
  if (startSeconds >= duration) {
    throw new AppError({
      code: 'EDIT_RANGE_EXCEEDS_DURATION',
      message: `${label} starts after the video ends (${duration}s)`,
      recoverable: true,
    });
  }
  // ponytail: 1s tolerance — the player often reports currentTime slightly
  // past the probed duration on live-captured files.
  if (endSeconds > duration && endSeconds - duration > 1) {
    throw new AppError({
      code: 'EDIT_RANGE_EXCEEDS_DURATION',
      message: `${label} ends after the video ends (${duration}s)`,
      recoverable: true,
    });
  }
  return { startSeconds: Math.max(0, startSeconds), endSeconds: Math.min(endSeconds, duration) };
}

function stripExt(fileName: string): string {
  const ext = extname(fileName);
  return ext !== '' ? fileName.slice(0, -ext.length) : fileName;
}

/** Filename-safe seconds: 65.5 → "65p5". */
function fmtSec(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', 'p');
}
