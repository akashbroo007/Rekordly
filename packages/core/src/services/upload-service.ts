import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Logger } from '@rekordly/shared';
import type { UploadQueueRepo, UploadQueueRecord } from '@rekordly/database';
import type { NotificationService } from './notification-service';

export interface UploadServiceOptions {
  repo: UploadQueueRepo;
  notifications: NotificationService;
  logger: Logger;
  /** How many uploads may run at the same time (default 1). */
  maxConcurrentUploads?: number;
  /** Base delay for the retry backoff (doubled per attempt, default 5s). */
  retryBaseDelayMs?: number;
  /** ponytail: live concurrency limit (user can change it in Settings). */
  getLimits?: () => { maxConcurrentUploads: number };
}

export interface UploadServiceEvents {
  'upload-queued': [{ uploadId: string; timestamp: string }];
  'upload-started': [{ uploadId: string; timestamp: string }];
  'upload-progress': [{ uploadId: string; percent: number; speed: number; eta: number; timestamp: string }];
  'upload-completed': [{ uploadId: string; timestamp: string }];
  'upload-failed': [{ uploadId: string; error: string; timestamp: string }];
  'upload-cancelled': [{ uploadId: string; timestamp: string }];
  'upload-paused': [{ uploadId: string; timestamp: string }];
  'upload-resumed': [{ uploadId: string; timestamp: string }];
  'upload-removed': [{ uploadId: string; timestamp: string }];
}

export interface UploadProvider {
  readonly id: string;
  readonly name: string;
  authenticate(): Promise<boolean>;
  upload(sourcePath: string, destinationPath: string, onProgress: (percent: number, speed: number) => void, signal: AbortSignal): Promise<{ checksum: string; link?: string }>;
  pause(): void;
  resume(): void;
  cancel(): void;
  delete(path: string): Promise<void>;
  verify(path: string, checksum: string): Promise<boolean>;
  healthCheck(): Promise<boolean>;
}

export interface UploadAddOptions {
  recordingId?: string;
  providerId: string;
  sourcePath: string;
  destinationPath?: string;
  priority?: number;
}

/**
 * Upload Service: manages the upload queue and provider lifecycle.
 * Providers are registered externally; no providers are built-in.
 */
export class UploadService extends EventEmitter<UploadServiceEvents> {
  private readonly repo: UploadQueueRepo;
  private readonly notifications: NotificationService;
  private readonly logger: Logger;
  private readonly providers = new Map<string, UploadProvider>();
  /** Minimum gap between progress writes to SQLite per item. */
  private static readonly PROGRESS_WRITE_THROTTLE_MS = 700;
  /** Active uploads keyed by upload id. */
  private readonly active = new Map<string, AbortController>();
  /** Items whose runItem() has been kicked off but not yet registered as active. */
  private readonly startingIds = new Set<string>();
  /** ponytail: next retry timestamps — items wait here between attempts. */
  private readonly retryAt = new Map<string, number>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private readonly limits: () => { maxConcurrentUploads: number };
  private readonly retryBaseDelayMs: number;

  private maxConcurrent(): number {
    return Math.max(1, this.limits().maxConcurrentUploads);
  }

  constructor(options: UploadServiceOptions) {
    super();
    this.repo = options.repo;
    this.notifications = options.notifications;
    this.logger = options.logger;
    this.limits = options.getLimits ?? (() => ({ maxConcurrentUploads: options.maxConcurrentUploads ?? 1 }));
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 5_000;
  }

  /**
   * ponytail: user changed the concurrency limit (or toggled Low-Resource
   * Mode) — re-evaluate the queue so waiting items can start right away.
   */
  notifyLimitsChanged(): void {
    this.kick();
  }

  registerProvider(provider: UploadProvider): void {
    this.providers.set(provider.id, provider);
    this.logger.info({ providerId: provider.id, name: provider.name }, 'upload provider registered');
  }

  unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
  }

  getProviders(): { id: string; name: string }[] {
    return Array.from(this.providers.values()).map((p) => ({ id: p.id, name: p.name }));
  }

  addUpload(options: UploadAddOptions): UploadQueueRecord {
    const now = new Date().toISOString();
    const record: UploadQueueRecord = {
      id: randomUUID(),
      recordingId: options.recordingId ?? null,
      providerId: options.providerId,
      sourcePath: options.sourcePath,
      destinationPath: options.destinationPath ?? null,
      status: 'queued',
      priority: options.priority ?? 0,
      bytesUploaded: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
      percent: 0,
      retries: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    };

    this.repo.create(record);
    this.emit('upload-queued', { uploadId: record.id, timestamp: now });
    this.notifications.send({
      level: 'info',
      title: 'Upload queued',
      message: `Upload to ${options.providerId} added to queue`,
      data: { uploadId: record.id },
    });

    this.kick();
    return record;
  }

  listUploads(status?: string): UploadQueueRecord[] {
    return this.repo.list(status);
  }

  getUpload(id: string): UploadQueueRecord | undefined {
    return this.repo.get(id);
  }

  removeUpload(id: string): void {
    // ponytail: removing an in-flight transfer must also tear the transfer
    // down, otherwise the slot stays blocked until the server times out.
    this.active.get(id)?.abort();
    this.retryAt.delete(id);
    this.repo.remove(id);
    this.emit('upload-removed', { uploadId: id, timestamp: new Date().toISOString() });
  }

  pauseUpload(id: string): void {
    const item = this.repo.get(id);
    if (item === undefined) return;
    // ponytail: queued items are pauseable too — previously only in-flight
    // transfers could be paused and clicking Pause on a queued row was a
    // silent no-op.
    if (item.status === 'uploading' || item.status === 'queued') {
      this.retryAt.delete(id);
      this.repo.update(id, { status: 'paused' });
      this.active.get(id)?.abort();
      this.emit('upload-paused', { uploadId: id, timestamp: new Date().toISOString() });
    }
  }

  resumeUpload(id: string): void {
    const item = this.repo.get(id);
    if (item && item.status === 'paused') {
      this.repo.update(id, { status: 'queued' });
      this.emit('upload-resumed', { uploadId: id, timestamp: new Date().toISOString() });
      this.kick();
    }
  }

  cancelUpload(id: string): void {
    const item = this.repo.get(id);
    if (item === undefined) return;
    if (item.status === 'uploading') {
      this.repo.update(id, { status: 'cancelled', finishedAt: new Date().toISOString() });
      this.active.get(id)?.abort();
      this.emit('upload-cancelled', { uploadId: id, timestamp: new Date().toISOString() });
    } else if (item.status !== 'completed' && item.status !== 'cancelled') {
      this.repo.update(id, { status: 'cancelled', finishedAt: new Date().toISOString() });
      this.emit('upload-cancelled', { uploadId: id, timestamp: new Date().toISOString() });
    }
  }

  retryUpload(id: string): void {
    const item = this.repo.get(id);
    if (item && (item.status === 'failed' || item.status === 'cancelled')) {
      this.retryAt.delete(id);
      this.repo.update(id, { status: 'queued', retries: 0, error: null });
      this.kick();
    }
  }

  // --- Worker -------------------------------------------------------------

  /**
   * Start the upload worker. Items left 'uploading' by a previous session
   * (their transfer died with the process) go back to the queue.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    const stale = this.repo.list('uploading');
    for (const item of stale) {
      this.repo.update(item.id, { status: 'queued' });
      this.logger.info({ uploadId: item.id }, 'recovered stale uploading item');
    }
    this.retryAt.clear();
    this.logger.info('upload worker started');
    this.kick();
  }

  /** Stop the worker and abort any active uploads. */
  stop(): void {
    this.started = false;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    for (const [id, controller] of this.active) {
      try {
        controller.abort();
      } catch (error) {
        this.logger.warn({ uploadId: id, error }, 'failed to abort upload on shutdown');
      }
    }
    this.logger.info('upload worker stopped');
  }

  private kick(): void {
    if (!this.started) return;
    let guard = 0;
    while (this.active.size + this.startingIds.size < this.maxConcurrent() && guard < 20) {
      guard += 1;
      const next = this.nextQueued();
      if (next === undefined) break;
      this.startingIds.add(next.id);
      void this.runItem(next).finally(() => {
        this.startingIds.delete(next.id);
        // A slot freed up — pull more queued work if any.
        this.kick();
      });
    }
    this.scheduleRetrySweep();
  }

  /** Earliest retry deadline across queued items, or undefined. */
  private nextRetryAt(): number | undefined {
    let earliest: number | undefined;
    for (const at of this.retryAt.values()) {
      if (earliest === undefined || at < earliest) earliest = at;
    }
    return earliest;
  }

  /** Wake the queue when the next delayed retry comes due. */
  private scheduleRetrySweep(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const nextAt = this.nextRetryAt();
    if (nextAt === undefined) return;
    const delay = Math.max(250, nextAt - Date.now());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.kick();
    }, delay);
  }

  private nextQueued(): UploadQueueRecord | undefined {
    const now = Date.now();
    const queued = this.repo
      .list('queued')
      .filter(
        (item) =>
          !this.active.has(item.id) &&
          !this.startingIds.has(item.id) &&
          (this.retryAt.get(item.id) ?? 0) <= now,
      );
    queued.sort(
      (a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt),
    );
    return queued[0];
  }

  private async runItem(item: UploadQueueRecord): Promise<void> {
    this.retryAt.delete(item.id);
    const provider = this.providers.get(item.providerId);
    if (provider === undefined) {
      const message = `Upload provider "${item.providerId}" is not registered`;
      this.repo.update(item.id, { status: 'failed', error: message, finishedAt: new Date().toISOString() });
      this.emit('upload-failed', { uploadId: item.id, error: message, timestamp: new Date().toISOString() });
      this.notifications.send({ level: 'error', title: 'Upload failed', message, data: { uploadId: item.id } });
      return;
    }

    const now = new Date().toISOString();
    this.repo.update(item.id, { status: 'uploading', startedAt: item.startedAt ?? now, error: null });
    this.emit('upload-started', { uploadId: item.id, timestamp: now });

    const controller = new AbortController();
    this.active.set(item.id, controller);

    try {
      const totalBytes = (await stat(item.sourcePath)).size;
      this.repo.update(item.id, { totalBytes });
      const fileName = item.destinationPath ?? basename(item.sourcePath);

      let lastWrite = 0;
      const result = await provider.upload(item.sourcePath, fileName, (percent, speed) => {
        const bytesUploaded = Math.round((percent / 100) * totalBytes);
        const eta = speed > 0 && percent < 100 ? (totalBytes - bytesUploaded) / speed : 0;
        const ts = new Date().toISOString();
        this.emit('upload-progress', {
          uploadId: item.id,
          percent: Math.min(100, Math.round(percent * 10) / 10),
          speed: Math.round(speed),
          eta: Math.round(eta),
          timestamp: ts,
        });
        const nowMs = Date.now();
        if (nowMs - lastWrite >= UploadService.PROGRESS_WRITE_THROTTLE_MS || percent >= 100) {
          lastWrite = nowMs;
          this.repo.update(item.id, {
            percent: Math.min(100, Math.round(percent * 10) / 10),
            speed: Math.round(speed),
            eta: Math.round(eta),
            bytesUploaded,
          });
        }
      }, controller.signal);

      this.repo.update(item.id, {
        status: 'completed',
        percent: 100,
        speed: 0,
        eta: 0,
        bytesUploaded: totalBytes,
        destinationPath: result.link ?? item.destinationPath ?? null,
        checksum: result.checksum,
        finishedAt: new Date().toISOString(),
      });
      this.emit('upload-completed', { uploadId: item.id, timestamp: new Date().toISOString() });
      this.notifications.send({
        level: 'info',
        title: 'Upload completed',
        message: `"${fileName}" uploaded to ${item.providerId}`,
        data: { uploadId: item.id, link: result.link },
      });
    } catch (error) {
      this.handleRunError(item, error);
    } finally {
      this.active.delete(item.id);
    }
  }

  private handleRunError(item: UploadQueueRecord, error: unknown): void {
    // ponytail: pause/cancel already wrote the terminal status before
    // aborting the transfer — only backfill if the row is untouched.
    const fresh = this.repo.get(item.id);
    if (fresh === undefined || fresh.status !== 'uploading') {
      return; // removed or user-stopped meanwhile — do not resurrect
    }

    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn({ uploadId: item.id, error: message }, 'upload attempt failed');

    const retries = fresh.retries + 1;
    if (retries <= fresh.maxRetries) {
      // ponytail: exponential backoff — the old instant retry loop slammed
      // the host 3 times in a row (ECONNRESET spam) instead of giving the
      // server/network a moment to recover.
      const delayMs = Math.min(60_000, this.retryBaseDelayMs * 2 ** (retries - 1));
      this.retryAt.set(item.id, Date.now() + delayMs);
      this.repo.update(item.id, { status: 'queued', retries, error: message });
      this.logger.info({ uploadId: item.id, retries, retryInMs: delayMs }, 'upload requeued for retry');
      this.scheduleRetrySweep();
      return;
    }

    this.retryAt.delete(item.id);
    this.repo.update(item.id, { status: 'failed', error: message, finishedAt: new Date().toISOString() });
    this.emit('upload-failed', { uploadId: item.id, error: message, timestamp: new Date().toISOString() });
    this.notifications.send({
      level: 'error',
      title: 'Upload failed',
      message: `${item.sourcePath} could not be uploaded: ${message}`,
      data: { uploadId: item.id },
    });
  }

  /** Provider list enriched with live auth/health state for the UI. */
  async getProviderStatus(): Promise<
    { id: string; name: string; authenticated: boolean; healthy: boolean }[]
  > {
    const results: { id: string; name: string; authenticated: boolean; healthy: boolean }[] = [];
    for (const provider of this.providers.values()) {
      let authenticated = false;
      let healthy = false;
      try {
        authenticated = await provider.authenticate();
      } catch (error) {
        this.logger.warn({ providerId: provider.id, error }, 'provider authenticate check failed');
      }
      try {
        healthy = await provider.healthCheck();
      } catch (error) {
        this.logger.warn({ providerId: provider.id, error }, 'provider health check failed');
      }
      results.push({ id: provider.id, name: provider.name, authenticated, healthy });
    }
    return results;
  }

  async testProvider(providerId: string): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) return false;
    try {
      const authenticated = await provider.authenticate();
      const healthy = await provider.healthCheck();
      return authenticated && healthy;
    } catch (error) {
      this.logger.warn({ providerId }, 'provider test failed');
      return false;
    }
  }

  clearCompleted(): void {
    this.repo.clearCompleted();
  }

  clearFailed(): void {
    this.repo.clearFailed();
  }

  countByStatus(): Record<string, number> {
    return this.repo.countByStatus();
  }
}
