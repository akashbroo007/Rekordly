# FAQ

## Is Rekordly really free?

Yes — for personal, educational, and other noncommercial use. Rekordly is source-available software under the [PolyForm Noncommercial license](license). The free tier includes unlimited creator monitoring, unlimited downloads, and full access to the library and plugins — it is a permanent tier, not a trial. Live recordings are capped at 15 minutes, up to 5 at a time, with auto-record on your first 2 creators. [Rekordly Pro](https://rekordly.in/pricing) removes those limits. Companies and other commercial users need a paid commercial license — contact [hello@rekordly.in](mailto:hello@rekordly.in). The vendored yt-dlp and ffmpeg binaries keep their own licenses.

## Do I need to install ffmpeg or yt-dlp?

No. Both are vendored inside the app — download the installer, run it, and you're done. Nothing else to install.

## Which platforms are supported?

Chaturbate, Stripchat, BongaCams, CamSoda, MyFreeCams, Dreamcam, Twitch, and YouTube are supported out of the box for live detection and recording — Dreamcam including VR (3D) shows. New sites can be added as plugins without touching the core app — see [Plugins](plugins) and [Supported Platforms](platforms).

## My ISP blocks one of the sites — can I still record?

Yes. Rekordly ships with a built-in **Secure Proxy**: enable it per creator with one toggle and the app routes that creator's traffic through it automatically — the proxy runtime downloads itself on first use. It runs on the Tor network, so it's slower; if you install Cloudflare WARP (free), Rekordly detects it and recordings automatically go full speed. Details in [Recording on Blocked Networks](blocked-networks).

## How do updates work?

Rekordly updates itself. When a new release is published on GitHub, you get an in-app notification and can download and restart with one click.

## Where is my data stored?

Everything — creators, recordings, the library database — lives locally on your machine in an SQLite database. Nothing is uploaded anywhere unless you explicitly configure a cloud provider.

## Does Rekordly collect telemetry?

No. There is no telemetry, no analytics, and no account system. The source code is publicly available, so you can verify that yourself.

## Is recording streams allowed?

You are responsible for using Rekordly in a way that respects the terms of the platforms you record from and the laws in your jurisdiction. Please record responsibly.

## Can I add my own site?

Yes — site support ships as plugins with a public SDK. Start with [Plugins](plugins), then follow the plugin guide in the repository.

## Windows shows a SmartScreen warning

The installer is not currently code-signed. Click **More info → Run anyway**, or use the portable build if you prefer not to bypass SmartScreen.
