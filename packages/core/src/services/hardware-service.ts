import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import os from 'node:os';
import type { HardwareProfileDto, HardwareTier } from '@rekordly/shared';
import type { Logger } from '@rekordly/shared';

export interface HardwareServiceOptions {
  logger: Logger;
  /** Directory whose drive is analyzed for disk type / free space. */
  probeDir: string;
}

/**
 * Detects the machine's hardware profile (CPU, RAM, disk medium) so the app
 * can recommend Low-Resource Mode on weak machines or HDD storage.
 *
 * Detection is best-effort and never throws — every failure degrades to a
 * sensible default ('unknown' disk, conservative tier).
 */
export class HardwareService {
  private readonly logger: Logger;
  private readonly probeDir: string;
  /** Cached after first successful detection — hardware does not change mid-session. */
  private cached: HardwareProfileDto | null = null;

  constructor(options: HardwareServiceOptions) {
    this.logger = options.logger;
    this.probeDir = options.probeDir;
  }

  async getProfile(): Promise<HardwareProfileDto> {
    if (this.cached !== null) return this.cached;

    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model.trim() ?? 'Unknown CPU';
    const cpuCores = cpus.length > 0 ? cpus.length : 1;
    const totalMemoryBytes = os.totalmem();

    const [diskType, freeDiskBytes] = await Promise.all([
      this.detectDiskType().catch(() => 'unknown' as const),
      this.detectFreeDiskBytes().catch(() => 0),
    ]);

    const profile = classify({
      cpuModel,
      cpuCores,
      totalMemoryBytes,
      diskType,
      freeDiskBytes,
    });

    this.cached = profile;
    this.logger.info({ profile }, 'hardware profile detected');
    return profile;
  }

  /**
   * Windows-only physical disk medium query via PowerShell. Returns
   * 'unknown' on non-Windows platforms or when the query fails/times out.
   */
  private detectDiskType(): Promise<'ssd' | 'hdd' | 'unknown'> {
    if (process.platform !== 'win32') {
      return Promise.resolve('unknown');
    }
    return new Promise((resolve) => {
      // ponytail: Get-PhysicalDisk reports MediaType (SSD/HDD/Unspecified)
      // per physical disk — the boot/recordings drive is almost always the
      // first row. A 3s timeout keeps first-launch snappy on odd systems.
      const child = execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', '(Get-PhysicalDisk | Select-Object -First 1).MediaType'],
        { timeout: 3000 },
        (error, stdout) => {
          if (error !== null) {
            resolve('unknown');
            return;
          }
          const value = stdout.trim().toLowerCase();
          if (value.includes('ssd')) resolve('ssd');
          else if (value.includes('hdd')) resolve('hdd');
          else resolve('unknown');
        },
      );
      child.on('error', () => resolve('unknown'));
    });
  }

  private async detectFreeDiskBytes(): Promise<number> {
    const stats = await statfs(this.probeDir);
    return stats.bsize * stats.bavail;
  }
}

interface ClassifyInput {
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  diskType: 'ssd' | 'hdd' | 'unknown';
  freeDiskBytes: number;
}

const GB = 1024 ** 3;

function classify(input: ClassifyInput): HardwareProfileDto {
  let tier: HardwareTier = 'high';
  if (input.cpuCores <= 2 || input.totalMemoryBytes < 8 * GB) {
    tier = 'low';
  } else if (input.cpuCores <= 4 || input.totalMemoryBytes < 16 * GB) {
    tier = 'moderate';
  }

  return {
    ...input,
    tier,
    recommendedLowResourceMode: tier === 'low' || input.diskType === 'hdd',
  };
}