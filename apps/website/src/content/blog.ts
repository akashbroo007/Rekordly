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

- **Live monitoring** — track creators across 12 sites (Twitch, YouTube, Rumble, Kick, Chaturbate, Stripchat, BongaCams, Cam4, CamSoda, Jerkmate, Streamate, MyFreeCams, Dreamcam) from one dashboard with live status, viewer counts, and stream titles.
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

Yes. Rekordly is free for personal, educational, and noncommercial use under the PolyForm Noncommercial license. Everything is included — unlimited monitoring, unlimited live recordings, and unlimited downloads — with no features locked behind a paywall. Commercial use requires a paid commercial license; see the [license docs](/docs/license) for the fine print.

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

Even when a recording survives, platforms treat VODs as disposable. The built-in [Download Manager](/docs/recording-downloads) grabs full VODs, clips, and highlights — with no duration limit on normal downloads — powered by bundled yt-dlp and ffmpeg.

### 3. Watching five streams means five tabs and zero archive

Juggling browser tabs gives you a live view but no capture, no history, and no way to search what you watched. Rekordly's [library](/docs/library-analytics) files every capture locally with tags, collections, favorites, and notes — your archive is searchable, not scattered.

### 4. Unattended recording is scary

A naive "record when live" toggle can fill your disk overnight or hang on a crashed stream. Rekordly ships guardrails for exactly this: a master pause switch, a disk-space guardrail, segment splitting every N minutes, and crash recovery that reconciles interrupted captures after a power cut.

## What it is *not*

- **Not a screen recorder.** Recording is a straight copy of the stream, so quality is lossless and CPU use stays low.
- **Not a subscription.** The app is entirely free for personal use under the PolyForm Noncommercial license — there is no paid tier to upgrade to, no monthly fee, and no locked features.
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

There are no caps: every creator can auto-record, recordings run at full length with no concurrency limit. Set the segment splitting and the disk-space guardrail to match your storage, and the app handles marathons.

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

To be clear about boundaries: Rekordly is not for redistributing other people's content, and commercial use requires a [commercial license](/docs/license). You are responsible for respecting the platforms you record from and the laws in your jurisdiction.

## Find your starting point

Whatever your workflow, the entry point is the same: [download](/download) the installer, add a creator, flip Auto-Record. The [docs](/docs) cover every feature in depth, and the [roadmap](/roadmap) shows what's shipping next.
`,
  },
  {
    slug: "stripchat-recorder",
    title: "How to record Stripchat shows — free & automatic",
    description:
      "How to record Stripchat streams automatically when a model goes live, in original quality, with no screen recorder and nothing to pay. Windows setup, ten minutes, once.",
    category: "Guides",
    date: "2026-09-19",
    updated: "2026-09-23",
    readingTime: "6 min read",
    emoji: "🎥",
    body: `
There is a specific kind of annoyance that everyone who watches Stripchat knows. You find a great show, watch twenty minutes of it, then life pulls you away. You come back an hour later and it is gone. Not purged-and-regrettable, gone: private and ticket shows never even reach the archive, and public replays have a way of evaporating.

The usual reflex is a screen recorder aimed at the browser tab. I won't pretend that never works. It works once, it eats your CPU, and it records the show at your monitor's resolution with every Discord ping baked into the audio. Then the laptop sleeps and the file dies mid-show.

This guide is about the other way to record Stripchat. Rekordly doesn't capture your screen. It copies the live stream itself, starts on its own the second a model goes live, and files the finished recording in a library you can actually search. It's a Windows app, it's free for personal use, and setup happens once.

## Screen capture vs stream copy, in one paragraph

Screen recording grabs pixels from your monitor. Stream copying grabs the broadcast data itself. That difference decides everything. A copy comes out at the same quality as the live feed, uses almost nothing on the CPU front (copying is not encoding), and keeps running when you minimize, lock, or walk away. Anyone trying to wrench a clean video out of OBS at 3 a.m. knows this pain.

## The ten-minute setup

[Download Rekordly](/download) first. Installer or portable, Windows 10 and 11, and nothing else to install because yt-dlp and ffmpeg ride inside the app.

Then add your streamers. On the Monitor page, click Add, pick Stripchat from the site list, and type the username as it appears in the creator's URL. Status starts updating right away: live or offline, viewer count, stream title. An account on Stripchat is unnecessary; session cookies are optional and only help with rate limits.

Last step, flip **Auto-Record** on the creator's row. That is the product, really. Every stream from that model now gets recorded from the first second to the last, with no one watching the record button. The capture lands in the library with tags, collections, favorites, notes, searchable by anything you typed six months ago.

The safety rails are worth one sentence each, because "unattended" is only scary if you skip them: a master pause switch, a disk guardrail that refuses to fill your drive, optional segment splitting for marathon shows, crash recovery after a bad shutdown. The [Auto-Record docs](/docs/auto-record) explain all four.

One more thing that matters more than it sounds: if your network blocks the site, Rekordly has a built-in Secure Proxy. One toggle per creator, no subscription, and the traffic reroutes automatically. The full story is in [Recording on Blocked Networks](/docs/blocked-networks), including the neat trick where installing Cloudflare WARP makes it run at full speed.

## Things that are Stripchat-specific

