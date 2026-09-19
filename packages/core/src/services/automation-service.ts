import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { Logger } from '@rekordly/shared';
import type { AutoActionsSettings } from '@rekordly/shared';
import type { RecordingRepo } from '@rekordly/database';
import type { FfmpegService } from '../recording/ffmpeg';
import type { UploadService } from './upload-service';
import type { PushNotifier } from './push-notifier';

/**
 * AutomationService: the post-recording pipeline.
 *
 * Applied to every finished recording, in a fixed safe order:
 *
 *   tag → compress → move → upload → delete-after-upload
 *
 * Every step is optional and independently skippable. The pipeline runs in
 * the background (never inside the recording finish path) and a failure in
 * one step never blocks the next — the Library entry always survives.
 */
export class AutomationService {
  private readonly repo: RecordingRepo;
  private readonly ffmpeg: FfmpegService;
  private readonly uploads: UploadService;
  private readonly push: PushNotifier | undefined;
  private readonly logger: Logger;
  private readonly getSettings: () => AutoActionsSettings;
  /** Bounded concurrency so 30 simultaneous finishes don't burst 30 ffmpeg runs. */
  private readonly queue: { run: () => Promise<void> }[] = [];
  private active = 0;
  private readonly maxConcurrent: number;

  constructor(options: {
    repo: RecordingRepo;
    ffmpeg: FfmpegService;
    uploads: UploadService;
    push?: PushNotifier;
    logger: Logger;
    getSettings: () => AutoActionsSettings;
    maxConcurrent?: number;
  }) {
    this.repo = options.repo;
    this.ffmpeg = options.ffmpeg;
    this.uploads = options.uploads;
    this.push = options.push;
    this.logger = options.logger;
    this.getSettings = options.getSettings;
    this.maxConcurrent = options.maxConcurrent ?? 1;
  }

  /** Entry point — call on every 'recording-completed' with the library entry id. */
  onRecordingCompleted(recordingId: string): void {
    this.enqueue(recordingId);
  }

  /** Manual run (Settings / Library "Run automation" action). */
  runForRecording(recordingId: string): Promise<{ ran: string[]; errors: string[] }> {
    return this.pipeline(recordingId);
  }

  private enqueue(recordingId: string): void {
    this.queue.push({
      run: async () => {
        await this.pipeline(recordingId);
      },
    });
    void this.pump();
  }

