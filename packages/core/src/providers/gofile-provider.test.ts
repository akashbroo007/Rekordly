import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Logger } from '@rekordly/shared';
import type { UploadQueueRecord, UploadQueueRepo } from '@rekordly/database';
import { GofileProvider } from './gofile-provider';
import { UploadService } from '../services/upload-service';
import type { NotificationService } from '../services/notification-service';

class InMemoryUploadRepo implements UploadQueueRepo {
  private readonly rows = new Map<string, UploadQueueRecord>();

  create(record: UploadQueueRecord): void {
    this.rows.set(record.id, { ...record });
  }

  update(id: string, patch: Partial<UploadQueueRecord>): void {
    const row = this.rows.get(id);
    if (row !== undefined) {
      this.rows.set(id, { ...row, ...patch, updatedAt: new Date().toISOString() });
    }
  }

  get(id: string): UploadQueueRecord | undefined {
    return this.rows.get(id);
  }

  list(status?: string): UploadQueueRecord[] {
    const all = [...this.rows.values()];
    return status === undefined ? all : all.filter((r) => r.status === status);
  }

  remove(id: string): void {
    this.rows.delete(id);
  }

  clearCompleted(): void {
    for (const [id, row] of this.rows) if (row.status === 'completed') this.rows.delete(id);
  }

  clearFailed(): void {
    for (const [id, row] of this.rows) if (row.status === 'failed') this.rows.delete(id);
  }

  countByStatus(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const row of this.rows.values()) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }

  bulkRemove(ids: string[]): void {
    for (const id of ids) this.rows.delete(id);
  }

  bulkRetry(ids: string[]): void {
    for (const id of ids) this.update(id, { status: 'queued', retries: 0, error: null });
  }
}

const notifications = {
  send: (): void => undefined,
} as unknown as NotificationService;

const logger = {
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
  debug: (): void => undefined,
  fatal: (): void => undefined,
  trace: (): void => undefined,
  child: (): unknown => undefined,
} as unknown as Logger;

let server: Server;
let serversPort = 0;
let uploadPort = 0;
let receivedBody = '';
let respondOk = true;

