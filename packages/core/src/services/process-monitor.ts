import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from '@rekordly/shared';

const execFileAsync = promisify(execFile);

export interface ChildProcessStats {
  pid: number;
  type: 'yt-dlp' | 'ffmpeg' | 'chromium';
  cpuPercent: number;
  memoryBytes: number;
}

export interface ProcessStats {
  totalCpuPercent: number;
  totalMemoryBytes: number;
  processCount: number;
  processes: ChildProcessStats[];
}

export interface ProcessMonitorOptions {
  logger: Logger;
  /** Function to get active PIDs from the recording service. */
  getActivePids: () => Array<{ pid: number; type: 'yt-dlp' | 'ffmpeg' | 'chromium' }>;
  /** Polling interval in ms. */
  pollIntervalMs?: number;
}

/**
 * Polls child process PIDs for CPU/memory usage on Windows.
 * Uses tasklist for efficient batch queries.
 */
export class ProcessMonitorService {
  private readonly logger: Logger;
  private readonly getActivePids: ProcessMonitorOptions['getActivePids'];
  private readonly pollIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cachedStats: ProcessStats = {
    totalCpuPercent: 0,
    totalMemoryBytes: 0,
    processCount: 0,
    processes: [],
  };

  constructor(options: ProcessMonitorOptions) {
    this.logger = options.logger;
    this.getActivePids = options.getActivePids;
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
  }

  start(): void {
    if (this.timer !== null) return;
    this.logger.info({ pollIntervalMs: this.pollIntervalMs }, 'ProcessMonitorService started');
    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    // Poll immediately on start
    void this.poll();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('ProcessMonitorService stopped');
    }
  }

  getStats(): ProcessStats {
    return this.cachedStats;
  }

  private async poll(): Promise<void> {
    const activePids = this.getActivePids();
    if (activePids.length === 0) {
      this.cachedStats = {
        totalCpuPercent: 0,
        totalMemoryBytes: 0,
        processCount: 0,
        processes: [],
      };
      return;
    }

    try {
      const processes = await this.queryProcessStats(activePids);
      const totalCpuPercent = processes.reduce((sum, p) => sum + p.cpuPercent, 0);
      const totalMemoryBytes = processes.reduce((sum, p) => sum + p.memoryBytes, 0);

      this.cachedStats = {
        totalCpuPercent,
        totalMemoryBytes,
        processCount: processes.length,
        processes,
      };
    } catch (error) {
      this.logger.warn({ error }, 'Failed to poll process stats');
    }
  }

  /**
   * Query process stats using tasklist on Windows.
   * Returns stats for the given PIDs.
   */
  private async queryProcessStats(
    pids: Array<{ pid: number; type: 'yt-dlp' | 'ffmpeg' | 'chromium' }>,
  ): Promise<ChildProcessStats[]> {
    if (process.platform !== 'win32') {
      // Fallback for non-Windows: return empty array
      // TODO: Implement /proc parsing for Linux
      return [];
    }

    const pidList = pids.map((p) => p.pid);
    const pidFilter = pidList.map((pid) => `PID eq ${pid}`).join(' or ');

    try {
      const { stdout } = await execFileAsync('tasklist', [
        '/FI',
        pidFilter,
        '/FO',
        'CSV',
        '/NH',
      ], {
        windowsHide: true,
        timeout: 5000,
      });

      return this.parseTasklistOutput(stdout, pids);
    } catch (error) {
      this.logger.debug({ error }, 'tasklist query failed');
      return [];
    }
  }

  /**
   * Parse tasklist CSV output.
   * Format: "Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"
   */
  private parseTasklistOutput(
    stdout: string,
    pidTypeMap: Array<{ pid: number; type: 'yt-dlp' | 'ffmpeg' | 'chromium' }>,
  ): ChildProcessStats[] {
    const lines = stdout.trim().split('\n').filter((line) => line.length > 0);
    const results: ChildProcessStats[] = [];

    for (const line of lines) {
      // Parse CSV (handle quoted fields)
      const matches = line.match(/"([^"]*)"/g);
      if (matches === null || matches.length < 5) continue;

      const pid = parseInt(matches[1]!.replace(/"/g, ''), 10);
      const memUsage = matches[4]!.replace(/"/g, '').replace(/,/g, '');

      if (Number.isNaN(pid) || Number.isNaN(parseInt(memUsage, 10))) continue;

      const pidEntry = pidTypeMap.find((p) => p.pid === pid);
      if (pidEntry === undefined) continue;

      results.push({
        pid,
        type: pidEntry.type,
        cpuPercent: 0, // tasklist doesn't provide CPU% directly
        memoryBytes: parseInt(memUsage, 10) * 1024, // Convert KB to bytes
      });
    }

    return results;
  }
}
