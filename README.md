<div align="center">

<img src="apps/desktop/resources/icons/icon-256x256px.png" width="128" alt="Rekordly logo">

# Rekordly

**Monitor, record, and download live streams — automatically.**

Rekordly is a free, source-available Windows desktop app that monitors
creators, automatically records live streams, downloads videos and VODs,
and organizes your recordings into a searchable library.

The source code is publicly available for inspection, building, and
contribution. Rekordly is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.txt) — free for personal
use, paid for commercial use.

[Download](https://github.com/akashbroo007/Rekordly/releases) •
[Features](#features) •
[Quick Start](#quick-start) •
[Documentation](docs/README.md) •
[Contributing](#contributing)

[![GitHub release](https://img.shields.io/github/v/release/akashbroo007/Rekordly?style=flat-square)](https://github.com/akashbroo007/Rekordly/releases)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm_Noncommercial_1.0.0-blue.svg?style=flat-square)](LICENSE.txt)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows-blue?style=flat-square)](https://github.com/akashbroo007/Rekordly/releases)
[![Electron](https://img.shields.io/badge/Electron-37-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

## Table of Contents

- [Free & Pro](#free--pro)
- [Features](#features)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Supported Platforms](#supported-platforms)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Why Source Available?](#why-source-available)
- [License](#license)

---

## Free & Pro

Rekordly is **free for personal, educational, and other noncommercial use**.
The free tier is a permanent tier, not a trial: unlimited creator monitoring,
unlimited downloads, and full access to the local library, cloud uploads,
and the plugin system.

[Rekordly Pro](https://rekordly.in/pricing) removes the automatic-recording
limits for people who record everything. Commercial use requires a separate
commercial license.

| Capability                       | Free                          | Pro                          |
| -------------------------------- | ----------------------------- | ---------------------------- |
| Monitor creators                 | Unlimited                     | Unlimited                    |
| Add creators                     | Unlimited                     | Unlimited                    |
| Auto-record creators             | Up to 2                       | Unlimited                    |
| Concurrent live recordings       | Up to 5                       | Unlimited                    |
| Live recording length            | Up to 15 minutes per recording| Unlimited                    |
| Manual video/VOD downloads       | Unlimited                     | Unlimited                    |
| Long-form video downloads        | Yes                           | Yes                          |
| Local library                    | Yes                           | Yes                          |
| Community plugins                | Yes                           | Yes                          |
| Commercial use                   | Requires a commercial license | Requires a commercial license|

> **Download Manager and Auto-Recording are separate workflows.** The
> Download Manager is designed for downloading supported non-live videos,
> VODs, and clips and does not impose an artificial duration limit on normal
> downloads — a 45-minute or 3-hour video downloads in full on the free tier.
> The live-recording caps above apply to recording live streams only.

---

## Features

### Live Monitoring

Track creators across multiple streaming sites from one dashboard. Rekordly
checks each creator on a configurable interval and shows live/offline status,
viewer counts, and stream titles in real time.

### Auto-Record

Opt any creator in to automatic recording and never miss a stream again.
Safety rails included:

- **Master pause switch** — halt all auto-recording instantly from Settings
- **Disk-space guardrail** — skips recording when free space drops below your limit
- **Segment splitting** — split long sessions into parts every N minutes
- **Crash recovery** — interrupted recordings are reconciled on next launch

### Recording & Downloads

- High-quality capture powered by vendored **yt-dlp + ffmpeg** — zero external installs
- Download Manager for supported non-live videos, VODs, and clips — no
  artificial duration limit on normal downloads
- Audio-only (MP3) extraction and per-URL quality probing
- Pause / resume / retry, priorities, and bandwidth limits

### Library & Analytics

- Searchable library with tags, collections, favorites, and notes
- Folder scanning to import existing media files
- Dashboard with recording stats, storage breakdown, and job outcomes
- Storage manager with cleanup tools and largest-file insights

### Cloud Uploads

Push finished recordings to the cloud with built-in providers:

| Provider    | Notes                        |
| ----------- | ---------------------------- |
| Gofile      | Optional account token       |
| Catbox      | Optional user hash           |
| MixDrop     | Email + API key              |
| Google Drive| OAuth client + refresh token |

### Desktop Integration

- System tray with live status tooltip and close-to-tray mode
- Launch at startup, start minimized, OS theme sync
- In-app notification center plus native desktop notifications
- Dark and light themes, low-resource mode for weaker machines

### Plugin System — built with the community

Site support is implemented through plugins. Every bundled site is a plugin,
built on the public Plugin SDK, with capability detection, health checks, and
per-plugin settings — new sites can be added without touching the core app.

Developers can create new plugins for platforms Rekordly does not support
yet, and community-built integrations are welcome. Start with
[PLUGIN_GUIDE.md](docs/PLUGIN_GUIDE.md).

---

## Quick Start

### For users

1. Go to the [**Releases**](https://github.com/akashbroo007/Rekordly/releases) page.
2. Download the installer (`Rekordly Setup <version>.exe`) or the portable build
   (`Rekordly-<version>-portable.exe`).
3. Run it — `yt-dlp` and `ffmpeg` are bundled, so there is nothing else to install.
4. Add a creator, optionally enable **Auto-Record**, and you're done.

> Rekordly updates itself: when a new release is published you'll be notified
> in the app and can download + restart to update.

### For developers

**Prerequisites:** [Node.js](https://nodejs.org/) 22+ and
[pnpm](https://pnpm.io/) 9+.

```bash
# Clone the repo
git clone https://github.com/akashbroo007/Rekordly.git
cd Rekordly

# Install dependencies (builds native modules)
pnpm install

# Fetch vendored binaries (yt-dlp + ffmpeg, required for packaging)
pwsh ./scripts/fetch-binaries.ps1

# Run the app in dev mode
pnpm dev
```

Other commands:

```bash
pnpm build       # build all packages + desktop app
pnpm typecheck   # typecheck every workspace package
pnpm package     # build the Windows installer + portable exe
```

---

## Usage

1. **Add creators** — pick a site plugin, enter the username, and start tracking.
2. **Enable Auto-Record** (optional) — per-creator toggle; recordings start the
   moment the creator goes live and stop when the stream ends.
3. **Manual recording** — hit record on any live creator with your choice of quality.
4. **Downloads** — paste any supported URL to download VODs or clips. Normal
   downloads run to completion regardless of length.
5. **Library** — browse, tag, favorite, and organize everything you've captured.
6. **Uploads** — send finished files to Gofile, Catbox, MixDrop, or Google Drive.

---

## Supported Platforms

Platform support can differ per capability — a site may support live
detection and automatic recording but not generic downloads, or vice versa.
The table below reflects what each bundled plugin currently implements.

| Site       | Live detection | Auto-record | Manual recording | Downloads |
| ---------- | :------------: | :---------: | :--------------: | :-------: |
| Chaturbate |       ✓        |      ✓      |        ✓         |     ✓     |
| Stripchat  |       ✓        |      ✓      |        ✓         |     ✓     |
| Twitch     |       ✓        |      ✓      |        ✓         |     ✓     |
| YouTube    |       ✓        |      ✓      |        ✓         |     ✓     |
| BongaCams  |       ✓        |      ✓      |        ✓         |     —     |
| CamSoda    |       ✓        |      ✓      |        ✓         |     —     |
| MyFreeCams |       ✓        |      ✓      |        ✓         |     —     |
| Dreamcam   |       ✓        |      ✓      |        ✓         |     —     |

The Dreamcam plugin also supports **VR (3D) shows** — the stereoscopic feed is
bridged to a local HLS playlist and recorded like any other stream, with a
per-creator preference for VR, 2D, or auto.

Want another site — or better support for an existing one?
See [Writing a plugin](docs/PLUGIN_GUIDE.md).

---

## Tech Stack

| Layer    | Technology                                                              |
| -------- | ----------------------------------------------------------------------- |
| Desktop  | Electron 37, electron-vite                                              |
| UI       | React 19, React Router 7, Tailwind CSS v4, Framer Motion, Radix UI       |
| State    | Zustand, TanStack Query                                                 |
| Language | TypeScript (strict, end to end)                                         |
| Storage  | SQLite via Drizzle ORM + better-sqlite3                                 |
| Capture  | yt-dlp + ffmpeg (vendored, zero user setup)                             |
| Tooling  | pnpm workspaces, ESLint, Prettier, Husky                                |
| Updates  | electron-updater via GitHub Releases                                    |

---

## Project Structure

```
Rekordly/
├── apps/desktop          Electron app (main / preload / renderer)
├── packages/
│   ├── core              Recording, downloads, uploads, monitoring, plugins
│   ├── database          Drizzle schema, migrations, repositories
│   ├── plugin-sdk        Public API for writing site plugins
│   ├── recorder          yt-dlp / ffmpeg wrappers and record queue
│   ├── shared            Shared types and typed IPC contracts
│   └── ui                Shared React components and theme
├── plugins/              Built-in site plugins (chaturbate, stripchat, …)
├── docs/                 Architecture, PRD, design docs, and guides
├── scripts/              Build and maintenance utilities
└── tests/
```

---

## Documentation

Full docs live in [`docs/`](docs/):

- [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design and data flow
- [`PRD.md`](docs/PRD.md) — product requirements
- [`PLUGIN_GUIDE.md`](docs/PLUGIN_GUIDE.md) — how to write a site plugin
- [`TECH_STACK.md`](docs/TECH_STACK.md) — tooling rationale
- [`DESIGN.md`](docs/DESIGN.md) — UI/UX design notes
- [`CHANGELOG.md`](docs/CHANGELOG.md) — release history

---

## Contributing

Rekordly is built in the open, and contributions are genuinely welcome:

- **Bug fixes** and code improvements
- **New platform plugins** and maintenance of existing ones
- **Documentation** — guides, docs pages, README clarity
- **Testing** — unit tests, integration tests, real-world site coverage
- **UX improvements** — flows, copy, accessibility
- **Performance improvements** — capture pipeline, UI responsiveness, memory

The source is publicly available specifically so developers can inspect how
it works, learn from it, contribute improvements, and build the plugin
ecosystem around it.

1. Fork the repo and create a branch (`git checkout -b feat/my-change`).
2. Make your changes with tests where it makes sense.
3. Run `pnpm typecheck` and `pnpm build` to verify.
4. Open a pull request describing what changed and why.

Please keep PRs focused and follow the existing code style (ESLint + Prettier
configs are in the repo; Husky hooks run on commit).

---

## Why Source Available?

Rekordly is intentionally source available. We want developers to be able to
inspect how it works, contribute improvements, and build plugins for
platforms we do not support yet.

At the same time, keeping the project sustainable matters. The official
Rekordly distribution is supported through Pro features and commercial
licensing, which fund ongoing development of the core app and the plugin
ecosystem.

Because Rekordly is source available, you are free to inspect and modify the
code within the license terms. Modified builds are not official Rekordly
releases and are not covered by official support or release guarantees.

---

## License

Rekordly is source-available software licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.txt).

The source code is publicly available and may be used, modified, and shared
within the permissions granted by the license.

- **Personal, educational, and other permitted noncommercial use:** free.
- **Commercial use** is not granted by the PolyForm Noncommercial license
  and requires a separate commercial license from Rekordly — contact
  [hello@rekordly.in](mailto:hello@rekordly.in).
- Rekordly Pro removes the live-recording limits for personal use and is
  available at [rekordly.in/pricing](https://rekordly.in/pricing).

Rekordly is source-available under the PolyForm Noncommercial License —
free for personal, educational, and other noncommercial use; commercial
use requires a paid license.

The capture engine shells out to [yt-dlp](https://github.com/yt-dlp/yt-dlp)
and [ffmpeg](https://ffmpeg.org/) (both vendored for convenience); those
projects retain their own licenses.
