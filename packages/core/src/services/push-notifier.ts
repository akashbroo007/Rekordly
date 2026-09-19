import type { Logger } from '@rekordly/shared';
import type { PushNotificationsSettings } from '@rekordly/shared';

/**
 * PushNotifier: sends app events to the user's phone/chat apps.
 *
 * Two channels:
 * - Discord: a single incoming-webhook URL (no bot needed).
 * - Telegram: a bot token + chat id (token from @BotFather, chat id from
 *   @userinfobot or a test push).
 *
 * Fire-and-forget: a slow or failing push must never delay or break the
 * recording pipeline. Every send is bounded by a timeout and its failure is
 * only logged (plus a rate-limited warning notification so a dead webhook
 * does not spam the notification center on every recording).
 */

const SEND_TIMEOUT_MS = 10_000;
/** Min gap between "push failed" notifications per channel (cooldown). */
const FAILURE_NOTIFY_COOLDOWN_MS = 10 * 60_000;

export interface PushMessage {
  title: string;
  message: string;
  level?: 'info' | 'warn' | 'error';
}

/** Outcome of one channel send ("error" is absent on success). */
export interface PushSendResult {
  ok: boolean;
  error?: string;
}

/** Per-channel result of PushNotifier.test(). */
export interface PushTestResult {
  discord: PushSendResult;
  telegram: PushSendResult;
}

export interface PushNotifierDeps {
  logger: Logger;
  /** Live settings read per send so changes apply without a restart. */
  getSettings: () => PushNotificationsSettings;
  /** Optional sink for user-visible failure warnings (NotificationService.send). */
  onSendFailure?: (channel: 'discord' | 'telegram', error: string) => void;
}

/** Discord embed color per level (decimal). */
const DISCORD_COLORS = { info: 0x5865f2, warn: 0xfee75c, error: 0xed4245 } as const;

export class PushNotifier {
  private readonly logger: Logger;
  private readonly getSettings: () => PushNotificationsSettings;
  private readonly onSendFailure: ((channel: 'discord' | 'telegram', error: string) => void) | undefined;
  private readonly lastFailureNotified = new Map<string, number>();

  constructor(deps: PushNotifierDeps) {
    this.logger = deps.logger;
    this.getSettings = deps.getSettings;
    this.onSendFailure = deps.onSendFailure;
  }

  /**
   * Sends to every configured channel. Never throws — a push failure is a
   * log line, not an error the pipeline should care about.
   */
  send(message: PushMessage): void {
    const settings = this.getSettings();
    if (!settings.enabled) return;

    const content = `${message.title}\n${message.message}`;
    if (settings.discordWebhookUrl.trim() !== '') {
      void this.sendDiscord(settings.discordWebhookUrl.trim(), message);
    }
    if (settings.telegramBotToken.trim() !== '' && settings.telegramChatId.trim() !== '') {
      void this.sendTelegram(settings.telegramBotToken.trim(), settings.telegramChatId.trim(), content);
    }
  }

  /** Convenience helpers for the common event kinds. */
  creatorLive(
    creatorName: string,
    platformId: string,
    options?: { title?: string; autoRecord?: boolean },
  ): void {
    const s = this.getSettings();
    if (!s.notifyOnLive) return;
    // ponytail: the old text claimed "Recording will start automatically"
    // even when the creator had no auto-record opt-in — say what is true.
    const autoRecord = options?.autoRecord === true;
    const detail = autoRecord
      ? 'Recording started automatically.'
      : 'Auto-record is off for this creator — open the app (or Telegram) to record.';
    this.send({
      level: 'info',
      title: `🔴 ${creatorName} is LIVE on ${platformId}`,
      message: options?.title !== undefined && options.title !== '' ? `"${options.title}"\n${detail}` : detail,
    });
  }

  recordingStarted(creatorName: string, title: string): void {
    const s = this.getSettings();
    if (!s.notifyOnRecordingStarted) return;
    this.send({
      level: 'info',
      title: `⏺️ Recording started — ${creatorName}`,
      message: title,
    });
  }

  recordingCompleted(creatorName: string, title: string, sizeBytes?: number): void {
    const s = this.getSettings();
    if (!s.notifyOnCompleted) return;
    const size = sizeBytes !== undefined && sizeBytes > 0 ? ` (${formatBytes(sizeBytes)})` : '';
    this.send({
      level: 'info',
      title: `✅ Recording saved — ${creatorName}${size}`,
      message: title,
    });
  }

