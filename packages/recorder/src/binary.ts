import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { AppError } from '@rekordly/shared';
import { resolveExecutable } from './binaries';

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  /**
   * Fires right after spawn so callers can hold a kill handle (cancel) and
   * stream the child's stdout (ffmpeg `-progress pipe:1` microformat).
   */
  onSpawn?: (child: ChildProcessWithoutNullStreams) => void;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Thin, typed wrapper around an external binary (ffmpeg, yt-dlp, ...).
 * Resolves the binary once and runs argument lists without recording-specific logic.
 */
export class ExternalBinary {
  private resolved: string | null | undefined;

  constructor(
    public readonly name: string,
    private readonly extraPaths: string[] = [],
  ) {}

  resolve(): string | null {
    if (this.resolved === undefined) {
      this.resolved = resolveExecutable(this.name, this.extraPaths);
    }
    return this.resolved;
  }

  async run(args: string[], options: RunOptions = {}): Promise<RunResult> {
    const binary = this.resolve();
    if (binary === null) {
      throw new AppError({
        code: 'BINARY_NOT_FOUND',
        message: `Could not find ${this.name} on PATH`,
        recoverable: true,
      });
    }
    return new Promise<RunResult>((resolve, reject) => {
      const child = spawn(binary, args, { cwd: options.cwd, env: options.env, windowsHide: true });
      options.onSpawn?.(child);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const timeout =
        options.timeoutMs !== undefined && options.timeoutMs > 0
          ? setTimeout(() => child.kill(), options.timeoutMs)
          : undefined;
      child.on('error', (error) => {
        if (timeout !== undefined) clearTimeout(timeout);
        reject(
          new AppError({
            code: 'BINARY_SPAWN_FAILED',
            message: `Failed to launch ${this.name}`,
            cause: error,
            recoverable: true,
          }),
        );
      });
      child.on('close', (code) => {
        if (timeout !== undefined) clearTimeout(timeout);
        resolve({ stdout, stderr, code: code ?? -1 });
      });
    });
  }

  async version(): Promise<string | null> {
    try {
      const { stdout } = await this.run(['--version']);
      return stdout.split('\n')[0]?.trim() ?? null;
    } catch {
      return null;
    }
  }
}
