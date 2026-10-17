# Live Monitoring

Live Monitoring is the front door of Rekordly: one dashboard that answers "who is live right now?" across every site you follow.

## How it works

Rekordly checks each tracked creator on a **configurable interval** using the site's plugin. Each check returns a normalized stream object so the dashboard looks the same regardless of the underlying site:

- **Live / offline status**
- **Viewer count**
- **Stream title**
- **Timestamps** for the last check

## Adding a creator

1. Go to **Creators → Add creator**.
2. Choose the site plugin.
3. Enter the creator's username exactly as it appears on the site.
4. Choose a check interval.

The interval is per-creator. A longer interval is friendlier to the site and your network; a tighter one detects streams faster. If you track dozens of creators, the defaults are a sensible middle ground.

## Dashboard status

The dashboard shows each creator as a card with a status indicator:

- **Live** — the creator is streaming right now (with viewers and title).
- **Offline** — last check found no stream.
- **Recording** — an active capture is running for this creator.
- **Error** — the last check failed; hover for details.

## Notifications

When a tracked creator goes live, Rekordly can notify you through:

- **In-app notification center** — a log of live events, recording starts, and errors.
- **Native desktop notifications** — standard Windows toasts, even when the window is closed to tray.
- **Push notifications** — Discord or Telegram messages to your phone, so you know the moment a creator goes live even when the app isn't in view.

Configure the first two under **Settings → Notifications**. Push channels (Discord webhook / Telegram bot) live in **Settings → Notifications → Push to phone** — see [Push Notifications](push-notifications).

On Telegram, the "creator went live" push doubles as a remote control: **Record**, **Pause**, and **Stop** buttons appear right on the message, so a stream can be captured without ever opening the app.