beforeAll(async () => {
  // ponytail: one HTTP server stubs both the "servers" endpoint and the
  // "uploadfile" endpoint so the provider is exercised over real sockets.
  server = createServer((req, res) => {
    if (req.url === '/servers') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', data: { servers: [{ name: 'stub1', zone: 'test' }] } }));
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.length > 4096 ? '' : chunk.toString('latin1');
    });
    req.on('end', () => {
      receivedBody = body;
      res.setHeader('content-type', 'application/json');
      if (respondOk) {
        res.end(JSON.stringify({ status: 'ok', data: { downloadPage: 'https://gofile.io/d/abc123', fileId: 'file-1' } }));
      } else {
        res.end(JSON.stringify({ status: 'error', error: 'boom' }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  serversPort = uploadPort = address.port;
});

afterAll(() => {
  server?.close();
});

function makeProvider(): GofileProvider {
  return new GofileProvider({
    logger,
    serversUrl: `http://127.0.0.1:${serversPort}/servers`,
    uploadUrlTemplate: `http://127.0.0.1:${uploadPort}/contents/uploadfile`,
  });
}

function makeRecord(id: string, sourcePath: string): UploadQueueRecord {
  const now = new Date().toISOString();
  return {
    id,
    recordingId: null,
    providerId: 'gofile',
    sourcePath,
    destinationPath: null,
    status: 'queued',
    priority: 0,
    bytesUploaded: 0,
    totalBytes: 0,
    speed: 0,
    eta: 0,
    percent: 0,
    retries: 0,
    maxRetries: 0,
    error: null,
    checksum: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('GofileProvider', () => {
  it('picks a server and streams a multipart upload, returning the link', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rekordly-upload-'));
    const filePath = join(dir, 'clip.mp4');
    writeFileSync(filePath, Buffer.alloc(2048, 7));
    const provider = makeProvider();

    expect(await provider.authenticate()).toBe(true);
    expect(await provider.healthCheck()).toBe(true);

    const progress: number[] = [];
    const result = await provider.upload(filePath, 'clip.mp4', (percent) => {
      progress.push(percent);
    }, new AbortController().signal);

    expect(result.checksum).toBe('file-1');
    expect(result.link).toBe('https://gofile.io/d/abc123');
    expect(progress[progress.length - 1]).toBe(100);
    expect(receivedBody).toContain('filename="clip.mp4"');
    expect(receivedBody).toContain('Content-Type: application/octet-stream');
  });

  it('throws a descriptive error when the API reports failure', async () => {
    respondOk = false;
    const dir = mkdtempSync(join(tmpdir(), 'rekordly-upload-'));
    const filePath = join(dir, 'clip.mp4');
    writeFileSync(filePath, 'x');
    try {
      await expect(
        makeProvider().upload(filePath, 'clip.mp4', () => undefined, new AbortController().signal),
      ).rejects.toThrow(/Gofile upload failed/);
    } finally {
      respondOk = true;
    }
  });
});

describe('UploadService worker', () => {
  it('processes a queued item through uploading to completed with a persisted link', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rekordly-worker-'));
    const filePath = join(dir, 'video.mp4');
    writeFileSync(filePath, Buffer.alloc(1024, 1));

    const repo = new InMemoryUploadRepo();
    repo.create(makeRecord('u1', filePath));

    const service = new UploadService({ repo, notifications, logger });
    service.registerProvider(makeProvider());
    service.start();

    await viWaitFor(() => repo.get('u1')?.status === 'completed');
    service.stop();

    const row = repo.get('u1');
    expect(row?.status).toBe('completed');
    expect(row?.destinationPath).toBe('https://gofile.io/d/abc123');
    expect(row?.checksum).toBe('file-1');
    expect(row?.percent).toBe(100);
  });

  it('retries transient failures up to maxRetries then marks the item failed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rekordly-worker-'));
    const filePath = join(dir, 'video.mp4');
    writeFileSync(filePath, 'data');

    const repo = new InMemoryUploadRepo();
    const record = makeRecord('u2', filePath);
    record.providerId = 'flaky';
    record.maxRetries = 1;
    repo.create(record);

    const service = new UploadService({ repo, notifications, logger, retryBaseDelayMs: 25 });
    service.registerProvider({
      id: 'flaky',
      name: 'Flaky',
      authenticate: async () => true,
      healthCheck: async () => true,
      upload: async () => {
        throw new Error('transient network hiccup');
      },
      pause: () => undefined,
      resume: () => undefined,
      cancel: () => undefined,
      delete: async () => undefined,
      verify: async () => true,
    });

    service.start();
    await viWaitFor(() => repo.get('u2')?.status === 'failed', 10000);
    service.stop();

    const row = repo.get('u2');
    expect(row?.status).toBe('failed');
    expect(row?.retries).toBe(1);
    expect(row?.error).toContain('transient network hiccup');
  });

  it('pauses a queued item so the worker never starts it', async () => {
    const repo = new InMemoryUploadRepo();
    const record = makeRecord('u3', 'C:\\nonexistent\\video.mp4');
    repo.create(record);

    let calls = 0;
    const service = new UploadService({ repo, notifications, logger });
    service.registerProvider({
      id: 'gofile',
      name: 'Gofile',
      authenticate: async () => true,
      healthCheck: async () => true,
      upload: async () => {
        calls += 1;
        throw new Error('should not run');
      },
      pause: () => undefined,
      resume: () => undefined,
      cancel: () => undefined,
      delete: async () => undefined,
      verify: async () => true,
    });

    service.start();
    service.pauseUpload('u3');
    const row = repo.get('u3');
    expect(row?.status).toBe('paused');
    await new Promise((r) => setTimeout(r, 150));
    expect(calls).toBe(0);
    service.stop();
  });

  it('removes an in-flight upload and frees the slot for the next item', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rekordly-worker-'));
    const filePath = join(dir, 'video.mp4');
    writeFileSync(filePath, Buffer.alloc(1024, 1));

    const repo = new InMemoryUploadRepo();
    repo.create(makeRecord('u4', filePath));
    repo.create(makeRecord('u5', filePath));

    let uploads = 0;
    let gate: ((ok: boolean) => void) | null = null;
    const firstUploadStarted = new Promise<void>((resolve) => {
      gate = (ok) => {
        if (ok) resolve();
      };
    });

    const service = new UploadService({ repo, notifications, logger });
    service.registerProvider({
      id: 'gofile',
      name: 'Gofile',
      authenticate: async () => true,
      healthCheck: async () => true,
      upload: async (_source, _dest, _progress, signal) => {
        uploads += 1;
        if (uploads > 1) return { checksum: 'c', link: 'l' };
        gate?.(true);
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve());
        });
        return { checksum: 'c', link: 'l' };
      },
      pause: () => undefined,
      resume: () => undefined,
      cancel: () => undefined,
      delete: async () => undefined,
      verify: async () => true,
    });
    service.start();

    await firstUploadStarted;
    expect(uploads).toBe(1);

    service.removeUpload('u4');
    expect(repo.get('u4')).toBeUndefined();
    await viWaitFor(() => repo.get('u5')?.status === 'completed');
    expect(uploads).toBe(2);
    service.stop();
  });
});

function viWaitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      if (condition()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('viWaitFor timed out'));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}