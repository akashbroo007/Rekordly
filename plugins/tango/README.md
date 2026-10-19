# Tango Live plugin

Monitor and record livestreams from [Tango Live](https://www.tango.me) — the
plugin ships as a Marketplace add-on and is loaded by Rekordly at runtime.

## What it does

| Capability | Notes |
| --- | --- |
| `auth` | Anonymous visitor sessions are minted automatically via the gateway; no account, no login. Optional: paste your own browser cookies in Settings to appear as your account's visitor (useful for region-gated rooms). |
| `creator-search` | Searches the live-showroom catalog (paged gateway walks, ~5 min cache). |
| `live-detection` | Creator lookup + stream-id probe answers live/offline directly; viewer counts come from the same payloads already fetched. |
| `stream-extraction` | Watches the broadcast, arms HLS access, then relays `master.m3u8` + the best variant through a local HTTP relay. Quality presets are exposed for recording. |
| `settings` | User agent override, optional cookie jar, request timeout. |
| `health-check` | Validates gateway reachability + visitor mint + catalog walk in one pass. |

## How it works (short version)

Tango's tenanted gateway needs a visitor JWT (`Tango-VT` cookie). The plugin
mints one through `visitor-lobby ... check-in`, keeps the whole cookie jar
(authority cookies like `tte`/`ttu` travel with it), and mirrors the browser's
own call rhythm:

1. `check-in` → visitor identity
2. `alias/convert` + `profiles` → creator resolution
3. `stream/v1/id` → live signal (this call also stamps the gateway state)
4. `watch` → playback URL set (a short-lived grant)
5. `token-data` → arms HLS for ~10 s; the relay re-arms before every fetch
6. edge fetches ride the same Fastly POP the seat was minted on

The seat decays behind the scenes: if the edge answers 401, the relay
re-establishes the chain (alias → id → watch → arm) with a freshly minted
visitor, throttled to once per 30 s. Reconnecting to a room that has ended is
reported as offline rather than retried forever.

## Settings

- `userAgent` — override the Chrome UA used for every request.
- `cookies` — optional raw cookie header (one line from your browser).

## Building

```
pnpm --filter @rekordly/plugin-tango typecheck
pnpm --filter @rekordly/plugin-tango build      # tsc → dist (dev artifact)
pnpm --filter @rekordly/plugin-tango bundle     # esbuild → dist/index.js (self-contained)
pnpm --filter @rekordly/plugin-tango package:zip → artifacts/tango-<version>.zip
```

The Marketplace zip is self-contained (manifest + README + icon + bundled
`dist/index.js` + map); it is served from the Rekordly website's plugin
marketplace. The `icon` in the manifest points at the packaged logo so the
desktop Plugins page shows it without web favicon lookups.
