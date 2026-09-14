/**
 * Minimal RFC 6455 WebSocket client over node:tls — the MFC chat servers
 * (fcserver) speak plain websocket text frames.
 *
 * Why hand-rolled: plugins ship without node_modules, so a `ws` dependency
 * would need a new electron-builder extraResources entry; the protocol surface
 * we need is tiny (text frames, ping/pong, close). Client frames are always
 * masked (RFC 6455 requirement — unmasked client frames are silently dropped
 * by the MFC lighttpd gateway), server frames are parsed with full 16/64-bit
 * length and fragmentation support.
 *
 * Optional HTTP-proxy support: when the host embedded proxy is in play, the
 * TCP connection is tunneled with CONNECT before the TLS handshake so the
 * chat session follows the same route as the site's HTTP requests.
 */
import * as tls from 'tls';
import * as net from 'net';
import crypto from 'crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export interface WsClientOptions {
  host: string;
  port: number;
  path: string;
  /** Sec-WebSocket-Protocol value, e.g. "fcsl" for LWS chat servers. */
  subprotocol?: string;
  origin: string;
  userAgent: string;
  /** Handshake timeout in ms (direct route; proxied handshakes get more). */
  timeoutMs?: number;
  /** HTTP proxy URL (http://host:port) to CONNECT-tunnel through, if any. */
  proxyUrl?: string | null;
  onText: (text: string) => void;
  onClose?: () => void;
  onError?: (err: Error) => void;
  logger?: (message: string) => void;
}

export class WsClient {
  private socket: tls.TLSSocket | null = null;
  private readonly opts: WsClientOptions;
  private buffer: Buffer = Buffer.alloc(0);
  /** Partial fragmented-message assembly (opcode 0 continuation). */
  private fragmented: Buffer | null = null;
  private closed = false;
  private errorFired = false;
  private expectedAccept = '';
  private handshakeDone = false;

  private constructor(opts: WsClientOptions) {
    this.opts = opts;
  }

  /**
   * Connect and complete the RFC 6455 handshake. Resolves once the server
   * answers 101; rejects on transport failure, non-101 answer or timeout.
   */
  static connect(options: WsClientOptions): Promise<WsClient> {
    const client = new WsClient(options);
    return client.handshake();
  }

