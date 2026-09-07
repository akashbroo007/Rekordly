export interface AppErrorOptions {
  /** Stable machine-readable identifier, e.g. 'BINARY_NOT_FOUND'. */
  code: string;
  /** Human-readable message shown to the user. */
  message: string;
  /** Optional structured context attached to the error. */
  details?: unknown;
  /** Whether retrying the operation can succeed. */
  recoverable?: boolean;
  /** Underlying error, if any. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly recoverable: boolean;
  readonly timestamp: string;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.details = options.details;
    this.recoverable = options.recoverable ?? false;
    this.timestamp = new Date().toISOString();
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
