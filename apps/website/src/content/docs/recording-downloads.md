# Recording & Downloads

Rekordly's capture engine is powered by **vendored yt-dlp + ffmpeg** — both shipped inside the app, so high-quality capture works with zero external installs.

## Recording

- **Manual record** — start a capture on any live creator with your choice of quality.
- **Auto-Record** — hands-off capture with safety rails (see [Auto-Record](auto-record)).
- **Segment splitting** — split long sessions into parts every N minutes.
- **Crash recovery** — interrupted recordings are reconciled on next launch.

## Downloads

The download manager accepts any supported URL — VODs, clips, or past broadcasts:

1. Paste the URL on the **Downloads** page.
2. Rekordly probes the URL for available qualities (per-URL quality probing).
3. Pick a quality and start the download.

> **No duration limit on normal downloads.** The Download Manager and
> Auto-Recording are separate workflows: downloading a supported non-live
> video — whether it runs 5 minutes or 3 hours — always completes in full,
> on every tier.

### Queue controls

- **Pause / resume / retry** individual jobs.
- **Priorities** — reorder the queue so urgent downloads finish first.
- **Bandwidth limits** — cap the download speed so the queue does not saturate your connection.

### Audio-only extraction

Need just the audio? Rekordly can extract **MP3 audio** from any supported URL — handy for podcasts, DJ sets, and talk streams.

## Where files go

Recordings and downloads are saved into your configured recordings folder (organized per-creator by default, see folder rules in the architecture docs). Files are registered in the library database as soon as they are finalized, so they show up in search and analytics immediately.

## Bundled binaries

yt-dlp and ffmpeg are vendored inside the app and updated together with Rekordly releases. You never need to install them system-wide, and the app works fully offline once installed.
