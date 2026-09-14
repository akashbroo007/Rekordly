# Rekordly website — SEO playbook

Everything on this list ships with the codebase. Items marked **manual** need
human action once (verification, external accounts). Check items off as you
complete the manual steps.

## Shipped in code

| Item | Where |
| --- | --- |
| Unique meta titles + descriptions per page | `src/lib/seo.ts` via `useSeo()` on every page |
| Canonical tags (absolute, one per page) | `src/lib/seo.ts` — `upsertLink("canonical", …)` |
| Open Graph + Twitter cards, og:image 1200×630 | `index.html` defaults + per-page overrides; asset at `public/og-image.png` |
| `robots.txt` (crawlers allowed, AI scrapers blocked, sitemap pointer) | `public/robots.txt` |
| `sitemap.xml` — 28 URLs incl. all blog posts & docs | `public/sitemap.xml` |
| HTTPS + HSTS preload, nosniff, frame-deny, referrer policy | `public/_headers` (Cloudflare Pages also force-HTTPS by default; enable "Always Use HTTPS" + HSTS in the dashboard) |
| Schema.org JSON-LD: WebSite, SoftwareApplication, FAQPage, Blog, BlogPosting | `src/lib/seo.ts` helpers used per page |
| Exactly one `<h1>` per page; logical h2/h3 below | `SectionHeading as="h1"` on landing pages; article h1s in blog/docs/legal |
| Clean slugs (`/blog/what-is-rekordly`, `/docs/auto-record`) | no query-string or date-based URLs anywhere |
| Internal links: blog ↔ docs ↔ product pages, footer Blog link | blog bodies + `BlogIndexPage` + `Footer.tsx` |
| Images: alt text, `loading="lazy"`, `decoding="async"`, width/height | `ScreenshotFrame.tsx` |
| Screenshot compressed 151 KB → 55 KB (WebP); demo video 1.8 MB → 960 KB with `+faststart` | `public/screenshots/dashboard.webp`, `public/demo/rekordly-demo.mp4` |
| 404 & empty states `noindex` | `useSeo({ noindex: true })` in `NotFoundPage`, `DocsArticlePage` |
| Immutable caching for hashed assets; HTML always revalidated | `public/_headers` |

## Manual steps (do once)

### 1. Verify Google Search Console

1. Go to <https://search.google.com/search-console> and add property
   `https://rekordly.in` (Domain property is best — it covers http/https and
   all subdomains).
2. Pick the **HTML file** method: download `google<hash>.html` and drop it in
   `apps/website/public/` — it deploys with the next build.
3. Alternatively use the **DNS TXT record** method in your domain registrar
   (works even if the file is lost later).
4. After verification, submit `https://rekordly.in/sitemap.xml` under
   *Sitemaps*.

### 2. Bing Webmaster Tools (optional but easy)

Import the site straight from Search Console at <https://www.bing.com/webmasters>.
It also feeds Yahoo/DuckDuckGo.

### 3. Backlink strategy

Goal: links from real pages that streaming/archiving audiences read. In rough
priority order:

**Developer & open-source audiences**
- GitHub repo profile: pin the repo, keep the website URL in the repo
  description and the README's first paragraph.
- GitHub Discussions + Issues: help people in *other* stream-archiver projects
  (yt-dlp discussions, similar tooling) where a Rekordly link genuinely helps.
- awesome-* lists: submit PRs to awesome-yt-dlp / awesome-stream-archiver
  style lists.
- Show HN ("Show HN: Rekordly – auto-record streams on Windows") and
  r/selfhosted, r/datahoarder, r/opensource type subreddits — follow each
  community's self-promo rules.

**Content-driven links (the blog is built for this)**
- The three posts target real search intent ("how to record streams",
  "who is it for", "what is it"). Add one comparison/guide post per month and
  pitch it to newsletters like Console.dev or TLDR.
- Answer Quora/StackExchange questions about recording streams with a
  non-spamy link when relevant.

**Directories & profiles**
- AlternativeTo, Product Hunt (launch), SourceForge, Slant, and any
  Windows-software directories — these are stable, easy wins.
- The app's listing on Microsoft Store (if/when packaged) links back too.

**Partnerships**
- Plugin authors who build site integrations will link their plugin pages
  back to Rekordly — the plugin guide already encourages public repos.
- Offer the commercial license page a "powered by Rekordly" badge that
  customers can embed (classic badge backlink).

**What to avoid**
- Buying links or bulk directory spam — Google devalues/penalizes these.
- Link swaps with unrelated sites.

### 4. After launch checklist

- [ ] `curl -I https://rekordly.in` returns `301` to https and
      `strict-transport-security` header present.
- [ ] Search Console → URL Inspection → request indexing for `/`,
      `/blog`, and each blog post.
- [ ] Rich results test: <https://search.google.com/test/rich-results> —
      confirm FAQPage + BlogPosting are detected.
- [ ] PageSpeed Insights on `/` and `/blog` — confirm CLS ≈ 0 (width/height
      are set) and LCP is the hero text, not the video.
- [ ] Check `/sitemap.xml` and `/robots.txt` return 200 in production.
