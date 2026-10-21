# Supported Platforms

Rekordly supports the following 13 sites out of the box (Stripchat and Dreamcam including VR cams), plus a Tango Live plugin available from the [Marketplace](/marketplace):

| Site       | Live detection | Recording | Downloads | VR (3D) |
| ---------- | :------------: | :-------: | :-------: | :-----: |
| Twitch     |       ✓        |     ✓     |     ✓     |    —    |
| YouTube    |       ✓        |     ✓     |     ✓     |    —    |
| Rumble     |       ✓        |     ✓     |     ✓     |    —    |
| Kick       |       ✓        |     ✓     |     ✓     |    —    |
| Chaturbate |       ✓        |     ✓     |     ✓     |    —    |
| Cam4       |       ✓        |     ✓     |     —     |    —    |
| Jerkmate   |       ✓        |     ✓     |     —     |    —    |
| Streamate  |       ✓        |     ✓     |     —     |    —    |
| Stripchat  |       ✓        |     ✓     |     ✓     |    ✓    |
| BongaCams  |       ✓        |     ✓     |     —     |    —    |
| CamSoda    |       ✓        |     ✓     |     —     |    —    |
| MyFreeCams |       ✓        |     ✓     |     —     |    —    |
| Dreamcam   |       ✓        |     ✓     |     —     |    ✓    |
| Tango Live |       ✓        |     ✓     |     ✓     |    —    |

Tango Live is distributed as a **marketplace plugin**: download the zip from the [Marketplace](/marketplace) and install it from inside the app (Plugins → Install plugin). The 13 sites above ship inside the installer itself.

> **One free setup step, twice:** Twitch monitoring uses the Helix API (a free
> Client-ID + Secret) and YouTube monitoring uses the Data API v3 (a free API
> key). You create each key once in Rekordly's Settings — everything else
> works with no account at all.

The **Downloads** column refers to VODs, clips, and past broadcasts handled by
the generic download manager (powered by yt-dlp) — paste a supported URL and
pick a quality. Live-cam sites are archived through live capture, which every
listed site supports.

Stripchat and Dreamcam recordings can capture the **VR (3D) stereoscopic feed** and play it back in the built-in look-around player — see [VR Playback & Recording](vr).

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
