# Troubleshooting

## A recording failed mid-stream

Rekordly's **crash recovery** reconciles interrupted recordings on next launch:

1. Restart the app.
2. Finished segments are kept and the job's outcome is updated in the library.
3. Check the notification center for a summary of what was recovered.

If a specific site consistently fails to record, the site plugin's health check will show it — see the [plugin guide](https://github.com/akashbroo007/Rekordly/blob/main/docs/PLUGIN_GUIDE.md) or open an issue on GitHub.

## Auto-record skipped a creator

Auto-record is deliberately conservative. The most common causes:

- **Disk-space guardrail** — free space dropped below your configured limit. Free space or raise the threshold in **Settings → Recording**.
- **Master pause switch** — all auto-recording was paused from Settings. Flip it back on.
- **Creator not live per the plugin** — check the dashboard status; an errored plugin may report stale offline status.

## Recording quality is lower than expected

- Quality is chosen per recording — check the quality setting you picked (or the default).
- For Auto-Record, the plugin negotiates the best available stream at record time; live transcodes on some sites cap the source quality.
- Check the site itself — a creator streaming at 480p cannot be captured above 480p.

## The app feels heavy

- Enable **low-resource mode** in Settings — trims parallel jobs and dashboard refresh work.
- Increase monitoring intervals for creators you check casually.

## Secure Proxy problems

The Secure Proxy page (sidebar, appears after first use) shows live status for the embedded proxy:

- **"Secure proxy failed"** with a download error — the runtime is fetched from torproject.org on first use; check your internet connection and press **Retry**. The bundle is cached, so later attempts are instant.
- **Slow live checks or recordings** — the built-in proxy routes through the Tor network, which is slower than a direct connection. If your network can reach the site through a system VPN (for example Cloudflare WARP), Rekordly automatically prefers the direct route and the proxy stays idle.
- **First check after enabling the proxy takes a while** — the app waits for a working circuit before declaring the proxy active ("Warming up circuits…"); monitoring retries handle the rest.
- **Test connection shows an error** — use the **Retry** button on the Secure Proxy page; if it persists, the network may be filtering Tor traffic. See [Recording on Blocked Networks](blocked-networks).
- The recording queue's concurrency is configurable; fewer parallel captures means less CPU.

## Downloads are slow or stalling

- Check **bandwidth limits** in the download queue — a cap may be throttling jobs.
- Retry a stalled job from the queue (pause → resume, or right-click → retry).
- Some hosts throttle: priorities help you finish what matters first.

## The app won't start

- Try the portable build to rule out an install problem.
- Delete nothing yet — the library database is preserved; a clean reinstall keeps your data if you do not touch the data folder.
- Still stuck? Open a [GitHub issue](https://github.com/akashbroo007/Rekordly/issues) with your Rekordly version, what you expected, and what happened instead.

## Still stuck?

- Browse or open [GitHub Issues](https://github.com/akashbroo007/Rekordly/issues).
- Ask on [GitHub Discussions](https://github.com/akashbroo007/Rekordly/discussions).
- Or email [hello@rekordly.in](mailto:hello@rekordly.in).
