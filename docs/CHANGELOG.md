# Changelog

All notable changes to Rekordly will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [1.1.0] - 2026-10-25

### Added

- Master "Record All Live": one click records every creator that is live
  right now. Lives in the Creators page header (with the live count), the
  + New menu and the command palette. Reuses the per-creator Record dialog's
  option model — stream type, quality, duration, split — with a checklist of
  the live creators (creators already recording render locked out). The batch
  starts sequentially with per-creator progress and outcomes (started /
  skipped / failed); one creator failing never aborts the rest, and a VR
  stream-type pick never reaches plugins without VR support.
- The "record this creator now" path now shares one implementation across
  the Record dialog, Telegram taps and the batch, closing the missing
  duplicate-session guard on the dialog's IPC path.

### Fixed

- Stop / Cancel no longer freezes the app: capture tree kills run through an
  async taskkill with a handle-kill deadline fallback (the old sync kill
  blocked the main thread per cancel — "Stop All" on N recordings stacked N
  blocking kills).
- App-suspension blocker held while any capture is recording/preparing —
  Windows no longer suspends the laptop under running recordings; suspend
  and resume are logged, and the new event-loop lag probe classifies
  suspension-sized drifts.
- Background plumbing errors no longer pop Electron's fatal dialog —
  uncaughtException / unhandledRejection nets log and continue; stdin EPIPE
  on already-stopped capture and download children is handled.
- Add Creator is idempotent against double-submits (the plugin_id +
  external_id unique race used to surface a raw constraint error).
- Storage sync and prune walks moved off the main loop; resource monitors
  drop to a 10s cadence with a single active recording (was 5s); ffprobe
  container names are comma-trimmed and thumbnail/frame extraction errors
  report the stderr tail instead of the banner.

## [1.0.1] - 2026-10-22

### Fixed

- Settings → Recording: editing the recording-only controls (output directory,
  default quality, max concurrent, retries, thumbnails, metadata, verify,
  naming template) no longer left the Save button permanently disabled —
  the dirty check ignored the recording settings draft. Edits made before the
  settings loaded are also no longer silently dropped.

## [1.0.0] - 2026-10-21

The first stable release. Rekordly is feature-complete for its core
mission — record livestreams, monitor creators, organize the library,
manage downloads, uploads, and plugins — and hardened for daily use.

### Added

- Redesigned app shell: a new top bar with status chips (recording,
  monitoring, disk space, updater — materializing only while relevant),
  a quick-search trigger, a New button, and a Help menu replaces the
  old toolbar.
- Sidebar refinement: accent-bar active state, static count badges,
  Settings pinned above the bottom hairline.
- OLED true-black dark theme: pure neutral-gray surfaces above
  #000000, WCAG-AA-checked text ramp, and disciplined accent use
  (primary button, active nav, progress, focus ring only).
- A shared dropdown system in the UI kit — select, multi-select,
  combobox, and menus on a custom listbox core — replaces every native
  select; a typecheck gate (check-native-selects.mjs) keeps native
  selects out of the renderer.
- Privacy modes card in Settings alongside the page-toolbar toggle.

### Fixed

- Menus, selects, and popovers opened inside modal dialogs no longer
  treat panel clicks as outside-dismissals or render the dialog inert
  (workspace overrides pin a single copy of
  react-dismissable-layer/react-focus-scope).

### Changed

- Website: hero animation cleanup, refreshed 404 page, content and
  style touch-ups.

## [0.2.0] - 2026-10-19

### Added

- Dedicated Downloads page: an add-download bar, grouped rows with
  pause/resume/retry, a filterable summary strip, and an "Open in library"
  handover that lands on the Library's Downloads tab and plays the finished
  file in the built-in player.
- Privacy mode: a one-toggle blur across the Library, Recordings, and Uploads
  pages (thumbnails, titles, failure reasons, share links) for safe screen
  sharing; the toggle lives in every page toolbar.
- Tango Live (tango.me) plugin — the first Marketplace-only plugin. Ships as a
  self-contained zip from rekordly.in instead of riding inside the installer;
  the site marketplace gains Bundled/Marketplace filters and install-a-zip
  steps.
- Bundled plugins can declare an icon (`manifest.icon`); the Plugins page
  tile/card/row render the plugin's own logo through the local media protocol
  instead of a favicon chain.
- In-app bug reporting, a GitHub-driven public roadmap, and Pro licensing
  (website v1 reboot shipped mid-cycle and nests in this release).
- The update notification's "What's new" button now opens the matching
  release-notes page on GitHub.

### Changed

- Website SEO/content refresh: sharper titles and descriptions ("Free Stream &
  Cam Site Recorder for Windows"), keyword FAQs, new blog posts, navbar
  reorder, sitemap update.

## [0.1.1] – [0.1.4] — interim patch releases (2026)

- Platform plugin expansion (including the Camsoda plugin) and the platform
  guides shipped across these patch releases.
- Recorder: fragmented-MP4 HLS (segments named `*.hls.fmp4`) is now accepted by
  the direct-ffmpeg capture path (`-extension_picky 0`); ffmpeg's HLS demuxer
  previously rejected such segment URLs before reading a single segment.
  Generic capability — no platform knowledge involved. Shipped with the
  vendored-ffmpeg blank-recording fixes in v0.1.4.
- Full per-version details live on the GitHub Releases page:
  https://github.com/akashbroo007/Rekordly/releases

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
