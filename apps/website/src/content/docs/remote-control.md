# Remote Control

Rekordly's push notifications tell you what's happening — **Remote Control** lets you *do* something about it. When a tracked creator goes live, the Telegram push arrives with buttons attached: tap **Record** and the capture starts on your PC, wherever you are.

Remote control works over **Telegram** and is a [Rekordly Pro](https://rekordly.in/pricing) feature. Push notifications themselves stay free for everyone.

## What you can control

| Push | Buttons |
| --- | --- |
| 🔴 *Creator went live* | **⏺️ Record (defaults)** — starts capturing immediately with the best available quality<br>**⚙️ Record with options…** — a three-step wizard: quality → duration → segment split, mirroring the in-app Record dialog<br>**⏹ Stop recording** — shown on pushes for creators that are already auto-recording |
| ⏺️ *Recording started* | **⏸ Pause**, **▶️ Resume**, and **⏹ Stop** for the running capture |

A few behaviors worth knowing:

- **Stopping keeps the partial file** — a recording stopped from chat is treated the same as one stopped in the app: everything captured so far is saved to your library.
- **Menus expire** — if you open the options wizard and don't finish it, tapping an old button tells you so; just tap *Record with options…* again.
- **Feedback is instant** — every button tap is acknowledged in the chat ("Recording paused.", "Recording started (job …)."), and errors surface as a short alert instead of failing silently.

## What's free vs Pro

| | Free | Pro |
| --- | --- | --- |
| Push notifications (Discord + Telegram) | ✓ | ✓ |
| Record / options wizard / Pause / Resume / Stop buttons | — | ✓ |

On the free tier, pushes arrive as plain text — a live push tells you to open the app to record, and includes a **⭐ Get Pro** button that opens the pricing page. Tapping a control button on an older message is answered with the upgrade hint rather than executed.

The gate is checked live: activating or deactivating a license takes effect on the next push, with no restart.

## Setting it up

1. Configure Telegram pushes — see [Push Notifications](push-notifications#setting-up-telegram) for the @BotFather bot token and chat ID steps.
2. That's it. On Pro, the buttons appear automatically on every live and recording push — there is no separate remote-control switch.

If you already had Telegram pushes configured, buttons show up the next time a creator goes live after Pro is active.

## Security

- **Your chat, only your chat.** The bot reacts exclusively to the chat ID(s) configured in Settings — messages and button taps from any other chat are ignored and logged locally as unauthorized.
- **Nothing is exposed on your network.** The app reaches Telegram's API over an outbound long-poll connection; there are no inbound ports or public endpoints to open in your firewall.
- **Credentials stay local.** The bot token and chat ID live in your app settings and are only sent to the Telegram API.

## Why Discord is notification-only

Discord pushes are delivered through **incoming webhooks**, which are strictly one-way — they can deliver an embed to a channel but cannot carry buttons or receive anything back. Interactive control is therefore a Telegram exclusive; Discord pushes show the event text and point you at the app instead. (A two-way Discord *bot* is technically possible and may be considered later, but webhooks alone cannot do it.)

## Requirements in practice

- **Your PC must be on** with Rekordly running (closing to tray is fine) — the bot is your local app talking to Telegram, not a cloud service.
- The **Enabled** master switch under **Settings → Notifications → Push to phone** gates everything, including the buttons.
