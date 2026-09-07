// ponytail: async fs only — sync variants block the event loop mid-pipeline.
import { access, stat } from 'node:fs/promises';
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
 * FFmpeg integration for remuxing, thumbnail generation, metadata writing,
 * audio/video validation, and duration verification.
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
    const binary = ffmpeg.resolve();
    if (binary === null) {
      throw new AppError({
        code: 'FFMPEG_NOT_FOUND',
        message: 'FFmpeg binary not found on PATH',
        recoverable: true,
      });
    }

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
}
