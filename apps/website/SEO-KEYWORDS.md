# Rekordly — SEO keyword & query strategy

_Single source of truth for what search queries we target, which page targets
them, and what still needs to be written. Update the Status column as pages
ship. Today's state lives in `src/content/` (titles/description in each page's
`useSeo` call) and `src/content/blog.ts`._

## How this works (and what does not)

- Google **ignores** the `<meta name="keywords">` tag (it has since 2009). Never
  spend effort there. What moves rankings for us:
  1. **A page that matches the query** — "Stripchat recorder" needs a page whose
     title/H1/URL are about a Stripchat recorder.
  2. Title & meta description that repeat the query naturally.
  3. Real, unique, honest content (Google punishes thin template pages).
  4. Structured data (JSON-LD FAQ + SoftwareApplication — already wired in
     `src/lib/seo.ts`), internal links, sitemap coverage.
- One intent → one page. Never target the same keyword on two pages; Google
  will pick one and demote both.
- Keep titles ≤ ~60 chars, meta descriptions ~150–160 chars.

## Query clusters

### A. Generic recorder (highest volume, hardest)

| Query | Target page | Status |
|---|---|---|
| stream recorder / record live stream | `/` (Home) | ✅ optimized 2026-10-19 |
| free stream recorder for windows | `/` (Home) + `/download` | ✅ |
| how to record live streams | `/blog/how-to-record-stripchat` (cluster) + docs | ✅ |
| stream recorder no screen recording | Home + `/blog/free-cam-site-recorder` | ✅ |
| download live videos / VOD downloader | `/features/recording` + docs | existing |
| automatic stream recorder | `/features/automation` | existing |

### B. Cam-site generic (the money cluster — lower competition, high intent)

| Query | Target page | Status |
|---|---|---|
| cam site recorder / cam recorder | `/adult-stream-recording` | ✅ optimized |
| free cam recorder for windows | `/adult-stream-recording` + hub post | ✅ |
| record cam shows / record live cam streams | `/adult-stream-recording` + hub post | ✅ |
| adult stream recorder / adult cam recording software | `/adult-stream-recording` | existing |
| cam video downloader | `/features/recording` + platform posts | existing |
| is there a free cam show recorder | hub post FAQ | ✅ |
| best cam site recorder 2026 | hub post | ✅ |

### C. Per-platform (the exact queries people type — each gets one guide)

Split between the exact "X recorder" query and "how to record X" — one page
targets both.

| Query | Target page | Status |
|---|---|---|
| stripchat recorder / free stripchat recorder | `/blog/stripchat-recorder` | ✅ |
| record stripchat / how to record stripchat shows | same post | ✅ |
| stripchat video downloader / stripchat vod download | same post (+ `/features/recording`) | ✅ |
| bongacams recorder / free bonga recorder | `/blog/bongacams-recorder` | ✅ |
| record bongacams / bonga cams recording | same post | ✅ |
| chaturbate recorder / record chaturbate shows | `/blog/chaturbate-recorder` | ✅ |
| chaturbate video downloader | same post | ✅ |
| dreamcam recorder / record dreamcam | `/blog/vr-cam-recorder` | ✅ |
| vr cam recorder / record vr cam shows | same post | ✅ |
| record stripchat vr / stripchat 3d | same post | ✅ |
| camsoda recorder / record camsoda | future post (`/blog/camsoda-recorder`) | ⬜ queue |
| cam4 recorder / record cam4 | future post (`/blog/cam4-recorder`) | ⬜ queue |
| myfreecams recorder / record myfreecams | future post (`/blog/myfreecams-recorder`) | ⬜ queue |
| streamate recorder / record streamate | future post (`/blog/streamate-recorder`) | ⬜ queue |
| jerkmate recorder / record jerkmate | future post (`/blog/jerkmate-recorder`) | ⬜ queue |
| twitch recorder / auto record twitch streams | `/blog/twitch-recorder` | ✅ written 2026-10-01 |
| kick recorder / record kick streams | `/blog/kick-recorder` | ✅ written 2026-10-15 |
| rumble recorder | `/docs/platforms` (+ a guide if demanded) | existing |
| youtube live recorder / record youtube livestreams | `/blog/youtube-recorder` | ✅ written 2026-09-21 (crowded field — long game) |

### D. Tango (the plugin is nearly shipped — post is written)

The guide lives at `/blog/tango-recorder` and is **already in the repo**. Hold
the deploy that publishes it until Tango is actually in a shipped release —
the post says "Rekordly now has a Tango plugin". When the plugin lands, flip
the same things so site-wide claims agree with the post:

| Query | Target page | Status |
|---|---|---|
| tango recorder / tango live recorder | `/blog/tango-recorder` | ✅ written — publish with plugin release |
| record tango live streams | same post | ✅ written |
| free tango video downloader | same post | ⚠️ post stays conservative (no VOD-download claim) |

Ship checklist for the plugin release: `plugins.ts` entry (id, domain, icon,
capabilities), `site.ts` `platforms` array, PlatformMatrix renders it, and this
doc's row flipped to ✅ shipped.

### E. Feature / product queries

| Query | Target page | Status |
|---|---|---|
| auto record streams when creator goes live | `/features/automation` | existing |
| how to record streams on blocked networks / isp blocked | `/features/blocked-networks` | existing |
| free stream library organizer | `/features/library-editor` | existing |
| video editor trim streams | `/features/library-editor` | existing |
| telegram notifications stream recorder | `/features/notifications-remote` | existing |
| record vr streams windows | `/blog/vr-cam-recorder` + features | ✅ |
| open source stream recorder alternative | Home + blog posts | existing |

### F. Question queries (FAQ-schema bait — answer inside existing pages)

| Query | Page |
|---|---|
| can you record stripchat | `/blog/stripchat-recorder` FAQ |
| is it legal to record cam shows | adult page FAQ + every guide's FAQ |
| does recording webcam shows cost money | all guides ("free under PolyForm") |
| do i need to keep a browser tab open | adult page FAQ ("no — stream copy") |
| will the creator know i recorded (platform notifications live status) | avoid promising anything: answer = platform-dependent, Rekordly reads public pages like a viewer |
| what happens when a stream ends mid-recording | docs/troubleshooting |
| cam shows fill my disk — storage guardrails | docs/auto-record |

## Meta title/description templates (already applied to existing pages)

- Home: `Rekordly — Free Stream & Cam Site Recorder for Windows`
- Cam hub: `Free Cam Site Recorder — Stripchat, BongaCams & More | Rekordly`
- Download: `Download Rekordly — Free Stream Recorder for Windows`
- Guide posts: `<Platform> Recorder — Record Shows Automatically | Rekordly`
  (the hook appends " | Rekordly" automatically; keep the pre-suffix ≤ 60 chars).

## Publishing rules to stay clean

1. Every claim must match the capability matrix in `src/content/site.ts`
   (`platforms` array) — e.g. BongaCams has **no VOD downloads**, download
   posts must say "live recording only".
2. Always include the responsibility/legal paragraph (copy the one on
   `/adult-stream-recording`). The tone: tooling is legal to publish, using it
   is your responsibility — never promise permission.
3. One internal link minimum to `/download`, one to the matching
   `/docs/<slug>`, one cross-link to a sibling guide.
4. Sitemap: add the new URL to `public/sitemap.xml` in the same commit.
5. Run `node scripts/checkFeatureLinks.mjs` — it fails the build if a guide
   links to a route that does not exist.
6. Cadence: platforms in cluster C's queue → one post per platform as they are
   prioritized; keep each ≥ 700 words of unique content.
