# Rekordly — Launch Notes (the announcements, ready to paste)

Companion to [LAUNCH_PLACES.md](LAUNCH_PLACES.md). Replace `◉` tokens with
current facts (version, links) before posting. Keep tone honest; never claim
telemetry/ad-free things you haven't verified.

Shared tokens:
- Download: `https://github.com/akashbroo007/Rekordly/releases`
- Site: `https://rekordly.in`
- Plugin guide: `https://github.com/akashbroo007/Rekordly/blob/main/docs/PLUGIN_GUIDE.md`

---

## 1. Main launch post — Reddit / F95Zone / forums (angle A)

**Title options:**
- I built Rekordly — a free, open-source Windows app that auto-records live streams (Twitch, Kick, YouTube, Rumble + a set of cam sites, VR included), downloads VODs, and organizes everything into a searchable library
- Stop losing live streams. Rekordly: free auto-recorder + download manager + local library (Windows, open-source)

**Body:**

> Hey — I'm Akash, I built this alone over the past months, and it's now at the point where I want real hoarders to hammer on it.
>
> **The problem it solves:** you discover a streamer after the fact, the VOD is gone/set to subscribers, and nothing critical is ever saved. Rekordly fixes that in one machine sitting quietly in your tray.
>
> **What it does**
> - **Monitor** creators across 13 plugins (Twitch, YouTube, Rumble, Kick, Chaturbate, Cam4, Jerkmate, Streamate, Stripchat, BongaCams, CamSoda, MyFreeCams, Dreamcam) — live status, viewer counts, stream titles on a configurable check interval.
> - **Auto-record** the moment a creator goes live, with guardrails: master pause switch, disk-space guardrail, segment splitting every N minutes, crash reconciliation on next launch.
> - **Downloads** for VODs/clips/any supported URL via vendored **yt-dlp + ffmpeg** (nothing else to install).
> - **Library**: searchable, tags/collections/favorites/notes, storage manager, stats dashboard.
> - **Cloud uploads**: Gofile, Catbox, MixDrop, Google Drive.
> - **Remote control from Telegram**: "creator went live" pushes with actual Record buttons on your phone; pause/resume/stop a running capture from chat.
> - **VR**: Stripchat & Dreamcam recordings capture the **3D stereoscopic feed**, playable in a built-in look-around player.
> - **Plugin system**: every bundled site *is* a plugin on a public SDK — if your favorite site is missing, someone can literally write it in a weekend (guide + typed SDK in the repo). New plugins are the most welcome contribution type.
>
> **Cost model:** everything above is free — no feature caps, personal or
> commercial use included, Apache-2.0 (open source: read it, audit it, fork
> it — the full source is public).
>
> **Use the tool responsibly**: Rekordly is for personal archiving on your own drives. Respect the creators whose content you follow and the sites' terms — keep recordings personal, don't re-distribute other people's shows. And if you *are* a creator: it works great recording your own shows, which some of you have told me is the best part.
>
> **Known limits:** Windows 10/11 x64 only right now; some sites record live but have no VOD downloads yet (documented per-plugin); if a site changes its code, its plugin degrades until it's patched.
>
> What I want from this community: crash logs, plugin requests, and the UX you'd change first. GitHub Releases link + docs in the comments. AMA.

*(For pure-cam communities, "cam sites" gets verified support transparency — link the per-site capability table from the README rather than dumping the matrix.)*

---

## 2. Modmail template — r/DataHoarder

> Subject: permission for a tool post (free & open-source stream auto-recorder)
>
> Hey mods — long-time reader. I'm the dev of Rekordly (`github.com/akashbroo007/Rekordly`), a free and open-source Windows app that auto-records live streams and organizes them into a searchable local library (tools bundled: yt-dlp + ffmpeg; Telegram remote control; plugin SDK so new sites are community-buildable). It's in the same family as the recorder tools that have come through here before, but maintained and capped at one honest post.
>
> Would you allow a single "Tool" self-post? If not, would a technical write-up (plugin architecture / how VR stereoscopic capture works) be acceptable as regular content instead? Happy to take whatever tone/rules you prefer. Thanks!