  private handshake(): Promise<WsClient> {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      const { host, port, path, subprotocol, origin, userAgent, proxyUrl } = this.opts;
      this.expectedAccept = crypto
        .createHash('sha1')
        .update(key + WS_GUID)
        .digest('base64');
      let settled = false;
      const finish = (err: Error | null, socket?: tls.TLSSocket): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err !== null) {
          socket?.destroy();
          reject(err);
          return;
        }
        resolve(this);
      };
      const timer = setTimeout(() => {
        finish(new Error('WebSocket handshake timed out'));
      }, this.opts.timeoutMs ?? 12_000);

      const connectTls = (stream: net.Socket): void => {
        const tlsSocket = tls.connect(
          { socket: stream, servername: host, host, port },
          () => {
            const headers = [
              `GET ${path} HTTP/1.1`,
              `Host: ${host}`,
              'Upgrade: websocket',
              'Connection: Upgrade',
              `Sec-WebSocket-Key: ${key}`,
              'Sec-WebSocket-Version: 13',
              `Origin: ${origin}`,
              `User-Agent: ${userAgent}`,
              ...(subprotocol !== undefined ? [`Sec-WebSocket-Protocol: ${subprotocol}`] : []),
              '',
              '',
            ].join('\r\n');
            tlsSocket.write(headers);
          },
        );
        this.socket = tlsSocket;
        tlsSocket.on('data', (data: Buffer) => this.onData(data, finish));
        tlsSocket.on('error', (err: Error) => {
          if (!this.errorFired) {
            this.errorFired = true;
            this.opts.onError?.(err);
          }
          finish(err);
        });
        tlsSocket.on('close', () => {
          if (!this.closed) {
            this.closed = true;
            this.opts.onClose?.();
          }
          finish(new Error('connection closed during handshake'));
        });
      };

      if (proxyUrl) {
        // ponytail: CONNECT-tunnel through the host's embedded proxy first —
        // the TLS layer (and the websocket inside it) stays end-to-end.
        const proxy = new URL(proxyUrl);
        const proxyHost = proxy.hostname;
        const proxyPort = Number(proxy.port || 80);
        const req = net.connect(
          { host: proxyHost, port: proxyPort },
          () => {
            req.write(
              `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`,
            );
          },
        );
        req.setTimeout(20_000, () => {
          req.destroy();
          finish(new Error('Proxy CONNECT timed out'));
        });
        req.on('error', (err) => finish(err));
        let resp = '';
        req.on('data', (chunk: Buffer) => {
          resp += chunk.toString('latin1');
          if (!resp.includes('\r\n\r\n')) return;
          req.removeAllListeners('data');
          if (!/^HTTP\/1\.[01] 200/.test(resp)) {
            finish(new Error(`Proxy CONNECT failed (${resp.split('\r\n')[0] ?? 'unknown'})`));
            return;
          }
          connectTls(req);
        });
      } else {
        connectTls(net.connect({ host, port }));
      }
    });
  }

  private onData(data: Buffer, finish: (err: Error | null) => void): void {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, data]);
    if (!this.handshakeDone) {
      // ponytail: before the 101 is seen, the buffer holds the HTTP upgrade
      // response; once it is, everything after the header terminator is
      // frames — later chunks must go straight to the frame decoder.
      const idx = this.buffer.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const head = this.buffer.slice(0, idx).toString('latin1');
      this.buffer = this.buffer.slice(idx + 4);
      if (!/^HTTP\/1\.1 101/i.test(head)) {
        finish(new Error(`WebSocket handshake rejected (${head.split('\r\n')[0] ?? 'unknown'})`));
        this.destroy();
        return;
      }
      const accept = /sec-websocket-accept:\s*(\S+)/i.exec(head)?.[1];
      if (accept === undefined || accept !== this.expectedAccept) {
        finish(new Error('WebSocket handshake accept mismatch'));
        this.destroy();
        return;
      }
      this.handshakeDone = true;
      finish(null);
    }
    if (this.buffer.length > 0) this.decode();
  }

  /** Send one text frame (masked, per RFC 6455 client requirement). */
  send(text: string): void {
    const socket = this.socket;
    if (socket === null || this.closed) return;
    const payload = Buffer.from(text, 'utf8');
    const mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) {
      masked[i] = masked[i]! ^ mask[i & 3]!;
    }
    let header: Buffer;
    const len = payload.length;
    if (len < 126) {
      header = Buffer.from([0x81, 0x80 | len]);
    } else if (len < 65_536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    socket.write(Buffer.concat([header, mask, masked]));
  }

  /** Reply to a server ping with a masked pong carrying the same payload. */
  private pong(payload: Buffer): void {
    const socket = this.socket;
    if (socket === null || this.closed) return;
    const mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) {
      masked[i] = masked[i]! ^ mask[i & 3]!;
    }
    const header = Buffer.from([0x8a, 0x80 | Math.min(payload.length, 125)]);
    socket.write(Buffer.concat([header, mask, masked]));
  }

  private decode(): void {
    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0]!;
      const b1 = this.buffer[1]!;
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buffer.length < 4) return;
        len = this.buffer.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buffer.length < 10) return;
        len = Number(this.buffer.readBigUInt64BE(2));
        off = 10;
      }
      if (this.buffer.length < off + len) return;
      const payload = this.buffer.slice(off, off + len);
      this.buffer = this.buffer.slice(off + len);
      if (opcode === 0x9) {
        this.pong(payload);
        continue;
      }
      if (opcode === 0xa) continue; // pong
      if (opcode === 0x8) {
        this.destroy();
        return;
      }
      if (opcode === 0x1 || opcode === 0x2) {
        this.fragmented = payload;
      } else if (opcode === 0x0 && this.fragmented !== null) {
        this.fragmented = Buffer.concat([this.fragmented, payload]);
      } else {
        continue;
      }
      if (fin) {
        const message = this.fragmented;
        this.fragmented = null;
        if (message !== null) {
          try {
            this.opts.onText(message.toString('utf8'));
          } catch (err) {
            this.opts.logger?.(`myfreecams: frame handler error: ${err instanceof Error ? err.message : err}`);
          }
        }
      }
    }
  }

  destroy(): void {
    if (!this.closed) {
      this.closed = true;
      this.opts.onClose?.();
    }
    this.socket?.destroy();
    this.socket = null;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