**VR shows are the whole point.** Stripchat broadcasts proper 3D shows, and the plugin records them as 3D rather than mangling them into a flat shape. Playback happens in the built-in look-around player, drag to look around, wheel to zoom, same as on the site. Files run heavier than flat streams, which is physics. More in the [VR guide](/blog/vr-cam-recorder).

**VOD downloads are supported here.** Anything sitting in the public archive, clips included, can be fetched through the Download Manager, with pause and retry. Live Auto-Record covers everything that never gets archived, which is most of the good stuff.

**No recording length cap.** A four-hour 1080p stream copy typically lands in the 2 to 6 GB range depending on bitrate. A screen capture of the same show runs bigger and looks worse. Do the math for your drive and set segment splitting accordingly.

## Money, honestly asked about

Is a free Stripchat recorder actually free? Here it is: yes for personal use. PolyForm Noncommercial license, unlimited monitoring, unlimited recordings, unlimited downloads, no watermark, no "premium settings" nonsense behind a paywall. Companies pay for a [commercial license](/docs/license); that's the entire business model.

Straight answers to the usual questions:

- **Do I keep the browser open?** No. The app records independently of any browser. Close everything.
- **Will the model be notified?** Rekordly reads public pages the way a viewer's browser would. Nothing unusual flows out of your machine. What you may ethically record is governed by the platform's terms, see below.
- **Private and ticket shows?** You get what you can see as a viewer. If your access never reveals the stream, there is nothing to capture.
- **Mac or Linux?** Not yet. Both are on the [roadmap](/roadmap) for 2.0.

## The responsibility sentence

Recording is subject to Stripchat's terms and your local laws, and only you can check both. Rekordly ships the tooling and nothing else: no permission is granted by using it, and a public broadcast is not an invitation to redistribute. Record accordingly.

## Go try it

Install, add one creator, flip the switch, sleep. The capture will be in the library when you wake up. If you're still comparing options, start with the [cam recording hub](/adult-stream-recording) or the plain-English [free cam site recorder guide](/blog/free-cam-site-recorder). Questions? The [FAQ docs](/docs/faq) cover most of them.
`,
  },
  {
    slug: "bongacams-recorder",
    title: "Recording BongaCams shows automatically (free setup)",
    description:
      "Set up automatic BongaCams recording in one evening: Rekordly checks models for you and captures every show at original quality on Windows. Free for personal use.",
    category: "Guides",
    date: "2026-10-03",
    updated: "2026-10-06",
    readingTime: "6 min read",
    emoji: "🌙",
    body: `
BongaCams has an archive problem, or rather the opposite of one. Shows end, and unless the platform decided to keep that particular public replay, there is nothing left. Fans who try to keep recordings usually go through three phases: a screen recorder aimed at a full-screen tab, then a souped-up browser extension, then a grudging "fine, I'll miss shows I can't attend".

The fourth thing to try is a BongaCams recorder that works like a DVR rather than a camera. Rekordly, free on Windows, is exactly that shape of tool: it watches the models you tell it to watch, and when one goes live it starts capturing the broadcast itself. You never press record, and the quality that comes out is the quality the show was streamed in.

## What actually happens when a show starts

Under the hood it's stream copying. The app pulls the broadcast data and writes it to disk basically unmodified, using the ffmpeg and yt-dlp binaries that ship inside the app. No monitor involved, no real-time re-encoding, which is why your CPU sits at single-digit percentages while the recording runs. Notifications, cursors, and your desktop wallpaper can stay out of it; there's simply no screen involved in the capture.

During the show you can do absolutely nothing and it still works. Between shows you can do a few things that are worth doing:

- Check the dashboard: live status, viewer count, and stream titles update for every tracked model.
- After it ends: the capture arrives in the local library, tagged, searchable, and ready for the built-in filmstrip editor if you want highlights.
- If a network blocks the site: one toggle on the Secure Proxy reroutes that creator. Tor-based, on the slow side, unless you install free Cloudflare WARP and let Rekordly detect it. [Blocked-network recording](/docs/blocked-networks) is a whole guide of its own.

## Setup, the short version

1. Install from the [download page](/download). One exe, or a portable build if you keep tools on a USB stick.
2. Monitor page, Add, site = BongaCams, username typed exactly like the URL shows it. Checks start immediately. No account required; cookies are optional and only smooth out rate limits.
3. Flip Auto-Record on the model's row. Done forever unless you add more rows.

For long sessions, segment splitting every N minutes plus the disk guardrail means a seven-hour show cannot quietly eat your SSD. If the app ever gets killed mid-show, crash recovery reconciles the file on next launch.

## The limitation that matters here

Here's the part most BongaCams "downloaders" won't tell you. Downloads for BongaCams are **not** a Rekordly feature: the plugin supports live recording, and that's it. Some other platforms in the app also offer VOD and clip downloads; BongaCams isn't one of them. The practical consequence is simple, so let me say it plainly: the only way this app keeps a BongaCams show is live capture, and live capture is exactly what the Auto-Record switch automates. If a stream is worth having, the switch has to be on while it happens.

## What you'll pay

Nothing, for personal use. PolyForm Noncommercial license, no watermark, no recording quotas, no upsell screen. Monitoring unlimited, recordings unlimited. The only people who pay are commercial users, and they do it for a [license](/docs/license) rather than for permissions inside the app.

## Questions from the inbox

