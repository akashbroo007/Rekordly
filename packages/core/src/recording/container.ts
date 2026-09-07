/**
 * ponytail: yt-dlp writes killed live downloads into a '.part' temp file
 * that is a raw MPEG-TS stream (Twitch/YouTube HLS), and generic VOD
 * downloads can land as '.mkv'/'.ts'. VLC plays any container, but
 * Chromium's <video> element (the in-app player) cannot demux TS or MKV —
 * so every finished download must be normalized into a real faststart MP4.
 */
// ponytail: async fs only — sync variants block the event loop mid-pipeline.
import { access, rename, rm, stat } from 'node:fs/promises';
import type { Logger } from '@rekordly/shared';
import { FfmpegService } from './ffmpeg';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureMp4Container(
  ffmpeg: FfmpegService,
  logger: Logger,
  logContext: Record<string, unknown>,
  filePath: string,
): Promise<string> {
  try {
    const container = await ffmpeg.getContainerFormat(filePath);
    if (container === null || /mp4/.test(container)) return filePath;
    logger.info(
      { ...logContext, filePath, container },
      'remuxing non-mp4 container for in-app playback',
    );
    const fixedPath = `${filePath}.container.mp4`;
    await ffmpeg.remux(filePath, fixedPath, { format: 'mp4' });
    if (!(await fileExists(fixedPath)) || (await stat(fixedPath)).size === 0) {
      throw new Error('container remux produced an empty file');
    }
    await rm(filePath, { force: true });
    await rename(fixedPath, filePath);
    return filePath;
  } catch (error) {
    logger.warn({ ...logContext, filePath, error }, 'container normalization failed — keeping original file');
    const fixedPath = `${filePath}.container.mp4`;
    if (await fileExists(fixedPath)) await rm(fixedPath, { force: true });
    return filePath;
  }
}
