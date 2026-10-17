import type { Logger } from '@rekordly/shared';
import type { PushNotificationsSettings } from '@rekordly/shared';

/**
 * ponytail: Telegram two-way control — the bot listens for button taps on its
 * own pushes and drives the recorder from chat. Discord incoming webhooks are
 * one-way only (they cannot carry buttons), so interactive control is a
 * Telegram exclusive; Discord keeps the "open the app" text.
 *
 * Security: the bot only reacts to chats in `allowedChatIds` (the chat id the
 * user detected/configured). Any other chat gets ignored. A single poller
 * runs per app instance; every API call is timeout-bounded and failures are
 * logged, never thrown — chat control must never destabilize the app.
 */

const POLL_TIMEOUT_S = 25; // long-poll window
const POLL_ERROR_DELAY_MS = 5_000;
const SEND_TIMEOUT_MS = 10_000;

/** A callback-button payload: `rek:<key>:<args…>` (Telegram caps at 64 bytes). */
const CALLBACK_PREFIX = 'rek:';

/**
 * Just the DB creator id — callback payloads must stay ≤ 64 bytes, so the
 * host resolves name/plugin/monitor id from the database itself.
 */
export interface TelegramRecordingTarget {
  creatorDbId: string;
  creatorName: string;
}

export interface TelegramCommandDeps {
  logger: Logger;
  /** Live push settings (token + allowed chat ids). */
  getSettings: () => PushNotificationsSettings;
  /** Security gate: only these chat ids may control the app. */
  getAllowedChatIds: () => string[];
  /**
   * Starts a recording with the exact Record-dialog option surface.
   * Resolves the full creator row (name, plugin, monitor id) from target.
   */
  startRecording: (
    target: TelegramRecordingTarget,
    options: { quality?: string; durationMinutes?: number; segmentMinutes?: number; streamType?: string },
  ) => Promise<string>;
  /** Finds the active (or paused) recording job for a DB creator id. */
  findActiveJob: (
    creatorDbId: string,
  ) => { jobId: string; status: string; title: string } | undefined;
  pauseRecording: (jobId: string) => Promise<void>;
  resumeRecording: (jobId: string) => Promise<void>;
  stopRecording: (jobId: string) => Promise<void>;
}

interface InlineButton {
  text: string;
  callback_data?: string;
  /** URL buttons use `url` instead of callback data. */
  url?: string;
}

interface TgUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { chat: { id: number | string }; message_id: number };
    data?: string;
  };
}

async function tgFetch<T>(token: string, method: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok: boolean; result?: T; description?: string }
      | null;
    if (!response.ok || payload === null || !payload.ok) {
      throw new Error(`Telegram ${method} failed: HTTP ${response.status} ${payload?.description ?? ''}`.trim());
    }
    return payload.result as T;
  } finally {
    clearTimeout(timer);
  }
}

/** True when a recording job status counts as active (pausable/stoppable). */
export function isActiveJobStatus(status: string): boolean {
  return ['queued', 'preparing', 'recording', 'paused', 'stopping', 'processing'].includes(status);
}

export class TelegramCommandService {
  private readonly deps: TelegramCommandDeps;
  private readonly logger: Logger;
  private running = false;
  /** Last processed update id so restarts don't replay old button taps. */
  private lastUpdateId = 0;
  private readonly pending = new Map<
    string,
    { target: TelegramRecordingTarget; quality: string; duration: string; segment: string }
  >();

  constructor(deps: TelegramCommandDeps) {
    this.deps = deps;
    this.logger = deps.logger;
  }

