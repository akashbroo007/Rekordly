# Changelog

All notable changes to Rekordly will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Camsoda plugin: creator discovery via the /girls SSR listing, cheap vtoken-based
  live polling, token-authed HLS stream extraction, cookie auth, metadata
  (tags, followers, thumbnails, quality variants). Cloudflare bot management is
  handled by the plugin's system-curl (schannel TLS) transport with a node
  fallback — no browser automation needed.

### Fixed

- Recorder: fragmented-MP4 HLS (segments named `*.hls.fmp4`) is now accepted
  by the direct-ffmpeg capture path (`-extension_picky 0`); ffmpeg's HLS
  demuxer previously rejected such segment URLs before reading a single
  segment. Generic capability — no platform knowledge involved.

## [0.1.0] - 2026-08-01

### Added

- Dashboard with real-time stats
- Creator management with CRUD, tags, collections, import/export
- Plugin system with SDK, loader, and example plugin
- Monitoring engine with scheduler and browser pool
- Recording engine with yt-dlp and FFmpeg integration
- Library with 4 view modes, search, sort, filtering
- Download manager with queue, pause/resume/retry
- Upload manager with provider registration
- Settings with categorized sections (General, Appearance, Recording, Downloads, Plugins, Notifications, Performance, Developer)
- Analytics dashboard with charts and statistics
- Logs viewer with search, filtering, and log levels
- Active recordings page with progress tracking
- Notification center with real-time events
- Command palette (Ctrl+K)
- Custom title bar and sidebar
- Status bar with system stats
- Dark theme
- Electron Builder packaging (Windows installer + portable)
- Auto-update service architecture
- SQLite database with Drizzle ORM
- Typed IPC between renderer and main process
