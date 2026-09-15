/**
 * ponytail: minimal ambient typing for `ws`. The recorder host does not ship
 * @types/ws, and pulling a types devDependency into every contributor install
 * just for one WebSocket class is not worth it — the plugin only uses the
 * constructor, the event surface below, and `close()`.
 */
declare module 'ws' {
  import type { IncomingMessage } from 'node:http';

  export interface WebSocketClientOptions {
    headers?: Record<string, string>;
    handshakeTimeout?: number;
  }

  export class WebSocket {
    constructor(url: string, options?: WebSocketClientOptions);
    readonly readyState: number;
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: 'open', listener: () => void): this;
    on(event: 'message', listener: (data: Buffer, isBinary: boolean) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
}
