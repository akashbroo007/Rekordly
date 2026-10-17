/**
 * Channel page parsing for Rumble.
 *
 * Channel pages (`/c/<handle>` or `/user/<name>`) are server-rendered with a
 * JSON payload inside `<script type="application/json">` tags whose `items`
 * array describes every video on the page (the exact data Rumble's own
 * front-end hydrates from). This module owns the platform shape knowledge so
 * `index.ts` stays readable.
 *
 * VALIDATED ITEM SHAPE (live channel page, 2026-09):
 * ```
 * { "object_type": "video",                 // "videostream" on some grids
 *   "relative_url": "/vXXXX-slug.html",     // permalink -> vXXXX id
 *   "live": true,                           // broadcast flag
 *   "livestream_status": 2,                 // 2 = live
 *   "watching_now": 1069,                   // live viewers (null off-live)
 *   "title", "thumb", "eid", "upload_date",
 *   "videos": [{ "url": "…playlist.m3u8", "type": "hls" }] }
 * ```
 *
 * Legacy HTML-only fallbacks (og:video embed tag, `/vXXXX` anchor links)
 * are kept as secondary discovery signals for layout changes.
 */
import type { CreatorInfo } from '@rekordly/plugin-sdk';

export const DEFAULT_BASE = 'https://rumble.com';

type Json = Record<string, unknown>;

export function asRecord(v: unknown): Json | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
}

export function str(v: unknown, key: string): string | undefined {
  const x = asRecord(v)?.[key];
  return typeof x === 'string' && x.length > 0 ? x : undefined;
}

export function num(v: unknown, key: string): number | undefined {
  const x = asRecord(v)?.[key];
  return typeof x === 'number' ? x : undefined;
}

// ---- Identifier normalization ----------------------------------------------

/**
 * Normalize a user-supplied creator reference into a Rumble handle
 * (case-insensitive; URL forms, `rumble:`-prefixed ids and `@` handles all
 * collapse to the bare handle). The handle IS the stable identity: both URL
 * namespaces (`/c/`, `/user/`) accept either case and resolve to the same
 * channel, so the lowercased handle is the identifier we key everything on.
 */
export function normalizeHandle(input: string): string {
  let s = input.trim();
  s = s.replace(/^rumble:/i, '');
  // ponytail: users paste both `https://rumble.com/c/X` and the scheme-less
  // `rumble.com/c/X` — force a scheme on the latter so URL parsing works.
  if (/^https?:\/\//i.test(s) || /^[^/\s]+\.rumble\.com\//i.test(s) || /^rumble\.com\//i.test(s)) {
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    try {
      const u = new URL(s);
      s = u.pathname;
    } catch {
      /* fall through to pattern stripping */
    }
  }
  s = s
    .replace(/^\/+(c|user)\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '')
    .replace(/\.(html?)$/i, '');
  return decodeURIComponent(s).trim().toLowerCase();
}

/** Build the canonical channel URL for a normalized handle. */
export function channelUrl(handle: string): string {
  return `${DEFAULT_BASE}/c/${encodeURIComponent(handle)}`;
}

/**
 * Try to re-fetch the channel under the /user/ namespace when /c/ 404s —
 * Rumble keeps both, and some channels only resolve under one of them.
 */
export function alternateChannelUrl(handle: string): string {
  return `${DEFAULT_BASE}/user/${encodeURIComponent(handle)}`;
}

/** Creator id as the host stores it (`pluginId:externalId`). */
export function creatorId(handle: string): string {
  return `rumble:${handle}`;
}

/** Extract the handle from a host identifier (`rumble:<handle>`). */
export function handleFromIdentifier(identifier: string): string {
  return normalizeHandle(identifier);
}

// ---- Page JSON discovery ----------------------------------------------------

/**
 * Extract all JSON payloads from `<script type="application/json">…</script>`
 * blocks. Rumble ships page data this way (its front-end hydrates from it);
 * the attribute order varies, so match the tag generically.
 */
