import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { type ClientRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { PassThrough } from 'node:stream';
import type { Logger } from '@rekordly/shared';
import type { UploadProvider } from '../services/upload-service';

export interface GoogleDriveProviderOptions {
  logger: Logger;
  getClientId?: () => string | undefined;
  getClientSecret?: () => string | undefined;
  getRefreshToken?: () => string | undefined;
  setRefreshToken?: (token: string) => void;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
}

interface DriveFileResponse {
  id?: string;
  name?: string;
  webViewLink?: string;
  webContentLink?: string;
  error?: { code: number; message: string };
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_UPLOAD_URL =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink';

export class GoogleDriveProvider implements UploadProvider {
  readonly id = 'google-drive';
  readonly name = 'Google Drive';

  private readonly logger: Logger;
  private readonly getClientId?: () => string | undefined;
  private readonly getClientSecret?: () => string | undefined;
  private readonly getRefreshToken?: () => string | undefined;
  private readonly setRefreshToken?: (token: string) => void;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  private currentStream: ReturnType<typeof createReadStream> | null = null;
  private currentRequest: ClientRequest | null = null;

  constructor(options: GoogleDriveProviderOptions) {
    this.logger = options.logger;
    this.getClientId = options.getClientId;
    this.getClientSecret = options.getClientSecret;
    this.getRefreshToken = options.getRefreshToken;
    this.setRefreshToken = options.setRefreshToken;
  }

  async authenticate(): Promise<boolean> {
    const clientId = this.getClientId?.();
    const clientSecret = this.getClientSecret?.();
    const refreshToken = this.getRefreshToken?.();
    if (!clientId || !clientSecret || !refreshToken) return false;
    try {
      await this.ensureAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureAccessToken();
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
    await this.ensureAccessToken();

    const totalBytes = (await stat(sourcePath)).size;
    const fileName =
      destinationPath.length > 0
        ? destinationPath
        : sourcePath.replace(/\\/g, '/').split('/').pop() ?? 'upload';

    const boundary = `gdrive-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

    const response = await this.postMultipart(
      DRIVE_UPLOAD_URL,
      boundary,
      sourcePath,
      fileName,
      totalBytes,
      onProgress,
      signal,
    );

    let parsed: DriveFileResponse | null = null;
    try {
      parsed = JSON.parse(response) as DriveFileResponse;
    } catch {
      parsed = null;
    }

    if (parsed === null || !parsed.id) {
      const detail = parsed?.error?.message ?? response.slice(0, 300);
      throw new Error(`Google Drive upload failed: ${detail || 'empty response'}`);
    }

    // ponytail: the bare API path is not a browsable link — webViewLink comes
    // back via the fields param, and the drive.google.com viewer is the
    // fallback.
    const link =
      parsed.webViewLink ??
      parsed.webContentLink ??
      `https://drive.google.com/file/d/${parsed.id}/view`;

    this.logger.info({ fileId: parsed.id, link }, 'google drive upload completed');

    return {
      checksum: parsed.id,
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
    /* no-op — delete requires file ID, handled by the upload service */
  }

  async verify(): Promise<boolean> {
    return true;
  }

  private async ensureAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const clientId = this.getClientId?.();
    const clientSecret = this.getClientSecret?.();
    const refreshToken = this.getRefreshToken?.();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Google Drive credentials not configured');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await response.json()) as TokenResponse;

    if (!response.ok || !data.access_token) {
      throw new Error(`Google Drive token refresh failed: ${data.error ?? 'unknown error'}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000;

    if (data.refresh_token && this.setRefreshToken) {
      this.setRefreshToken(data.refresh_token);
    }

    return this.accessToken;
  }

  private postMultipart(
    url: string,
    boundary: string,
    filePath: string,
    fileName: string,
    totalBytes: number,
    onProgress: (percent: number, speed: number) => void,
    signal: AbortSignal,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const body = new PassThrough();
      const stream = createReadStream(filePath);
      this.currentStream = stream;

      // ponytail: metadata part + media part + epilogue — exact length keeps
      // the request off chunked encoding (more reliable across middleboxes).
      const metadata = JSON.stringify({ name: fileName });
      const preamble =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
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
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': String(contentLength),
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          },
          timeout: 120_000,
        },
        (response) => {
          if (response.statusCode !== undefined && (response.statusCode < 200 || response.statusCode > 299)) {
            fail(new Error(`Google Drive responded with HTTP ${response.statusCode}`));
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
