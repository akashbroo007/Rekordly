// ponytail: async fs only — sync variants block the event loop mid-pipeline.
import { access, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { AppError } from '@rekordly/shared';
import type { FileVerificationResult } from '@rekordly/shared';
import { ExternalBinary } from '@rekordly/recorder';

const ffmpeg = new ExternalBinary('ffmpeg');

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * A single time range in seconds: [startSeconds, endSeconds).
 * Used for both trim windows and cut (remove) ranges.
 */
export interface TimeRange {
  startSeconds: number;
  endSeconds: number;
}

/**
 * Hooks for cancellable, progress-reporting ffmpeg runs. `onProgress` reports
 * processed OUTPUT seconds (parsed from the `-progress pipe:1` microformat),
 * `onSpawned` exposes the live child so the IPC layer can kill it, and
 * `isCancelled` lets long, multi-step operations bail between steps instead
 * of falling into a doomed fallback re-encode after a cancel.
 */
export interface ProgressHooks {
  onProgress?: (seconds: number, percent?: number) => void;
  onSpawned?: (child: ChildProcessWithoutNullStreams) => void;
  isCancelled?: () => boolean;
}

function cancelledError(): AppError {
  return new AppError({ code: 'EDIT_EXPORT_CANCELLED', message: 'Export cancelled', recoverable: true });
}

/** ponytail: `out_time_ms` is actually microseconds (ffmpeg legacy naming). */
function attachProgress(
  child: ChildProcessWithoutNullStreams,
  hooks: ProgressHooks,
  toPercent?: (seconds: number) => number,
): void {
  hooks.onSpawned?.(child);
  const onProgress = hooks.onProgress;
  if (onProgress === undefined) return;
  child.stdout.on('data', (chunk: Buffer) => {
    for (const match of String(chunk).matchAll(/out_time(?:_us|_ms)=(\d+)/g)) {
      const seconds = Number(match[1]) / 1e6;
      if (Number.isFinite(seconds) && seconds >= 0) onProgress(seconds, toPercent?.(seconds));
    }
  });
}

export interface TrimOptions {
  startSeconds: number;
  endSeconds: number;
  /** Re-encode (libx264/aac) for frame accuracy instead of fast stream copy. */
  accurate?: boolean;
}

/**
 * FFmpeg integration for remuxing, thumbnail generation, metadata writing,
 * audio/video validation, duration verification, and non-destructive editing
 * (trim / cut / concat) used by the built-in editor.
 */
export class FfmpegService {
  async remux(
    inputPath: string,
    outputPath: string,
    options: {
      format?: string;
      copyVideo?: boolean;
      copyAudio?: boolean;
    } = {},
  ): Promise<void> {
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({
        code: 'FFMPEG_NOT_FOUND',
        message: 'FFmpeg binary not found on PATH',
        recoverable: true,
      });
    }

    const args: string[] = ['-i', inputPath];

    if (options.copyVideo !== false) args.push('-c:v', 'copy');
    if (options.copyAudio !== false) args.push('-c:a', 'copy');

    if (options.format !== undefined) {
      args.push('-f', options.format);
      if (options.format === 'mp4') {
        // ponytail: faststart puts the moov atom up front (needed for the
        // in-app Range-streaming player) and make_zero normalizes live
        // streams' non-zero start timestamps so Chromium's demuxer accepts
        // them — VLC tolerates these, the <video> element does not.
        args.push('-movflags', '+faststart', '-avoid_negative_ts', 'make_zero');
      }
    }

    args.push('-y', outputPath);

    const result = await ffmpeg.run(args, { timeoutMs: 120_000 });
    if (result.code !== 0) {
      throw new AppError({
        code: 'FFMPEG_REMUX_FAILED',
        message: `FFmpeg remux failed: ${result.stderr.slice(0, 500)}`,
        recoverable: true,
      });
    }
  }

  /**
   * Concatenate same-codec mp4 files listed in an ffmpeg concat list file
   * into one output file (used to merge resumed recording parts).
   */
  async concat(listFilePath: string, outputPath: string): Promise<void> {
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({
        code: 'FFMPEG_NOT_FOUND',
        message: 'FFmpeg binary not found on PATH',
        recoverable: true,
      });
    }

    const args = ['-f', 'concat', '-safe', '0', '-i', listFilePath, '-c', 'copy', '-y', outputPath];
    const result = await ffmpeg.run(args, { timeoutMs: 120_000 });
    if (result.code !== 0) {
      throw new AppError({
        code: 'FFMPEG_CONCAT_FAILED',
        message: `FFmpeg concat failed: ${result.stderr.slice(0, 500)}`,
        recoverable: true,
      });
    }
  }

  /**
   * ponytail: detect the actual container format from ffmpeg's input probe
   * (e.g. 'mpegts', 'mov,mp4,...'). A killed yt-dlp download leaves its
   * '.part' temp file — often a raw MPEG-TS stream with an '.mp4' name.
   * VLC plays anything; Chromium's <video> cannot demux TS-in-.mp4, so the
   * caller uses this to decide when a remux into a real mp4 is required.
   */
  async getContainerFormat(filePath: string): Promise<string | null> {
    try {
      const result = await ffmpeg.run(
        ['-i', filePath, '-hide_banner'],
        { timeoutMs: 30_000 },
      );
      const match = result.stderr.match(/Input #\d+,\s*([\w,]+)/);
      return match ? (match[1] ?? null) : null;
    } catch {
      return null;
    }
  }

  async generateThumbnail(
    inputPath: string,
    outputPath: string,
    timeSeconds = 10,
  ): Promise<void> {
    // ponytail: seek BEFORE -i (input seeking) — output seeking with -ss after
    // -i decodes everything up to the timestamp and fails outright on partial
    // files shorter than the seek point (e.g. cancelled recordings).
    // Fall back to progressively earlier timestamps so even a ~1s partial
    // clip yields a frame.
    const attempts = [timeSeconds, 1, 0].filter((t, i, arr) => arr.indexOf(t) === i);
    let lastStderr = '';
    for (const t of attempts) {
      const args = [
        '-ss', String(t),
        '-i', inputPath,
        '-vframes', '1',
        '-vf', 'scale=640:-1',
        '-y', outputPath,
      ];

      const result = await ffmpeg.run(args, { timeoutMs: 30_000 });
      if (result.code === 0 && (await fileExists(outputPath))) return;
      lastStderr = result.stderr;
    }
    throw new AppError({
      code: 'FFMPEG_THUMBNAIL_FAILED',
      message: `Thumbnail generation failed: ${lastStderr.slice(0, 500) || 'no frame extracted'}`,
      recoverable: true,
    });
  }

  /**
   * Full-resolution single-frame grab (player screenshots). Same input-seek
   * + fallback pattern as generateThumbnail, but WITHOUT the 640px scale so
   * screenshots come out at source resolution.
   */
  async extractFrame(inputPath: string, outputPath: string, timeSeconds: number): Promise<void> {
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({
        code: 'FFMPEG_NOT_FOUND',
        message: 'FFmpeg binary not found on PATH',
        recoverable: true,
      });
    }
    const attempts = [Math.max(0, timeSeconds), 1, 0].filter((t, i, arr) => arr.indexOf(t) === i);
    let lastStderr = '';
    for (const t of attempts) {
      const args = [
        '-ss', String(t),
        '-i', inputPath,
        '-vframes', '1',
        '-y', outputPath,
      ];
      const result = await ffmpeg.run(args, { timeoutMs: 30_000 });
      if (result.code === 0 && (await fileExists(outputPath))) return;
      lastStderr = result.stderr;
    }
    throw new AppError({
      code: 'FFMPEG_FRAME_FAILED',
      message: `Frame extraction failed: ${lastStderr.slice(0, 500) || 'no frame extracted'}`,
      recoverable: true,
    });
  }

  async getMetadata(filePath: string): Promise<{
    duration: number;
    resolution: string;
    videoCodec: string;
    audioCodec: string;
    bitrate: number;
    fps: number;
  }> {
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({
        code: 'FFMPEG_NOT_FOUND',
        message: 'FFmpeg binary not found on PATH',
        recoverable: true,
      });
    }

    // ponytail: timeout — a truncated/tree-killed file can make ffmpeg scan
    // forever; without it the whole recording pipeline hangs and the job card
    // silently disappears from the UI.
    const result = await ffmpeg.run([
      '-i', filePath,
      '-hide_banner',
    ], { timeoutMs: 30_000 });

    // Parse ffprobe-like output from stderr
    const output = result.stderr;

    const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    const duration = durationMatch
      ? parseInt(durationMatch[1]!) * 3600 + parseInt(durationMatch[2]!) * 60 + parseInt(durationMatch[3]!)
      : 0;

    const videoMatch = output.match(/Stream.*Video:\s*(\w+)/);
    const audioMatch = output.match(/Stream.*Audio:\s*(\w+)/);
    const fpsMatch = output.match(/(\d+(?:\.\d+)?)\s*fps/);
    const bitrateMatch = output.match(/bitrate:\s*(\d+)\s*kb\/s/);
    const resolutionMatch = output.match(/(\d{3,5})x(\d{3,5})/);

    return {
      duration,
      resolution: resolutionMatch ? `${resolutionMatch[1]}x${resolutionMatch[2]}` : 'unknown',
      videoCodec: videoMatch?.[1] ?? 'unknown',
      audioCodec: audioMatch?.[1] ?? 'unknown',
      bitrate: bitrateMatch ? parseInt(bitrateMatch[1]!) * 1000 : 0,
      fps: fpsMatch ? parseFloat(fpsMatch[1]!) : 0,
    };
  }

  async validateFile(filePath: string): Promise<FileVerificationResult> {
    const errors: string[] = [];

    // Check exists
    if (!(await fileExists(filePath))) {
      return {
        exists: false,
        sizeBytes: 0,
        durationSeconds: 0,
        playable: false,
        validMetadata: false,
        integrity: false,
        errors: ['File does not exist'],
      };
    }

    // Check size
    const stat_ = await stat(filePath);
    const sizeBytes = stat_.size;
    if (sizeBytes === 0) {
      errors.push('File is empty');
    }

    // Get metadata for duration and codec info
    let duration = 0;
    let playable = false;
    try {
      const metadata = await this.getMetadata(filePath);
      duration = metadata.duration;
      playable = metadata.duration > 0 && metadata.videoCodec !== 'unknown';
      if (!playable) {
        errors.push('File may not be playable');
      }
    } catch {
      errors.push('Could not read metadata');
    }

    return {
      exists: true,
      sizeBytes,
      durationSeconds: duration,
      playable,
      validMetadata: duration > 0,
      integrity: errors.length === 0,
      errors,
    };
  }

  async writeMetadata(
    inputPath: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({
        code: 'FFMPEG_NOT_FOUND',
        message: 'FFmpeg binary not found on PATH',
        recoverable: true,
      });
    }

    const args = ['-i', inputPath];
    for (const [key, value] of Object.entries(metadata)) {
      args.push('-metadata', `${key}=${value}`);
    }
    args.push('-c', 'copy', '-y', `${inputPath}.tmp`);

    const result = await ffmpeg.run(args, { timeoutMs: 60_000 });
    if (result.code !== 0) {
      throw new AppError({
        code: 'FFMPEG_METADATA_FAILED',
        message: `Failed to write metadata: ${result.stderr.slice(0, 500)}`,
        recoverable: true,
      });
    }
  }

  /**
   * plan §8: explicit quality-downgrade transcode. Runs EXCLUSIVELY in the
   * background transcode pool (concurrency 2) — the live path always captures
   * source quality and never awaits this. Same encode shape the live path
   * used to run inline (`veryfast`/`crf23`, audio copied untouched).
   */
  async transcode(
    inputPath: string,
    outputPath: string,
    options: { height: number; crf?: number },
  ): Promise<void> {
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({
        code: 'FFMPEG_NOT_FOUND',
        message: 'FFmpeg binary not found on PATH',
        recoverable: true,
      });
    }
    if (!(await fileExists(inputPath))) {
      throw new AppError({
        code: 'FFMPEG_TRANSCODE_INPUT_MISSING',
        message: `Input file not found: ${inputPath}`,
        recoverable: true,
      });
    }

    const args = [
      '-i', inputPath,
      '-vf', `scale=-2:'min(ih,${options.height})'`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      // ponytail: CRF is constant-QUALITY — the size knob for the user's
      // storage setting. Higher = smaller files, slightly lower quality.
      '-crf', String(options.crf ?? 23),
      '-c:a', 'copy',
      '-y', outputPath,
    ];
    const result = await ffmpeg.run(args);
    if (result.code !== 0 || !(await fileExists(outputPath))) {
      await rm(outputPath, { force: true }).catch(() => undefined);
      throw new AppError({
        code: 'FFMPEG_TRANSCODE_FAILED',
        message: `FFmpeg transcode failed: ${result.stderr.slice(0, 500)}`,
        recoverable: true,
      });
    }
  }

  /**
   * Trim a single window [startSeconds, endSeconds) into a new file.
   * Non-destructive: the input is never modified.
   *
   * Fast path uses stream copy (`-c copy`) — instant on multi-GB files but
   * snaps to keyframes (±2s). When the fast path fails (or `accurate` is
   * set), falls back to a libx264/aac re-encode for frame accuracy.
   */
  async trim(
    inputPath: string,
    outputPath: string,
    options: TrimOptions & ProgressHooks,
  ): Promise<void> {
    const { startSeconds, endSeconds, accurate = false } = options;
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
      throw new AppError({ code: 'FFMPEG_TRIM_INVALID_RANGE', message: 'Trim range must be finite numbers', recoverable: true });
    }
    if (startSeconds < 0 || endSeconds <= startSeconds) {
      throw new AppError({ code: 'FFMPEG_TRIM_INVALID_RANGE', message: `Invalid trim range: start=${startSeconds} end=${endSeconds}`, recoverable: true });
    }
    if (inputPath === outputPath) {
      throw new AppError({ code: 'FFMPEG_TRIM_SAME_FILE', message: 'Trim output must differ from input (non-destructive)', recoverable: true });
    }
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({ code: 'FFMPEG_NOT_FOUND', message: 'FFmpeg binary not found on PATH', recoverable: true });
    }
    if (!(await fileExists(inputPath))) {
      throw new AppError({ code: 'FFMPEG_TRIM_INPUT_MISSING', message: `Input file not found: ${inputPath}`, recoverable: true });
    }

    // ponytail: `-t duration` (not `-to end`) — with `-ss` as an input option,
    // `-to` is interpreted as an *output* timestamp, so `-ss 5 -to 10` records
    // 10s (5→15), not 5→10. Duration is unambiguous either way.
    // `-progress pipe:1 -nostats` emits machine-parseable out_time lines on
    // stdout for the editor's progress bar.
    const windowSeconds = endSeconds - startSeconds;
    const toPercent = (seconds: number): number => Math.min(100, (seconds / windowSeconds) * 100);
    const fastArgs = [
      '-ss', String(startSeconds),
      '-i', inputPath,
      '-t', String(windowSeconds),
      '-c', 'copy',
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero',
      '-progress', 'pipe:1',
      '-nostats',
      '-y', outputPath,
    ];
    if (!accurate) {
      const fast = await ffmpeg.run(fastArgs, { onSpawn: (child) => attachProgress(child, options, toPercent) });
      if (fast.code === 0 && (await fileExists(outputPath))) return;
      // ponytail: fall through to the accurate re-encode below — stream copy
      // fails on some live-captured files (non-zero start, missing keyframes).
      // But a cancelled run must NOT fall into a full re-encode: bail instead.
      if (options.isCancelled?.() === true) {
        await rm(outputPath, { force: true }).catch(() => undefined);
        throw cancelledError();
      }
    }

    const accurateArgs = [
      '-ss', String(startSeconds),
      '-i', inputPath,
      '-t', String(windowSeconds),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '18',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-progress', 'pipe:1',
      '-nostats',
      '-y', outputPath,
    ];
    const result = await ffmpeg.run(accurateArgs, { onSpawn: (child) => attachProgress(child, options, toPercent) });
    if (result.code !== 0 || !(await fileExists(outputPath))) {
      await rm(outputPath, { force: true }).catch(() => undefined);
      if (options.isCancelled?.() === true) throw cancelledError();
      throw new AppError({
        code: 'FFMPEG_TRIM_FAILED',
        message: `FFmpeg trim failed: ${result.stderr.slice(0, 500)}`,
        recoverable: true,
      });
    }
  }

  /**
   * Remove `cuts` ranges from the input and write the kept segments joined
   * into a new file. Implemented as N stream-copy trims + concat demuxer so
   * a multi-cut export stays fast; pass `accurate` for frame-exact boundaries.
   */
  async cut(
    inputPath: string,
    outputPath: string,
    cuts: TimeRange[],
    options: { accurate?: boolean } & ProgressHooks = {},
  ): Promise<void> {
    if (cuts.length === 0) {
      throw new AppError({ code: 'FFMPEG_CUT_NO_RANGES', message: 'At least one cut range is required', recoverable: true });
    }
    if (inputPath === outputPath) {
      throw new AppError({ code: 'FFMPEG_CUT_SAME_FILE', message: 'Cut output must differ from input (non-destructive)', recoverable: true });
    }
    const sorted = [...cuts].sort((a, b) => a.startSeconds - b.startSeconds);
    for (const c of sorted) {
      if (!Number.isFinite(c.startSeconds) || !Number.isFinite(c.endSeconds) || c.startSeconds < 0 || c.endSeconds <= c.startSeconds) {
        throw new AppError({ code: 'FFMPEG_CUT_INVALID_RANGE', message: `Invalid cut range: ${c.startSeconds}-${c.endSeconds}`, recoverable: true });
      }
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.startSeconds < sorted[i - 1]!.endSeconds) {
        throw new AppError({ code: 'FFMPEG_CUT_OVERLAP', message: 'Cut ranges must not overlap', recoverable: true });
      }
    }

    const metadata = await this.getMetadata(inputPath).catch(() => null);
    const duration = metadata?.duration ?? 0;
    if (duration <= 0) {
      throw new AppError({ code: 'FFMPEG_CUT_NO_DURATION', message: 'Could not determine media duration for cut', recoverable: true });
    }

    // Complement of cuts = kept segments.
    const keep: TimeRange[] = [];
    let cursor = 0;
    for (const c of sorted) {
      const s = Math.min(c.startSeconds, duration);
      const e = Math.min(c.endSeconds, duration);
      if (s > cursor) keep.push({ startSeconds: cursor, endSeconds: s });
      cursor = Math.max(cursor, e);
    }
    if (cursor < duration) keep.push({ startSeconds: cursor, endSeconds: duration });
    if (keep.length === 0) {
      throw new AppError({ code: 'FFMPEG_CUT_REMOVES_ALL', message: 'Cuts remove the entire file — nothing to export', recoverable: true });
    }

    const tag = randomUUID().slice(0, 8);
    const workDir = tmpdir();
    const keepFiles: string[] = [];
    const listPath = join(workDir, `rekordly-cut-${tag}.txt`);
    // ponytail: progress is weighted by segment length — each keep segment's
    // ffmpeg reports its own processed seconds, and we report cumulative
    // OUTPUT seconds so percent = seconds / total kept length.
    const totalKept = keep.reduce((sum, k) => sum + (k.endSeconds - k.startSeconds), 0);
    let doneSeconds = 0;
    try {
      for (let i = 0; i < keep.length; i++) {
        const k = keep[i]!;
        if (options.isCancelled?.() === true) throw cancelledError();
        const tmp = join(workDir, `rekordly-cut-${tag}-keep${i}.mp4`);
        await this.trim(inputPath, tmp, {
          startSeconds: k.startSeconds,
          endSeconds: k.endSeconds,
          accurate: options.accurate,
          onSpawned: options.onSpawned,
          isCancelled: options.isCancelled,
          onProgress: options.onProgress
            ? (seconds) => options.onProgress!(doneSeconds + Math.min(seconds, k.endSeconds - k.startSeconds))
            : undefined,
        });
        keepFiles.push(tmp);
        doneSeconds += k.endSeconds - k.startSeconds;
      }
      await writeFile(listPath, keepFiles.map((p) => `file '${p.replace(/'/g, '"')}'`).join('\n'));
      await this.concat(listPath, outputPath);
      options.onProgress?.(totalKept, 100);
    } finally {
      await rm(listPath, { force: true }).catch(() => undefined);
      for (const f of keepFiles) await rm(f, { force: true }).catch(() => undefined);
    }
  }

  /**
   * Join multiple same-codec files (in order) into one new file via the
   * concat demuxer with stream copy. Used to merge clips / combine recordings.
   */
  async concatMultiple(inputPaths: string[], outputPath: string): Promise<void> {
    if (inputPaths.length < 2) {
      throw new AppError({ code: 'FFMPEG_CONCAT_NEEDS_TWO', message: 'Concat needs at least two inputs', recoverable: true });
    }
    for (const p of inputPaths) {
      if (!(await fileExists(p))) {
        throw new AppError({ code: 'FFMPEG_CONCAT_INPUT_MISSING', message: `Input file not found: ${p}`, recoverable: true });
      }
      if (p === outputPath) {
        throw new AppError({ code: 'FFMPEG_CONCAT_SAME_FILE', message: 'Concat output must differ from inputs (non-destructive)', recoverable: true });
      }
    }
    const listPath = `${outputPath}.concat-${randomUUID().slice(0, 8)}.txt`;
    try {
      await writeFile(listPath, inputPaths.map((p) => `file '${p.replace(/'/g, '"')}'`).join('\n'));
      await this.concat(listPath, outputPath);
    } finally {
      await rm(listPath, { force: true }).catch(() => undefined);
    }
  }

  /**
   * Extract the audio track (optionally a sub-range) into a standalone
   * audio file. Always re-encodes — stream copy into .m4a only works for
   * AAC sources and never for .mp3, and the editor's audio export must
   * succeed regardless of the source codec.
   */
  async extractAudio(
    inputPath: string,
    outputPath: string,
    options: { startSeconds?: number; endSeconds?: number; format: 'mp3' | 'm4a' } & ProgressHooks,
  ): Promise<void> {
    const { startSeconds = 0, endSeconds, format } = options;
    if (!Number.isFinite(startSeconds) || startSeconds < 0) {
      throw new AppError({ code: 'FFMPEG_AUDIO_INVALID_RANGE', message: 'Invalid audio range', recoverable: true });
    }
    if (endSeconds !== undefined && (!Number.isFinite(endSeconds) || endSeconds <= startSeconds)) {
      throw new AppError({ code: 'FFMPEG_AUDIO_INVALID_RANGE', message: 'Invalid audio range', recoverable: true });
    }
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({ code: 'FFMPEG_NOT_FOUND', message: 'FFmpeg binary not found on PATH', recoverable: true });
    }
    if (!(await fileExists(inputPath))) {
      throw new AppError({ code: 'FFMPEG_AUDIO_INPUT_MISSING', message: `Input file not found: ${inputPath}`, recoverable: true });
    }

    const windowSeconds = endSeconds !== undefined ? endSeconds - startSeconds : null;
    const toPercent =
      windowSeconds !== null && windowSeconds > 0
        ? (seconds: number): number => Math.min(100, (seconds / windowSeconds) * 100)
        : undefined;

    const args: string[] = [];
    if (startSeconds > 0) args.push('-ss', String(startSeconds));
    args.push('-i', inputPath);
    if (windowSeconds !== null) args.push('-t', String(windowSeconds));
    args.push(
      '-vn',
      '-c:a', format === 'mp3' ? 'libmp3lame' : 'aac',
      '-b:a', '192k',
    );
    if (format === 'm4a') args.push('-movflags', '+faststart');
    args.push('-progress', 'pipe:1', '-nostats', '-y', outputPath);

    const result = await ffmpeg.run(args, { onSpawn: (child) => attachProgress(child, options, toPercent) });
    if (result.code !== 0 || !(await fileExists(outputPath))) {
      await rm(outputPath, { force: true }).catch(() => undefined);
      if (options.isCancelled?.() === true) throw cancelledError();
      throw new AppError({
        code: 'FFMPEG_AUDIO_EXTRACT_FAILED',
        message: `Audio extraction failed: ${result.stderr.slice(0, 500)}`,
        recoverable: true,
      });
    }
  }

  /**
   * Evenly-sampled filmstrip for the editor timeline: `cells` frames spread
   * across the whole duration, tiled into ONE wide image (cell i covers
   * time [i, i+1) * duration/cells, so the renderer can map x → time
   * linearly). One ffmpeg pass, cached on disk by the caller.
   */
  async generateFilmstrip(
    inputPath: string,
    outputPath: string,
    options: { cells: number; durationSeconds: number },
  ): Promise<void> {
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({ code: 'FFMPEG_NOT_FOUND', message: 'FFmpeg binary not found on PATH', recoverable: true });
    }
    const { cells, durationSeconds } = options;
    if (!(cells >= 1) || !(durationSeconds > 0)) {
      throw new AppError({ code: 'FFMPEG_TIMELINE_INVALID', message: 'Invalid filmstrip parameters', recoverable: true });
    }
    const args = [
      '-i', inputPath,
      '-vf', `fps=${cells / durationSeconds},scale=256:-2,tile=${cells}x1`,
      '-frames:v', '1',
      '-y', outputPath,
    ];
    const result = await ffmpeg.run(args, { timeoutMs: 240_000 });
    if (result.code !== 0 || !(await fileExists(outputPath))) {
      await rm(outputPath, { force: true }).catch(() => undefined);
      throw new AppError({
        code: 'FFMPEG_TIMELINE_FAILED',
        message: `Filmstrip generation failed: ${result.stderr.slice(0, 400)}`,
        recoverable: true,
      });
    }
  }

  /** Whole-file waveform image for the editor timeline (one ffmpeg pass). */
  async generateWaveform(inputPath: string, outputPath: string): Promise<void> {
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({ code: 'FFMPEG_NOT_FOUND', message: 'FFmpeg binary not found on PATH', recoverable: true });
    }
    const args = [
      '-i', inputPath,
      '-filter_complex', '[0:a]aformat=channel_layouts=mono,showwavespic=s=2048x120:colors=#818cf8[w]',
      '-map', '[w]',
      '-frames:v', '1',
      '-y', outputPath,
    ];
    const result = await ffmpeg.run(args, { timeoutMs: 180_000 });
    if (result.code !== 0 || !(await fileExists(outputPath))) {
      await rm(outputPath, { force: true }).catch(() => undefined);
      throw new AppError({
        code: 'FFMPEG_WAVEFORM_FAILED',
        message: `Waveform generation failed: ${result.stderr.slice(0, 300)}`,
        recoverable: true,
      });
    }
  }

  /**
   * Detect quiet (dead-air) spans via the `silencedetect` audio filter.
   * Audio-only decode (`-vn`) keeps this fast even on multi-GB inputs.
   * `durationHint` closes a trailing silence that never gets an
   * `silence_end` line (end of file).
   */
  async detectSilence(
    inputPath: string,
    options: { thresholdDb?: number; minSeconds?: number; durationHint?: number } = {},
  ): Promise<TimeRange[]> {
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({ code: 'FFMPEG_NOT_FOUND', message: 'FFmpeg binary not found on PATH', recoverable: true });
    }
    const thresholdDb = options.thresholdDb ?? -40;
    const minSeconds = options.minSeconds ?? 2;
    const args = [
      '-i', inputPath,
      '-vn',
      '-af', `silencedetect=noise=${thresholdDb}dB:d=${minSeconds}`,
      '-f', 'null', '-',
    ];
    const result = await ffmpeg.run(args, { timeoutMs: 300_000 });

    const spans: TimeRange[] = [];
    let start: number | null = null;
    for (const line of result.stderr.split('\n')) {
      const startMatch = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
      if (startMatch !== null) {
        start = Math.max(0, parseFloat(startMatch[1]!));
        continue;
      }
      const endMatch = line.match(/silence_end:\s*(\d+(?:\.\d+)?)/);
      if (endMatch !== null && start !== null) {
        const end = parseFloat(endMatch[1]!);
        if (end > start) spans.push({ startSeconds: start, endSeconds: end });
        start = null;
      }
    }
    if (start !== null && (options.durationHint ?? 0) > start) {
      spans.push({ startSeconds: start, endSeconds: options.durationHint! });
    }
    return spans;
  }
}
