# Build a New Rekordly Plugin

Read the following documentation before making any changes:

1. docs/TECH_STACK.md
2. docs/MASTER_PROMPT.md
3. docs/PRD.md
4. docs/ARCHITECTURE.md
5. docs/DESIGN.md
6. docs/AGENT.md

The documentation is the source of truth.

---

# Objective

Implement a new Rekordly plugin for the target platform.

The implementation must follow the existing Plugin SDK and architecture.

Do NOT modify the core application unless a generic Plugin SDK improvement is required.

If an SDK improvement is needed, implement it in a platform-agnostic way.

---

# Target Platform

dreamcam.com

---

# Plugin Responsibilities

The plugin is responsible for all platform-specific behavior.

This includes:

- Session management
- Authentication (if required)
- Cookie management
- Creator lookup
- Profile parsing
- Live status detection
- Stream extraction
- Metadata extraction
- Quality selection
- Error handling
- Session refresh

The core application must remain unaware of how this platform works.

---

# Required Plugin Interface

Implement the Plugin SDK interfaces for:

- initialize()
- authenticate()
- healthCheck()
- searchCreators()
- getCreator()
- checkLiveStatus()
- getLiveStreams()
- extractStream()
- refreshSession()
- shutdown()

---

# Stream Extraction

Implement stream extraction using the most reliable method supported by the platform.

The plugin may use platform APIs, browser automation, authenticated requests, network interception, or other legitimate techniques as needed.

The core application should receive only the standardized Stream object defined by the Plugin SDK.

---

# Long-Lived Per-Model Resources (proxies, browsers, servers)

If `extractStream` creates anything the recorder consumes AFTER you return
(a local proxy server, a headless browser, an authenticated tunnel), that
resource outlives your function call. This has caused real production bugs —
read these rules before hand-rolling resource tracking:

1. **Use `ProxyRegistry` from `@rekordly/plugin-sdk`.** Do not write your own
   map + eviction loop. It encodes the hard-won rules below and is unit-tested.
2. **Key entries by STABLE model identity** (lowercased username), never by a
   per-extraction URL. Every extraction mints fresh signed URLs — keying by
   URL means re-recording model A evicts some OTHER model's live resource,
   and ffmpeg dies with `Connection refused` on `127.0.0.1:<port>`.
   Same-model re-extract MUST replace its own entry (fresh signed URL); the
   registry returns the displaced entry for you to stop.
3. **Caps count heavy resources, never live consumers.** A proxy that released
   its browser is a tiny local server — evicting it kills a recording to save
   nothing. Cap browser-holding entries; never evict a warming-up entry (the
   registry's startup grace); when nothing is evictable, overflow the cap
   rather than killing a live recording.
4. **The registry never stops anything itself** — stop returned entries
   asynchronously with `.catch(() => undefined)`; a stop failure must never
   fail the extraction.
5. **Self-clean on death.** Wire idle watchdogs / `onIdleStop` callbacks to
   `registry.delete(key)`, and `cleanup()` to stopping everything the
   registry reports, so dead entries never count against live ones.
6. **Packaging constraint.** Bundled plugins ship WITHOUT `node_modules`
   (see `apps/desktop/electron-builder.yml`). Value-imports from
   `@rekordly/plugin-sdk` work in dev via workspace symlinks but resolve in
   the installed app ONLY through the shared copy shipped at
   `resources/plugins/node_modules` — which covers the SDK plus its runtime
   dependencies. If you add a NEW runtime dependency to the SDK, you MUST add
   a matching `extraResources` entry or packaged plugins will fail to load
   (dev will not catch it).

---

# Monitoring

Support monitoring of multiple creators.

Implement efficient polling.

Reuse browser sessions where possible.

Avoid unnecessary browser launches.

---

# Secure Proxy Routing (direct-first with proxy fallback)

Site reachability is a property of the USER'S network — ISP/DNS blocks are regional, never a property of the plugin. The host provides `context.network` (`ensureProxy(identifier)` / `getProxyAgent(identifier)` / `getProxyHttpUrl(identifier)`) and resolves the per-creator opt-in (`creators.use_proxy`) itself.

Follow this pattern for every outbound request that must reach the site:

1. **Attempt DIRECT first** with a short timeout (~8s). Transport-level failures (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, socket hang-up) and block-page signatures (HTML where JSON was expected) are what an ISP block looks like.
2. **On network failure only, retry through the proxy**: `await context.network.ensureProxy(identifier)` (may download and bootstrap the proxy on first use), then retry with `getProxyAgent(identifier)`. HTTP-level answers (404/403, real API errors) are the site talking — never retry those through the proxy.
3. **Stay on the chosen route for the whole fetch cycle** (playlist fetches, variant resolution) so detection and extraction agree.
4. **Set `StreamObject.proxyUrl` only when the extraction actually used the proxy** (`getProxyHttpUrl(identifier)`) — the recorder's child processes (ffmpeg `-proxy` / yt-dlp `--proxy`) then follow the same route. When a system VPN like Cloudflare WARP makes the direct route work, `proxyUrl` stays unset and the embedded proxy never starts.

Reference implementation: `plugins/bongacams/src/index.ts` (`withSmartRoute`, `fetchRoomDataSmart`).

---

# Metadata

Return as much metadata as possible, including:

- Creator ID
- Creator Name
- Stream Title (if available)
- Thumbnail
- Stream Start Time
- Viewer Count (if available)
- Categories/Tags (if available)
- Available Qualities
- Required Headers
- Required Cookies

---

# Authentication

If the platform requires authentication:

- Support login/session handling.
- Securely store credentials or session data using the application's existing storage mechanisms.
- Automatically refresh expired sessions where possible.

---

# Error Handling

Handle:

- Network failures
- Authentication failures
- Missing creators
- Offline creators
- Rate limiting
- Temporary platform changes

Return structured errors compatible with the Plugin SDK.

---

# Performance

- Reuse Playwright browser instances.
- Reuse contexts when appropriate.
- Minimize network requests.
- Avoid memory leaks.
- Support concurrent monitoring.

---

# Logging

Log:

- Authentication events
- Monitoring events
- Live detection
- Stream extraction
- Errors
- Session refreshes

Use the application's centralized logging system.

---

# Validation

Before completion:

- Plugin loads successfully.
- Plugin passes TypeScript.
- Plugin passes ESLint.
- Plugin registers with the Plugin Manager.
- Monitoring works.
- Live detection works.
- Stream extraction works.
- Long-lived resources (if any) use `ProxyRegistry` keyed by stable model
  identity — burst-starting 3+ recordings kills none of them.
- No core architecture violations.

---

# Deliverables

Provide:

1. Files created
2. Files modified
3. Plugin architecture overview
4. Any Plugin SDK improvements made (if any)
5. Validation results
6. Build confirmation

Stop after the plugin is complete.