export function extractJsonScripts(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script\s+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(m[1]!.trim());
      if (asRecord(parsed) !== null) out.push(parsed as Json);
    } catch {
      /* not all application/json blocks are page data — skip */
    }
  }
  return out;
}

/**
 * Recursively collect video entries from a JSON blob: any object carrying a
 * `relative_url` that points at a watch page (`/vXXXX-slug.html`) qualifies.
 * The blobs nest lists of items, commanders and widgets several levels deep —
 * a targeted walk is more robust than pinning the exact tree shape.
 */
export function collectVideoEntries(node: unknown, depth = 0, out: Json[] = []): Json[] {
  if (depth > 12) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoEntries(item, depth + 1, out);
    return out;
  }
  const rec = asRecord(node);
  if (rec === null) return out;
  const rel = str(rec, 'relative_url');
  if (rel !== undefined && /^\/v[0-9a-z]+/i.test(rel)) {
    out.push(rec);
    // ponytail: do not recurse further into a video object — nested
    // thumbnails etc. can carry unrelated shapes.
    return out;
  }
  for (const value of Object.values(rec)) {
    if (value !== null && typeof value === 'object') collectVideoEntries(value, depth + 1, out);
  }
  return out;
}

/**
 * Classify one video entry. Exported for tests.
 *
 * ponytail: the `live` boolean + `livestream_status` numeric pair is the
 * signal (both confirmed against a live channel page: live=true,
 * livestream_status=2, watching_now=1069, while VODs carry live=false,
 * livestream_status=null). `livestream_status === 1` marks a scheduled
 * stream that has not started (upcoming). Object types other than
 * video/videostream (channels, links) never count as live.
 */
export function classifyVideoEntry(entry: Json): { videoId: string; isLive: boolean; isUpcoming: boolean } | null {
  const rel = str(entry, 'relative_url');
  if (rel === undefined) return null;
  const videoId = videoIdFromWatchUrl(rel);
  if (videoId === undefined) return null;
  const objectType = str(entry, 'object_type') ?? 'video';
  if (objectType !== 'video' && objectType !== 'videostream') return null;
  const live = entry['live'] === true || num(entry, 'livestream_status') === 2;
  const isUpcoming = !live && (num(entry, 'livestream_status') === 1 || entry['live'] === true && num(entry, 'livestream_status') === undefined);
  return { videoId, isLive: live, isUpcoming };
}

/**
 * One video entry with the extra fields the live decision needs.
 * Exported for tests.
 */
export interface VideoEntryWithClass {
  entry: Json;
  elementClass?: string;
  /** Live viewer count when the entry is a running broadcast. */
  watchingNow?: number;
  /** Direct HLS URL when the item itself carries one (live items do). */
  hlsUrl?: string;
  title?: string;
}

/**
 * Pair video entries with their live signals and direct playback URL.
 * (The name mirrors the legacy element-class pairing; live items on today's
 * pages carry everything in the item object itself.)
 */
export function pairEntriesWithClasses(node: unknown, depth = 0, out: VideoEntryWithClass[] = []): VideoEntryWithClass[] {
  if (depth > 12) return out;
  if (Array.isArray(node)) {
    for (const item of node) pairEntriesWithClasses(item, depth + 1, out);
    return out;
  }
  const rec = asRecord(node);
  if (rec === null) return out;
  const rel = str(rec, 'relative_url');
  if (rel !== undefined && /^\/v[0-9a-z]+/i.test(rel)) {
    const videos = Array.isArray(rec['videos']) ? rec['videos'] : undefined;
    const hls = videos?.find(
      (v) => asRecord(v) !== null && str(asRecord(v)!, 'url') !== undefined && /\.m3u8/i.test(str(asRecord(v)!, 'url')!),
    );
    out.push({
      entry: rec,
      elementClass: str(rec, 'element_class'),
      watchingNow: num(rec, 'watching_now'),
      hlsUrl: hls !== undefined ? str(asRecord(hls)!, 'url') : undefined,
      title: str(rec, 'title'),
    });
    return out;
  }
  for (const value of Object.values(rec)) {
    if (value !== null && typeof value === 'object') pairEntriesWithClasses(value, depth + 1, out);
  }
  return out;
}

