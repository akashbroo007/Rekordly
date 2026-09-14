export interface BlogPost {
  /** Clean URL slug, e.g. /blog/what-is-rekordly */
  slug: string;
  title: string;
  /** ~155 chars, shown in search results and social cards. */
  description: string;
  category: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** ISO date when the post was last meaningfully updated. */
  updated: string;
  readingTime: string;
  emoji: string;
  /** Markdown body rendered with the shared `.markdown` prose styles. */
  body: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "what-is-rekordly",
    title: "What is Rekordly and how do you get started?",
    description:
      "A plain-English tour of Rekordly: what the desktop app does, how to install it on Windows, and how to record your first stream in under five minutes.",
    category: "Product",
    date: "2026-09-01",
    updated: "2026-09-14",
    readingTime: "7 min read",
    emoji: "🚀",
    body: `
Rekordly is a free, source-available desktop app for Windows that does one job end to end: it watches the creators you follow, hits record the moment they go live, and files every capture into a searchable local library. Bundled yt-dlp and ffmpeg mean there is nothing else to install.

If you have ever refreshed a follower page 30 times hoping to catch a stream, or lost a VOD because the platform deleted it two days later, this post is for you.

## What Rekordly actually does

- **Live monitoring** — track creators across 7 sites (Chaturbate, Stripchat, Twitch, YouTube, BongaCams, CamSoda, MyFreeCams) from one dashboard with live status, viewer counts, and stream titles.
- **Auto-Record** — flip one per-creator switch and recording starts the second the creator goes live, then stops cleanly when the stream ends.
- **Downloads** — grab VODs, clips, and highlights, or extract audio-only MP3s from anything.
- **Library** — every capture lands in a local, searchable library with tags, collections, favorites, and notes.
- **Editor** — trim, cut, and combine recordings on a filmstrip timeline without leaving the app.
- **Cloud uploads** — push finished files to Gofile, Catbox, MixDrop, or Google Drive.

Everything runs on your machine. There is no account, no cloud database, and nothing is uploaded anywhere unless you explicitly configure a provider.

## How to get started in four steps

### 1. Download and install

Grab the installer from [GitHub Releases](https://github.com/akashbroo007/Rekordly/releases) — it is a single .exe that registers the app for automatic updates. Prefer no install step? The portable build runs standalone from any folder, including a USB stick. If Windows SmartScreen warns on first run, click "More info → Run anyway" — the app is not code-signed yet, which is exactly why the warning appears. The full details are in the [installation guide](/docs/installation).

### 2. Add your first creator

Open the dashboard, click **Add Creator**, pick a site plugin, and enter the username. Rekordly immediately starts checking their status on a configurable interval — you will see live/offline state, current viewer count, and the stream title.

### 3. Enable Auto-Record

On the creator's row, flip the Auto-Record switch. From this point Rekordly records every stream they do, unattended. The [Auto-Record docs](/docs/auto-record) cover the safety rails: a master pause switch, a disk-space guardrail that skips creators when free space runs low, segment splitting for marathon sessions, and crash recovery that reconciles interrupted captures on next launch.

### 4. Find everything in your library

Every capture is organized with tags, collections, favorites, and notes. Use the built-in editor to trim the boring parts, then push the result straight to cloud storage.

## Is it really free?

Yes. Rekordly is free for personal, educational, and noncommercial use under the PolyForm Noncommercial license. The free tier includes unlimited monitoring and unlimited downloads; live recordings are capped at 15 minutes, up to 5 at a time, with auto-record on 2 creators. Pro removes those limits with a one-time payment — see the [pricing](/pricing) page for the comparison, or the [license docs](/docs/license) for the fine print.

## Where to go next

- Watch the [product walkthrough](/features) on the features page.
- Follow the [getting-started guide](/docs/getting-started) for a guided tour.
- Stuck? Check [troubleshooting](/docs/troubleshooting) or open an issue on GitHub.
- Want a site supported that is not on the list? The [plugin system](/plugins) lets anyone add one — start with the plugin guide.

Rekordly runs on Windows 10 and 11. There is no macOS or Linux build yet — cross-platform support is on the [roadmap](/roadmap) for 2.0.
`,
  },
  {
    slug: "the-problem-rekordly-solves",
    title: "The problem Rekordly solves: streams disappear, you have a life",
    description:
      "VODs get deleted, streams happen while you sleep, and tabs don't archive themselves. Here's the exact gap Rekordly fills — and how its monitoring, auto-record, and library close it.",
    category: "Product",
    date: "2026-09-05",
    updated: "2026-09-14",
    readingTime: "6 min read",
    emoji: "🎯",
    body: `
Every streamer you follow eventually deletes a stream you meant to rewatch. Platforms purge VODs after days or weeks, highlights get trimmed, and accounts vanish overnight. If you were not in the audience at the exact moment, the content is gone.

That is the core problem Rekordly solves: **it converts "I hope I catch it live" into a system that archives by default.**

## The four failures Rekordly is built around

### 1. Streams happen while you are asleep or at work

Time zones guarantee that creators you care about are live when you cannot be. A browser tab cannot help you. Rekordly's monitoring engine checks each creator on a configurable interval and [Auto-Record](/docs/auto-record) starts capturing the moment they go live — no human needs to be present.

### 2. VODs are temporary

Even when a recording survives, platforms treat VODs as disposable. The built-in [Download Manager](/docs/recording-downloads) grabs full VODs, clips, and highlights — with no duration limit on normal downloads, even on the free tier — powered by bundled yt-dlp and ffmpeg.

### 3. Watching five streams means five tabs and zero archive

Juggling browser tabs gives you a live view but no capture, no history, and no way to search what you watched. Rekordly's [library](/docs/library-analytics) files every capture locally with tags, collections, favorites, and notes — your archive is searchable, not scattered.

### 4. Unattended recording is scary

A naive "record when live" toggle can fill your disk overnight or hang on a crashed stream. Rekordly ships guardrails for exactly this: a master pause switch, a disk-space guardrail, segment splitting every N minutes, and crash recovery that reconciles interrupted captures after a power cut.

## What it is *not*

- **Not a screen recorder.** Recording is a straight copy of the stream, so quality is lossless and CPU use stays low.
- **Not a subscription.** The app is free for personal use under the PolyForm Noncommercial license; [Pro](/pricing) is a one-time payment, not a monthly fee.
- **Not cloud-based.** Creators, recordings, and the library database live in local SQLite on your machine. Nothing is uploaded unless you explicitly configure a [cloud provider](/docs/cloud-uploads).

## The 30-second test

Add one creator, enable Auto-Record, and go to bed. Wake up to a finished capture organized in your library — that is the whole pitch, and the [download](/download) takes about two minutes to install.
`,
  },
  {
    slug: "who-is-rekordly-for",
    title: "Who is Rekordly for? Five users, five very different workflows",
    description:
      "Archivists, power users, plugin developers, journalists, and heavy viewers all use Rekordly differently. Find the workflow that matches how you watch streams.",
    category: "Use cases",
    date: "2026-09-08",
    updated: "2026-09-14",
    readingTime: "8 min read",
    emoji: "👤",
    body: `
Rekordly has one pipeline — monitor, capture, organize — but five very different groups use it in five very different ways. Find yours below.

## 1. The archivist

**You:** You keep personal archives of streams you love and hate that platforms delete them.

Rekordly is a set-and-forget archiving tool. Add creators, enable [Auto-Record](/docs/auto-record), and let the disk-space guardrail and segment splitting handle marathons. Use the [library](/docs/library-analytics) with collections and notes to keep years of captures searchable, and the [editor](/docs/editor) to cut highlight reels. The whole archive stays on your own disk.

## 2. The power user who records everything

**You:** You want every stream from five creators at full length, no caps.

The free tier caps live recordings (15 minutes, 5 concurrent, auto-record on 2 creators) while keeping monitoring and downloads unlimited. If that is too tight, [Pro](/pricing) is a one-time payment that removes every live-recording limit — unlimited auto-record creators, unlimited concurrent recordings, unlimited length. No subscription; verification happens offline via a license key.

## 3. The plugin developer

**You:** You want to add a streaming site that is not supported yet.

Site support ships as plugins with a public, typed SDK. Follow the [plugin guide](/plugins), implement four responsibilities (stream extraction, monitoring, metadata, auth), and every Rekordly user can track your site. Capability detection and health checks keep a broken plugin from breaking the app. The [plugin docs](/docs/plugins) cover the SDK, testing, and submission.

## 4. The journalist or researcher

**You:** You need verifiable, time-stamped primary sources.

Capture streams as they happen for documentation or research. Recording is a direct capture, and the [Secure Proxy](/docs/blocked-networks) keeps recordings working on networks that block streaming sites — one per-creator toggle, no VPN subscription, with automatic full speed if you have Cloudflare WARP installed. Everything stays local: nothing is uploaded unless you choose a [cloud upload provider](/docs/cloud-uploads).

## 5. The heavy viewer on a blocked network

**You:** Your ISP, school, or workplace blocks the sites you follow.

The built-in Secure Proxy routes a blocked creator's traffic with one toggle; the proxy runtime downloads itself on first use. Install Cloudflare WARP (free) and Rekordly detects it — recordings automatically go full speed. The full guide is in [Recording on Blocked Networks](/docs/blocked-networks).

## What Rekordly is not for

To be clear about boundaries: Rekordly is not for redistributing other people's content, and commercial use requires a [commercial license](/pricing). You are responsible for respecting the platforms you record from and the laws in your jurisdiction.

## Find your starting point

Whatever your workflow, the entry point is the same: [download](/download) the installer, add a creator, flip Auto-Record. The [docs](/docs) cover every feature in depth, and the [roadmap](/roadmap) shows what's shipping next.
`,
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

/** Format an ISO date (YYYY-MM-DD) as "Sep 1, 2026". */
export function formatBlogDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
