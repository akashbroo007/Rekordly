import pino, { type DestinationStream, type Logger, type LoggerOptions, type Level } from 'pino';
import pinoRoll from 'pino-roll';
import { join } from 'node:path';

export type { Logger, LoggerOptions };

export interface CreateLoggerOptions {
  level?: LoggerOptions['level'];
  destination?: DestinationStream;
  /** Also print to stdout (console). Useful during development. */
  console?: boolean;
  /**
   * Writes to a rotating log file in `dir` (daily rotation, `retentionDays`
   * kept, default 7). Takes precedence over `destination`.
   */
  rotatingFile?: {
    dir: string;
    fileName?: string;
    retentionDays?: number;
  };
}

/**
 * Centralized pino logger factory for main-process code.
 * The renderer sends entries through IPC (see apps/desktop preload) instead.
 * Async: pino-roll's destination is created asynchronously.
 */
export async function createLogger(scope: string, options: CreateLoggerOptions = {}): Promise<Logger> {
  const base: LoggerOptions = {
    name: scope,
    level: options.level ?? 'info',
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const streams: { level: Level; stream: DestinationStream }[] = [];

  if (options.rotatingFile !== undefined) {
    const stream = await pinoRoll({
      file: join(options.rotatingFile.dir, options.rotatingFile.fileName ?? 'app.log'),
      frequency: 'daily',
      mkdir: true,
      limit: { count: options.rotatingFile.retentionDays ?? 7 },
    });
    streams.push({ level: (options.level ?? 'info') as Level, stream });
  } else if (options.destination !== undefined) {
    streams.push({ level: (options.level ?? 'info') as Level, stream: options.destination });
  }

  if (options.console) {
    streams.push({ level: (options.level ?? 'info') as Level, stream: pino.destination(1) });
  }

  if (streams.length > 1) {
    return pino(base, pino.multistream(streams));
  }
  if (streams.length === 1) {
    return pino(base, streams[0]!.stream);
  }
  return pino(base);
}
