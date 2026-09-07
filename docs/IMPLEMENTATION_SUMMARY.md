# Rekordly — Phase 2 & 3 Implementation Summary

Phases delivered: **2 (Core Infrastructure)** and **3 (Plugin System)**.
Build, typecheck, lint and tests all pass: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` (13 tests).

## Folder tree (relevant additions/changes)

```
packages/
  plugin-sdk/src/            Plugin-facing API surface (core never knows platforms)
    types.ts                 CreatorSearchResult, LiveStatus, HealthStatus, SettingDef, ...
    events.ts                PluginEventBus + plugin lifecycle event types
    settings.ts              PluginSettingsApi + capability
    capabilities.ts          auth / creator-search / live-detection / stream-extraction
                             / settings / health-check / metadata
    plugin.ts                PluginCapabilities, PluginContext (incl. settings), definePlugin
  database/src/
    schema.ts                13 tables: settings, plugins, pluginData, pluginSettings,
                             creators, tags, creatorTags, collections, recordingJobs,
                             recordings, collectionRecordings, logs, notifications
    repositories/            SettingsRepo, PluginRepo, CreatorRepo, RecordingRepo, LogRepo
    drizzle/                 0000_typical_sunset_bain.sql (generated migration)
  core/src/
    events/event-bus.ts      Typed emitter; listener errors are caught, not thrown
    fs/paths.ts              AppDirs resolution + creation (userData, logs, plugins, data)
    config/config-manager.ts Layered config: defaults < user < runtime
    services/settings-service.ts   zod-validated AppSettings, import/export/reset
    services/notification-service.ts  persisted notifications + bus + unread count
    plugin-manager/          loader.ts (discover/read/load via createRequire),
                             manager.ts (lifecycle, permissions, install/update/remove,
                             health, diagnostics, settings), helpers.ts, dto.ts
    plugin-manager/manager.test.ts  9 integration tests (loads the real example plugin)
  shared/src/
    ipc/contracts.ts         IPC_CHANNELS + typed DesktopApi (app/windowControls/logs/
                             settings/plugins/notifications)
    logger.ts                rotating file logging (pino-roll, daily, retention 7)
plugins/
  example/                   mock-platform plugin: mock creator search, live detection,
                             stream extraction, health check, settings (validates SDK)
apps/desktop/src/
  main/index.ts              bootstrap: dirs, logger, DB migration, services, IPC
  main/ipc/                  context.ts, app.ts, settings.ts, plugins.ts,
                             notifications.ts, index.ts
  preload/index.ts           typed DesktopApi bridge (no raw Electron in renderer)
  renderer/src/
    pages/plugins.tsx        Plugin Manager UI (cards, enable/disable, install, update,
                             remove, details, diagnostics, settings form)
    pages/settings.tsx       AppSettings form + import/export/reset
    components/notification-center.tsx   unread badge, list, mark read/all
    components/toast-stack.tsx + stores/toast-store.ts
packages/ui/src/components/  switch.tsx, badge.tsx (new primitives)
```

## Database schema (key tables)

- **plugins**: id, name, version, author, description, license, homepage,
  minAppVersion, entry, state, capabilities (JSON), permissionsRequested /
  permissionsGranted (JSON), enabled, lastError (JSON), installedAt, updatedAt.
- **pluginSettings**: `(pluginId, key)` composite PK, value (JSON), updatedAt.
- **pluginData**: `(pluginId, key)` composite PK, value (JSON), updatedAt —
  plugin-scoped persistent storage.
- **creators**: id, platform, platformId, name, avatarUrl, url; unique `(platform, platformId)`.
- **creatorTags** / **collections** / **collectionRecordings**: M:N relations with cascade.
- **recordingJobs**: one per creator (platformId, creatorId, lastCheckedAt,
  liveStatus, lastLiveAt, isRecording, nextCheckAt).
- **recordings**: resolved stream recordings (title, startedAt, endedAt, durationSec,
  path, sizeBytes, status, format).
- **logs**: all app log lines (source, level, message, data, time) — backs the in-app Logs page.
- **notifications**: title, message, level, read flag — backs the notification center.

## Plugin SDK overview

A plugin is a folder with `manifest.json` + built `dist/index.js` (CJS),
installed under the plugins directory. It exports a module that calls
`definePlugin()` with capabilities:

- **auth**: `getAuthStatus()`, `setAuthStatus()`, `login()`, `logout()`
- **creator-search**: `searchCreators(query)`, `getCreator(platformId)`, `onCreatorUrlChange?`
- **live-detection**: `checkLiveStatus(creatorId)`, `isLiveNow?`, `onLiveStatusChange?`
- **stream-extraction**: `extractStream(creatorId, stream)`, `onStreamReady?`
- **health-check**: `checkHealth()` (latency + optional message)
- **metadata**: `resolveMetadata(creatorId)`, `onMetadataResolved?`
- **settings**: `getSettings()`, `updateSettings(values)`

`PluginContext` gives the plugin a `logger`, a `manifest`, a `settings` API
(schema-declared key/value store persisted in DB), and a `data` API
(arbitrary JSON storage). Plugins declare permissions in the manifest
(network, storage, cookies, notifications, recording); the manager grants
requested permissions at discovery and enable time.

## Plugin lifecycle

1. **Discover**: manager scans the plugins directory for `manifest.json`.
2. **Register**: manifest parsed, validated against the SDK schema, version
   checked against `minAppVersion`; requested permissions granted; record
   upserted (DB) — DTOs served to the renderer.
3. **Load** (startup / enable): module required via `createRequire` (ESM-safe)
   with a 10s timeout; `load()` → `init(ctx)` → `start()` hooks run; health
   checked; state → `ready`.
4. **Run**: plugin answers creator search / live detection / stream extraction
   calls from the scheduler (Phase 4). Events (health change, errors) bubble
   through the event bus → IPC → renderer.
5. **Disable / stop**: `stop()` hook, state → `disabled`, module cached for reload.
6. **Unload**: state → `unloaded`.
7. **Remove**: `stop()` + state → `uninstalled`; directory deleted (unless
   installed into the dev source tree).
8. **Update**: manifest re-read, version compared (`compareSemver`), module
   reloaded with cache-bust.

Failures at any step set `lastError` and a `failed` state, surfaced as a
notification and shown on the plugin card.

## Build confirmation

| Check | Result |
| --- | --- |
| `pnpm build` (9 packages + desktop) | Passed |
| `pnpm typecheck` (8 projects) | Passed |
| `pnpm lint` | Passed (0 problems) |
| `pnpm test` | 13/13 (core plugin-manager 9, recorder queue 4) |

Not started (Phase 4): monitoring scheduler, stream recording, creator pages.