**Is this a "free Bonga recorder" or a downloader?** A recorder. On BongaCams specifically there is no VOD grabbing, because the plugin there implements live detection and capture only. Where you see the word downloader attached to this platform, assume the tool is scraping something else or lying.

**Does the model need to add me, or accept a request?** There is nothing to accept. Rekordly reads the same public pages your browser reads when you visit.

**Recording quality when the model streams on a data saver?** You get what was broadcast. If she streams at reduced bitrate, that's the ceiling of any recorder. The app keeps the stream's own quality, which is usually the best available version of it anywhere.

**Private rooms?** Same rule as every platform: if your viewer session can see it, it can be captured, if it can't, it can't. Platform terms decide the rest.

## Last thing before you install

The responsibility part, stated once and meant: platform terms and local laws are yours, not the app's. Rekordly is a tool that records; permission to record any specific show is a question the tool cannot answer for you. Keep that in mind and this stays a hobby instead of a headache.

If Stripchat and Chaturbate are also on your rotation, the flows in the [Stripchat guide](/blog/stripchat-recorder) and the [Chaturbate guide](/blog/chaturbate-recorder) differ slightly (they add VOD downloads and VR), and the [cam recording hub](/adult-stream-recording) holds the full capability matrix. Otherwise: [install](/download), add a model, flip the switch, forget it exists.
`,
  },
  {
    slug: "chaturbate-recorder",
    title: "Getting clean Chaturbate recordings (without screen capture)",
    description:
      "Record Chaturbate automatically in broadcast quality: Rekordly starts recording when a broadcaster goes live, downloads VODs and clips, and keeps it all in a local library.",
    category: "Guides",
    date: "2026-09-27",
    updated: "2026-09-29",
    readingTime: "6 min read",
    emoji: "⚙️",
    body: `
Chaturbate's biggest fans live in the wrong time zones. The show starts at 4 a.m. your time, or while you're in a meeting, or on the one week your internet is being "upgraded". By the time you hear about the stream that mattered, it's a screenshot in a group chat.

You can throw OBS at the problem. Lots of people do, once. What they get is a video where the show is one monitor-shaped crop of the whole broadcast, the CPU fans are screaming, and something always breaks when you alt-tab. That's screen recording doing its best; it just wasn't built for this.

The fix that actually sticks is to stop recording pixels and start copying the stream. Rekordly, a free Windows app with a bundled Chaturbate plugin, does the copy automatically whenever the broadcaster goes live, then fetches their past VODs, clips, and highlights on top of that. It's the whole pipeline, and it costs nothing for personal use.

## Your four-a.m. problem gets solved by a switch

Here's the workflow that replaces "I hope I catch it":

Add the broadcaster on the **Monitor** page (site = Chaturbate, username as shown in their URL). Add as many as you like; there is no concurrency cap. Each row gets a status line that updates quietly in the background: live or offline, viewers, stream title.

Flip **Auto-Record** on that row. The moment they go live, recording starts as a straight stream copy, files land on disk, and when the show ends the capture is already filed into the library with searchable tags and notes. Nobody is operating anything. The [Auto-Record guide](/docs/auto-record) covers the fail-safes: master pause, disk guardrail, segment splitting every N minutes, crash recovery after a power cut. Four small features, worth more than any one headline feature, because they make the automation trustworthy.

While you're at work or asleep, that switch is working. All of it runs local: an SQLite library database on your own machine, no cloud middleman, and nothing uploads unless you configure a cloud provider on purpose. If a network between you and Chaturbate is hostile, the Secure Proxy toggle routes that one creator around it; the [blocked-networks guide](/docs/blocked-networks) explains when Tor mode is slow and how installing free Cloudflare WARP returns full speed.

## The part Chaturbate is uniquely good for: downloads

Compared to the other big cam sites, Chaturbate is the dream case for an archive, because the plugin handles recorded streams *and* fetched uploads:

- Past VODs, individual clips, and highlights can be pulled into the same library, with pause, resume, and retry handled by the Download Manager.
- Audio-only extraction is built in when you want the sound without the video.
- Broadcast-quality 2 to 6 GB per recorded show hour at 1080p is a reasonable planning number; a screen capture of the same show at the same settings tends to run bigger and softer.

## What it costs, and the questions that follow

Free for personal use, PolyForm Noncommercial license. Nothing personal is gated: monitoring, recording, downloads, the library, the editor. Companies take a paid [license](/docs/license), which is one paragraph of honesty that lots of other "free recorders" skip.

A few of the messages we get, answered plainly:

**Do I need a Chaturbate account?** You do not. Optional session cookies, if you add them, just raise rate limits for heavy monitoring schedules.

**Is the recording flagged or noticed by the site?** The app reads the same public pages a viewer's browser reads. What may or may not be fine to record is a question of Chaturbate's terms, not of technology; more in the following paragraph.

**Where do recordings end up?** A folder you can browse, wrapped in a searchable local library on your disk. Standard files, any player plays them.

**Windows only?** For now, yes. macOS and Linux are queued on the [roadmap](/roadmap) for version 2.0.

## The paragraph about responsibility

Every recording guide should have one, so here it is: platform terms and laws in your jurisdiction are the real rules. Rekordly gives you the capability; it can't give you permission. Treat performers' content with the same care you'd want for your own.

## Set it up this evening