---

## 3. F95Zone / forum release-thread opener (shorter, punchier)

> **[Windows] Rekordly — auto-record live streams from 13 sites (incl. VR), free & open-source**
>
> TL;DR: it watches creators for you, hits record the second they go live, and files everything into a library you can actually search — tags, notes, stats, cloud push (Gofile/Catbox/MixDrop/GDrive), and Telegram buttons to record from your phone without a PC in the room.
> - Sites: Twitch / YouTube / kick / Rumble / Chaturbate / Cam4 / Jerkmate / Streamate / Stripchat (VR) / BongaCams / CamSoda / MyFreeCams / Dreamcam (VR)
> - Bundles yt-dlp + ffmpeg — install-and-go, ~nothing else needed
> - License: Apache-2.0, free for personal and commercial use; source is public
> - Download: GitHub releases → `◉releases-url`; site `rekordly.in`
>
> I'm the dev. Ask me anything in-thread; plugin requests are literally how new sites get added — the SDK is public and typed. Changelog and roadmap in the repo.

---

## 4. Performer-side post — WeCamgirls / r/CamGirlProblems / OF-Advice subs (angle B)

> **Your shows, your drives: how I keep every stream I do**
>
> A backup rant, first: hard drives die mid-stream; "I'll re-edit it later" files never surface; and the private where something funny happened is gone by morning unless someone recorded it. Creators deserve their own recordings, not just the site's retention.
>
> So I built a tool for exactly that and it's free: **Rekordly** (Windows). It watches your own rooms (or anyone you follow) on a check interval, starts recording when a show goes live, stops when it ends, splits long shows into parts so a 7-hour stream isn't one fragile file, and drops everything into a searchable library — tags, notes, favorites. Optional pushes to Google Drive/Catbox/etc when the show finishes, so the backup exists even if the rig crashes overnight. Also records your own VR shows (Stripchat/Dreamcam 3D feed) as stereoscopic files.
>
> Consent line, said plainly: this is for **your own shows and archive-keeping**, not for harvesting other people's — redistribution of someone's show is not what this is for and I'd rather keep it that way.
>
> Free and open source (Apache-2.0), GitHub releases in comments. Would love feedback from working models — especially what the "ideal file name / folder structure" actually looks like to you, because I'll make it default.

