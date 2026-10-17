# Push Notifications

Rekordly can ping your **phone or chat app** the moment something happens — a creator goes live, a recording starts or finishes, or an upload completes. Instead of watching the dashboard, you get a Discord or Telegram message wherever you are.

## Channels

| Channel | What you need | Notes |
| --- | --- | --- |
| Discord | An **incoming webhook URL** | No bot needed — one URL per Discord channel |
| Telegram | A **bot token** + your **chat ID** | Create the bot with @BotFather |

Both channels are independent: configure one, the other, or both. Pushes are fire-and-forget — a slow or failing push never delays or breaks a recording.

## Setting up Discord

1. In your Discord server, open **Server Settings → Integrations → Webhooks → New Webhook**.
2. Choose the channel that should receive the messages, then **Copy Webhook URL**.
3. In Rekordly, open **Settings → Notifications → Push to phone** and paste the URL into **Discord webhook URL**.

Messages arrive as rich embeds — color-coded by level (info/warn/error) so you can see at a glance what happened.

## Setting up Telegram

1. Message **@BotFather** on Telegram and create a bot (`/newbot`). Copy the **bot token**.
2. Message your new bot once (any text — this opens the chat), then get your **chat ID**:
   - Message **@userinfobot** and it replies with your ID, or
   - Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and read the `chat.id` value.
3. In Rekordly, paste the **bot token** and **chat ID** into the Telegram fields.

## Events you can subscribe to

Each event has its own toggle under **Settings → Notifications → Push to phone**:

| Event | Default |
| --- | --- |
| Creator went live | On |
| Recording started | On |
| Recording saved (finished successfully) | On |
| Recording failed | On |
| Cloud upload finished | Off |

## Remote control from Telegram

On Telegram, pushes can do more than inform — live and recording pushes carry **interactive buttons**: start a recording (with defaults or the full options wizard), and pause, resume, or stop a running capture, all from the chat. Discord webhooks are one-way only, so buttons are a Telegram exclusive.

Everything is included in the free app; see [Remote Control](remote-control) for the full button list and security notes.

## Test before you rely on it

Hit **Send test notification** after entering your credentials. Rekordly saves the current values first, then sends a test message through every configured channel and tells you which ones actually delivered.

## Notes

- The **Enabled** master switch gates all push channels — turn everything off without deleting your credentials.
- Failed pushes are logged, and a dead webhook triggers a rate-limited warning in the in-app notification center (at most one per 10 minutes per channel) instead of spamming you on every recording.
- Credentials stay local in your app settings and are only sent to the Discord/Telegram APIs you configured.
