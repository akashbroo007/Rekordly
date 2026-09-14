# Plugins

Site support in Rekordly ships as **plugins**: self-contained modules that teach the app how one streaming site works. The core app never hard-codes site logic — it discovers plugins, detects their capabilities, and routes work through them.

## Philosophy

- **Plugin first** — a site is a plugin or it does not exist. Support for a new site never requires core changes.
- **Capability detection** — plugins declare what they support (live detection, recording, downloads) and the UI adapts.
- **Health checks** — per-plugin diagnostics detect when a site breaks, so failures stay isolated.

## What a plugin does

A site plugin implements the standard plugin interface from [`@rekordly/plugin-sdk`](https://github.com/akashbroo007/Rekordly/tree/main/packages/plugin-sdk):

1. **Stream extraction** — resolve a creator page into a playable stream for the recorder.
2. **Monitoring** — report whether a creator is live, plus viewer count and stream title.
3. **Metadata** — normalize site-specific details into the standard stream object so the dashboard looks consistent.
4. **Authentication** — handle optional credential flows when a site needs them.

## Lifecycle

Plugins are loaded at startup, initialized with per-plugin settings, and exercised through regular monitoring checks. Health checks track plugin failures over time and surface them in the Plugin Manager.

## Long-lived resources

Some sites need proxies, browser automation, or helper servers. The SDK supports long-lived per-model resources so expensive assets are created once and reused across checks — with cleanup on shutdown.

## Error handling and validation

- Errors are surfaced through the app's notification system and logs, with the plugin as the attribution point.
- Plugins are validated against the SDK interface — a malformed plugin is rejected at load time with a clear message.

## Write your own

The full authoring guide — responsibilities, required interface, monitoring, metadata, authentication, error handling, performance, logging, and validation — is in [docs/PLUGIN_GUIDE.md](https://github.com/akashbroo007/Rekordly/blob/main/docs/PLUGIN_GUIDE.md).

New site plugins are one of the most valuable contributions you can make. If your plugin ships, every Rekordly user can track that site.
