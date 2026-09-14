# Overview

Rekordly is a **source-available desktop app** that watches your favorite creators, records them the moment they go live, and organizes everything into a searchable library. It's free for personal and noncommercial use; commercial use requires a [paid license](license).

It was built around one simple observation: streams worth watching are often live at inconvenient hours, and scrolling through VOD lists afterwards is a losing game. Rekordly turns that chore into a background process — you add a creator once, and the app handles detection, capture, and organization from then on.

## What Rekordly does

- **Live Monitoring** — track creators across multiple streaming sites from one dashboard, with live/offline status, viewer counts, and stream titles updated in real time.
- **Auto-Record** — opt any creator in to automatic recording, with safety rails for disk space, session length, and crashes.
- **Recording & Downloads** — capture streams with bundled yt-dlp + ffmpeg, or paste any supported URL to download VODs and clips.
- **Library & Analytics** — a searchable library with tags, collections, favorites, notes, plus dashboards for recording stats and storage usage.
- **Cloud Uploads** — push finished recordings to Gofile, Catbox, MixDrop, or Google Drive.
- **Desktop Integration** — system tray with live status, native notifications, themes, and a low-resource mode.

## How it works end to end

1. **Add creators** — pick a site plugin, enter the username, and start tracking.
2. **Enable Auto-Record** (optional) — per-creator toggle; recording starts the moment the creator goes live and stops when the stream ends.
3. **Manual recording** — hit record on any live creator with your choice of quality.
4. **Downloads** — paste any supported URL to download VODs or clips.
5. **Library** — browse, tag, favorite, and organize everything you've captured.
6. **Uploads** — send finished files to Gofile, Catbox, MixDrop, or Google Drive.

## Under the hood

Rekordly is an Electron 37 desktop app for Windows, built with React 19, TypeScript, Tailwind CSS, and SQLite via Drizzle ORM. The capture engine shells out to **yt-dlp** and **ffmpeg** — both vendored inside the app, so there is nothing external to install.

The architecture is plugin-first: site support lives in plugins with capability detection and health checks, which means new sites can be added without touching the core app. Everything is local-first — creators, recordings, and the library database live in an SQLite database on your own machine.

## Where to go next

- [Installation](installation) — download and install the app.
- [Getting Started](getting-started) — add your first creator in five minutes.
- [Plugins](plugins) — learn how site support works and how to write your own.
- [FAQ](faq) — quick answers to common questions.