*(Never paste the exact same text into two communities — rewrite the opener in that community's voice. In advice subs, include 3–4 genuinely useful storage tips first and the tool second.)*

---

## 5. VideoHelp forum thread (technical voice, no hype)

> **Release: Rekordly — Windows GUI wrapper for multi-site live recording + downloads**
>
> I've released v◉ of Rekordly, a Windows app for recording live streams and downloading VODs. Under the hood it drives vendored yt-dlp and ffmpeg, which is why there's nothing external to install. It exposes live-detection intervals, per-creator auto-record with segment splitting and disk-space guards, per-URL quality probing, MP4/MKV output organized into a local library, and provides plugin-defined site support (Twitch, YouTube, Kick, Rumble, plus Chaturbate/Cam4/Jerkmate/Streamate/Stripchat/BongaCams/CamSoda/MyFreeCams/Dreamcam; Stripchat/Dreamcam capture the stereoscopic VR feed). Binary and source at GitHub `◉releases-url`, license Apache-2.0 (free for personal and commercial use, open source). I'd genuinely appreciate bug reports from this forum's users — especially stream-edge cases around segmented live recording.

---

## 6. Hacker News (Show HN)

**Title:**
`Show HN: Rekordly – auto-recorder for live streams with VR capture (Windows, open-source)`

**First comment (skeleton, fill from main post):**

> Hi HN — I spent months on this because I kept missing streams to retention windows and channel deletions, and the single-site DVR tools I tried are largely unmaintained.
>
> Rekordly watches creators on whatever interval you choose, starts a recording the second one goes live, and turns finished files into a searchable local library with optional cloud push and Telegram remote control. It ships yt-dlp and ffmpeg vendored; site support is implemented as plugins on a public typed SDK (the 13 bundled sites — Twitch, YouTube, Kick, Rumble, and a set of cam sites including stripchat VR — are all built that way, so community plugins are the intended growth path).
>
> License: Apache-2.0 — free for personal and commercial use, open source so you can audit or build it. I'll happily answer design questions about live-stream capture, VR stereoscopic recording, or why I vendored yt-dlp instead of shelling out.
>
> Releases: ◉releases-url

---

## 7. Product Hunt

- **Tagline:** "Auto-record every live stream — then actually find it again"
- **Description:** Rekordly monitors creators across Twitch, YouTube, Kick, Rumble and 9 cam sites, records the moment they go live, and files everything into a searchable local library. yt-dlp + ffmpeg bundled, Telegram remote control, VR playback, public plugin SDK — free and open source (Apache-2.0).
- **First comment:** dev story (2 paragraphs), gallery of dashboard + Telegram + VR player, then the consent paragraph verbatim.

---

## 8. Directories blurb (AlternativeTo / Softpedia / MajorGeeks / SaaSHub)

**Title:** Rekordly
**One-liner:** Monitor and auto-record live streams from Twitch, Kick, YouTube, Rumble and 9 cam sites (VR support included) — then organize, tag, and cloud-push everything in a searchable local library.
**Keywords:** stream recorder, live stream downloader, auto-record, chaturbate recorder, stripchat recorder, twitch dvr, vod downloader, webcam recording, media library, yt-dlp frontend
**License/price:** Free for everyone (Apache-2.0, open source). Windows 10/11.

---

## 9. Comment-format answer (promo-restricted subs like r/Twitch)

When cold posts are banned, do the answer-first version in threads about VODs/missing streams:

> 90% of "is there a VOD?" is a retention problem, not a rights one — retention windows and channel deletions. What I do myself: `◉one sentence: "I built Rekordly — it auto-records the moment a creator goes live and keeps every recording local + searchable (free, open-source — github.com/akashbroo007/Rekordly)"`. Works offline, no account; Windows only today. Disclosure: I'm the dev.

---

## 10. Maintainer outreach DM (goondvr / ctbcap / ChatRoomRecorder / etc.)

> Hey ◉maintainer — I maintain Rekordly (◉repo-url), a Windows-based multi-site live-stream recorder built around yt-dlp/ffmpeg with a public plugin SDK (every bundled site is a plugin). Your project is on my compatibility radar; if you ever consider migrating — or want the reverse (I port your ◉site support into a Rekordly plugin and credit you) — I'd love to talk. Either way, appreciate the work you've put into the space.

---

## 11. Consent paragraph — verbatim, every adult-audience post

> **Use responsibly:** archive for yourself, keep recordings of other people to personal use, respect performers' and platforms' rights. Redistribution is the thing to avoid — this tool keeps files on *your* machine, and that's the point. Creators recording their own shows is a first-class use case.

---

## 12. Follow-up comment template (48h "what's changed")

> Quick update cycle for ◉place: v◉in. shipped ◉thing (often a plugin), fixed ◉bug reported here by ◉user, and ◉next-thing is next. Everything's free & open source; repo + releases in the OP. What should the next plugin be — really, name the site you wish it covered.

---

## Checklist before Day 0

- [ ] GH release tag matches all `package.json` versions (CI gate) — see AGENTS.md pre-tag list
- [ ] `node scripts/checkFeatureLinks.mjs` passes in `apps/website`
- [ ] latest.yml + installer + portable exe all present on the release
- [ ] Install images: dashboard, Telegram push with buttons, VR look-around player, library tag view
- [ ] `◉` tokens replaced; links resolve
- [ ] VirusTotal scan of the installed exe posted as a comment preemptively (hobby-tool trust)
- [ ] Modmail sent to r/DataHoarder (+ optionally r/Piracy) ≥ 72h before at Day 0
