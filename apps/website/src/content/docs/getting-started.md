# Getting Started

This guide walks you from a fresh install to your first automatic capture in about five minutes.

## 1. Add a creator

Open Rekordly and head to **Creators**. Click **Add creator**, then:

1. Pick the site the creator streams on (e.g. Chaturbate, Twitch).
2. Enter their exact username.
3. Set the check interval — how often Rekordly checks whether they are live. The default works well; tighter intervals cost more CPU and network round-trips.

Once added, the creator appears on your dashboard with live/offline status, viewer counts, and the current stream title.

## 2. Enable Auto-Record

On the creator row, flip the **Auto-Record** switch. From now on:

- Recording starts automatically the moment the creator goes live.
- Recording stops cleanly when the stream ends.
- Finished files land in your library automatically.

Before you walk away for the night, it is worth opening **Settings** and checking the safety rails: the **master pause switch** (instantly halts all auto-recording), the **disk-space guardrail** (skips recording below your free-space threshold), and **segment splitting** (splits long sessions into parts every N minutes).

## 3. Record manually

On any live creator, hit **Record** to start a manual capture. You can pick the quality, and stop at any time — manual recording is independent of the Auto-Record toggle.

## 4. Download a VOD

Paste any supported URL into the **Downloads** page. Rekordly probes the URL for available qualities and starts the download. You can pause, resume, retry, set priorities, and cap bandwidth.

## 5. Clean up a recording in the editor

Open any capture in the player and expand the **Editor** panel. Trim the start and end, cut out dead air (silence detection can suggest the ranges), or pull out the audio as MP3/M4A. Exports are non-destructive — the original is never modified — and land in the library under **Edited**. See [Built-in Video Editor](editor).

## 6. Organize your library

Everything you capture is searchable from the **Library**:

- **Tags, collections, favorites, and notes** — organize however you like.
- **Folder scanning** — import existing media files from a folder on disk.
- **Storage manager** — see what's eating space, find the largest files, and clean up.

## 7. (Optional) Push to the cloud

Open **Uploads** and pick a provider — Gofile, Catbox, MixDrop, or Google Drive. Each provider has its own credential setup described in [Cloud Uploads](cloud-uploads). Finished recordings can then be uploaded with one click.

## What's next

- [Auto-Record](auto-record) — the full safety-rail reference.
- [Supported Platforms](platforms) — what works today and how sites are added.
- [Troubleshooting](troubleshooting) — if something misbehaves.
