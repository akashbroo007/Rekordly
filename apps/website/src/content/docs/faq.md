# FAQ

## Is Rekordly really free?

Yes — completely. Rekordly is free and open-source software under the [Apache License 2.0](license). Everything is included: unlimited creator monitoring, unlimited live recordings, unlimited downloads, push notifications with remote control from Telegram, and full access to the library and plugins — for individuals, businesses, and everyone else. The vendored yt-dlp and ffmpeg binaries keep their own licenses.

## Do I need to install ffmpeg or yt-dlp?

No. Both are vendored inside the app — download the installer, run it, and you're done. Nothing else to install.

## Which platforms are supported?

Twitch, YouTube, Rumble, Kick, Chaturbate, Stripchat, BongaCams, Cam4, CamSoda, Jerkmate, Streamate, MyFreeCams, and Dreamcam are supported out of the box for live detection and recording — Stripchat and Dreamcam including VR (3D) shows. A Tango Live plugin is also available from the [Marketplace](/marketplace). New sites can be added as plugins without touching the core app — see [Plugins](plugins) and [Supported Platforms](platforms).

One setup note: Twitch and YouTube monitoring go through their providers' free public APIs, so you create a free Twitch Client-ID/Secret or a free YouTube Data API key once, in Settings. Every other site needs no account and no keys.

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