Flow: [install](/download), add the broadcasters, flip their switches, sleep. In the morning you'll either have captures or "well, nobody went live", which is the correct failure mode. If you're weighing platforms, the [cam recording hub](/adult-stream-recording) shows the full matrix and the [Stripchat guide](/blog/stripchat-recorder) and [BongaCams guide](/blog/bongacams-recorder) cover the neighbouring platforms. The general [free cam site recorder page](/blog/free-cam-site-recorder) lays all the approaches side by side.
`,
  },
  {
    slug: "free-cam-site-recorder",
    title: "Free Cam Site Recorder for Windows — the 2026 Guide",
    description:
      "Why screen recorders make bad cam show recordings, what stream-copy recording does instead, and how the free Rekordly app puts the whole archive on autopilot.",
    category: "Guides",
    date: "2026-09-14",
    updated: "2026-09-16",
    readingTime: "7 min read",
    emoji: "🛰️",
    body: `
Search for a free cam site recorder and you'll find two kinds of software pretending to be the same thing: screen recorders, and stream copiers. They are not the same, the difference decides whether your recording is worth keeping, and most people learn this the expensive way, by recording a show they loved with a tool that turned it into a mushy 30 fps rectangle with notification sounds on the audio track.

So let's untangle it once, properly. Then we'll go through a way to turn the recording part into a system that runs by itself.

## School one: screen capture

Tools like OBS are honest about what they do. They capture your screen, faithfully, at whatever resolution and framerate your machine runs. For a cam show that workflow starts losing points immediately:

- Frame size and fidelity get decided by your monitor, not the broadcast.
- Real-time encoding appears on the CPU/GPU bill, and multiplies when shows stack up.
- Switching tabs, locking the screen, or Windows nudging out an update is enough to end the file.
- Something has to be there to press buttons in the first place.

None of that is OBS's fault; screen recording exists for tutorial videos. It's a category mismatch.

## School two: stream copy

Stream copying keeps the broadcast bytes and writes them to a file. Fidelity and frame rate match the feed by definition, CPU load is low, and browser behaviour is irrelevant. Also, a program that copies streams can *check* whether a stream is live, which opens the automation door: time zones stop mattering because the app presses record instead of you.

The catch is that every streaming site is its own small project: different listings, different APIs, different quirks. That's the reasoning behind Rekordly's plugin design; each supported site is a piece of the same app, updated as the sites change.

## What a properly-built version looks like

Rekordly is a free, source-available Windows app, and its shape is: watch, capture, keep.

Number one, monitoring. A single dashboard tracks your creators across 13 bundled sites at the moment: Twitch, YouTube, Rumble, Kick, Chaturbate, Stripchat, BongaCams, Cam4, CamSoda, Jerkmate, Streamate, MyFreeCams, and Dreamcam, with live status, viewer count, and the current stream title for each row.

Number two, capture. A per-creator Auto-Record switch starts recording when they go live and stops when they stop. Around it sit the features you don't notice until you need them: master pause switch, a disk-space guardrail that protects your drive while shows fly unattended, segment splitting for long sessions, crash recovery for bad shutdowns. Downloads run through a dedicated manager with pause and resume for VODs, clips, highlights, and audio extraction, on the platforms where the plugin offers it.

Number three, keep. Every capture lands in a local SQLite-backed library with tags, collections, favorites, and notes, and the built-in filmstrip editor trims without leaving the app. Cloud pushes to Gofile, Catbox, MixDrop, or Google Drive are opt-in rather than default.

One extra piece turns out to matter per network: the built-in Secure Proxy. If a site is blocked where you are, one toggle reroutes that creator's traffic. Details in the [blocked-networks guide](/docs/blocked-networks).

Per-platform facts live on the [cam recording hub page](/adult-stream-recording); the [Stripchat guide](/blog/stripchat-recorder), [BongaCams guide](/blog/bongacams-recorder), [Chaturbate guide](/blog/chaturbate-recorder), and the [VR recording guide](/blog/vr-cam-recorder) each take a deep dive on their platform. The short version: assets like VR 3D capture exist where the platforms themselves do (Dreamcam, Stripchat), and download support varies by site, honestly stated in each guide rather than oversold.

## What about extensions and one-click "downloader" web tools?

Worth saying directly: browser extensions and "paste the URL" web pages for cam sites can run as downloaders only by some third party's proxy holding your session. On top of the reliability problems (they break the day the site changes), you're trusting whoever runs that server with traffic around an account you care about. A desktop app that vendors its own tools, is source-available, and runs local has fewer hands in the middle. Those are the actual reasons we built it this way, not just the ones that fit in a feature box.

The price question comes up in every thread about free cam recorders, so, plainly: Rekordly is free for personal use under PolyForm Noncommercial. No watermark, no recording limits, no settings gated behind a plan. The one paid thing is the [commercial license](/docs/license) for companies, which is how development keeps paying for the pipes it runs on.

## Questions that keep showing up

**Legal to record cam shows?** Platform terms plus your local laws decide, not us and not a tool. What Rekordly does is give you the same sorted pipeline a broadcaster would use to keep their own work; where you point it is your call.

**Several creators at once?** Yes, and no per-show caps. The disk guardrail is the only thing that calls a stop, and it calls it the honest way.

**Do I need accounts on the sites?** No. Cookies are optional fine-tuning for rate limits on the busier plugins.