  private async pump(): Promise<void> {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      if (task === undefined) return;
      this.active++;
      void task
        .run()
        .catch((error) => {
          this.logger.warn({ error }, 'automation task failed');
        })
        .finally(() => {
          this.active--;
          void this.pump();
        });
    }
  }

  private async pipeline(recordingId: string): Promise<{ ran: string[]; errors: string[] }> {
    const ran: string[] = [];
    const errors: string[] = [];
    const settings = this.getSettings();
    if (!settings.enabled) return { ran, errors };

    const recording = this.repo.getRecording(recordingId);
    const initialPath = recording?.filePath;
    if (
      recording === undefined ||
      initialPath === null ||
      initialPath === undefined ||
      initialPath === ''
    ) {
      return { ran, errors };
    }
    // Skip derivative entries ((480p) transcodes, edits) — automation applies
    // to original captures only.
    if (recording.sourceRecordingId !== null) return { ran, errors };

    const filePath: string = initialPath;

    // 1. Tag
    if (settings.tagNewRecordings.trim() !== '') {
      try {
        this.applyTag(recordingId, settings.tagNewRecordings.trim());
        ran.push('tag');
      } catch (error) {
        errors.push(`tag: ${errorMessage(error)}`);
      }
    }

    // 2. Compress
    let currentPath = filePath;
    if (settings.compress.enabled) {
      try {
        const size = (await stat(currentPath)).size;
        if (size >= settings.compress.minSizeMb * 1024 * 1024) {
          const compressed = await this.compressFile(currentPath);
          if (compressed !== currentPath) {
            this.repo.updateRecording(recordingId, {
              filePath: compressed,
              fileName: basename(compressed),
              sizeBytes: (await stat(compressed)).size,
            });
            currentPath = compressed;
            ran.push('compress');
          }
        }
      } catch (error) {
        errors.push(`compress: ${errorMessage(error)}`);
      }
    }

    // 3. Move
    if (settings.moveToFolder.trim() !== '') {
      try {
        const moved = await this.moveFile(currentPath, settings.moveToFolder.trim());
        if (moved !== currentPath) {
          this.repo.updateRecording(recordingId, {
            filePath: moved,
            fileName: basename(moved),
          });
          currentPath = moved;
          ran.push('move');
        }
      } catch (error) {
        errors.push(`move: ${errorMessage(error)}`);
      }
    }

    // 4. Upload
    let uploadedVia: string | undefined;
    if (settings.uploadProviderId.trim() !== '') {
      try {
        const upload = this.uploads.addUpload({
          recordingId,
          providerId: settings.uploadProviderId.trim(),
          sourcePath: currentPath,
          destinationPath: basename(currentPath),
        });
        uploadedVia = settings.uploadProviderId.trim();
        ran.push('upload');
        this.logger.info(
          { recordingId, uploadId: upload.id, providerId: uploadedVia },
          'automation queued upload',
        );
      } catch (error) {
        errors.push(`upload: ${errorMessage(error)}`);
      }
    }

    // 5. Delete-after-upload — the file must actually finish uploading before
    // deletion. Register a one-shot listener on the upload-completed event.
    if (settings.deleteAfterUpload && uploadedVia !== undefined) {
      const listener = ({ uploadId }: { uploadId: string }): void => {
        try {
          const item = this.uploads.getUpload(uploadId);
          if (item === undefined || item.recordingId !== recordingId) return;
          this.uploads.off('upload-completed', listener);
          void this.deleteFileSafe(recordingId, currentPath)
            .then((deleted) => {
              if (deleted) ran.push('delete');
            })
            .catch((error) => {
              errors.push(`delete: ${errorMessage(error)}`);
              this.logger.warn({ recordingId, error }, 'automation delete-after-upload failed');
            });
        } catch (error) {
          this.logger.warn({ recordingId, error }, 'automation delete handler failed');
        }
      };
      this.uploads.on('upload-completed', listener);
    }

    if (ran.length > 0 || errors.length > 0) {
      this.logger.info(
        { recordingId, ran, errors },
        'automation pipeline finished',
      );
      if (errors.length > 0) {
        this.push?.send({
          level: 'warn',
          title: 'Automation had problems',
          message: `"${recording.title}": ${errors.join('; ')}`,
        });
      }
    }

    return { ran, errors };
  }

  /** Finds-or-creates the configured tag and attaches it. */
  private applyTag(recordingId: string, tagName: string): void {
    const existing = this.repo
      .listTags()
      .find((tag) => tag.name.toLowerCase() === tagName.toLowerCase());
    const tagId =
      existing?.id ??
      (() => {
        this.repo.createTag(tagName);
        return this.repo.listTags().find((tag) => tag.name.toLowerCase() === tagName.toLowerCase())?.id;
      })();
    if (tagId !== undefined) {
      this.repo.addTagToRecording(recordingId, tagId);
    }
  }

  /**
   * Re-encodes next to the source and swaps it in on success. The original
   * file is only removed after the compressed copy is verified non-empty, so
   * a failed encode never loses data.
   */
  private async compressFile(filePath: string): Promise<string> {
    const parsed = filePath.replace(/\.mp4$/i, '');
    const tmpPath = `${parsed}.compressed.mp4`;
    await this.ffmpeg.transcode(filePath, tmpPath, { height: 720, crf: 26 });
    const compressedSize = (await stat(tmpPath)).size;
    if (compressedSize === 0) {
      await rm(tmpPath, { force: true });
      throw new Error('compress produced an empty file');
    }
    // Keep the compressed copy only when it's actually smaller.
    if (compressedSize >= (await stat(filePath)).size) {
      await rm(tmpPath, { force: true });
      this.logger.info({ filePath }, 'compress skipped — output was not smaller');
      return filePath;
    }
    await rm(filePath, { force: true });
    await rename(tmpPath, filePath);
    return filePath;
  }

  private async moveFile(filePath: string, targetFolder: string): Promise<string> {
    const absolute = resolve(targetFolder);
    if (dirname(filePath) === absolute) return filePath;
    await mkdir(absolute, { recursive: true });
    const target = join(absolute, basename(filePath));
    if (target === filePath) return filePath;
    await rename(filePath, target);
    return target;
  }

  /** Never removes the last reference blindly — verifies the file still matches the recording row. */
  private async deleteFileSafe(recordingId: string, expectedPath: string): Promise<boolean> {
    const recording = this.repo.getRecording(recordingId);
    if (recording === undefined || recording.filePath !== expectedPath) {
      return false;
    }
    await rm(expectedPath, { force: true });
    // Keep the library entry (status 'completed') — only clear the file
    // reference so the UI shows it as stored in the cloud, not as missing.
    this.repo.updateRecording(recordingId, {
      filePath: null,
      fileName: null,
    });
    this.logger.info({ recordingId, path: expectedPath }, 'automation deleted uploaded file');
    return true;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
