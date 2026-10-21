# Rekordly — Launch Playbook: Places & Notes (first-users release)

Goal: put v1.x in front of the people who *already archive cam/stream content*, in
order of how closely each place matches that audience. Pair this file with
[LAUNCH_NOTE.md](LAUNCH_NOTE.md) — every post below reuses one of the notes there.

Positioning angles (pick one per place, never send all three to one community):

- **A — The tool angle** *(data hoarders / tech)*: free, open-source,
  all-in-one live-stream auto-recorder: keeps a local library, uploads to the
  cloud, Telegram remote control, VR capture, plugin SDK. `_100% local, no ads, no accounts_`
- **B — The creator angle** *(cam models & adult creators)*: "record and archive
  **your own** shows automatically — the show files stay yours, organized and searchable".
- **C — The viewer angle** *(fan of streamers)*: "never miss a live again — auto-record
  anyone you follow".

---

## Tier 1 — The cam/stream-archiving ecosystem (highest intent, do first)

| # | Place | Where exactly | Angle | Notes / gotchas |
|---|-------|---------------|-------|-----------------|
| 1 | **F95Zone** — `f95zone.to` | Software/tech sections (they host tool dev-threads; see the existing "CB Recorder" threads) | A | Big, active adult community that publicly discusses recorder tooling. Make a proper release-thread: screenshots, feature list, GitHub link, changelog/roadmap, answer every comment. Be an established member first (lurk, reply to 2–3 tool questions) — cold posts get ignored. |
| 2 | **r/DataHoarder** — `reddit.com/r/DataHoarder` | Main sub, after modmail | A | Recorder-tool posts have history here (e.g. the 2019 "Chaturbate Recorder" thread). Rule: promotion needs **mod permission** — modmail the template from LAUNCH_NOTE.md days in advance. Offer a technical write-up instead of a plain ad; it comments better. |
| 3 | **VideoHelp Forum** — `forum.videohelp.com` → *Video Streaming Downloading* + the `videohelp.com/software` database | New thread + software-DB entry | A | VideoHelp is *the* 20-year-old home of stream-recording users; they actively ask devs to "submit new video software" into their software list. Do both: a release thread AND a DB entry (they review and list it). |
| 4 | **GitHub — the cam-DVR ecosystem** | Repo relations, not ads | A | The known projects: `goondvr` (HeapOfChaos), `ctbcap` (KFERMercer), `ChatRoomRecorder` (SagalVanderklok), `teacat/chaturbate-dvr` (**archived Nov 2025 — its users need Rekordly now**, say that openly). No repo-comment spam: instead (a) **topics are set ✓** — live set (20 = GitHub max): `stream-recorder`, `stream-recording`, `livestream`, `video-downloader`, `twitch`, `youtube-downloader`, `yt-dlp`, `ffmpeg`, `electron`, `windows`, `media-library`, `telegram-bot`, `webcam`, `vr`, `chaturbate`, `stripchat`, `bongacams`, `camsoda`, `myfreecams`, `cam4` — these make topic pages like `github.com/topics/chaturbate` surface Rekordly, (b) reach out to maintainers to swap "related projects" mentions, (c) do yt-dlp karma work — Rekordly ships vendored yt-dlp, fixing a bug upstream earns goodwill and name-recognition. |
| 5 | **GitHub Topics pages drift** | `github.com/topics/chaturbate`, `/topics/stripchat`, `/topics/cams`, `/topics/stream-recording` | A | Free discovery surface — depends entirely on repo topics being set (see #4). Watch trending after wk 1 if stars accumulate. |
| 6 | **AmberCutie's Forum (ACF)** — `ambercutie.com/forums` | Chaturbate/tags → apps & tools where they exist; else General | A + B | Adult community for models & members, alive and active; "chaturbate apps"-type threads exist. Register, read section rules (NSFW community with its own etiquette), make an intro post, don't sign-post-spam. |
| 7 | **r/DataHoarder Discord** | linked from the sub's sidebar | A | Worth being present in #projects / #software once the modmail-OK thread exists; don't circumvent mods by going Discord-first. |
| 8 | **Discord discovery via Disboard** — `disboard.org` | search "camgirl", "webcam", "data hoarder", "archive" | A + B | Dozens of small cam/model/memory Discords. Each server has its own promotional rules — join, chat, then share in their designated channel. Never carpet-bomb. |
| 9 | **r/Piracy megathread** (optional, modmail first) | request a line in the tools megathread | A | Recorder tools historically live in the megathread. Ask politely in modmail; don't post the thread cold. Skip if uncomfortable — it's a traffic-up, positioning-tolerant audience only. |

---

## Tier 2 — Performer side (angle B: "record YOUR OWN shows")

These are consent-clean: models who record their own paid shows to keep, sell, or edit.

| # | Place | Where exactly | Notes / gotchas |
|---|-------|---------------|-----------------|
| 10 | **WeCamgirls** — `wecamgirls.com` | Forum (since 2012), tech/guides area | Mission-fit for the creator angle: "free community for cam models and adult content creators… guides and tools". Register free, be a real member before pitching: answer privacy/backup posts with genuinely useful advice, then mention what you built. |
| 11 | **StripperWeb** | Camming sections | Long-running industry forum (varies in activity — check current state). Industry-insider etiquette: no drive-by promo. |
| 12 | **ACF** (from Tier 1, reused) | General/tool threads | Same community, this time opened from the model angle: "never lose a paid private to a dead drive". |
| 13 | **r/CamGirlProblems** | Post as resource, not vendor | "post problems & share knowledge while being a cam model". Vendor posts get eaten alive; the honest version works: "I built this, here's why, free, AMA". Check rules + modmail if unsure. |
| 14 | **r/OnlyFansAdvice** / **r/CreatorsAdvice** | Weekly/info threads or per rules | Creator-support subs where backup & archiving of own content is a living topic. Read current pinned rules before first post. |
| 15 | **r/SexWorkers** | Comments/answers only | Heavily moderated; no cold ads — this is comment-credibility territory only. |
| 16 | **CamgirlLinks** — `camgirl-links` (`camgirllinks.com`) | Resource directory | They catalogue forums/tools for models — ask to be listed under software/tools; directories evergreen-convert. |
| 17 | **CamiPlay blog** — `camiplay.com` | Guest-post / listicle pitch | They publish "best forums for cam models" listicles — pitch them "best tools to archive your own shows" featuring Rekordly. |
| 18 | **Private model Discords** (per-site cluster servers) | via Disboard / intros from ACF/WCg members | Where power models already discuss tools. Get invited, then introduce the tool inside the community's rules. |

---

## Tier 3 — General streamer/creator communities (angle C)

| # | Place | Where exactly | Notes |
|---|-------|---------------|-------|
| 19 | **r/Twitch** | tool posts per sub rules (often limited threads) | Check rules — they typically limit self-promo; if so, answer "how do I save a VOD…" comments with the tool in the 2nd sentence of a helpful reply, which their rules usually tolerate better than a cold post. |
| 20 | **r/streaming** | main | Broadcaster-tech sub, tool talk is normal. Post with screenshots. |
| 21 | **r/KickStreaming** (and Rumble-communities) | main | Kick power users lose content to deletions most — the "auto-record + Kick downloads" line is strong. Verify current sub name; Kick subreddits have churned. |
| 22 | **r/NewTubers** | weekly thread per rules | YouTube side of the product (record + download + library). Post in whatever promo thread they run this week. |
| 23 | **r/YouTube** (comment-only) | comments | Cold posts usually get removed; lend answers. |
| 24 | **r/Livestream** / niche IRL-tech groups where stream-capture is discussed | varies | Low volume; comment-level only. |

---

## Tier 4 — General tech / launch pads / directories

| # | Place | Link / entry | Notes |
|---|-------|--------------|-------|
| 25 | **Hacker News — "Show HN"** | `news.ycombinator.com/showhn.html` | Title: "Show HN: Rekordly – auto-recorder for live streams (Windows, source-available, VR)" — post Tue–Thu morning ET. Expect ToS/privacy questions; answer straight. Plug cam sites as one line only. |
| 26 | **Product Hunt** | producthunt.com | Prep tagline + 3 assets; launch on a weekday after HN. |
| 27 | **Indie Hackers** | indiehackers.com | Create product page + "How I built it" devlog; the plugin-architecture story is the interesting part. |
| 28 | **Peerlist Launchpad**, **Uneed**, **BetaPage**, **Launching Next** | peerlist.io/launchpad · uneed.best · betapage.co · launchingnext.com | Free-ish launch aggregators; 15 min each; check alive at post-time, submit where the form works. |
| 29 | **r/SideProject** | main | Adult-tool posts have direct precedent there (an adult live-recorder was posted publicly). Angle A, honest tone. |
| 30 | **r/opensource** · **r/coolgithubprojects** · **r/software** · **r/foss** · **r/SelfPromo** · **r/alphaandbetausers** | main | One post per sub, rewritten per audience (never identical text sitewide — spam-filter + etiquette). |
| 31 | **AlternativeTo** | `alternativeto.net/suggest/` | Submit as "Rekordly" and declare what it's an alternative to (Streamlink / yt-dlp wrappers / commercial recorder services). Evergreen traffic. |
| 32 | **Softpedia** · **MajorGeeks** · **FileForum (BetaNews)** · **SaaSHub** | each site's "submit/add software" page | Submission ecosystems for Windows freeware; their editors list/describe it. Do them all once, then forget. |
| 33 | **Tech blogs / listicles** | gHacks (`ghacks.net`), TechSpot news tip, `ilovefreesoftware.com` | Short pitches: 3-line "what it is + why free + screenshot". gHacks historically covers niche tools; ilovefreesoftware reviews free software by submission. |
| 34 | **awesome-lists** | open PR / issue on `all-the-data/awesome-data-hoarding`; find others via `github.com/topics/awesome-lists` → "streaming" | The old emanuelef stream-recording list is gone — mention that in your PR ("maintainer vanished, adding maintained alternative" is a natural fit). |
| 35 | **Socials** | X/Bluesky/Mastodon/Threads: `#DataHoarder #streaming #Windows #opensource` | Regular launch posts, not the center of gravity; do them, then move on. 4chan /g/ — only if you're comfortable with the chaos, one post, expect rough language. |

---

## Where NOT to post (and why)

Skip the "cam archive / leak" tube sites, file-share boards, and Telegram/Dis c ord channels
whose purpose is redistributing models' recorded shows without their consent.

1. **Legal/reputational**: that ecosystem is exactly what NCII laws exist for. Attaching
   Rekordly to it invites takedown storms, payment-processor suspicion, and abuse-flag
   risk on every service the app touches.
2. **Audience mismatch**: those users want re-uploads, not a tool that keeps files *personal* —
   the product's core promise (local, private, consent-respectful) contradicts the room's etiquette,
   and the app will get criticized *or worse, co-opted*.
3. **Positioning durability**: the eventual explainer stories will write about Rekordly as whatever
   community introduced it first. Set the frame: "built for archiving your own and for fandom privacy —
   endorsed by performers, not by leak boards."

---

## Order of operations

- **D-4 to D-1**: repo polish (screenshots in README, topics set per #4, latest release verified);
  send the r/DataHoarder + r/Piracy modmails; create ACF / WeCamgirls / VideoHelp accounts, make a
  couple of organic posts in each; prepare images (dashboard, Telegram buttons, VR player).
- **Day 0**: Show HN (morning ET) → F95Zone thread → VideoHelp thread → r/DataHoarder thread
  (modmail-OK'd) → GitHub topics live.
- **Day 1–2**: r/SideProject + the small reddit subs → Product Hunt → Indie Hackers → Directory
  submissions (31–32) → launch posts on X/Bluesky.
- **Week 2**: performer angle (B) on WeCamgirls / ACF / r/CamGirlProblems / OF Advice —
  genuinely helpful content first; CamiPlay + gHacks pitches; awesome-list PRs; Disboard Discord intros.
- **Weekly after**: every landing spot gets a changelog-comment ("added site X by plugin, thanks
  @user") — that's what keeps niche communities recommending you.

## Universal posting rules (every place)

1. Disclose you built it ("I'm the dev", first sentence).
2. Lead with what's *free*, and Apache-2.0 open source in one line.
3. Windows-only at the top (expect Mac/Linux questions; answer honestly: "bring a plugin, or upvote an issue").
4. Never host installer files in the post — link GitHub Releases + rekordly.in only (every
   hobby-tool's installer trips *something*; pointing people at the checksummed GitHub source
   is what defuses the antivirus FUD).
5. Include the consent paragraph from LAUNCH_NOTE.md **verbatim in every adult-audience post**.
6. One site ≠ one copy-paste: rewrite the first paragraph to that community's vocabulary.
7. Answer every comment for 48h; screenshot every criticism; log all site/plugin requests in the repo issues.
