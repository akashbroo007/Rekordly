# Auto-Record

Auto-Record is the reason most people install Rekordly: an opt-in, per-creator switch that captures every stream, unattended, from the moment it starts to the moment it ends.

Recording while you sleep needs more than a naive toggle, so Auto-Record ships with four safety rails.

> **Free tier:** Auto-Record works for up to **2 creators**, with up to **5 simultaneous live recordings** capped at **15 minutes** each. [Rekordly Pro](https://rekordly.in/pricing) removes all three caps.

## The safety rails

### Master pause switch

A single switch in **Settings** that halts all auto-recording instantly — useful before system maintenance, heavy gaming sessions, or any time you want the app to stay quiet without touching individual creators.

### Disk-space guardrail

Auto-record **skips recording** when free space drops below your configured limit. No silent disk filling, no half-written files when the drive hits zero. Configure the threshold in **Settings → Recording**.

### Segment splitting

Split long sessions into parts every **N minutes**. A ten-hour stream becomes a clean series of manageable files instead of one gigantic capture that is painful to move, preview, and upload.

### Crash recovery

If Rekordly (or your machine) crashes mid-stream, interrupted recordings are **reconciled on next launch**: finished segments are kept, missing tails are noted, and the job is marked accordingly. A power cut never costs you the whole capture.

## How a recording cycle works

1. A monitoring check reports the creator is live.
2. The record queue claims the creator (respecting the master pause and disk guardrail).
3. Capture starts through the vendored yt-dlp + ffmpeg engine, honoring your quality choice.
4. When the stream ends — or the plugin's stop condition fires — capture stops and the file is finalized.
5. The recording is registered in your library and shows up on the dashboard analytics.

## Manual recording

You can always hit **Record** on a live creator for a one-off capture with your choice of quality. Manual recording is independent of the Auto-Record switch.
