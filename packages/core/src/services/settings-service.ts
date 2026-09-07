import { z } from 'zod';
import type { ConfigManager } from '../config/config-manager';
import type { Logger } from '@rekordly/shared';

export const APP_SETTINGS_SCHEMA = z.object({
  recordingsDir: z.string().min(1, 'Recording directory is required'),
  checkIntervalSeconds: z.number().int().min(30).max(86_400),
  theme: z.enum(['dark', 'light']),
  notificationsEnabled: z.boolean(),
  desktopNotificationsEnabled: z.boolean(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'fatal']),
  /**
   * ponytail: master kill-switch — pauses ALL auto-recording regardless of
   * per-creator flags. Per-creator opt-in lives on the creators table; this
   * is the panic button ("pause everything") in Settings → Recording.
   */
  autoRecordPaused: z.boolean(),
  /**
   * ponytail: storage guardrail — auto-record skips (with a notification)
   * when free disk space on the recordings drive drops below this value.
   * 0 disables the guardrail.
   */
  autoRecordMinFreeDiskGb: z.number().int().min(0).max(1024),
  /** Whether the storage warning shown on first auto-record enable was seen. */
  autoRecordWarningAcknowledged: z.boolean(),
  /** Split auto-recordings into parts every N minutes (0 = single file). */
  autoRecordSegmentMinutes: z.number().int().min(0).max(600),
  /** Hide to the system tray instead of quitting when the window is closed. */
  closeToTray: z.boolean(),
  /** Start with the main window hidden (monitoring runs in the background). */
  startMinimized: z.boolean(),
  /** Launch Rekordly automatically on system login. */
  launchAtStartup: z.boolean(),
  /** Show a notification when a recording completes successfully. */
  notifyCompletion: z.boolean(),
  /** Show a notification when a recording fails. */
  notifyFailures: z.boolean(),
  /** Show warnings and non-critical notifications. */
  notifyWarnings: z.boolean(),
  /** How long toast notifications stay visible (ms). */
  toastDurationMs: z.number().int().min(1000).max(60_000),
  /** Maximum number of simultaneous generic downloads. */
  maxConcurrentDownloads: z.number().int().min(1).max(10),
  /** Global download speed cap in bytes/s. 0 = unlimited. */
  downloadBandwidthLimit: z.number().int().min(0),
  /** Root folder for generic downloads; each website gets its own subfolder. */
  downloadsDir: z.string().min(1, 'Download directory is required'),
  /** Caps recordings/downloads to 1 concurrent job and disables UI animations. */
  lowResourceMode: z.boolean(),
  /** Whether the first-launch welcome + guided tour has been completed. */
  onboardingCompleted: z.boolean(),
  /** Upload provider configuration (credentials, defaults). */
  uploadProviders: z
    .object({
      defaultProvider: z.string().default('gofile'),
      gofile: z
        .object({
          enabled: z.boolean().default(true),
          token: z.string().optional(),
        })
        .optional(),
      mixdrop: z
        .object({
          enabled: z.boolean().default(false),
          email: z.string().optional(),
          apiKey: z.string().optional(),
        })
        .optional(),
      'google-drive': z
        .object({
          enabled: z.boolean().default(false),
          clientId: z.string().optional(),
          clientSecret: z.string().optional(),
          refreshToken: z.string().optional(),
        })
        .optional(),
      catbox: z
        .object({
          enabled: z.boolean().default(true),
          userhash: z.string().optional(),
        })
        .optional(),
    })
    .default({}),
});

export type AppSettings = z.infer<typeof APP_SETTINGS_SCHEMA>;

export interface SettingsServiceDeps {
  config: ConfigManager;
  logger: Logger;
  /** User-configurable recording location fallback when unset. */
  defaultRecordingsDir: string;
  /** User-configurable download location fallback when unset. */
  defaultDownloadsDir: string;
}

export class SettingsService {
  private readonly changeListeners = new Set<(settings: AppSettings) => void>();

  constructor(private readonly deps: SettingsServiceDeps) {}

  getAll(): AppSettings {
    const defaults: AppSettings = {
      recordingsDir: this.deps.defaultRecordingsDir,
      checkIntervalSeconds: 120,
      theme: 'dark',
      notificationsEnabled: true,
      desktopNotificationsEnabled: true,
      logLevel: 'info',
      autoRecordPaused: false,
      autoRecordMinFreeDiskGb: 10,
      autoRecordWarningAcknowledged: false,
      autoRecordSegmentMinutes: 30,
      closeToTray: true,
      startMinimized: false,
      launchAtStartup: false,
      notifyCompletion: true,
      notifyFailures: true,
      notifyWarnings: true,
      toastDurationMs: 6000,
      maxConcurrentDownloads: 3,
      downloadBandwidthLimit: 0,
      downloadsDir: this.deps.defaultDownloadsDir,
      lowResourceMode: false,
      onboardingCompleted: false,
      uploadProviders: { defaultProvider: 'gofile' },
    };
    const result = APP_SETTINGS_SCHEMA.safeParse(this.deps.config.getAll());
    if (result.success) {
      return result.data;
    }
    return defaults;
  }

  set(patch: Partial<AppSettings>): AppSettings {
    const next = this.validateOrThrow({ ...this.getAll(), ...patch });
    for (const [key, value] of Object.entries(next)) {
      this.deps.config.setUser(key, value);
    }
    this.deps.logger.info({ patch: Object.keys(patch) }, 'settings updated');
    this.notifyChanged(next);
    return next;
  }

  /** Subscribe to settings changes (e.g. to apply tray/startup behavior). */
  onChanged(listener: (settings: AppSettings) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyChanged(settings: AppSettings): void {
    for (const listener of this.changeListeners) {
      try {
        listener(settings);
      } catch (error) {
        this.deps.logger.error({ error }, 'settings change listener failed');
      }
    }
  }

  reset(): AppSettings {
    this.deps.config.resetUser();
    return this.getAll();
  }

  validate(values: unknown): { valid: boolean; errors: string[] } {
    const result = APP_SETTINGS_SCHEMA.safeParse(values);
    if (result.success) {
      return { valid: true, errors: [] };
    }
    return {
      valid: false,
      errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  exportToJson(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }

  importFromJson(json: string): AppSettings {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json) as unknown;
    } catch {
      throw new Error('Imported settings are not valid JSON');
    }
    const settings = this.validateOrThrow(parsed);
    for (const [key, value] of Object.entries(settings)) {
      this.deps.config.setUser(key, value);
    }
    this.deps.logger.info('settings imported');
    return settings;
  }

  private validateOrThrow(values: unknown): AppSettings {
    const result = APP_SETTINGS_SCHEMA.safeParse(values);
    if (!result.success) {
      throw new Error(result.error.issues.map((issue) => issue.message).join('; '));
    }
    return result.data;
  }
}
