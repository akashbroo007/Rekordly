import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { type ClientRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { PassThrough } from 'node:stream';
import type { Logger } from '@rekordly/shared';
import type { UploadProvider } from '../services/upload-service';

export interface MixDropProviderOptions {
  logger: Logger;
  getEmail?: () => string | undefined;
  getKey?: () => string | undefined;
  apiUrl?: string;
}

const DEFAULT_API_URL = 'https://ul.mixdrop.ag/api';
const HEALTH_URL = 'https://mixdrop.ag/';

interface MixDropUploadResponse {
  success: boolean;
  result?: {
    fileref?: string;
    url?: string;
    embedurl?: string;
  };
}

export class MixDropProvider implements UploadProvider {
  readonly id = 'mixdrop';
  readonly name = 'MixDrop';

  private readonly logger: Logger;
  private readonly getEmail?: () => string | undefined;
  private readonly getKey?: () => string | undefined;
  private readonly apiUrl: string;

  private currentStream: ReturnType<typeof createReadStream> | null = null;
  private currentRequest: ClientRequest | null = null;

  constructor(options: MixDropProviderOptions) {
    this.logger = options.logger;
    this.getEmail = options.getEmail;
    this.getKey = options.getKey;
    this.apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  }

  async authenticate(): Promise<boolean> {
    const email = this.getEmail?.();
    const key = this.getKey?.();
    return email !== undefined && email.length > 0 && key !== undefined && key.length > 0;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10_000) });
      return true;
    } catch {
      return false;
    }
  }

  async upload(
    sourcePath: string,
    destinationPath: string,
    onProgress: (percent: number, speed: number) => void,
    signal: AbortSignal,
  ): Promise<{ checksum: string; link?: string }> {
    const totalBytes = (await stat(sourcePath)).size;
    const boundary = `mixdrop-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

    const response = await this.postMultipart(
      this.apiUrl,
      boundary,
      sourcePath,
      totalBytes,
      onProgress,
      signal,
    );

    let parsed: MixDropUploadResponse | null = null;
    try {
      parsed = JSON.parse(response) as MixDropUploadResponse;
    } catch {
      parsed = null;
    }

    if (parsed === null || !parsed.success || !parsed.result?.url) {
      const detail = response.slice(0, 300);
      throw new Error(`MixDrop upload failed: ${detail || 'empty response'}`);
    }

    this.logger.info(
      { fileref: parsed.result.fileref, link: parsed.result.url },
      'mixdrop upload completed',
    );

    return {
      checksum: parsed.result.fileref ?? '',
      link: parsed.result.url,
    };
  }

  pause(): void {
    this.currentStream?.pause();
  }

  resume(): void {
    this.currentStream?.resume();
  }

  cancel(): void {
    this.currentRequest?.destroy(new Error('cancelled'));
  }

  async delete(): Promise<void> {
    /* no-op — MixDrop API has no delete endpoint */
  }

  async verify(): Promise<boolean> {
    return true;
  }

  private postMultipart(
    url: string,
    boundary: string,
    filePath: string,
    totalBytes: number,
    onProgress: (percent: number, speed: number) => void,
    signal: AbortSignal,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const email = this.getEmail?.();
      const key = this.getKey?.();

      if (!email || !key) {
        reject(new Error('MixDrop API credentials not configured'));
        return;
      }

      const body = new PassThrough();
      const stream = createReadStream(filePath);
      this.currentStream = stream;

      let settled = false;
      let requestFinished = false;
      let responseData: string | null = null;

      const tryResolve = (): void => {
        if (settled) return;
        if (requestFinished && responseData !== null) {
          settled = true;
          resolve(responseData);
        }
      };

      const fail = (err: Error): void => {
        if (settled) return;
        settled = true;
        stream.unpipe(body);
        stream.destroy();
        body.destroy();
        request.destroy();
        reject(err);
      };

      const parsedUrl = new URL(url);
      const request = httpsRequest(
        {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            responseData = Buffer.concat(chunks).toString('utf8');
            tryResolve();
          });
          response.on('error', fail);
        },
      );

      this.currentRequest = request;

      request.on('error', fail);
      request.on('finish', () => {
        requestFinished = true;
        tryResolve();
      });

      const abort = (): void => {
        fail(new Error('aborted'));
      };
      signal.addEventListener('abort', abort, { once: true });
      request.on('close', () => signal.removeEventListener('abort', abort));

      const startedAt = Date.now();
      let bytesSent = 0;

      let lastReport = 0;
      const report = (): void => {
        const now = Date.now();
        if (now - lastReport < 300 && bytesSent < totalBytes) return;
        lastReport = now;
        const elapsed = (now - startedAt) / 1000;
        const speed = elapsed > 0 ? bytesSent / elapsed : 0;
        const percent = totalBytes > 0 ? Math.min(100, (bytesSent / totalBytes) * 100) : 0;
        onProgress(percent, speed);
      };

      stream.on('error', fail);
      body.on('error', fail);
      body.pipe(request);

      const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? 'upload';
      const preamble =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="email"\r\n\r\n` +
        `${email}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="key"\r\n\r\n` +
        `${key}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${fileName.replace(/["\r\n]/g, '')}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`;

      if (!settled) body.write(preamble);
      stream.on('data', (chunk) => {
        bytesSent += chunk.length;
        report();
      });
      stream.pipe(body, { end: false });
      stream.on('end', () => {
        if (settled) return;
        const epilogue = `\r\n--${boundary}--\r\n`;
        body.end(epilogue, () => {
          report();
          onProgress(100, 0);
        });
      });
    });
  }
}
