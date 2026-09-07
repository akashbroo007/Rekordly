/**
 * Minimal ambient types for pino-roll (CJS, no bundled declarations).
 * Only the options used by createLogger are covered.
 */
declare module 'pino-roll' {
  import type { DestinationStream } from 'pino';

  export interface PinoRollOptions {
    file: string;
    frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';
    dateFormat?: string;
    mkdir?: boolean;
    limit?: { count?: number; size?: string };
  }

  export default function pinoRoll(options: PinoRollOptions): Promise<DestinationStream>;
}
