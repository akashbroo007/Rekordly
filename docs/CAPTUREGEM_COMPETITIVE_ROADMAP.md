# CaptureGem Competitive Analysis & Feature Roadmap

> **Document Purpose:** Complete competitive analysis of CaptureGem (capturegem.com) vs Rekordly, with a prioritized implementation roadmap to achieve feature parity and differentiation.
>
> **Last Updated:** 2026-08-25
>
> **CaptureGem Version Analyzed:** 2.14.7

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [CaptureGem Deep Dive](#2-capturegem-deep-dive)
3. [Rekordly Current State](#3-rekordly-current-state)
4. [Full Feature Comparison](#4-full-feature-comparison)
5. [Rekordly's Competitive Advantages](#5-rekordlys-competitive-advantages)
6. [Feature Implementation Roadmap](#6-feature-implementation-roadmap)
   - [Tier 1 — Critical](#tier-1--critical)
   - [Tier 2 — Important](#tier-2--important)
   - [Tier 3 — Enhancement](#tier-3--enhancement)
7. [Architecture Changes Required](#7-architecture-changes-required)
8. [Monetization Strategy](#8-monetization-strategy)
9. [Implementation Priority Matrix](#9-implementation-priority-matrix)

---

## 1. Executive Summary

### CaptureGem
- **Type:** Closed-source desktop app (freemium)
- **Tech Stack:** Electron.js (TypeScript/MUI Joy) UI + Golang recording engine (`recorderd.exe`)
- **Platforms:** Windows, macOS, Linux
- **Pricing:** Free tier (limited) + Premium at $10.99/month
- **Downloads:** 21,685
- **Community:** 5,000+ Discord members
- **Supported Sites:** 130+ (16 built-in cam sites + 120+ streaming platforms)
- **Revenue Model:** Subscriptions + 30% affiliate commissions + CamTrove archive service
- **Key Differentiator:** VR recording, proxy mode, cross-site grouping, built-in editor

### Rekordly
- **Type:** Source-available desktop app (PolyForm Noncommercial licensed, free for personal use)
- **Tech Stack:** Electron 37 + React 19 + TypeScript 5.9 + Tailwind CSS v4 + SQLite (Drizzle ORM)
- **Platforms:** Windows only (build config; codebase is cross-platform)
- **Pricing:** Free for personal/noncommercial use; commercial use requires a paid license
- **Supported Sites:** 4 plugins (YouTube, Twitch, Stripchat, Chaturbate) + yt-dlp generic support for 1000+ sites
- **Key Differentiator:** Plugin architecture, source-available, analytics, generic download manager

### Gap Summary
CaptureGem has **~15 features** Rekordly lacks. Rekordly has **~10 features** CaptureGem lacks. The critical gaps are: platform coverage, VR support, proxy mode, video editor, and live monitoring.

---

## 2. CaptureGem Deep Dive

### 2.1 Business Model

CaptureGem operates on a **freemium subscription model**:

| Tier | Price | Limitations |
|------|-------|-------------|
| **Free** | $0 | Limited concurrent recordings, limited duration, no auto-record, no auto-restart, no cross-site groups, no proxy, no built-in browser |
| **Premium** | $10.99/month | Unlimited concurrent recordings, unlimited duration, auto-record on go-live, auto-restart after disconnects, cross-site grouping, proxy mode, built-in browser, CamTrove Premium access |

**Payment Methods:** Credit card (via payment processor), Bitcoin/crypto (via CamTrove legacy site), PayPal, Cash App (via Discord, minimum 3 months/$32)

**Additional Revenue:**
- 30% affiliate commission program
- CamTrove Premium (archive of thousands of recordings, bundled with CaptureGem Premium)
- Featured site partnerships (CamDirectory, CamRecord, RecordHer, etc.)

### 2.2 Complete Feature Set

#### Core Recording
| Feature | Details |
|---------|---------|
| Multi-threaded recording engine | Golang-based `recorderd.exe` handles actual recording via WebSocket communication with UI |
| Unlimited concurrent models | Premium: record as many streams as bandwidth allows |
| Unlimited recording duration | Premium: no time cap on recordings |
| Auto-record on go-live | Premium: automatically starts recording when model comes online |
| Auto-restart after disconnect | Premium: resumes recording after network timeouts or stream drops |
| All files saved as .mp4 | Universal format for easy playback |
| MKV recording support | Added in v2.14.5 for better corruption resilience |
| Concurrent transcoders | Parallel post-recording processing (v2.14.3+) |

#### Platform Support
| Category | Count | Examples |
|----------|-------|---------|
| Built-in cam sites | 16 | Chaturbate, Stripchat, Stripchat VR, BongaCams, CamSoda, MyFreeCams, Flirt4Free, Streamate, Jerkmate, Cams.com, Cam4, XLoveCam, Dreamcam VR, SexLikeReal, AmateurTV, Sexchat.hu |
| Other streaming platforms | 130+ | Twitch, Kick, TikTok, Dailymotion, Bigo Live, Bilibili, Trovo, Picarto, DLive, Huya, +120 more |
| **Total** | **146+** | Just paste any stream URL — auto-detects site |

#### VR Support
| Feature | Details |
|---------|---------|
| VR stream recording | Records both VR and non-VR streams in top quality resolution |
| VR format support | Side-by-Side (SBS) format |
| Recommended viewer | HereSphere (Steam) — Fisheye, SBS, FOV 120 |
| Stripchat VR | Dedicated VR strip site support |

#### Review & Management
| Feature | Details |
|---------|---------|
| Auto-generated image grids | Thumbnail grids for quick visual review of recordings |
| Favorites system | Mark and filter favorite recordings |
| Tags | Organize recordings with custom tags |
| Deletion protection | Prevent accidental deletion of important recordings |
| Sort and filter | Multiple sorting and filtering options |

#### Live Monitoring
| Feature | Details |
|---------|---------|
| Live monitor | Real-time thumbnails of all active recordings |
| Zero extra bandwidth | Monitors without consuming additional bandwidth (screenshot-based) |
| Dashboard view | See all active recordings at a glance |

#### Editing
| Feature | Details |
|---------|---------|
| Built-in video editor | Edit and combine recordings |
| Segment trimming | Keep only favorite segments |
| Timeline-based | Visual timeline for editing |

#### Advanced Features
| Feature | Details |
|---------|---------|
| Cross-site model grouping | Group models from multiple sites; continue from another site if model goes offline/private |
| Proxy mode | Route browser traffic through CaptureGem to record private shows, unsupported sites, and saved recordings |
| Built-in web browser | Optional browser to help with rate limiting |
| Keyboard shortcuts | Global shortcuts for common actions (v2.14.4+) |
| Color theme customization | Beyond dark/light themes (v2.14.4+) |
| Settings tooltips | Hover over settings to see explanations |

#### Community & Ecosystem
| Feature | Details |
|---------|---------|
| Discord community | 5,000+ members, support channel |
| CamTrove Premium | Archive of thousands of recordings included with premium |
| Affiliate program | 30% commissions for referrals |
| Model directory | Browse and discover models |
| Recording status page | Public uptime/status page |
| Blog | Development updates and changelogs |
| Product Hunt presence | Listed and reviewed |
| Trustpilot reviews | Third-party review platform |

### 2.3 Tech Architecture

```
+---------------------------------------------------+
|                CaptureGem.exe                      |
|  (Electron.js UI -- TypeScript + MUI Joy)         |
|  +-----------------------------------------------+|
|  |  Renderer Process (React)                      ||
|  |  - Dashboard, Recording, Review, Settings      ||
|  |  - Live Monitor Grid                           ||
|  |  - Video Editor                                ||
|  |  - Built-in Browser                            ||
|  +-----------------------------------------------+|
|                    | WebSocket                      |
|  +-----------------------------------------------+|
|  |  recorderd.exe (Golang child process)          ||
|  |  - Multi-threaded recording engine             ||
|  |  - Stream extraction & download                ||
|  |  - State management                            ||
|  |  - Concurrent transcoders                      ||
|  +-----------------------------------------------+|
+---------------------------------------------------+
```

**Key architectural note:** CaptureGem separates the UI (Electron/TypeScript) from the recording engine (Golang) via WebSocket. This allows the recording engine to handle high-concurrency multi-threaded work efficiently. Rekordly uses Node.js for everything (via yt-dlp/ffmpeg child processes).

---

## 3. Rekordly Current State

### 3.1 Existing Features

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-platform monitoring | ✅ | YouTube, Twitch, Stripchat, Chaturbate via plugins |
| Auto-record on go-live | ✅ | Free — no paywall (CaptureGem locks this behind premium) |
| Auto-restart after disconnect | ✅ | Resume recording with fresh stream URL extraction |
| Generic video download manager | ✅ | yt-dlp integration for 1000+ sites (CaptureGem doesn't have this) |
| Unified media library | ✅ | Search, sort, filter, tag, favorite, collections |
| Built-in video player | ✅ | Fullscreen, speed control, PiP, keyboard shortcuts |
| Plugin architecture | ✅ | Full SDK with manifest, capabilities, permissions (CaptureGem is hardcoded) |
| Analytics dashboard | ✅ | Success rates, platform breakdown, storage trends (CaptureGem has none) |
| Command palette | ✅ | Ctrl+K global search (CaptureGem lacks this) |
| Creator management | ✅ | Search, add, tag, favorite, import/export (JSON/CSV) |
| Dashboard | ✅ | Real-time overview, system health, storage, status |
| Notification center | ✅ | In-app + desktop OS notifications |
| First-launch onboarding | ✅ | Spotlight tour with guided steps |
| Storage management | ✅ | Disk usage analysis, cleanup, largest files |
| File verification | ✅ | Post-recording integrity checks |
| Settings (11 tabs) | ✅ | General, Appearance, Recording, Downloads, Plugins, Notifications, Performance, Developer, Privacy, TOS, Supported Sites |
| Low-Resource Mode | ✅ | Auto-detected or manual; caps concurrency, disables animations |
| System tray | ✅ | Close-to-tray, start minimized, launch at startup |
| Dark/Light theme | ✅ | Synced with native OS theme |
| Settings import/export | ✅ | JSON file backup/restore |
| Custom naming templates | ✅ | `{creator}_{date}_{time}` with configurable patterns |
| Recording resume | ✅ | Part-file merging for interrupted recordings |
| Stale job cleanup | ✅ | Auto-fails jobs left non-terminal by crashes |

### 3.2 Existing Plugins

| Plugin | Platform | Auth Method | API Used |
|--------|----------|-------------|----------|
| YouTube | youtube.com | API key (free) | Data API v3 |
| Twitch | twitch.tv | Client-ID + Secret | Helix API |
| Stripchat | stripchat.ooo | Session cookies | HTML scraping + headless browser |
| Chaturbate | cht.xxx | Session cookies | HTML scraping |
| Example | (template) | N/A | Starter template |

### 3.3 Tech Stack Details

| Layer | Technology |
|-------|------------|
| Monorepo | pnpm workspaces (pnpm 9+) |
| Desktop shell | Electron 37 (electron-vite 4, electron-builder 26) |
| Renderer | React 19 + TypeScript 5.9 |
| Routing | react-router-dom v7 (HashRouter) |
| State | Zustand 5 |
| Server-state | TanStack React Query v5 |
| Styling | Tailwind CSS v4 |
| Animations | Framer Motion 12 |
| Icons | lucide-react |
| UI components | Custom `@rekordly/ui` package |
| Database | better-sqlite3 (SQLite, WAL mode) |
| ORM | Drizzle ORM (8 migrations) |
| Recording | ffmpeg + yt-dlp binaries |
| Browser automation | playwright-core (Stripchat plugin) |

### 3.4 Database Schema (17 tables)

`settings`, `plugins`, `plugin_data`, `plugin_settings`, `creators`, `tags`, `creator_tags`, `collections`, `recording_jobs`, `recordings`, `collection_recordings`, `recording_tags`, `download_queue`, `upload_queue`, `background_jobs`, `monitoring_jobs`, `logs`, `notifications`

### 3.5 IPC Architecture

- ~130+ typed IPC channels in `@rekordly/shared/contracts`
- Renderer -> `window.desktop.*` (preload bridge) -> ipcRenderer.invoke() -> Main process -> Services -> Database
- Event channels for real-time updates: monitoring, recording, download, plugin, notification events

---

## 4. Full Feature Comparison

### 4.1 Core Features

| Feature | CaptureGem | Rekordly | Winner |
|---------|-----------|----------|--------|
| Auto-record on go-live | Premium only ($10.99/mo) | Free (no paywall) | **Rekordly** |
| Auto-restart after disconnect | Premium only | Yes (with fresh stream extraction) | **Rekordly** |
| Unlimited concurrent recordings | Premium only | Free (configurable max) | **Rekordly** |
| Unlimited recording duration | Premium only | Free (no cap) | **Rekordly** |
| Built-in video editor | Yes | No | **CaptureGem** |
| Live monitor (thumbnail grid) | Yes (zero extra bandwidth) | No | **CaptureGem** |
| Cross-site model grouping | Premium only | No | **CaptureGem** |
| Proxy mode (private shows) | Premium only | No | **CaptureGem** |
| Built-in browser (rate limiting) | Premium only | No | **CaptureGem** |
| MKV recording format | Yes (v2.14.5+) | No | **CaptureGem** |
| Concurrent transcoders | Yes (v2.14.3+) | No | **CaptureGem** |
| Keyboard shortcuts | Yes (v2.14.4+) | Limited | **CaptureGem** |
| Color theme customization | Yes (v2.14.4+) | Dark/Light only | **CaptureGem** |
| Settings tooltips | Yes | No | **CaptureGem** |

### 4.2 Platform Coverage

| Feature | CaptureGem | Rekordly | Winner |
|---------|-----------|----------|--------|
| Built-in cam sites | 16 | 4 | **CaptureGem** |
| Total supported platforms | 146+ | 4 plugins + yt-dlp 1000+ | **Tie** (different approaches) |
| Plugin/extension system | No (hardcoded) | Yes (full SDK) | **Rekordly** |
| Generic URL download | No | Yes (yt-dlp) | **Rekordly** |

### 4.3 UX & Management

| Feature | CaptureGem | Rekordly | Winner |
|---------|-----------|----------|--------|
| Analytics dashboard | No | Yes | **Rekordly** |
| Command palette (Ctrl+K) | No | Yes | **Rekordly** |
| Onboarding flow | No | Yes (spotlight tour) | **Rekordly** |
| Storage management | No | Yes (disk analysis, cleanup) | **Rekordly** |
| Notification center | No | Yes | **Rekordly** |
| File verification | No | Yes | **Rekordly** |
| Creator import/export | No | Yes (JSON/CSV) | **Rekordly** |
| In-app video player | Review tab (screenshots) | Full player (PiP, speed, seek) | **Rekordly** |
| Recording resume (part merge) | Basic restart | Part-file merging | **Rekordly** |
| Low-Resource Mode | No | Yes (auto-detected) | **Rekordly** |
| Settings tabs | 1 basic settings page | 11 detailed tabs | **Rekordly** |
| Settings import/export | No | Yes (JSON backup) | **Rekordly** |

### 4.4 Platform & Distribution

| Feature | CaptureGem | Rekordly | Winner |
|---------|-----------|----------|--------|
| Windows | Yes | Yes | **Tie** |
| macOS | Yes (Apple Silicon + Intel) | No (build config only) | **CaptureGem** |
| Linux | Yes | No (build config only) | **CaptureGem** |
| Source-available | No (closed-source) | Yes (PolyForm Noncommercial) | **Rekordly** |
| No signup required | Yes | Yes (local app) | **Tie** |

### 4.5 Community & Ecosystem

| Feature | CaptureGem | Rekordly | Winner |
|---------|-----------|----------|--------|
| Discord community | 5,000+ members | None | **CaptureGem** |
| Affiliate program | 30% commissions | None | **CaptureGem** |
| Archive service (CamTrove) | Yes (bundled with premium) | None | **CaptureGem** |
| Model directory | Yes | None | **CaptureGem** |
| Blog/changelog | Yes | None | **CaptureGem** |
| Product Hunt listing | Yes | None | **CaptureGem** |
| Trustpilot reviews | Yes | None | **CaptureGem** |
| Reddit presence | r/CaptureGemApp | None | **CaptureGem** |

### 4.6 Pricing & Monetization

| Feature | CaptureGem | Rekordly | Winner |
|---------|-----------|----------|--------|
| Free tier | Yes (limited) | Yes (unlimited, all features) | **Rekordly** |
| Premium tier | $10.99/month | Commercial license for business use | N/A |
| Crypto payment | Yes (Bitcoin) | None | N/A |
| Source-available | No | Yes (PolyForm Noncommercial) | **Rekordly** |

---

## 5. Rekordly's Competitive Advantages

These are features where Rekordly **already beats** CaptureGem and should be leveraged in marketing:

### 5.1 Free for Personal Use
- **No $10.99/month subscription** — all features free for personal use, including auto-record, unlimited recordings, unlimited duration
- PolyForm Noncommercial licensed — community can contribute, fork, and audit code
- No account required, no data sent to servers
- **Marketing angle:** "CaptureGem charges $10.99/mo for features we give you for free"

### 5.2 Plugin Architecture
- Extensible plugin SDK — any developer can add new platforms
- CaptureGem is closed/hardcoded — adding a new site requires their team
- Rekordly can support any platform via community plugins
- **Marketing angle:** "Support any platform — built by us or the community"

### 5.3 Generic Download Manager
- yt-dlp integration supports 1000+ sites out of the box
- CaptureGem only supports its listed 146 sites
- Paste any URL from any video site and download
- **Marketing angle:** "Record from any site — not just the ones we listed"

### 5.4 Analytics Dashboard
- Recording success rates, platform breakdown, storage consumption trends
- CaptureGem has zero analytics features
- **Marketing angle:** "Track your recording success and optimize your setup"

### 5.5 Command Palette (Ctrl+K)
- Power-user productivity — quick access to any feature
- CaptureGem lacks this entirely
- **Marketing angle:** "Keyboard-first design for power users"

### 5.6 Storage Management
- Disk usage analysis, cleanup tools, largest files analysis
- CaptureGem has no storage management
- **Marketing angle:** "Never run out of disk space — built-in storage analyzer"

### 5.7 File Verification
- Post-recording integrity checks ensure recordings are playable
- CaptureGem has no verification
- **Marketing angle:** "Every recording is verified — no corrupted files"

### 5.8 Creator Import/Export
- JSON/CSV import/export for creator lists
- CaptureGem has no portability features
- **Marketing angle:** "Your data is portable — export and import anytime"

### 5.9 In-App Video Player
- Full-featured player with playback speed, PiP, keyboard shortcuts
- CaptureGem only has screenshot-based review (no playback)
- **Marketing angle:** "Watch recordings without leaving the app"

### 5.10 Recording Resume & Part Merging
- Sophisticated resume system that merges part files from interrupted recordings
- CaptureGem has basic restart but no part merging
- **Marketing angle:** "Never lose a recording — smart resume and merge"

### 5.11 Low-Resource Mode
- Auto-detected hardware tier; caps concurrency, disables animations
- CaptureGem has no equivalent
- **Marketing angle:** "Works great even on older hardware"

### 5.12 Onboarding Tour
- First-launch spotlight walkthrough of all features
- CaptureGem has no onboarding
- **Marketing angle:** "Up and running in 60 seconds"

---

## 6. Feature Implementation Roadmap

### Tier 1 — Critical

These features are **must-haves** to compete head-to-head with CaptureGem.

---

#### Feature 1: New Cam Site Plugins

**What CaptureGem does:**
- 16 built-in cam sites: Chaturbate, Stripchat (+VR), BongaCams, CamSoda, MyFreeCams, Flirt4Free, Streamate, Jerkmate, Cams.com, Cam4, XLoveCam, Dreamcam VR, SexLikeReal, AmateurTV, Sexchat.hu
- Each has optimized quality settings and site-specific handling

**Current Rekordly state:**
- 4 plugins: YouTube, Twitch, Stripchat, Chaturbate
- Plugin SDK is mature and ready for new plugins
- Example plugin template exists

**Plugins to create (priority order):**
1. **BongaCams** — Popular cam site, HTML scraping approach (similar to Chaturbate)
2. **CamSoda** — Major cam site, similar architecture to Chaturbate
3. **MyFreeCams** — Unique token-based streams, needs custom extraction
4. **Flirt4Free** — Premium cam site, needs auth handling
5. **Streamate** — High-end platform, complex stream extraction
6. **Jerkmates** — Newer platform, growing user base
7. **Cam4** — International platform, large model base
8. **XLoveCam** — European platform
9. **Dreamcam VR** — VR-specific cam site
10. **SexLikeReal** — VR content platform
11. **AmateurTV** — Amateur-focused platform
12. **Cams.com** — Major mainstream cam site
13. **Sexchat.hu** — Hungarian platform (CaptureGem supports it)

**Implementation approach:**
- Each plugin follows the existing pattern in `plugins/chaturbate/` or `plugins/stripchat/`
- Requires: `manifest.json`, plugin entry point implementing `Plugin` interface
- Capabilities needed per plugin: `auth`, `creator-search`, `live-detection`, `stream-extraction`, `health-check`, `metadata`
- Auth methods vary: cookies (most), API tokens (some), OAuth (rare)
- Study each site's stream extraction mechanism (HLS manifest, WebSocket, or direct URL)

**Files to create per plugin:**
```
plugins/{site}/
  manifest.json
  src/
    index.ts          # Plugin implementation
    auth.ts           # Authentication handling
    stream.ts         # Stream URL extraction
    search.ts         # Creator search
    types.ts          # Platform-specific types
```

**Estimated effort:** 2-4 hours per plugin (8-12 hours for complex ones like MyFreeCams, Streamate)

---

#### Feature 2: VR Stream Recording Support

**What CaptureGem does:**
- Records VR streams in top quality (Side-by-Side format)
- Dedicated Stripchat VR and Dreamcam VR support
- VR recordings best viewed with HereSphere (Steam): Fisheye, SBS, FOV 120
- VR streams use different URL patterns and manifest formats

**Current Rekordly state:**
- No VR-specific handling
- Standard stream recording only
- No VR format detection

**Implementation plan:**

**A. Plugin SDK Changes (`packages/plugin-sdk/src/`):**
- Add new capability: `vr-detection` to `capabilities.ts`
- Add `isVR` flag to `StreamObject` in `@rekordly/shared`
- Add VR format metadata to stream extraction results

**B. Recording Service Changes (`packages/core/src/recording/service.ts`):**
- Detect VR streams via `isVR` flag from plugin
- Preserve VR stream format (don't re-encode SBS)
- Add VR-specific metadata to recording records
- Add VR tag/category in library

**C. UI Changes:**
- Add VR badge/filter in Library page
- VR settings in Recording settings (format preservation)
- VR-specific thumbnail generation (capture from SBS frame)

**D. Database Changes:**
- Add `isVR` boolean column to `recordings` table
- Add `vrFormat` text column (e.g., 'sbs', 'top-bottom')

**Files to modify:**
- `packages/plugin-sdk/src/capabilities.ts` — add vr-detection
- `packages/plugin-sdk/src/types.ts` — add VR types
- `packages/shared/src/stream.ts` — add isVR to StreamObject
- `packages/core/src/recording/service.ts` — VR-aware recording
- `packages/database/src/schema.ts` — add VR columns
- `apps/desktop/src/renderer/src/pages/library.tsx` — VR filter/badge

**Estimated effort:** 8-12 hours

---

#### Feature 3: Proxy Mode for Private Shows

**What CaptureGem does:**
- Routes browser traffic through CaptureGem's proxy
- Records private shows that aren't directly accessible via stream URL
- Records from unsupported sites via browser capture
- Records saved/archived recordings from cam sites
- Windows, macOS, and Linux guides available

**Current Rekordly state:**
- No proxy mode
- No browser-based recording
- Only direct stream URL extraction

**Implementation plan:**

**A. New Core Service (`packages/core/src/services/proxy-service.ts`):**
- Local HTTP proxy server (using Node.js `http` module or a library like `http-proxy`)
- Intercept browser requests and capture video streams
- Route traffic through the proxy when enabled
- Capture HLS/DASH manifests and video segments

**B. Plugin SDK Changes:**
- New capability: `browser-capture` — plugins can declare support for browser-based recording
- New permission: `proxy` — for plugins that need proxy access

**C. Browser Integration:**
- Use playwright-core (already in dependencies) to launch a configured browser
- Browser goes through the local proxy
- Proxy captures video stream URLs from network requests
- Automatically start recording when video stream is detected

**D. UI Changes:**
- New "Proxy" section in Settings (port, auto-start, browser path)
- "Record via Proxy" button on creator cards
- Proxy status indicator in dashboard/status bar
- Guide/tutorial for setting up proxy in external browsers

**E. Database Changes:**
- Add `proxy_enabled` setting
- Add `proxy_port` setting
- Add `recording_method` column to `recording_jobs` ('direct' | 'proxy')

**Files to create/modify:**
- `packages/core/src/services/proxy-service.ts` (new)
- `packages/plugin-sdk/src/capabilities.ts` — add browser-capture
- `packages/plugin-sdk/src/permissions.ts` — add proxy permission
- `apps/desktop/src/main/ipc/proxy.ts` (new)
- `apps/desktop/src/renderer/src/pages/settings.tsx` — proxy tab

**Estimated effort:** 16-24 hours (complex feature)

---

#### Feature 4: Built-in Video Editor

**What CaptureGem does:**
- Edit and combine recordings within the app
- Trim to keep only favorite segments
- Visual timeline-based editing
- Export edited segments

**Current Rekordly state:**
- No video editing capabilities
- Users must use external editors

**Implementation plan:**

**A. New Core Service (`packages/core/src/services/editor-service.ts`):**
- Wraps ffmpeg for trim/cut/concat operations
- Operations: trim (start/end), cut (remove segment), concatenate (join segments), split
- All non-destructive editing (original file preserved)
- Output as new file in library

**B. New UI Page (`apps/desktop/src/renderer/src/pages/editor.tsx`):**
- Video player with timeline
- Trim handles (drag start/end markers)
- Cut markers (select region to remove)
- Segment list (ordered list of segments to keep)
- Preview edited result
- Export button (renders via ffmpeg)
- Keyboard shortcuts (space=play/pause, arrow keys=seek, I=in point, O=out point)

**C. IPC Channels:**
- `editor:trim` — trim a recording
- `editor:cut` — remove a segment
- `editor:concat` — join multiple recordings
- `editor:preview` — generate preview of edit
- `editor:export` — render final output

**D. Database Changes:**
- Add `edit_history` JSON column to `recordings` table (non-destructive edit metadata)
- Add `source_recording_id` to link edited recordings to originals

**Files to create/modify:**
- `packages/core/src/services/editor-service.ts` (new)
- `packages/core/src/recording/ffmpeg.ts` — add trim/cut/concat methods
- `apps/desktop/src/main/ipc/editor.ts` (new)
- `apps/desktop/src/renderer/src/pages/editor.tsx` (new)
- `apps/desktop/src/renderer/src/components/editor/` (new components)
- `apps/desktop/src/renderer/src/App.tsx` — add editor route

**Estimated effort:** 20-30 hours

---

#### Feature 5: Live Monitor Grid

**What CaptureGem does:**
- Real-time thumbnails of all active recordings
- Zero extra bandwidth consumption (screenshot-based capture)
- Dashboard view showing all active recordings at a glance

**Current Rekordly state:**
- Dashboard shows active recording count
- No visual thumbnail grid
- No live preview

**Implementation plan:**

**A. New Core Service (`packages/core/src/services/monitor-grid-service.ts`):**
- Periodically capture screenshots from active recording streams
- Use ffmpeg to grab frames at configurable intervals (e.g., every 5-10 seconds)
- Store thumbnails in temp directory
- Emit events for UI updates

**B. New UI Component (`apps/desktop/src/renderer/src/components/monitor/`):**
- Grid layout showing all active recordings
- Each cell: thumbnail image, creator name, platform, elapsed time, file size
- Auto-refresh thumbnails on event
- Click to expand/open in video player
- Configurable grid size (small/medium/large thumbnails)

**C. Dashboard Integration:**
- Add "Live Monitor" section to dashboard
- Or dedicated "Monitor" page in sidebar

**D. Settings:**
- Monitor refresh interval (5s, 10s, 15s, 30s)
- Enable/disable live monitor
- Thumbnail quality setting

**Files to create/modify:**
- `packages/core/src/services/monitor-grid-service.ts` (new)
- `packages/core/src/recording/ffmpeg.ts` — add grabFrame method
- `apps/desktop/src/renderer/src/components/monitor/live-grid.tsx` (new)
- `apps/desktop/src/renderer/src/pages/dashboard.tsx` — add monitor section
- `apps/desktop/src/main/ipc/monitor-grid.ts` (new)

**Estimated effort:** 12-16 hours

---

#### Feature 6: Built-in Browser View

**What CaptureGem does:**
- Optional built-in web browser
- Helps bypass rate limiting by accessing streams through browser context
- Can navigate to cam sites within the app

**Current Rekordly state:**
- No browser view (playwright-core is used headlessly for Stripchat only)

**Implementation plan:**

**A. New UI Component (`apps/desktop/src/renderer/src/components/browser/`):**
- Embedded browser view using Electron's `<webview>` tag or BrowserView
- URL bar for navigation
- Bookmarks for favorite cam sites
- "Record this page" button that triggers proxy recording
- Cookie import from system browsers

**B. Integration with Proxy Mode:**
- Browser view routes through the local proxy
- Auto-detect video streams in the browser
- One-click recording from browser view

**C. Settings:**
- Default homepage
- Cookie import tool
- Browser user-agent configuration

**Files to create/modify:**
- `apps/desktop/src/renderer/src/components/browser/browser-view.tsx` (new)
- `apps/desktop/src/renderer/src/components/browser/url-bar.tsx` (new)
- `apps/desktop/src/renderer/src/components/browser/bookmarks.tsx` (new)
- `apps/desktop/src/main/ipc/browser.ts` (new — webview management)
- `apps/desktop/src/renderer/src/App.tsx` — add browser route/tab

**Estimated effort:** 12-16 hours

---

#### Feature 7: Cross-Site Model Grouping

**What CaptureGem does:**
- Group models from multiple sites (e.g., same model on Chaturbate + Stripchat)
- Continue recording from another site if the model goes offline or private on one site
- Premium feature

**Current Rekordly state:**
- Each creator is tied to a single plugin/platform
- No cross-platform grouping

**Implementation plan:**

**A. Database Changes:**
- New table: `creator_groups` (id, name, notes, createdAt)
- New table: `creator_group_members` (groupId, creatorId)
- Add `groupId` nullable column to `creators` table

**B. Core Service (`packages/core/src/services/group-service.ts`):**
- CRUD operations for groups
- Add/remove creators from groups
- Get all live creators in a group
- Auto-switch: when a creator in a group goes offline, check if same creator (by name/alias) is live on another platform in the group

**C. Monitoring Integration (`packages/core/src/monitoring/service.ts`):**
- When a monitored creator goes offline, check the group for the same creator on other platforms
- Auto-start recording from the alternate platform if live
- Emit 'group-failover' event

**D. UI Changes:**
- New "Groups" section in Creators page
- Create/edit/delete groups
- Add creators to groups (drag-and-drop or select)
- Group card showing all members and their live status
- Settings for auto-failover behavior

**E. IPC Channels:**
- `groups:list`, `groups:create`, `groups:update`, `groups:delete`
- `groups:add-creator`, `groups:remove-creator`, `groups:get-members`

**Files to create/modify:**
- `packages/database/src/schema.ts` — add creator_groups tables
- `packages/database/src/repos/` — add group repository
- `packages/core/src/services/group-service.ts` (new)
- `packages/core/src/monitoring/service.ts` — add failover logic
- `apps/desktop/src/renderer/src/components/creators/group-card.tsx` (new)
- `apps/desktop/src/renderer/src/pages/creators-page.tsx` — add groups tab

**Estimated effort:** 12-16 hours

---

#### Feature 8: Enhanced Auto-Restart After Network Disconnects

**What CaptureGem does:**
- Automatically restarts recordings after network timeouts or disconnects
- Configurable retry settings
- Seamless user experience — recording continues transparently

**Current Rekordly state:**
- Has retry logic with configurable retryCount and retryDelay
- Has resume recording with part-file merging
- Missing: automatic retry without user intervention when stream drops mid-recording

**Implementation plan:**

**A. Enhance Recording Service (`packages/core/src/recording/service.ts`):**
- Add automatic re-extraction and restart on stream failure
- When yt-dlp reports a stream error/disconnect, automatically:
  1. Save current partial file
  2. Re-extract stream URL via plugin
  3. Start new recording to next .partN.mp4
  4. Merge parts when stream ends or recording is stopped
- Add configurable disconnect retry settings:
  - `autoRestartOnDisconnect: boolean`
  - `disconnectRetryDelay: number` (ms)
  - `maxDisconnectRetries: number`

**B. UI Changes:**
- Add auto-restart toggle in Recording settings
- Add disconnect retry delay setting
- Show reconnect attempts in recording job status
- Add 'reconnecting' status to recording jobs

**C. Monitoring Integration:**
- When monitoring detects creator is still live but recording failed, auto-retry

**Files to modify:**
- `packages/core/src/recording/service.ts` — add auto-restart logic
- `packages/shared/src/recording.ts` — add disconnect settings types
- `apps/desktop/src/renderer/src/pages/settings.tsx` — recording tab additions

**Estimated effort:** 8-12 hours

---

### Tier 2 — Important

These features bring Rekordly to full feature parity with CaptureGem.

---

#### Feature 9: MKV Recording Format Support

**What CaptureGem does:**
- Supports MKV (Matroska) container format as alternative to MP4
- MKV is more resilient to corruption (if recording crashes, less data is lost)
- Added in v2.14.5

**Current Rekordly state:**
- Records only to MP4
- Has container normalization (ensures MP4)
- yt-dlp supports MKV natively

**Implementation plan:**

**A. Recording Settings:**
- Add `outputFormat: 'mp4' | 'mkv'` to `RecordingSettings`
- Default to MP4 for compatibility

**B. Recording Service:**
- Pass format to yt-dlp as output template extension
- Update container normalization to handle MKV
- Update thumbnail generation for MKV files

**C. Library:**
- Show format badge on recordings
- Filter by format
- Ensure video player supports MKV (Chromium supports most MKV codecs)

**D. Download Manager:**
- Add format selection for generic downloads

**Files to modify:**
- `packages/shared/src/recording.ts` — add outputFormat
- `packages/core/src/recording/service.ts` — use format in output path
- `packages/core/src/recording/yt-dlp.ts` — pass format option
- `apps/desktop/src/renderer/src/pages/settings.tsx` — format selector

**Estimated effort:** 4-6 hours

---

#### Feature 10: Concurrent Transcoders

**What CaptureGem does:**
- Parallel post-recording processing
- Multiple recordings can be processed (thumbnail, metadata, verification) simultaneously
- Added in v2.14.3

**Current Rekordly state:**
- Sequential post-recording processing
- Each recording goes through verify → thumbnail → metadata one at a time

**Implementation plan:**

**A. Recording Service:**
- Add configurable `maxConcurrentTranscoders` setting
- Use a semaphore/pool pattern for post-recording processing
- Process thumbnail generation, metadata extraction, and verification in parallel for different recordings

**B. Settings:**
- Add `maxConcurrentTranscoders` (default: 2)
- Add note about CPU/RAM impact

**Files to modify:**
- `packages/core/src/recording/service.ts` — add transcoding pool
- `packages/shared/src/recording.ts` — add transcoder settings

**Estimated effort:** 4-6 hours

---

#### Feature 11: Keyboard Shortcuts

**What CaptureGem does:**
- Global keyboard shortcuts for common actions
- Added in v2.14.4

**Current Rekordly state:**
- Video player has keyboard shortcuts
- Command palette (Ctrl+K)
- No global shortcuts for recording actions

**Implementation plan:**

**A. Global Shortcuts (Electron):**
- Register global shortcuts via Electron's `globalShortcut` module
- Default shortcuts:
  - `Ctrl+Shift+R` — Start/stop quick recording
  - `Ctrl+Shift+P` — Open quick download dialog
  - `Ctrl+Shift+M` — Toggle minimize to tray
  - `Ctrl+Shift+L` — Open library

**B. In-App Shortcuts:**
- Recording page: Space=play/pause, R=record, P=pause
- Library: F=favorite, Del=delete, Ctrl+A=select all
- General: Esc=close dialog, /=focus search

**C. Settings:**
- New "Keyboard Shortcuts" section in Settings
- Show all shortcuts with keybindings
- Allow customization (click to rebind)
- Import/export shortcut profiles

**D. Database:**
- Add `keyboard_shortcuts` JSON setting

**Files to create/modify:**
- `apps/desktop/src/main/shortcuts.ts` (new — global shortcut registration)
- `apps/desktop/src/renderer/src/components/settings/keyboard-shortcuts.tsx` (new)
- `apps/desktop/src/renderer/src/pages/settings.tsx` — add shortcuts tab
- Multiple page components — add onKeyDown handlers

**Estimated effort:** 8-10 hours

---

#### Feature 12: Color Theme Customization

**What CaptureGem does:**
- Customizable color themes beyond dark/light
- Added in v2.14.4

**Current Rekordly state:**
- Dark/Light theme synced with OS
- Uses Tailwind CSS with theme variables

**Implementation plan:**

**A. Theme System:**
- Extend theme store with accent color selection
- Predefined color palettes: Blue (default), Purple, Green, Red, Orange, Pink, Teal
- Custom color picker for advanced users
- Apply accent color to primary buttons, links, active states, sidebar highlight

**B. UI Changes:**
- Theme settings in Appearance tab
- Color picker / palette selector
- Live preview of accent color
- Persist selection in settings

**C. CSS Changes:**
- Add CSS custom properties for accent colors
- Update Tailwind config to support dynamic accent colors

**Files to modify:**
- `apps/desktop/src/renderer/src/stores/theme-store.ts` — add accent color
- `apps/desktop/src/renderer/src/pages/settings.tsx` — appearance tab
- `apps/desktop/src/renderer/src/styles/` — add accent color CSS variables
- `apps/desktop/src/renderer/src/components/layout/sidebar.tsx` — use accent color

**Estimated effort:** 6-8 hours

---

#### Feature 13: Settings Tooltips

**What CaptureGem does:**
- Hover over any setting to see an explanation tooltip
- Helps users understand what each setting does

**Current Rekordly state:**
- No tooltips on settings
- Settings are labeled but not explained

**Implementation plan:**

**A. Tooltip Component:**
- Use existing `@rekordly/ui` Tooltip component
- Add info icon (i) next to each setting label
- Tooltip shows on hover with detailed explanation

**B. Settings Content:**
- Add tooltip text to every setting across all 11 tabs
- Examples:
  - "Max Concurrent Recordings" -> "Maximum number of streams to record simultaneously. Lower this if you experience network or performance issues."
  - "Retry Count" -> "Number of times to retry a failed recording before giving up. Higher values help with unstable connections."
  - "Verify Enabled" -> "Run integrity checks on recordings after they finish. Detects corrupted or incomplete files."

**Files to modify:**
- `apps/desktop/src/renderer/src/pages/settings.tsx` — add tooltips to all settings
- Create `apps/desktop/src/renderer/src/data/settings-tooltips.ts` — tooltip content data

**Estimated effort:** 4-6 hours

---

#### Feature 14: macOS + Linux Cross-Platform Builds

**What CaptureGem does:**
- Windows, macOS (Apple Silicon + Intel), and Linux builds
- macOS binaries are code-signed and notarized by Apple
- SHA-256 checksums published for all releases

**Current Rekordly state:**
- Windows only (NSIS installer + portable)
- `electron-builder.yml` only defines `win` targets
- Codebase is cross-platform in principle

**Implementation plan:**

**A. Build Configuration (`electron-builder.yml`):**
- Add `mac` target (dmg + zip, both arm64 and x64)
- Add `linux` target (AppImage + deb)
- Code signing for macOS (requires Apple Developer account)
- Notarization for macOS (requires Apple notary service)

**B. Platform-Specific Code:**
- Review `packages/core/src/fs/paths.ts` — ensure cross-platform paths
- Review system tray implementation — macOS tray behaves differently
- Review file associations — different per platform
- Test proxy/networking on all platforms

**C. CI/CD:**
- Add GitHub Actions workflow for macOS and Linux builds
- Test on all three platforms before release
- Generate SHA-256 checksums

**D. Installer:**
- macOS: DMG with drag-to-Applications
- Linux: AppImage (portable) + .deb (Debian/Ubuntu)

**Files to modify:**
- `electron-builder.yml` — add mac and linux targets
- `.github/workflows/` (new) — CI/CD pipeline
- `packages/core/src/fs/paths.ts` — verify cross-platform
- `apps/desktop/src/main/` — verify platform-specific code

**Estimated effort:** 12-16 hours (including testing)

---

#### Feature 15: Discord Community Integration

**What CaptureGem does:**
- Active Discord server with 5,000+ members
- Support channel, feature requests, bug reports
- Community engagement and feedback

**Current Rekordly state:**
- No community presence

**Implementation plan:**

**A. Create Discord Server:**
- Channels: #general, #support, #feature-requests, #bug-reports, #plugins, #showcase
- Bot for GitHub integration (new issues/PRs posted automatically)
- Pinned guides and FAQ

**B. In-App Integration:**
- Add "Join our Discord" link in About/Help section
- Add Discord link in settings footer
- Optional: Discord Rich Presence (show what you're recording)
- Notification channel for app updates

**C. Plugin Community:**
- Channel for plugin developers
- Plugin showcase and submission
- SDK documentation and guides

**Files to modify:**
- `apps/desktop/src/renderer/src/pages/settings.tsx` — add Discord link
- `apps/desktop/src/renderer/src/components/layout/sidebar.tsx` — add community link
- Create Discord server and configure bots

**Estimated effort:** 4-6 hours (setup) + ongoing community management

---

### Tier 3 — Enhancement

These features add polish and ecosystem depth.

---

#### Feature 16: Affiliate Program System

**What CaptureGem does:**
- 30% commission for referrals
- Custom referral links
- Payout via payment processor

**Implementation plan:**

**A. If monetization is added later:**
- Referral link generation
- Tracking and analytics
- Commission calculation
- Payout integration

**Note:** Only relevant if Rekordly adds a premium tier. Skip for now.

**Estimated effort:** 16-24 hours (when needed)

---

#### Feature 17: Archive/Browsing Service (Like CamTrove)

**What CaptureGem does:**
- CamTrove Premium: archive of thousands of recordings
- Bundled with CaptureGem Premium subscription
- Separate website (camtrove.com)

**Implementation plan:**

**A. Optional Future Feature:**
- Community-contributed recording archive
- Search and browse public recordings
- Download cached recordings
- Would require server infrastructure

**Note:** Significant infrastructure required. Consider only with community growth.

**Estimated effort:** 40+ hours (full web service)

---

#### Feature 18: Model Directory

**What CaptureGem does:**
- Browse and discover cam models
- Featured models page
- Directory moved to separate page

**Implementation plan:**

**A. Local Directory:**
- Aggregate creator metadata from all plugins
- Search across all known creators
- Filter by platform, tags, favorites
- Sort by name, platform, last seen

**B. UI:**
- New "Directory" page in sidebar
- Grid/list view of creators
- Quick-add to monitoring from directory
- Integration with creator search

**Files to create/modify:**
- `apps/desktop/src/renderer/src/pages/directory.tsx` (new)
- `apps/desktop/src/renderer/src/components/directory/creator-card.tsx` (new)

**Estimated effort:** 8-12 hours

---

#### Feature 19: Recording Status Page

**What CaptureGem does:**
- Public recording status page (capturegem.com/recording-status)
- Shows which sites are currently working
- Uptime monitoring

**Implementation plan:**

**A. Plugin Health Dashboard:**
- Run periodic health checks on all enabled plugins
- Display status (healthy/degraded/down) per platform
- Show last successful check time
- Public export of status (optional)

**B. UI:**
- New "Status" section in dashboard or settings
- Platform health cards with status indicators
- Historical uptime chart (optional)

**Files to modify:**
- `apps/desktop/src/renderer/src/pages/dashboard.tsx` — add platform status section
- `packages/core/src/services/` — add health check scheduling

**Estimated effort:** 6-8 hours

---

#### Feature 20: Blog/Changelog Page

**What CaptureGem does:**
- Development blog with release notes
- Feature announcements
- Bug fix details

**Implementation plan:**

**A. In-App Changelog:**
- New "What's New" dialog on update
- Version history page in settings
- Markdown-rendered changelogs
- Check for updates feature

**Files to create/modify:**
- `apps/desktop/src/renderer/src/components/changelog/whats-new-dialog.tsx` (new)
- `apps/desktop/src/renderer/src/pages/settings.tsx` — add changelog tab
- `CHANGELOG.md` in repo root

**Estimated effort:** 6-8 hours

---

## 7. Architecture Changes Required

### 7.1 New Plugin SDK Capabilities

Add to `packages/plugin-sdk/src/capabilities.ts`:

```typescript
// New capabilities to add:
VR_DETECTION: 'vr-detection',        // Detect VR streams
BROWSER_CAPTURE: 'browser-capture',  // Browser-based recording
PROXY_SUPPORT: 'proxy-support',      // Proxy mode support
```

### 7.2 New Database Tables

```sql
-- Cross-site model grouping
CREATE TABLE creator_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE creator_group_members (
  group_id TEXT NOT NULL REFERENCES creator_groups(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, creator_id)
);

-- Edit history for non-destructive editing
ALTER TABLE recordings ADD COLUMN edit_history TEXT; -- JSON
ALTER TABLE recordings ADD COLUMN source_recording_id TEXT REFERENCES recordings(id);
ALTER TABLE recordings ADD COLUMN is_vr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recordings ADD COLUMN vr_format TEXT; -- 'sbs', 'top-bottom'
ALTER TABLE recordings ADD COLUMN output_format TEXT NOT NULL DEFAULT 'mp4'; -- 'mp4', 'mkv'

-- Recording method tracking
ALTER TABLE recording_jobs ADD COLUMN recording_method TEXT NOT NULL DEFAULT 'direct'; -- 'direct', 'proxy'
ALTER TABLE recording_jobs ADD COLUMN reconnect_attempts INTEGER NOT NULL DEFAULT 0;
```

### 7.3 New IPC Channels

```
// Proxy
proxy:start, proxy:stop, proxy:status, proxy:configure

// Editor
editor:trim, editor:cut, editor:concat, editor:preview, editor:export

// Monitor Grid
monitor-grid:start, monitor-grid:stop, monitor-grid:thumbnails

// Groups
groups:list, groups:create, groups:update, groups:delete,
groups:add-creator, groups:remove-creator, groups:get-members,
groups:check-failover

// Browser
browser:navigate, browser:record, browser:cookies-import

// Keyboard Shortcuts
shortcuts:list, shortcuts:update, shortcuts:reset
```

### 7.4 New UI Pages/Components

| Path | Purpose |
|------|---------|
| `pages/editor.tsx` | Video editor page |
| `pages/directory.tsx` | Model directory |
| `components/editor/timeline.tsx` | Video editing timeline |
| `components/editor/trim-controls.tsx` | Trim handles |
| `components/monitor/live-grid.tsx` | Live recording grid |
| `components/browser/browser-view.tsx` | Built-in browser |
| `components/creators/group-card.tsx` | Creator group card |
| `components/settings/keyboard-shortcuts.tsx` | Shortcut settings |
| `components/changelog/whats-new-dialog.tsx` | Update dialog |

### 7.5 New Sidebar Items

Add to sidebar navigation:
- **Monitor** (live grid) — between Recordings and Library
- **Editor** — between Library and Downloads
- **Directory** — between Creators and Recordings (optional)
- **Browser** — between Downloads and Plugins (optional)

---

## 8. Monetization Strategy

### Option A: Keep 100% Free (Current)
- **Pros:** Maximum adoption, community goodwill, source-available simplicity
- **Cons:** No revenue for development, sustainability concerns
- **Recommendation:** Good for initial growth phase

### Option B: Optional Premium Tier
- **Price:** $5-7/month (undercut CaptureGem's $10.99)
- **Premium features:** Priority plugin support, beta features, cloud sync (future)
- **Free features remain:** All current features stay free
- **Pros:** Sustainable development, still competitive
- **Cons:** Complexity of maintaining two tiers

### Option C: Donation/Sponsorship
- GitHub Sponsors, Ko-fi, or Buy Me a Coffee
- One-time or recurring donations
- Sponsor recognition in app
- **Pros:** No feature gating, community-driven
- **Cons:** Unpredictable revenue

### Option D: Services (Future)
- Premium plugins (developed by Rekordly team)
- Custom plugin development
- Priority support
- **Pros:** Revenue without gating core features
- **Cons:** Requires service infrastructure

**Recommendation:** Start with Option A (free), transition to Option C (donations) once community grows, consider Option B if development costs increase significantly.

---

## 9. Implementation Priority Matrix

| Priority | Feature | Effort | Impact | Dependencies |
|----------|---------|--------|--------|--------------|
| **P0** | New Cam Site Plugins (5-6 sites) | 16-24h | Critical | Plugin SDK (exists) |
| **P0** | Enhanced Auto-Restart | 8-12h | High | Recording service |
| **P1** | Live Monitor Grid | 12-16h | High | ffmpeg frame capture |
| **P1** | VR Recording Support | 8-12h | High | Plugin SDK changes |
| **P1** | Proxy Mode | 16-24h | High | New core service |
| **P2** | Built-in Video Editor | 20-30h | Medium | ffmpeg operations |
| **P2** | Cross-Site Grouping | 12-16h | Medium | Database + monitoring |
| **P2** | Built-in Browser | 12-16h | Medium | Electron webview |
| **P2** | Keyboard Shortcuts | 8-10h | Medium | Electron globalShortcut |
| **P3** | MKV Format Support | 4-6h | Low | yt-dlp config |
| **P3** | Concurrent Transcoders | 4-6h | Low | Recording service |
| **P3** | Color Theme Customization | 6-8h | Low | Tailwind CSS |
| **P3** | Settings Tooltips | 4-6h | Low | UI component |
| **P3** | Cross-Platform Builds | 12-16h | Medium | electron-builder |
| **P3** | Discord Community | 4-6h | Medium | External service |
| **P4** | Model Directory | 8-12h | Low | Creator metadata |
| **P4** | Status Page | 6-8h | Low | Health checks |
| **P4** | Changelog Page | 6-8h | Low | Markdown rendering |
| **P5** | Affiliate Program | 16-24h | Low | Monetization needed |
| **P5** | Archive Service | 40+h | Low | Server infrastructure |

### Recommended Implementation Order

**Phase 1 — Core Parity (Week 1-2):**
1. New cam site plugins (BongaCams, CamSoda, MyFreeCams, Flirt4Free)
2. Enhanced auto-restart after disconnects
3. Settings tooltips (quick win)

**Phase 2 — Visual Features (Week 3-4):**
4. Live monitor grid
5. VR recording support
6. Keyboard shortcuts

**Phase 3 — Advanced Features (Week 5-7):**
7. Proxy mode
8. Built-in video editor
9. Cross-site model grouping

**Phase 4 — Polish (Week 8-9):**
10. MKV format support
11. Concurrent transcoders
12. Color theme customization
13. Built-in browser view

**Phase 5 — Ecosystem (Week 10+):**
14. Cross-platform builds
15. Discord community
16. Model directory
17. Status page/changelog

---

## Appendix A: CaptureGem Supported Sites (Complete List)

### Built-in Cam Sites (16)
1. Chaturbate
2. Stripchat
3. Stripchat VR
4. BongaCams
5. CamSoda
6. MyFreeCams
7. Flirt4Free
8. Streamate
9. Jerkmate
10. Cams.com
11. Cam4
12. XLoveCam
13. Dreamcam VR
14. SexLikeReal
15. AmateurTV
16. Sexchat.hu

### Other Supported Platforms (130+)
Twitch, Kick, TikTok, Dailymotion, Bigo Live, Bilibili, Trovo, Picarto, DLive, Huya, +120 more

---

## Appendix B: CaptureGem Premium Feature Comparison

| Feature | Free | Premium |
|---------|------|---------|
| Record unlimited models simultaneously | No | Yes |
| No cap on recording durations | No | Yes |
| Auto-record when models come online | No | Yes |
| Auto-restart after network timeouts | No | Yes |
| Cross-site model grouping | No | Yes |
| Built-in web browser for rate limiting | No | Yes |
| Proxy mode (private shows, unsupported sites) | No | Yes |
| CamTrove Premium access | No | Yes |
| Record from 130+ sites | Yes | Yes |
| Top quality resolution | Yes | Yes |
| Review & manage recordings | Yes | Yes |
| Live monitoring | Yes | Yes |
| Built-in editor | Yes | Yes |
| Settings | Yes | Yes |
| Windows & macOS | Yes | Yes |

---

## Appendix C: CaptureGem Settings Overview

Based on their settings guide, CaptureGem offers:
- **Network:** Timeout settings, disconnect retry, proxy configuration
- **Recording:** Output directory, quality, naming, format (MP4/MKV)
- **Concurrent:** Max recordings, concurrent transcoders
- **Appearance:** Theme (dark/light/custom), language
- **Hotkeys:** Keyboard shortcut configuration
- **Notifications:** Desktop notifications toggle
- **Advanced:** Logging, reset, file locations

---

*End of competitive analysis document.*