// ---- HTML fallback discovery -------------------------------------------------

/**
 * First watch-page anchor on the page (`href="/vXXXX-slug.html"`). ponytail:
 * Rumble renders UNQUOTED attributes when the value has no spaces, so the
 * quote in the pattern is optional. Layout-dependent — used only as a
 * fallback when the page JSON yields nothing.
 */
export function firstVideoLink(html: string): string | undefined {
  const m = /<a[^>]*\bhref=["']?(\/v[0-9a-z]+[^"'\s>]*)/i.exec(html);
  if (m === null) return undefined;
  const href = m[1]!;
  return /^https?:/i.test(href) ? href : new URL(href, DEFAULT_BASE).toString();
}

/** True when the page's HTML marks the current broadcast as live. */
export function htmlLooksLive(html: string): boolean {
  return /videostream__status--live/.test(html);
}

/** True when the page's HTML marks the current entry as upcoming. */
export function htmlLooksUpcoming(html: string): boolean {
  return /videostream__status--upcoming/.test(html);
}

// ---- Meta tag / page identity -------------------------------------------------

/**
 * meta tag content lookup. ponytail: Rumble emits UNQUOTED attributes
 * whenever the value contains no spaces (`<meta property=og:title
 * content=Styxhexenhammer666>` — verified against live pages), so the value
 * group must accept bare tokens as well as quoted strings.
 */
function metaContent(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]*=(?:["']${property}["']|${property})[^>]*>`,
    'i',
  );
  const tag = re.exec(html)?.[0];
  if (tag === undefined) return undefined;
  const contentRe = /\bcontent=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
  const m = contentRe.exec(tag);
  const value = m?.[1] ?? m?.[2] ?? m?.[3];
  return value !== undefined && value.length > 0 ? value : undefined;
}

/**
 * og:video / twitter:player carry the channel's pinned embed URL on live and
 * just-ended pages. Returns the raw URL — the caller decides whether the
 * video id it contains is worth following.
 */
export function pinnedEmbedUrl(html: string): string | undefined {
  return (
    metaContent(html, 'og:video') ??
    metaContent(html, 'og:video:url') ??
    metaContent(html, 'twitter:player')
  );
}

/** Extract the video id from an embed URL (`/embed/v6abcde/…` → `v6abcde`). */
export function videoIdFromEmbedUrl(embedUrl: string): string | undefined {
  const m = /\/embed\/(?:[0-9a-z]+\.)?(v[0-9a-z]+)/i.exec(embedUrl);
  return m?.[1];
}

/**
 * Extract the video id from a watch-page URL or path (`/vXXXX-slug.html` →
 * `vXXXX`). The slug part is optional.
 */
export function videoIdFromWatchUrl(watchUrl: string): string | undefined {
  const m = /\b((?:[0-9a-z]+\.)?v[0-9a-z]+)(?:-[^/?#]*)?\.html/i.exec(watchUrl);
  return m?.[1];
}

/**
 * Extract the video id from a bare path with no .html suffix
 * (`/vXXXX-slug` → `vXXXX`) — the shape `relative_url` uses inside page
 * JSON when the item is a live grid entry.
 */
export function videoIdFromPath(path: string): string | undefined {
  const m = /\b((?:[0-9a-z]+\.)?v[0-9a-z]+)(?:-[^/?#]*)?(?:\.html)?$/i.exec(path.trim());
  return m?.[1];
}

export interface PageIdentity {
  displayName?: string;
  avatarUrl?: string;
  followerCount?: number;
  bio?: string;
}

/**
 * Identity from og: meta tags — server-rendered on every channel page, so
 * this never depends on the JSON blob shape.
 */
export function identityFromMeta(html: string): PageIdentity {
  const ogImage = metaContent(html, 'og:image');
  const followersRaw = metaContent(html, 'og:description');
  let followerCount: number | undefined;
  if (followersRaw !== undefined) {
    const m = /([\d.,]+)\s*(K|M)?\s*followers?/i.exec(followersRaw);
    if (m !== null) {
      const value = Number.parseFloat(m[1]!.replace(/,/g, ''));
      if (!Number.isNaN(value)) {
        const suffix = m[2]?.toUpperCase();
        if (suffix === 'K') followerCount = Math.round(value * 1_000);
        else if (suffix === 'M') followerCount = Math.round(value * 1_000_000);
        else followerCount = Math.round(value);
      }
    }
  }
  return {
    displayName: metaContent(html, 'og:title'),
    avatarUrl: ogImage,
    followerCount,
  };
}

/**
 * Channel identity from the `by` block of the page's own video items —
 * VALIDATED shape: `{ type: "channel", url, thumb, name, followers,
 * verified_badge, … }`. Carries the channel's real display name (with its
 * original casing), avatar and follower count, so it beats the og: tags.
 * Returns null when the page has no items (about pages, error pages).
 */
export function identityFromItems(entries: VideoEntryWithClass[]): PageIdentity & { verified?: boolean } {
  for (const { entry } of entries) {
    const by = asRecord(entry['by']);
    if (by === null) continue;
    const followers = num(by, 'followers');
    return {
      displayName: str(by, 'name'),
      avatarUrl: str(by, 'thumb'),
      followerCount: typeof followers === 'number' ? followers : undefined,
      verified: by['verified_badge'] === true,
    };
  }
  return {};
}

/** HTML entity / tag cleanup for titles coming out of meta tags. */
export function cleanText(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- Creator assembly ---------------------------------------------------------

export function creatorFromPage(
  handle: string,
  html: string,
  identity: PageIdentity,
  live: boolean,
): CreatorInfo {
  const ogTitle = metaContent(html, 'og:title');
  const ogImage = identity.avatarUrl ?? metaContent(html, 'og:image');
  const url = channelUrl(handle);
  return {
    id: creatorId(handle),
    username: handle,
    displayName: cleanText(identity.displayName ?? ogTitle ?? handle),
    avatarUrl: ogImage,
    profileUrl: url,
    bio: identity.bio,
    followerCount: identity.followerCount,
    isLive: live,
    liveUrl: live ? url : undefined,
  };
}

/**
 * Fetch one URL (already routed by the caller) and extract the channel
 * page's live-video discovery signals.
 */
export interface ChannelPageSignals {
  jsonEntries: VideoEntryWithClass[];
  pinnedVideoId?: string;
  firstLinkVideoId?: string;
  htmlLive: boolean;
  htmlUpcoming: boolean;
  identity: PageIdentity & { bio?: string; verified?: boolean };
}

export function parseChannelPage(html: string): ChannelPageSignals {
  const jsonScripts = extractJsonScripts(html);
  let jsonEntries: VideoEntryWithClass[] = [];
  for (const script of jsonScripts) {
    const pairs = pairEntriesWithClasses(script);
    if (pairs.length > jsonEntries.length) jsonEntries = pairs;
  }
  const pinned = pinnedEmbedUrl(html);
  const firstLink = firstVideoLink(html);
  const items = identityFromItems(jsonEntries);
  const meta = identityFromMeta(html);
  return {
    jsonEntries,
    pinnedVideoId: pinned !== undefined ? videoIdFromEmbedUrl(pinned) : undefined,
    firstLinkVideoId: firstLink !== undefined ? videoIdFromPath(firstLink) : undefined,
    htmlLive: htmlLooksLive(html),
    htmlUpcoming: htmlLooksUpcoming(html),
    identity: {
      displayName: items.displayName ?? meta.displayName,
      avatarUrl: items.avatarUrl ?? meta.avatarUrl,
      followerCount: items.followerCount ?? meta.followerCount,
      bio: meta.bio,
      verified: items.verified,
    },
  };
}
