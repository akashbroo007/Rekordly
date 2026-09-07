import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { networkInterfaces } from 'node:os';
import type { Logger } from '@rekordly/shared';

const execFileAsync = promisify(execFile);

export interface NetworkStats {
  downloadSpeed: number;
  uploadSpeed: number;
}

export interface NetworkMonitorOptions {
  logger: Logger;
  /** Polling interval in ms. */
  pollIntervalMs?: number;
}

interface NetworkCounters {
  bytesReceived: number;
  bytesSent: number;
  timestamp: number;
}

/**
 * Polls network interface counters to calculate bandwidth usage.
 * Uses PowerShell Get-NetAdapterStatistics on Windows.
 */
export class NetworkMonitorService {
  private readonly logger: Logger;
  private readonly pollIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private previousCounters: NetworkCounters | null = null;
  private cachedStats: NetworkStats = {
    downloadSpeed: 0,
    uploadSpeed: 0,
  };

  constructor(options: NetworkMonitorOptions) {
    this.logger = options.logger;
    this.pollIntervalMs = options.pollIntervalMs ?? 1500;
  }

  start(): void {
    if (this.timer !== null) return;
    this.logger.info({ pollIntervalMs: this.pollIntervalMs }, 'NetworkMonitorService started');
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
      this.logger.info('NetworkMonitorService stopped');
    }
  }

  getStats(): NetworkStats {
    return this.cachedStats;
  }

  private async poll(): Promise<void> {
    try {
      const counters = await this.getNetworkCounters();
      const now = Date.now();

      if (this.previousCounters !== null) {
        const elapsedSeconds = (now - this.previousCounters.timestamp) / 1000;
        if (elapsedSeconds > 0) {
          const downloadSpeed = (counters.bytesReceived - this.previousCounters.bytesReceived) / elapsedSeconds;
          const uploadSpeed = (counters.bytesSent - this.previousCounters.bytesSent) / elapsedSeconds;

          this.cachedStats = {
            downloadSpeed: Math.max(0, downloadSpeed),
            uploadSpeed: Math.max(0, uploadSpeed),
          };

          this.logger.debug(
            { downloadSpeed: this.cachedStats.downloadSpeed, uploadSpeed: this.cachedStats.uploadSpeed, elapsedSeconds },
            'Network speed calculated',
          );
        }
      }

      this.previousCounters = { ...counters, timestamp: now };
    } catch (error) {
      this.logger.warn({ error }, 'Failed to poll network stats');
    }
  }

  /**
   * Get aggregate network counters from all active interfaces.
   */
  private async getNetworkCounters(): Promise<{ bytesReceived: number; bytesSent: number }> {
    if (process.platform === 'win32') {
      return this.getWindowsCounters();
    }
    // Fallback for non-Windows
    return this.getFallbackCounters();
  }

  /**
   * Use PowerShell to get network adapter statistics on Windows.
   * Outputs "received,sent" as plain integers for easy parsing.
   * Note: Get-NetAdapterStatistics has no Status property, so we sum all
   * adapters — disconnected ones contribute 0 bytes.
   */
  private async getWindowsCounters(): Promise<{ bytesReceived: number; bytesSent: number }> {
    try {
      const script = [
        '$stats = Get-NetAdapterStatistics -ErrorAction SilentlyContinue',
        '$received = 0',
        '$sent = 0',
        'if ($stats) {',
        '  $received = ($stats | Measure-Object -Property ReceivedBytes -Sum).Sum',
        '  $sent = ($stats | Measure-Object -Property SentBytes -Sum).Sum',
        '}',
        'Write-Output "$received,$sent"',
      ].join('; ');

      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        script,
      ], {
        windowsHide: true,
        timeout: 5000,
      });

      const trimmed = stdout.trim();
      const parts = trimmed.split(',');
      const bytesReceived = parts.length > 0 ? parseInt(parts[0]!, 10) : 0;
      const bytesSent = parts.length > 1 ? parseInt(parts[1]!, 10) : 0;

      this.logger.debug({ bytesReceived, bytesSent, raw: trimmed }, 'Network counters polled');

      return {
        bytesReceived: Number.isNaN(bytesReceived) ? 0 : bytesReceived,
        bytesSent: Number.isNaN(bytesSent) ? 0 : bytesSent,
      };
    } catch (error) {
      this.logger.debug({ error }, 'PowerShell network query failed');
      return this.getFallbackCounters();
    }
  }

  /**
   * Fallback: use node:os networkInterfaces (limited - no byte counters).
   * Returns zeros since os.networkInterfaces() doesn't provide counters.
   */
  private getFallbackCounters(): { bytesReceived: number; bytesSent: number } {
    // node:os doesn't provide byte counters, so we return the previous values
    // This will result in 0 speed until a proper implementation is added
    const interfaces = networkInterfaces();
    let hasActiveInterface = false;

    for (const iface of Object.values(interfaces)) {
      if (iface === undefined) continue;
      for (const info of iface) {
        if (!info.internal && info.mac !== '00:00:00:00:00:00') {
          hasActiveInterface = true;
          break;
        }
      }
      if (hasActiveInterface) break;
    }

    // Return previous counters to avoid resetting
    if (this.previousCounters !== null) {
      return {
        bytesReceived: this.previousCounters.bytesReceived,
        bytesSent: this.previousCounters.bytesSent,
      };
    }

    return { bytesReceived: 0, bytesSent: 0 };
  }
}
