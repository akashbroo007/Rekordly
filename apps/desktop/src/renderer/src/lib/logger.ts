import type { LogLevel } from '@rekordly/shared/contracts';

export interface RendererLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Renderer logger: entries are forwarded to the main process through typed
 * IPC so all logs land in the same pino file (see main/ipc.ts).
 */
function createRendererLogger(scope: string): RendererLogger {
  const write =
    (level: LogLevel) =>
    (message: string, data?: Record<string, unknown>): void => {
      void window.desktop.logs.write({ scope, level, message, time: Date.now(), data });
    };
  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
  };
}

export const logger = createRendererLogger('renderer');
