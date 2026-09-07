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

https://www.cht.xxx

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

# Monitoring

Support monitoring of multiple creators.

Implement efficient polling.

Reuse browser sessions where possible.

Avoid unnecessary browser launches.

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