**Anything other than Windows?** Windows 10/11 today. Mac and Linux are on the [2.0 roadmap](/roadmap).

## Try it with one show

Ten minutes total: [install](/download), add one creator, flip their switch, live your life. Tomorrow there'll be a capture in the library, or nobody went live, which is allowed. Missing a site? The [plugin system](/plugins) exists precisely for that.
`,
  },
  {
    slug: "vr-cam-recorder",
    title: "Recording VR cam shows from Dreamcam and Stripchat",
    description:
      "VR cam shows deserve better than a flat fisheye file: Rekordly records Dreamcam and Stripchat 3D broadcasts as real VR and plays captures back in a look-around player.",
    category: "Guides",
    date: "2026-10-11",
    updated: "2026-10-13",
    readingTime: "5 min read",
    emoji: "🥽",
    body: `
Ask a regular recorder what to do with a VR cam show and it does something quietly tragic: it grabs the 180- or 360-degree broadcast and squashes it into whatever shape your monitor is. You end up with a curved video inside a flat rectangle. Playable, technically. VR? Long gone before the first frame.

The two platforms that broadcast proper 3D shows are Dreamcam and Stripchat, and both are covered by Rekordly, a free Windows app that treats the 3D stream as 3D data rather than footage of a fisheye.

## What "recording VR properly" means here

Rekordly's plugins for those two sites understand the stream type per show. A normal 2D broadcast gets recorded as 2D. A VR broadcast gets recorded as an immersive stream, and the captures play back in the app's built-in look-around player: drag to look around, wheel to zoom, the closest thing to re-entering the room for anyone not currently wearing a headset.

That "drag to look" part deserves emphasis, because it's the difference people feel the moment they press play. Depth and orientation are what made the show different in the first place. Flattening it at capture time throws most of it away; no player can put it back.

## Setup, assuming you already know the drill

Same boat as every platform in the app: [install](/download), add the creator on the Monitor page (Dreamcam or Stripchat, username from their URL), flip the Auto-Record row switch. VR isn't a second workflow, it's a property the plugin reads per stream.

While a show runs, the same rails apply as anywhere: recording stops cleanly at the end, the disk guardrail watches storage, segment splitting can chunk the file every N minutes, crash recovery heals a power-cut capture on next launch. Full details in the [Auto-Record docs](/docs/auto-record).

## Sizes and quality, roughly

3D shows run heavier than flat ones, more resolution, frames packed for immersion. Budget accordingly. Segment splitting and the guardrail exist precisely so heavy captures can't quietly wreck a drive. The stream copy itself keeps the broadcast fidelity; there's no encode step adding softness or saving CPU at quality's expense.

## Small honest print

- Platform coverage is exactly two sites, because they're the ones broadcasting native VR today. When the matrix changes, it updates in the [platform docs](/docs/platforms) and on the [cam recording hub](/adult-stream-recording) first.
- Price is the usual: free, personal use, PolyForm Noncommercial; companies take a [license](/docs/license). No watermark. The strip of "premium VR settings" you'd find on some tools doesn't exist here at all.
- Headset playback depends on what your headset's player accepts. The safest path: files on disk plus the app's own look-around player, which is available even when the headset isn't.
- The regular rules apply unchanged: the platforms' terms and your local laws are on you, not on the app. Public broadcast isn't redistribution permission.

## Worth it?

If Dreamcam and Stripchat are your normal rotation and you have ever rewatched a flattend capture thinking "this isn't what it was like", then yes: [install](/download), add, flip, done. Flat-platform workflows live in the [Stripchat guide](/blog/stripchat-recorder); the general [free cam site recorder page](/blog/free-cam-site-recorder) covers the rest of the thinking.
`,
  },
  {
    slug: "tango-recorder",
    title: "How to record Tango live streams for free (no phone)",
    description:
      "A free Tango recorder for Windows: Rekordly watches the Tango creators you follow and records every live stream automatically, straight from the feed, no screen capture.",
    category: "Guides",
    date: "2026-10-19",
    updated: "2026-10-19",
    readingTime: "5 min read",
    emoji: "🕺",
    body: `
Tango Live is built for phones, and recording it by phone is its own punishment. Battery heat, a notification demolishing the audio track, a 45-minute show chopped up every time you switch apps to reply to a message. And half the streams worth keeping happen at hours your phone should not be awake for in the first place.

Rekordly now has a Tango plugin, so the answer moved to an actual device. It is a free Windows app; it monitors the creators you follow on Tango, and the second one of them goes live it records the stream directly. Phone stays cool, notifications can arrive whenever they like, and the file that lands on disk is the broadcast itself instead of a video of your phone poking at it.

## What the Tango plugin actually covers

Wait, let me say the capabilities straight, because "recorder" gets used loosely everywhere. For Tango, Rekordly covers the same three jobs it covers on other sites:

- **Monitoring.** Each creator you add gets a row: live or offline, viewer count, stream title, updated on a schedule you control. That alone kills a browser-checking habit.
- **Automatic recording.** One Auto-Record switch per creator. When they stream, the app copies the stream data and writes it to disk from the first second; when the stream ends, the file closes and moves into your library. Nobody operated anything, which is the entire point of a [DVR-style recorder](/docs/auto-record).
- **A place to keep it all.** Captures file themselves into the local library, tags, collections, favorites, notes, plus a filmstrip editor for cutting the boring parts. Cloud pushes exist but nothing uploads unless you turn that on.

