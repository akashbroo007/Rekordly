import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { type ClientRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { PassThrough } from 'node:stream';
import type { Logger } from '@rekordly/shared';
import type { UploadProvider } from '../services/upload-service';

export interface CatboxProviderOptions {
  logger: Logger;
  getUserhash?: () => string | undefined;
  apiUrl?: string;
}

const DEFAULT_API_URL = 'https://catbox.moe/user/api.php';

export class CatboxProvider implements UploadProvider {
  readonly id = 'catbox';
  readonly name = 'Catbox.moe';

  private readonly logger: Logger;
  private readonly apiUrl: string;

  private currentStream: ReturnType<typeof createReadStream> | null = null;
  private currentRequest: ClientRequest | null = null;

  constructor(options: CatboxProviderOptions) {
    this.logger = options.logger;
    this.apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  }

  async authenticate(): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await fetch('https://catbox.moe/', {
        signal: AbortSignal.timeout(10_000),
      });
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
    const boundary = `catbox-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

    const link = await this.postMultipart(
      this.apiUrl,
      boundary,
      sourcePath,
      totalBytes,
      onProgress,
      signal,
    );

    this.logger.info({ link }, 'catbox upload completed');

    return {
      checksum: link,
      link,
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
    /* no-op — anonymous uploads have no delete API */
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
      const body = new PassThrough();
      const stream = createReadStream(filePath);
      this.currentStream = stream;

      // catbox.moe sits behind Cloudflare, which hangs up on requests with
      // no User-Agent or with chunked transfer encoding — send both a UA and
      // an exact Content-Length so the upload survives.
      const fileName =
        filePath.replace(/\\/g, '/').split('/').pop()?.replace(/["\r\n]/g, '_') ?? 'upload';
      const preamble =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="reqtype"\r\n\r\n` +
        `fileupload\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="fileToUpload"; filename="${fileName}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`;
      const epilogue = `\r\n--${boundary}--\r\n`;
      const contentLength = Buffer.byteLength(preamble) + totalBytes + Buffer.byteLength(epilogue);

      let settled = false;
      let requestFinished = false;
      let responseData: string | null = null;

      const tryResolve = (): void => {
        if (settled) return;
        if (requestFinished && responseData !== null) {
          settled = true;
          resolve(responseData.trim());
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
            'Content-Length': String(contentLength),
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept: '*/*',
          },
          timeout: 120_000,
        },
        (response) => {
          if (response.statusCode !== undefined && (response.statusCode < 200 || response.statusCode > 299)) {
            fail(new Error(`catbox responded with HTTP ${response.statusCode}`));
            response.resume();
            return;
          }
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
      request.on('timeout', () => fail(new Error('connection timed out')));
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

      if (!settled) body.write(preamble);
      stream.on('data', (chunk) => {
        bytesSent += chunk.length;
        report();
      });
      stream.pipe(body, { end: false });
      stream.on('end', () => {
        if (settled) return;
        body.end(epilogue, () => {
          report();
          onProgress(100, 0);
        });
      });
    });
  }
}
