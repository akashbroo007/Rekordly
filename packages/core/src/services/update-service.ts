import type { Logger } from '@rekordly/shared';
import { EventEmitter } from 'node:events';

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateEvents {
  'status-changed': { status: UpdateStatus; info?: UpdateInfo; error?: string };
  'download-progress': { percent: number; transferred: number; total: number };
}

export interface UpdateServiceOptions {
  logger: Logger;
  /** Provider URL for auto-updates. Empty = disabled. */
  updateUrl?: string;
}

/**
 * Auto-update service abstraction.
 *
 * Architecture supports GitHub Releases in the future.
 * Currently operates in passive mode — checks for updates
 * but does not require a release server.
 *
 * ponytail: minimal stub, real electron-updater integration when first release ships.
 */
export class UpdateService extends EventEmitter {
  private readonly logger: Logger;
  private readonly updateUrl: string;
  private status: UpdateStatus = 'idle';
  private updateInfo: UpdateInfo | null = null;

  constructor(options: UpdateServiceOptions) {
    super();
    this.logger = options.logger;
    this.updateUrl = options.updateUrl ?? '';
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  getUpdateInfo(): UpdateInfo | null {
    return this.updateInfo;
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (!this.updateUrl) {
      this.logger.debug('Auto-update URL not configured, skipping check');
      return null;
    }

    this.setStatus('checking');
    this.logger.info({ url: this.updateUrl }, 'checking for updates');

    try {
      // When a release server is configured, this will:
      // 1. Fetch the latest release manifest from the updateUrl
      // 2. Compare versions
      // 3. Return update info if a newer version is available
      //
      // For now, return null (no update available)
      this.setStatus('not-available');
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.setStatus('error', message);
      this.logger.error({ error: message }, 'update check failed');
      return null;
    }
  }

  async downloadUpdate(): Promise<void> {
    if (!this.updateInfo) {
      this.logger.warn('No update available to download');
      return;
    }

    this.setStatus('downloading');
    this.logger.info({ version: this.updateInfo.version }, 'downloading update');

    // When electron-updater is integrated:
    // 1. Use autoUpdater.downloadUpdate()
    // 2. Emit download-progress events
    // 3. Set status to 'downloaded' when complete
  }

  async installUpdate(): Promise<void> {
    if (this.status !== 'downloaded') {
      this.logger.warn('No update downloaded to install');
      return;
    }

    this.logger.info('installing update — app will restart');

    // When electron-updater is integrated:
    // 1. Use autoUpdater.quitAndInstall()
  }

  private setStatus(status: UpdateStatus, error?: string): void {
    this.status = status;
    this.emit('status-changed', { status, info: this.updateInfo ?? undefined, error });
  }

  destroy(): void {
    this.removeAllListeners();
  }
}