  /** Starts long-polling. Idempotent; a missing token/disabled switch skips. */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.pollLoop();
    this.logger.info('telegram command listener started');
  }

  stop(): void {
    this.running = false;
  }

  /**
   * Sends the "creator went live" message WITH a Record button. Used by the
   * host's live-notification path; text is honest about auto-record state.
   */
  async sendLiveMessage(input: {
    creatorName: string;
    platformId: string;
    title?: string;
    autoRecord: boolean;
    creatorDbId: string;
  }): Promise<void> {
    const { token, chatIds } = this.resolveChannel();
    if (token === '' || chatIds.length === 0) return;
    const text =
      `🔴 ${input.creatorName} is LIVE on ${input.platformId}\n` +
      (input.title !== undefined && input.title !== '' ? `"${input.title}"\n` : '') +
      (input.autoRecord
        ? '⏺️ Recording started automatically.'
        : 'Tap Record to capture it from here.');
    const keyboard: InlineButton[][] = input.autoRecord
      ? [[{ text: '⏹ Stop recording', callback_data: callback('stop', input.creatorDbId) }]]
      : [
          [{ text: '⏺️ Record (defaults)', callback_data: callback('rec', input.creatorDbId) }],
          [{ text: '⚙️ Record with options…', callback_data: callback('opts', input.creatorDbId) }],
        ];
    await Promise.allSettled(
      chatIds.map((chatId) =>
        tgFetch(token, 'sendMessage', {
          chat_id: chatId,
          text,
          reply_markup: { inline_keyboard: keyboard },
        }),
      ),
    );
  }

  /**
   * Attaches Stop/Pause buttons to a "recording started" push. Fire-and-forget
   * like the rest of the push pipeline.
   */
  async sendRecordingStartedMessage(input: {
    creatorName: string;
    title: string;
    jobId: string;
    creatorDbId: string;
  }): Promise<void> {
    const { token, chatIds } = this.resolveChannel();
    if (token === '' || chatIds.length === 0) return;
    // Remote control buttons: pause/resume/stop straight from the push.
    const keyboard: InlineButton[][] = [
      [
        { text: '⏸ Pause', callback_data: callback('pause', input.jobId) },
        { text: '▶️ Resume', callback_data: callback('resume', input.jobId) },
        { text: '⏹ Stop', callback_data: callback('stopjob', input.jobId) },
      ],
    ];
    await Promise.allSettled(
      chatIds.map((chatId) =>
        tgFetch(token, 'sendMessage', {
          chat_id: chatId,
          text: `⏺️ Recording started — ${input.creatorName}\n${input.title}`,
          ...(keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : {}),
        }),
      ),
    );
  }

  // --- internals -----------------------------------------------------------

  private resolveChannel(): { token: string; chatIds: string[] } {
    const s = this.deps.getSettings();
    if (!s.enabled) return { token: '', chatIds: [] };
    const allowed = new Set(this.deps.getAllowedChatIds().map((id) => id.trim()).filter((id) => id !== ''));
    const configured = s.telegramChatId
      .split(/[,\s]+/)
      .map((id) => id.trim())
      .filter((id) => id !== '');
    for (const id of configured) allowed.add(id);
    return { token: s.telegramBotToken.trim(), chatIds: [...allowed] };
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      const token = this.deps.getSettings().telegramBotToken.trim();
      if (token === '' || !this.deps.getSettings().enabled) {
        await sleep(10_000);
        continue;
      }
      try {
        // ponytail: keep 'message' in allowed_updates — the setting is sticky
        // on Telegram's side, and dropping it would starve the Settings
        // "Detect chat ID" button (it reads plain messages via getUpdates).
        const updates = await tgFetch<TgUpdate[]>(token, 'getUpdates', {
          timeout: POLL_TIMEOUT_S,
          offset: this.lastUpdateId + 1,
          allowed_updates: ['callback_query', 'message'],
        });
        for (const update of updates) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
          if (update.callback_query === undefined) continue;
          void this.handleUpdate(token, update).catch((err) => {
            this.logger.warn({ error: err }, 'telegram callback handling failed');
          });
        }
      } catch (error) {
        this.logger.debug?.({ error }, 'telegram poll failed — retrying');
        await sleep(POLL_ERROR_DELAY_MS);
      }
    }
  }

  private async handleUpdate(token: string, update: TgUpdate): Promise<void> {
    const cq = update.callback_query;
    if (cq === undefined || cq.data === undefined) return;
    const chatId = cq.message?.chat.id;
    if (chatId === undefined) return;
    const chatKey = String(chatId);
    // Always answer the callback query so Telegram stops the button spinner.
    const ack = (text?: string): Promise<unknown> =>
      tgFetch(token, 'answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: text !== undefined }).catch(
        () => undefined,
      );

    const allowed = new Set(this.deps.getAllowedChatIds().map((id) => id.trim()).filter((id) => id !== ''));
    const configured = this.deps
      .getSettings()
      .telegramChatId.split(/[,\s]+/)
      .map((id) => id.trim())
      .filter((id) => id !== '');
    for (const id of configured) allowed.add(id);
    if (!allowed.has(chatKey)) {
      this.logger.warn({ chatId: chatKey }, 'telegram command from unauthorized chat ignored');
      return;
    }

    const [prefix, key, arg] = cq.data.split(':');
    if (prefix !== CALLBACK_PREFIX.slice(0, -1) || key === undefined) {
      await ack();
      return;
    }

    try {
      switch (key) {
        case 'rec': {
          const target = decodeTarget(arg);
          const jobId = await this.deps.startRecording(target, { quality: 'best' });
          await ack(`Recording started (job ${jobId.slice(0, 8)}…).`);
          this.pending.delete(chatKey);
          return;
        }
        case 'opts': {
          const target = decodeTarget(arg);
          this.pending.set(chatKey, { target, quality: 'best', duration: '', segment: '' });
          await this.editButtons(token, chatId, cq.message?.message_id, this.optionKeyboard(chatKey, 'quality'));
          await ack();
          return;
        }
        case 'q': {
          const pending = this.pending.get(chatKey);
          if (pending === undefined) {
            await ack('This options menu expired — tap "Record with options…" again.');
            return;
          }
          pending.quality = arg ?? 'best';
          await this.editButtons(token, chatId, cq.message?.message_id, this.optionKeyboard(chatKey, 'duration'));
          await ack();
          return;
        }
        case 'd': {
          const pending = this.pending.get(chatKey);
          if (pending === undefined) {
            await ack('This options menu expired — tap "Record with options…" again.');
            return;
          }
          pending.duration = arg ?? '';
          await this.editButtons(token, chatId, cq.message?.message_id, this.optionKeyboard(chatKey, 'segment'));
          await ack();
          return;
        }
        case 's': {
          const pending = this.pending.get(chatKey);
          if (pending === undefined) {
            await ack('This options menu expired — tap "Record with options…" again.');
            return;
          }
          pending.segment = arg ?? '';
          await this.startFromOptions(pending);
          this.pending.delete(chatKey);
          await ack();
          return;
        }
        case 'cancel': {
          this.pending.delete(chatKey);
          await this.editButtons(token, chatId, cq.message?.message_id, []);
          await ack('Cancelled.');
          return;
        }
        case 'pause':
        case 'resume':
        case 'stopjob': {
          const jobId = cq.data.split(':').slice(2).join(':'); // job ids contain no ':' but be safe
          if (jobId === '') {
            await ack();
            return;
          }
          if (key === 'pause') {
            await this.deps.pauseRecording(jobId);
            await ack('Recording paused.');
          } else if (key === 'resume') {
            await this.deps.resumeRecording(jobId);
            await ack('Recording resumed.');
          } else {
            await this.deps.stopRecording(jobId);
            await ack('Recording stopped — the partial file was kept.');
          }
          return;
        }
        case 'stop': {
          // Stop by creator: find the active job for this creator.
          const creatorDbId = cq.data.split(':').slice(2).join(':');
          const job = this.deps.findActiveJob(creatorDbId);
          if (job === undefined) {
            await ack('No active recording for this creator.');
            return;
          }
          await this.deps.stopRecording(job.jobId);
          await ack('Recording stopped — the partial file was kept.');
          return;
        }
        default:
          await ack();
          return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ key, error: message }, 'telegram command failed');
      await ack(`⚠️ ${message.slice(0, 180)}`);
    }
  }

  private async startFromOptions(
    pending: { target: TelegramRecordingTarget; quality: string; duration: string; segment: string },
  ): Promise<void> {
    const quality = pending.quality === '' ? 'best' : pending.quality;
    const durationMinutes = pending.duration === '' ? undefined : Number(pending.duration);
    const segmentMinutes = pending.segment === '' || pending.segment === '0' ? undefined : Number(pending.segment);
    try {
      await this.deps.startRecording(pending.target, { quality, durationMinutes, segmentMinutes });
      await this.reply(`⏺️ Recording ${pending.target.creatorName} started from Telegram.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.reply(`⚠️ Could not start recording: ${message.slice(0, 200)}`);
      throw error;
    }
  }

  /** Sends a plain follow-up message to every allowed chat. */
  private async reply(text: string): Promise<void> {
    const { token, chatIds } = this.resolveChannel();
    if (token === '' || chatIds.length === 0) return;
    await Promise.allSettled(chatIds.map((chatId) => tgFetch(token, 'sendMessage', { chat_id: chatId, text })));
  }

  private async editButtons(
    token: string,
    chatId: number | string,
    messageId: number | undefined,
    keyboard: InlineButton[][],
  ): Promise<void> {
    if (messageId === undefined) return;
    await tgFetch(token, 'editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  /** The three-step wizard keyboard (mirrors the app's Record dialog). */
  private optionKeyboard(chatKey: string, step: 'quality' | 'duration' | 'segment'): InlineButton[][] {
    const stepLabel =
      step === 'quality' ? 'Quality?' : step === 'duration' ? 'Duration?' : 'Split into parts?';
    const header: InlineButton[] = [{ text: `⚙️ ${stepLabel}`, callback_data: 'noop' }];
    if (step === 'quality') {
      return [
        header,
        [
          { text: 'Best (auto)', callback_data: callback('q', 'best') },
          { text: '1080p', callback_data: callback('q', '1080p') },
        ],
        [
          { text: '720p', callback_data: callback('q', '720p') },
          { text: '480p', callback_data: callback('q', '480p') },
        ],
      ];
    }
    if (step === 'duration') {
      return [
        header,
        [
          { text: 'Until ends', callback_data: callback('d', '') },
          { text: '5 min', callback_data: callback('d', '5') },
          { text: '15 min', callback_data: callback('d', '15') },
        ],
        [
          { text: '30 min', callback_data: callback('d', '30') },
          { text: '1 h', callback_data: callback('d', '60') },
          { text: '2 h', callback_data: callback('d', '120') },
        ],
      ];
    }
    return [
      header,
      [
        { text: 'No split', callback_data: callback('s', '') },
        { text: '5 min parts', callback_data: callback('s', '5') },
        { text: '15 min parts', callback_data: callback('s', '15') },
        { text: '30 min parts', callback_data: callback('s', '30') },
      ],
      [{ text: 'Cancel', callback_data: 'rek:cancel:x' }],
    ];
  }
}

// --- callback payload helpers ---------------------------------------------

function callback(key: string, arg: string): string {
  return `rek:${key}:${arg}`;
}

/** Rebuilds the target from a bare DB creator id carried in the payload. */
function decodeTarget(arg: string | undefined): TelegramRecordingTarget {
  const creatorDbId = (arg ?? '').trim();
  if (creatorDbId === '') throw new Error('Malformed Telegram button payload');
  // Name comes back from the host when the recording starts; a placeholder
  // keeps acks readable if resolution fails first.
  return { creatorDbId, creatorName: 'the creator' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