Where a platform also exposes VODs or clips for download, the in-app Download Manager grabs them; the app itself always shows you exactly what the current release supports for any given site, so there's no guessing.

## Setup from nothing to first recording

1. [Install Rekordly](/download). One installer (or a portable exe), Windows 10 and 11, and the tools it needs ship inside, so there's nothing else to sit through.
2. Monitor page, **Add**, choose Tango from the site picker, paste the username. Status starts ticking. A Tango account is not needed for public streams; session cookies are optional fine-tuning.
3. Flip **Auto-Record**. Next stream from that creator gets recorded without you near the software. Think of the switch as the whole product and you're close enough.

Long shows? Segment splitting plus the disk-space guardrail means a marathon can't eat your SSD while you're asleep. Recording on a network that blocks Tango? Same story as the other sites: one Secure Proxy toggle per creator, explained in the [blocked-networks guide](/docs/blocked-networks), with free Cloudflare WARP returning full speed where applicable.

## The usual questions, answered like a human

**Does the creator need to invite or approve me?** There is nothing to approve. Public streams are recorded the way any viewer's device would have seen them; follower-only rooms come down to what your own access shows.

**Is there a notification ping to the creator?** Rekordly reads the same public pages a browser would. If a platform ever hides information from viewers, the plugin gets the same silent treatment.

**Are recordings a weird proprietary format?** No. Standard files on your disk, any player opens them, the library is just a tidy index on top.

**So, the price?** Free for personal use under PolyForm Noncommercial. Unlimited monitoring, unlimited recording. There is no watermarked "basic mode". A commercial license is a separate document for companies, not a pop-up blinking at personal users.

**Do you also record other apps like this?** The list changes as plugins land; the [cam recording hub](/adult-stream-recording) keeps the current truth. Neighbouring guides: [Stripchat](/blog/stripchat-recorder), [BongaCams](/blog/bongacams-recorder), [Chaturbate](/blog/chaturbate-recorder).

## The one thing I'd repeat to anyone

Platform terms, local laws, and how to treat performers' work: those rules belong to you, not to a download button. This app won't decide what is acceptable to record for you, and you're better off with standards than without them.

## Go on then

[Install](/download), add a Tango creator, flip the switch. If the first recording shows up in your library the next morning, you've got it; check the [FAQ docs](/docs/faq) for everything else, including the questions I was too annoyed to type out twice.
`,
  },
  {
    slug: "youtube-recorder",
    title: "Record YouTube livestreams automatically (free, Windows)",
    description:
      "A free YouTube recorder for Windows: Rekordly checks the channels you follow, captures their livestreams as they air, and downloads VODs, clips, and audio into a local library.",
    category: "Guides",
    date: "2026-09-21",
    updated: "2026-09-24",
    readingTime: "6 min read",
    emoji: "📺",
    body: `
Almost everyone keeps a private "watch later" queue of things that will not exist later. A creator's back catalog goes private mid-lawsuit. A once-only livestream ends and YouTube takes the live file down with it. A channel pivots and deletes three years of uploads. The download-it-later queue has a mortality rate of roughly one hundred percent.

That's the argument for running a real personal library instead of a bookmark folder, and it's why the YouTube support in Rekordly is worth a separate guide. Rekordly is a free Windows app that downloads YouTube videos onto your machine in standard formats, captures livestreams while they're airing, and watches the channels you follow so neither event surprises you again.

## What the YouTube piece of Rekordly actually does

Four jobs, no overlap:

- **Monitoring.** You pick channels; the app checks them on a schedule and surfaces live status and stream titles. The morning surprise of "that stream ended eight hours ago" stops being a thing.
- **Automatic live capture.** Auto-Record on a channel starts recording a livestream from the first second, as a straight stream copy in broadcast quality. When the stream ends, the file closes itself and lands in the library. Nobody had to sit through it. The [Auto-Record docs](/docs/auto-record) describe the rails (segment splitting, disk guardrail, crash recovery) in detail for the marathon-length stuff.
- **Downloads.** Past videos, VODs, shorts, and clips sit behind the built-in Download Manager with pause, resume, and retry. Audio-only extraction is included, which covers the "I only want the podcast this channel did once on stream" case that real life produces constantly.
- **A local library.** Everything files into one searchable place on your disk: tags, collections, favorites, notes. It's a database, not a swamp of mp4s with timestamp names.

No cloud bucket in the middle. Nothing uploads unless you turn on a provider yourself. The library runs on SQLite on your own machine, and the whole thing is free for personal use.

## The one key you'll need (it's free)

Here's the honest friction: the YouTube plugin talks through Google's official Data API v3, and Google gives you a key, not a login. The flow is ten minutes:

1. Open the Google Cloud console, create a project, enable the Data API v3.
2. Create an API key.
3. In Rekordly's Settings, paste the key. There is a step-by-step guide inside the settings screen, so you're following instructions rather than excavating documentation.

You do this once. After that, the app handles quotas itself on your configured check interval. If YouTube ever changes what the API exposes and a feature needs rethinking, the fix ships as a plugin update rather than an app rewrite; that's the reason the plugin approach exists in the first place.

## What ends up on disk

