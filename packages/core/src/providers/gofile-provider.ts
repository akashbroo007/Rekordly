import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { request as httpRequest, type ClientRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { PassThrough } from 'node:stream';
import type { Logger } from '@rekordly/shared';
import type { UploadProvider } from '../services/upload-service';

export interface GofileProviderOptions {
  logger: Logger;
  /**
   * Optional Gofile account token. Anonymous uploads work without one, but
   * token uploads are not subject to anonymous file retention cleanup.
   */
  getToken?: () => string | undefined;
  /** Override for the servers endpoint (tests point this at a local server). */
  serversUrl?: string;
  /**
   * Override for the upload endpoint. `{server}` is replaced with the picked
   * server name (tests point this at a local server).
   */
  uploadUrlTemplate?: string;
}

interface GofileServer {
  name: string;
  zone?: string;
}

interface GofileUploadResponse {
  status: string;
  data?: {
    downloadPage?: string;
    fileId?: string;
    [key: string]: unknown;
  };
}

const DEFAULT_SERVERS_URL = 'https://api.gofile.io/servers';
const DEFAULT_UPLOAD_URL_TEMPLATE = 'https://{server}.gofile.io/contents/uploadfile';

/**
 * Gofile upload provider (https://gofile.io).
 *
 * Flow: pick an upload server via GET /servers, then multipart-POST the file
 * to https://{server}.gofile.io/contents/uploadfile. The response carries the
 * public download page link, which the upload worker persists in the queue
 * record's destinationPath.
 *
 * The file is streamed (never buffered in memory) so multi-GB recordings can
 * be uploaded, and byte counts from the request stream drive real progress.
 */
export class GofileProvider implements UploadProvider {
  readonly id = 'gofile';
  readonly name = 'Gofile';

  private readonly logger: Logger;
  private readonly getToken?: () => string | undefined;
  private readonly serversUrl: string;
  private readonly uploadUrlTemplate: string;

  /** Active transfer handles for pause/resume/cancel (one upload at a time). */
  private currentStream: ReturnType<typeof createReadStream> | null = null;
  private currentRequest: ClientRequest | null = null;

  constructor(options: GofileProviderOptions) {
    this.logger = options.logger;
    this.getToken = options.getToken;
    this.serversUrl = options.serversUrl ?? DEFAULT_SERVERS_URL;
    this.uploadUrlTemplate = options.uploadUrlTemplate ?? DEFAULT_UPLOAD_URL_TEMPLATE;
  }

  async authenticate(): Promise<boolean> {
    const token = this.getToken?.();
    return token === undefined || token.length > 0;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pickServer();
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
    const server = await this.pickServer();
    const uploadUrl = this.uploadUrlTemplate.replace('{server}', server);
    const totalBytes = (await stat(sourcePath)).size;

    const boundary = `rekordly-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    const fileName =
      destinationPath.length > 0
        ? destinationPath
        : sourcePath.replace(/\\/g, '/').split('/').pop() ?? 'upload';
    const preamble =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName.replace(/["\r\n]/g, '')}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`;
    const epilogue = `\r\n--${boundary}--\r\n`;

    const response = await this.postMultipart(
      uploadUrl,
      boundary,
      preamble,
      epilogue,
      sourcePath,
      totalBytes,
      onProgress,
      signal,
    );

    let parsed: GofileUploadResponse | null = null;
    try {
      parsed = JSON.parse(response) as GofileUploadResponse;
    } catch {
      parsed = null;
    }

    if (parsed === null || parsed.status !== 'ok') {
      const detail = parsed !== null ? JSON.stringify(parsed).slice(0, 300) : response.slice(0, 300);
      throw new Error(`Gofile upload failed: ${detail || 'empty response'}`);
    }

    this.logger.info(
      { fileId: parsed.data?.fileId, link: parsed.data?.downloadPage },
      'gofile upload completed',
    );

    return {
      checksum: typeof parsed.data?.fileId === 'string' ? parsed.data.fileId : '',
      link: typeof parsed.data?.downloadPage === 'string' ? parsed.data.downloadPage : undefined,
    };
  }

  /** Pause the active transfer by suspending the file read stream. */
  pause(): void {
    this.currentStream?.pause();
  }

  resume(): void {
    this.currentStream?.resume();
  }

  /** Abort the active transfer; the pending request errors out immediately. */
  cancel(): void {
    this.currentRequest?.destroy(new Error('cancelled'));
  }

  /** Gofile exposes no delete API for anonymous uploads — nothing to do. */
  async delete(): Promise<void> {
    /* no-op for anonymous uploads */
  }

  async verify(): Promise<boolean> {
    return true;
  }

  // --- internals ---------------------------------------------------------

  private async pickServer(): Promise<string> {
    const response = await fetch(this.serversUrl, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Gofile servers request failed with HTTP ${response.status}`);
    }
    const body = (await response.json()) as { status?: string; data?: unknown };
    if (body.status !== 'ok' || body.data === undefined) {
      throw new Error('Gofile servers response was malformed');
    }
    const data = body.data as { servers?: GofileServer[]; server?: string };
    if (typeof data.server === 'string' && data.server.length > 0) {
      return data.server;
    }
    const first = data.servers?.[0];
    if (first === undefined || first.name.length === 0) {
      throw new Error('Gofile returned no upload servers');
    }
    return first.name;
  }

  private authHeaders(): Record<string, string> {
    const token = this.getToken?.();
    return token !== undefined && token.length > 0 ? { Authorization: `Bearer ${token}` } : {};
  }

  private postMultipart(
    url: string,
    boundary: string,
    preamble: string,
    epilogue: string,
    filePath: string,
    totalBytes: number,
    onProgress: (percent: number, speed: number) => void,
    signal: AbortSignal,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const requestFn = url.startsWith('http://') ? httpRequest : httpsRequest;

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

      const request = requestFn(
        url,
        {
          method: 'POST',
          headers: {
            ...this.authHeaders(),
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

      // ponytail: throttle progress pushes so the DB/UI pipeline is not
      // hammered for every chunk of a multi-GB stream.
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