  recordingFailed(creatorName: string, title: string, error: string): void {
    const s = this.getSettings();
    if (!s.notifyOnFailed) return;
    this.send({
      level: 'error',
      title: `❌ Recording failed — ${creatorName}`,
      message: `${title}\n${error}`,
    });
  }

  uploadCompleted(fileName: string, providerId: string, link?: string): void {
    const s = this.getSettings();
    if (!s.notifyOnUploadCompleted) return;
    this.send({
      level: 'info',
      title: `☁️ Upload finished — ${providerId}`,
      message: link !== undefined && link !== '' ? `${fileName}\n${link}` : fileName,
    });
  }

  /**
   * Sends a test message through every configured channel and reports per
   * channel whether it worked plus the failure reason (Settings →
   * "Send test notification"). Deliberately ignores the master switch:
   * a test must work even while pushes are paused.
   */
  async test(): Promise<PushTestResult> {
    const settings = this.getSettings();
    const [discord, telegram] = await Promise.all([
      settings.discordWebhookUrl.trim() !== ''
        ? this.sendDiscord(settings.discordWebhookUrl.trim(), {
            level: 'info',
            title: 'Rekordly test notification',
            message: 'If you can read this, Discord pushes are working.',
          })
        : Promise.resolve({ ok: false, error: 'not configured' }),
      settings.telegramBotToken.trim() !== '' && settings.telegramChatId.trim() !== ''
        ? this.sendTelegram(
            settings.telegramBotToken.trim(),
            settings.telegramChatId.trim(),
            'Rekordly test notification\nIf you can read this, Telegram pushes are working.',
          )
        : Promise.resolve({ ok: false, error: 'not configured' }),
    ]);
    this.logger.info({ discord, telegram }, 'push test finished');
    return { discord, telegram };
  }

  /**
   * Reads the bot's recent messages and returns the chat ids found, most
   * recent first. Powers the "Detect chat ID" button: the user messages the
   * bot once, clicks the button, and we read the id off the update — no JSON
   * spelunking in a browser needed.
   */
  async detectTelegramChatIds(token?: string): Promise<string[]> {
    const resolvedToken = (token ?? this.getSettings().telegramBotToken).trim();
    if (resolvedToken === '') {
      throw new Error('Enter your bot token first.');
    }
    const response = await fetchWithTimeout(`https://api.telegram.org/bot${resolvedToken}/getUpdates`, {
      method: 'GET',
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 401) {
        throw new Error('Bot token rejected by Telegram — check it against @BotFather.');
      }
      throw new Error(`Telegram error HTTP ${response.status}${body !== '' ? `: ${body.slice(0, 200)}` : ''}`);
    }
    const payload = (await response.json()) as {
      ok: boolean;
      result?: { message?: { chat?: { id?: number | string } }; channel_post?: { chat?: { id?: number | string } } }[];
    };
    if (!payload.ok) throw new Error('Telegram rejected getUpdates.');
    const ids = new Set<string>();
    for (const update of payload.result ?? []) {
      const chatId = update.message?.chat?.id ?? update.channel_post?.chat?.id;
      if (chatId !== undefined) ids.add(String(chatId));
    }
    return [...ids].reverse();
  }

  private async sendDiscord(webhookUrl: string, message: PushMessage): Promise<PushSendResult> {
    const level = message.level ?? 'info';
    try {
      const response = await fetchWithTimeout(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Rekordly',
          embeds: [
            {
              title: message.title,
              description: message.message,
              color: DISCORD_COLORS[level],
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return { ok: true };
    } catch (error) {
      this.handleFailure('discord', error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async sendTelegram(token: string, chatId: string, text: string): Promise<PushSendResult> {
    try {
      const response = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${body !== '' ? `: ${body.slice(0, 200)}` : ''}`);
      }
      return { ok: true };
    } catch (error) {
      this.handleFailure('telegram', error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Logs the failure; surfaces it to the user at most once per cooldown. */
  private handleFailure(channel: 'discord' | 'telegram', error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn({ channel, error: message }, 'push notification failed');
    const now = Date.now();
    const last = this.lastFailureNotified.get(channel) ?? 0;
    if (now - last >= FAILURE_NOTIFY_COOLDOWN_MS) {
      this.lastFailureNotified.set(channel, now);
      this.onSendFailure?.(channel, message);
    }
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  timer.unref?.();
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