Livestream captures and downloads both arrive as standard files your player opens natively, sized by what the source actually is: a two-hour 1080p live capture lands somewhere in the gigabytes depending on bitrate, an audio-only extraction a hundred megabytes leaner. The library indexes lengths, titles, and your own tags, which matters the first time you want "that one stream" out of ten years of a channel's history. The [library and analytics docs](/docs/library-analytics) show the search and tagging tools.

## The answers section

**Do I need to be signed in to YouTube?** Basic usage: no. Where a specific video requires an account to see it, the app works with what your session can access; configuration lives in the plugin settings.

**Is this like those "YouTube to MP3" websites?** It's local, and there's no third-party server between you and YouTube. The same engine, yt-dlp, that serious archival communities use ships bundled inside the app.

**Quality?** Whatever the source broadcasts: no monitor resolution nonsense and no re-encode step anywhere in the chain.

**Premieres or reruns?** Same pipeline: a premiere is a stream while it runs and a VOD after it ends, and both paths exist in the app.

## The part I'd better write properly

YouTube's terms are long, and yours may vary from the next reader's jurisdiction. What you download, why, what you do with it: those decisions are yours and so is the compliance. Rekordly ships the machinery for personal archiving; it does not hand out permissions, and public availability is not redistribution permission. Keep uploads back on YouTube, keep your archive personal, and behave.

## Where this fits

YouTube is one of thirteen platforms bundled today; the [platform docs](/docs/platforms) keep the full list. Sibling guides: the [Twitch recorder setup](/blog/twitch-recorder), the [Kick guide](/blog/kick-recorder), and the Rumble workflow lives in the same platform docs since it needs no account at all. Install takes minutes: [download here](/download), and the cam-side guides live at the [cam recording hub](/adult-stream-recording) if that's your corner of the internet.
`,
  },
  {
    slug: "twitch-recorder",
    title: "Twitch recordings on autopilot — lives, VODs and clips",
    description:
      "A free Twitch recorder for Windows: Rekordly follows your streamers' live status around the clock, records each stream in broadcast quality, and downloads past VODs and clips.",
    category: "Guides",
    date: "2026-10-01",
    updated: "2026-10-04",
    readingTime: "6 min read",
    emoji: "👾",
    body: `
Twitch is the only platform where "third stream of the day" is a schedule, not a joke. Farming sim marathons run eight hours. Time zones put your favourite streamer's live window at your bedtime. And every VOD you thought about rewatching "next weekend" is living on a shortened expiry clock the moment it ends.

If you've ever sat through that download screen deciding whether the whole 8-hour VOD is worth keeping just for its last forty minutes, this guide is for you. The Twitch support inside Rekordly, a free Windows app, covers both halves of the problem: automatic recording of lives while they happen, and clean downloads of VODs, clips, and highlights afterward, all of it landing in a searchable local library.

## The Recorder, honestly described

Stream-copy recording, like everywhere else in the app: when a followed streamer goes live, Rekordly pulls the broadcast data to disk rather than screen-capturing pixels. Full quality, tiny CPU footprint, and no mandatory open window. It starts within seconds of the stream going live, because the monitoring loop is polling live status on your configured interval, viewer count and stream title included.

For the long sessions, two guard-rail features do the heavy lifting: segment splitting writes the recording in N-minute chunks so the files stay manageable, and the disk-space guardrail pauses new segments rather than filling your SSD on a fourteen-hour marathon. Crash recovery reconciles incomplete captures after a power cut. All of it is described in plain language in the [Auto-Record pages](/docs/auto-record).

## The setup: one free API handshake

Full honesty here, because a useful Twitch guide has to admit where the small fiddle is. The Twitch plugin uses Twitch's official Helix API to poll status, and Helix requires an application credential:

1. Create a free developer application on Twitch's site, which hands you a Client ID and a Secret.
2. Paste both into Rekordly's Settings; the screen walks you through it step by step.

Five minutes, once per app install, not per streamer. After that, monitoring works quietly forever. This is a different shape from some other platforms where no account is needed at all (Kick, for example, works immediately with no keys, see the [Kick guide](/blog/kick-recorder)), and if "no credential setup" is a hard requirement for you, Rumble is the plug-and-play one; both are in the [platform docs](/docs/platforms).

## Downloads: the part past-tense fans care about

Live recording covers the future. The Download Manager covers the past: full VODs, individual clips, and highlights from any channel's public catalog, into the same library, with pause, resume, and retry. Audio-only extraction is built in for the podcast-hours case.

One nuance that belongs in every honest Twitch guide: what Rekordly can fetch is what a viewer session can see. Content gated behind a subscription or an account shows up only if you configure the session the same way you'd watch it. The plugin settings exist for that fine tuning; the library doesn't care which path a file took to arrive, tags and collections treat captured lives and downloaded VODs identically.

Twitch VOD retention is the platform's business, not ours, and it changes; anything you care about keeping long-term is better on your disk than on their featured-streams page. That's not a strong opinion, it's an observation about every past platform purge.

## Rapid answers

**Does the streamer get any notification?** Monitoring reads the same public API surface any client reads. Recording happens on your machine; nothing unusual floats upstream.

**Sub-only mode streams?** If your configured access can see it, the tools can record it; locked-mode shows aren't public feeds, and whether you may record them is bound up in the platform's terms — the bit below.

**Multiple streamers at once?** Unlimited rows. Schedules collide all the time; that's who this feature set was built for.

