# Supported Platforms

Rekordly supports the following sites out of the box:

| Site       | Live detection | Recording | Downloads |
| ---------- | :------------: | :-------: | :-------: |
| Chaturbate |       ✓        |     ✓     |     ✓     |
| Stripchat  |       ✓        |     ✓     |     ✓     |
| BongaCams  |       ✓        |     ✓     |     —     |
| CamSoda    |       ✓        |     ✓     |     —     |
| MyFreeCams |       ✓        |     ✓     |     —     |
| Twitch     |       ✓        |     ✓     |     ✓     |
| YouTube    |       ✓        |     ✓     |     ✓     |

## Blocked networks

If your internet provider blocks one of these sites, you do not need a VPN subscription: Rekordly ships with a built-in **Secure Proxy** you can enable per creator with one toggle. See [Recording on Blocked Networks](blocked-networks) for how it works and how to get full speed with Cloudflare WARP.

## Why only these?

Because site support is **not hard-coded**. Each site lives in its own plugin that declares what it can do — live detection, recording, downloads — and the core app discovers capabilities at runtime. Adding a site means writing a plugin, not modifying Rekordly itself.

## How plugins work

Every plugin implements a standard interface: it resolves a creator into a live stream, extracts the metadata the dashboard displays, and provides the details the recorder needs to capture the feed. Capability detection means the dashboard only shows controls a given site actually supports.

Health checks run per-plugin so a broken site (redesigned page, changed URLs) degrades gracefully instead of taking the app down.

## Want another site?

The public plugin SDK and step-by-step guide live in the repository:

- [Plugin SDK](https://github.com/akashbroo007/Rekordly/tree/main/packages/plugin-sdk) — the typed API plugins implement.
- [Writing a plugin](https://github.com/akashbroo007/Rekordly/blob/main/docs/PLUGIN_GUIDE.md) — responsibilities, monitoring, metadata, authentication, error handling, and validation.
- See also [Plugins](plugins) in these docs for the tour.

If you build a plugin, open a pull request — new site plugins are one of the most welcome contribution types.