**What about the cam sites I also watch?** Different guide, same app: see the [cam recording hub](/adult-stream-recording), and the [Stripchat recorder walkthrough](/blog/stripchat-recorder) if VR is your thing.

**Cost?** Free for personal use under PolyForm Noncommercial. No watermark, no recording quotas, no upsells. Companies take the paid [license](/docs/license) and everyone else keeps their money.

## The disclaimer paragraph I write every time

Platform terms: yours to read. Local laws: yours to know. Rekordly is a tool for personal archiving, and it grants exactly as much permission as it advertises, which is none. Please use it the way you'd want a viewer of your own old streams to use it.

## Try it this evening

[Install](/download), get the free API credentials once, add your streamers, flip Auto-Record on each. The next time a schedule lands at a bad hour, it records anyway. The [blog](/blog) has sibling guides for other platforms, and the [YouTube recorder page](/blog/youtube-recorder) covers the second-most-asked-about platform.
`,
  },
  {
    slug: "kick-recorder",
    title: "Recording Kick streams and VODs for your own archive",
    description:
      "Free Kick recorder: add creators, flip auto-record, and Rekordly captures every Kick stream at broadcast quality — plus VOD downloads, no account required.",
    category: "Guides",
    date: "2026-10-15",
    updated: "2026-10-17",
    readingTime: "5 min read",
    emoji: "🟢",
    body: `
Kick is the platform where the biggest problem is not watching. Someone goes live with a nine-hour session, you see it four hours deep in a clip on social media, and the VOD sits there mocking you while your tabs multiply.

The honest pitch for this guide: Kick support inside Rekordly is the lowest-friction setup of any platform in the app. No account. No API credentials. A session cookie if you want a rate-limit upgrade, otherwise nothing. You install the app, add creators, flip a switch. Everything below describes what that switch gains you.

## Setup with zero accounts

The whole thing is three actions:

1. [Install Rekordly](/download). One installer on Windows 10 or 11, takes a couple of minutes; ffmpeg and yt-dlp ship inside it, so no toolchain hunting.
2. Monitor page, Add, pick Kick, enter the creator's username. Status checks start on your chosen interval; dashboard shows live/offline, viewer count, stream title in real time.
3. Flip Auto-Record. Every stream that creator runs gets captured, first-second-to-last, whether you're at the desk or asleep.

Optional: session cookies in plugin settings lift API rate limits for heavy monitoring lists. Optional. The default works.

## What the recording itself gets you

Stream-copy capture, same as every other plugin. The file on disk is the broadcast, not pixels from a screen: original quality, no re-encode, no monitor crop. Kick's streams land at whatever bitrate the source pushes; the copy keeps it. The built-in look comes later: everything files into the local library with tags, notes, collections, searchable by anything you typed, and the filmstrip editor cuts highlights without a second app. The [library pages](/docs/library-analytics) document the tagging.

For the marathon crowd: segment splitting breaks a long session into N-minute files, and the disk guardrail protects your SSD instead of filling it when eight streamers go live at once. Crash recovery stitches interrupted sessions after an unclean shutdown. None of this is kick-specific cleverness; it's the same trust-the-unattended-recording rails every plugin shares, which is the point of the app. The [Auto-Record docs](/docs/auto-record) spell out each one.

## VOD downloads, since everyone asks

Yes, there's a downloader for Kick too. Past VODs, clips, whatever the public catalog exposes, into the same library with pause/resume/retry and audio-only extraction where you just want the podcast hours. What your session can see is what the download is defined by; configuration in settings covers the edge cases.

One live-truth note: platforms rearrange their plumbing, Kick included, and a downloader wrapped around one endpoint dies when that endpoint does. Rekordly's plugins ride the site's own supported surface and update with the app, which is a boring sentence that happens to decide whether your archive survives next quarter's API shuffle.

## Rapid-fire answers

**Need a Kick account?** No. Cookies are a rate-limit nicety, nothing more.

**Does the streamer know?** The app reads the same public surfaces any viewer device reads; recording happens locally.

**Files proprietary?** No. Standard files, any player opens them, library is just the index on top.

**Also does other platforms?** Twitch and YouTube and Rumble and twelve cam sites; full list in the [platform docs](/docs/platforms), cam guides at the [cam recording hub](/adult-stream-recording), and the [Twitch guide](/blog/twitch-recorder) has the one platform that needs API credentials.

**Price?** Free for personal use, PolyForm Noncommercial, no watermarks, no quotas. Companies buy the [license](/docs/license); personal pockets stay shut.

## The one rule I keep repeating

Kick's terms and your local laws are the actual rulebook, and no tool changes that. Record for yourself, don't redistribute other people's content, don't be the reason a platform tightens its policies. And if that all sounds obvious: good. Most Rekordly users are exactly the type.

## Go set it up

[Download](/download), add a creator, flip the switch, close the app if you want. It runs in the background, checks quietly, records when it should. The usual sibling reads: the [YouTube recorder guide](/blog/youtube-recorder) and the general [free cam site recorder page](/blog/free-cam-site-recorder) for the whole approach in one spot.
`,
  },
];

// Rendered newest-first no matter how posts are grouped in the array above
// (ISO dates sort correctly as plain strings).
blogPosts.sort((a, b) => b.date.localeCompare(a.date));

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
