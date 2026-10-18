/**
 * Single source of truth for feature links across the site.
 *
 * Every place that links to a feature — the /features hub grid, the homepage
 * highlight cards, the navbar dropdown, the footer, related-feature strips,
 * and in-content mention links — reads from this config. The backend-like
 * copy (titles/descriptions) still lives in site.ts; this file owns the
 * routing: which box goes to which page/anchor, which pages exist, and what
 * content each page shows.
 *
 * NOTE: keep this module free of React imports so node scripts (see
 * scripts/checkFeatureLinks.mjs) can import it directly for link validation.
 */
import { features } from "./site.ts";

/** Prefix for every feature page so links stay under one URL space. */
export const FEATURES_HUB_PATH = "/features";

export interface FeatureBox {
  title: string;
  description: string;
  /** Full link including the target anchor, e.g. "/features/recording#vr". */
  href: string;
  /** Page path without the anchor. */
  page: string;
  sectionId?: string;
  featured?: boolean;
  /** Replaces the box title when rendered as the featured card. */
  featuredHeadline?: string;
}

export interface FeaturePageSection {
  /** DOM id for the anchor (#library, #editor, …), with scroll-margin applied. */
  id: string;
  heading: string;
  lead: string;
  body?: string;
  bullets?: readonly string[];
}

export interface FeaturePageDef {
  path: string;
  /** Nav dropdown / footer label. */
  name: string;
  metaTitle: string;
  metaDescription: string;
  heading: string;
  tagline: string;
  popular?: boolean;
  sections: readonly FeaturePageSection[];
}

/** Per-box link configuration (keyed by the exact site.ts feature title). */
const boxLinks: Record<
  string,
  {
    href: string;
    page: string;
    sectionId?: string;
    featured?: boolean;
    featuredHeadline?: string;
  }
> = {
  "Live Monitoring": {
    href: "/features/monitoring-auto-record#live-monitoring",
    page: "/features/monitoring-auto-record",
    sectionId: "live-monitoring",
  },
  "Auto-Record with safety rails": {
    href: "/features/monitoring-auto-record#auto-record",
    page: "/features/monitoring-auto-record",
    sectionId: "auto-record",
  },
  "Recording & Downloads": {
    href: "/features/recording#downloads",
    page: "/features/recording",
    sectionId: "downloads",
  },
  "VR Recording & Playback": {
    href: "/features/recording#vr",
    page: "/features/recording",
    sectionId: "vr",
  },
  "Works on blocked networks": {
    href: "/features/blocked-networks",
    page: "/features/blocked-networks",
  },
  "Library & Analytics": {
    href: "/features/library-editor#library",
    page: "/features/library-editor",
    sectionId: "library",
  },
  "Built-in Video Editor": {
    href: "/features/library-editor#editor",
    page: "/features/library-editor",
    sectionId: "editor",
  },
  "Cloud Uploads": {
    href: "/features/automation#cloud-uploads",
    page: "/features/automation",
    sectionId: "cloud-uploads",
  },
  "Post-Recording Automation": {
    href: "/features/automation",
    page: "/features/automation",
    featured: true,
    featuredHeadline: "Archive and share on autopilot",
  },
  "Desktop Integration": {
    href: "/features/desktop",
    page: "/features/desktop",
  },
  "Push Notifications": {
    href: "/features/notifications-remote#push",
    page: "/features/notifications-remote",
    sectionId: "push",
  },
  "Remote Control via Telegram": {
    href: "/features/notifications-remote#telegram",
    page: "/features/notifications-remote",
    sectionId: "telegram",
  },
};

function boxLink(title: string) {
  const link = boxLinks[title];
  if (!link) {
    throw new Error(`featuresConfig: no link configured for "${title}"`);
  }
  return link;
}

/** The 12 hub boxes, each with its link attached. */
export const featureBoxes: FeatureBox[] = features.map((feature) => ({
  title: feature.title,
  description: feature.description,
  ...boxLink(feature.title),
}));

/** The exact link for a box title (used by mention-linking helpers). */
const featured: FeatureBox[] = featureBoxes.filter((box) => box.featured);
if (featured.length !== 1) {
  throw new Error(
    `featuresConfig: exactly one featured box expected, got ${featured.length}`,
  );
}

/** Featured box for banner/highlight use (exactly one is validated above). */
export const featuredFeatureBox: FeatureBox = featured[0] as FeatureBox;

// ---------------------------------------------------------------------------
// Feature pages (7 routes under /features)
// ---------------------------------------------------------------------------

export const featurePages: FeaturePageDef[] = [
  {
    path: "/features/automation",
    name: "Automation",
    metaTitle:
      "Post-Recording Automation — archive and share on autopilot",
    metaDescription:
      "A background pipeline for every finished capture: tag, compress, move, upload, delete. Each step optional, failures never block the rest. Includes cloud uploads to Gofile, Catbox, MixDrop, and Google Drive.",
    heading: "Archive and share on autopilot",
    tagline:
      "A background pipeline for every finished capture: tag → compress → move → upload → delete. Each step optional, failures never block the rest, and your library entry always survives.",
    popular: true,
    sections: [
      {
        id: "automation",
        heading: "Post-Recording Automation",
        lead:
          "Every finished capture flows through a background pipeline. You choose which steps are on; Rekordly runs them in order as soon as a recording completes.",
        bullets: [
          "Tag — label captures the moment they finish",
          "Compress — shrink files without re-recording or losing quality",
          "Move — file captures into your archive folder layout",
          "Upload — push finished files to your cloud provider",
          "Delete — free the source file only after a successful upload",
          "Steps are optional, and a failure never blocks the rest of the pipeline",
          "Your library entry always survives — deletions never touch the index",
        ],
      },
      {
        id: "cloud-uploads",
        heading: "Cloud Uploads",
        lead:
          "Push finished recordings straight to the cloud. Built-in providers include Gofile, Catbox, MixDrop, and Google Drive — each with its own credential handling.",
        bullets: [
          "Built-in providers: Gofile, Catbox, MixDrop, and Google Drive",
          "Per-provider credential handling — no shared token soup",
          "Runs in the background and never delays the next recording",
          "Nothing is uploaded unless you configure a provider",
        ],
      },
    ],
  },
  {
    path: "/features/monitoring-auto-record",
    name: "Monitoring & Auto-Record",
    metaTitle:
      "Live Monitoring & Auto-Record — watch creators, record automatically",
    metaDescription:
      "One dashboard for every creator with live status, viewer counts, and stream titles — plus auto-record with a master pause switch, disk guardrail, segment splitting, and crash recovery.",
    heading: "Watch every creator, record every stream",
    tagline:
      "Live Monitoring keeps watch on every creator you follow; Auto-Record starts the capture the moment they go live — with safety rails that make unattended recording safe.",
    sections: [
      {
        id: "live-monitoring",
        heading: "Live Monitoring",
        lead:
          "Track creators across multiple streaming sites from one dashboard. Rekordly checks each creator on a configurable interval and shows live/offline status, viewer counts, and stream titles in real time.",
        bullets: [
          "One dashboard for every creator, on every supported site",
          "Configurable check interval — balance speed against API limits",
          "Live/offline status, viewer counts, and stream titles in real time",
          "Add a creator once; the app keeps watch for you",
        ],
      },
      {
        id: "auto-record",
        heading: "Auto-Record with safety rails",
        lead:
          "Opt any creator in to automatic recording. The moment they go live, Rekordly starts capturing — and keeps recording cleanly until the stream is over.",
        bullets: [
          "Master pause switch — halt every auto-recording from Settings, zero orphaned jobs",
          "Disk-space guardrail — auto-record skips creators when free space drops below your limit",
          "Segment splitting — split marathon sessions into parts every N minutes",
          "Crash recovery — interrupted recordings are reconciled on next launch",
          "Opt-in per creator; never records anything you didn't ask for",
        ],
      },
    ],
  },
  {
    path: "/features/recording",
    name: "Recording",
    metaTitle:
      "Recording, downloads, and VR playback — high-quality capture",
    metaDescription:
      "High-quality capture powered by vendored yt-dlp + ffmpeg. Pause, resume, and retry downloads, set priorities and bandwidth limits, extract audio-only MP3s, and record VR (3D) shows.",
    heading: "Studio-grade capture, straight into your library",
    tagline:
      "High-quality capture powered by vendored yt-dlp + ffmpeg — zero external installs. Pause, resume, and retry downloads, set priorities and bandwidth limits, or extract audio-only MP3s.",
    sections: [
      {
        id: "downloads",
        heading: "Recording & Downloads",
        lead:
          "High-quality capture powered by vendored yt-dlp + ffmpeg — zero external installs. Pause, resume, and retry downloads, set priorities and bandwidth limits, or extract audio-only MP3s.",
        bullets: [
          "No duration limits on normal video/VOD downloads",
          "Pause, resume, and retry downloads at any time",
          "Priorities and bandwidth limits for big batch jobs",
          "Audio-only MP3 extraction from any video",
        ],
      },
      {
        id: "vr",
        heading: "VR Recording & Playback",
        lead:
          "Record VR (3D) shows from Dreamcam and Stripchat and watch them in the built-in look-around player — drag to look, wheel to zoom, just like the site's own VR player.",
        bullets: [
          "Record 3D shows from Dreamcam and Stripchat",
          "Built-in look-around player — drag to look, wheel to zoom",
          "Feels just like the site's own VR player",
          "Same capture pipeline — VR files land in your library",
        ],
      },
    ],
  },
  {
    path: "/features/blocked-networks",
    name: "Blocked Networks",
    metaTitle:
      "Works on blocked networks — built-in Secure Proxy + Cloudflare WARP",
    metaDescription:
      "Your ISP blocks cam sites? Rekordly's built-in Secure Proxy handles it with one per-creator toggle — no VPN subscription, no configuration. Install Cloudflare WARP (free) for automatic full speed.",
    heading: "Record even when your ISP says no",
    tagline:
      "Your ISP blocks cam sites? A built-in Secure Proxy handles it with one per-creator toggle — no VPN subscription, no configuration. Install Cloudflare WARP (free) and recordings automatically go full speed.",
    sections: [
      {
        id: "proxy",
        heading: "Built-in Secure Proxy",
        lead:
          "Your ISP blocks cam sites? A built-in Secure Proxy handles it with one per-creator toggle — no VPN subscription, no configuration.",
        bullets: [
          "One per-creator toggle — nothing to install or configure",
          "No VPN subscription required",
          "The proxy runtime downloads itself on first use",
          "Cloudflare WARP (free) is detected automatically — recordings go full speed",
        ],
      },
    ],
  },
  {
    path: "/features/library-editor",
    name: "Library & Editor",
    metaTitle: "Library & Analytics and the built-in Video Editor",
    metaDescription:
      "A searchable library with tags, collections, favorites, and notes — plus a filmstrip-and-waveform editor for trimming, combining, and extracting audio, all non-destructive.",
    heading: "Everything you capture, organized and cut to size",
    tagline:
      "A searchable library with tags, collections, favorites, and notes — and a built-in editor for trimming and combining recordings without leaving the app.",
    sections: [
      {
        id: "library",
        heading: "Library & Analytics",
        lead:
          "A searchable library with tags, collections, favorites, and notes. Scan folders to import existing media, then dig into dashboard stats, storage breakdowns, and job outcomes.",
        bullets: [
          "Searchable library with tags, collections, favorites, and notes",
          "Scan folders to import media you already have",
          "Dashboard stats, storage breakdowns, and job outcomes",
          "Every capture lands in the library automatically",
        ],
      },
      {
        id: "editor",
        heading: "Built-in Video Editor",
        lead:
          "Trim, cut out sections, and combine recordings without leaving the app. A filmstrip-and-waveform timeline with one-frame stepping, silence detection, audio-only MP3/M4A extraction, and non-destructive exports — the original is never modified.",
        bullets: [
          "Filmstrip-and-waveform timeline with one-frame stepping",
          "Trim and cut sections, combine multiple recordings",
          "Silence detection to find dead air fast",
          "Audio-only MP3/M4A extraction whenever you need it",
          "Non-destructive exports — the original is never modified",
        ],
      },
    ],
  },
  {
    path: "/features/desktop",
    name: "Desktop",
    metaTitle: "Desktop Integration — tray, themes, and low-resource mode",
    metaDescription:
      "System tray with live status, close-to-tray mode, launch at startup, native notifications, dark and light themes, and a low-resource mode for weaker machines.",
    heading: "Built into Windows, and out of the way",
    tagline:
      "System tray with live status, close-to-tray mode, launch at startup, native notifications, dark and light themes, and a low-resource mode for weaker machines.",
    sections: [
      {
        id: "desktop",
        heading: "Desktop Integration",
        lead:
          "Rekordly behaves like a native Windows app everywhere — the tray, the notifications, and the resource budget are all yours to control.",
        bullets: [
          "System tray with live status",
          "Close-to-tray mode and launch at startup",
          "Native notifications",
          "Dark and light themes",
          "Low-resource mode for weaker machines",
        ],
      },
    ],
  },
  {
    path: "/features/notifications-remote",
    name: "Notifications & Remote",
    metaTitle:
      "Push Notifications & Telegram remote control — your phone, in the loop",
    metaDescription:
      "Get pinged via Discord or Telegram when a creator goes live or a recording starts, finishes, or fails — and control Rekordly straight from a Telegram chat.",
    heading: "Your phone, in the loop",
    tagline:
      "Get pinged on your phone the moment a creator goes live or a recording starts, finishes, or fails — and start, pause, resume, or stop captures straight from a Telegram chat.",
    sections: [
      {
        id: "push",
        heading: "Push Notifications",
        lead:
          "Get pinged on your phone the moment a creator goes live or a recording starts, finishes, or fails — via Discord or Telegram. Fire-and-forget delivery that never delays a recording.",
        bullets: [
          "Live alerts the moment a creator goes live",
          "Recording events — starts, finishes, or fails",
          "Via Discord or Telegram",
          "Fire-and-forget delivery that never delays a recording",
        ],
      },
      {
        id: "telegram",
        heading: "Remote Control via Telegram",
        lead:
          "The Telegram push becomes a control surface: start a recording with one tap — defaults or the full options wizard — and pause, resume, or stop a running capture straight from your phone.",
        bullets: [
          "Start a recording with one tap — defaults or the full options wizard",
          "Pause, resume, or stop a running capture from the chat",
          "The push becomes a control surface — drive Rekordly from your phone",
        ],
      },
    ],
  },
];

/** Pages in nav order — the popular page (Automation) first. */
export const navFeaturePages: FeaturePageDef[] = [
  ...featurePages
    .filter((page) => !page.popular)
    .sort((a, b) => featurePages.indexOf(a) - featurePages.indexOf(b)),
  ...featurePages.filter((page) => page.popular),
].sort((a, b) => Number(b.popular ?? false) - Number(a.popular ?? false));

export function getFeaturePage(path: string): FeaturePageDef | undefined {
  return featurePages.find((page) => page.path === path);
}

/**
 * Related-feature strip for a page: other pages' boxes, deterministically
 * rotated so each page gets a different slice of the catalog.
 */
export function relatedFeaturesForPage(page: FeaturePageDef): FeatureBox[] {
  const others = featureBoxes.filter((box) => box.page !== page.path);
  if (others.length <= 6) return others;
  const start = (featurePages.indexOf(page) * 2) % others.length;
  const rotated = [...others.slice(start), ...others.slice(0, start)];
  return rotated.slice(0, 6);
}

// ---------------------------------------------------------------------------
// In-content mention linking (docs / blog / FAQ)
// ---------------------------------------------------------------------------

export interface FeatureAlias {
  /** Human phrase as it appears in prose. */
  phrase: string;
  href: string;
}

const ALIASES: FeatureAlias[] = [
  { phrase: "Post-Recording Automation", href: "/features/automation" },
  {
    phrase: "Auto-Record with safety rails",
    href: "/features/monitoring-auto-record#auto-record",
  },
  {
    phrase: "Remote Control via Telegram",
    href: "/features/notifications-remote#telegram",
  },
  {
    phrase: "Remote control via Telegram",
    href: "/features/notifications-remote#telegram",
  },
  {
    phrase: "Telegram remote control",
    href: "/features/notifications-remote#telegram",
  },
  { phrase: "VR Recording & Playback", href: "/features/recording#vr" },
  { phrase: "VR Playback & Recording", href: "/features/recording#vr" },
  {
    phrase: "Recording & Downloads",
    href: "/features/recording#downloads",
  },
  {
    phrase: "Works on blocked networks",
    href: "/features/blocked-networks",
  },
  { phrase: "Built-in Video Editor", href: "/features/library-editor#editor" },
  { phrase: "Desktop Integration", href: "/features/desktop" },
  {
    phrase: "Library & Analytics",
    href: "/features/library-editor#library",
  },
  {
    phrase: "Auto-Record",
    href: "/features/monitoring-auto-record#auto-record",
  },
  {
    phrase: "Live Monitoring",
    href: "/features/monitoring-auto-record#live-monitoring",
  },
  {
    phrase: "Cloud Uploads",
    href: "/features/automation#cloud-uploads",
  },
  {
    phrase: "Push Notifications",
    href: "/features/notifications-remote#push",
  },
  { phrase: "Secure Proxy", href: "/features/blocked-networks" },
  {
    phrase: "Video Editor",
    href: "/features/library-editor#editor",
  },
];

/** Sorted by phrase length (longest first) so longer phrases win. */
const aliasesByLength: FeatureAlias[] = [...ALIASES].sort(
  (a, b) => b.phrase.length - a.phrase.length,
);

interface Segment {
  text: string;
  /** Safe segments (existing links, inline code, URLs) are never modified. */
  safe: boolean;
}

const SAFE_TOKEN_SPLIT = /(\[[^\]\n]*\]\([^)\n]*\)|`[^`\n]*`|https?:\/\/\S+)/;

function aliasPattern(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i");
}

/**
 * Segment scan: walk the "safe-split" segments in order and, for each alias
 * (longest first), replace its first occurrence inside a non-safe segment
 * with a markdown link. The replacement segment becomes safe so later
 * aliases can never match inside it, and each alias is linked at most once
 * per document via the shared `used` set.
 */
function linkifySegments(segments: Segment[], used: Set<string>): void {
  for (const alias of aliasesByLength) {
    if (used.has(alias.href)) continue;
    const pattern = aliasPattern(alias.phrase);
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      if (!segment || segment.safe) continue;
      const match = pattern.exec(segment.text);
      if (!match || match.index === undefined) continue;

      const label = match[0];
      const before = segment.text.slice(0, match.index);
      const after = segment.text.slice(match.index + label.length);
      const replacement: Segment = {
        text: `[${label}](${alias.href})`,
        safe: true,
      };
      const rebuilt: Segment[] = [];
      if (before) rebuilt.push({ text: before, safe: false });
      rebuilt.push(replacement);
      if (after) rebuilt.push({ text: after, safe: false });
      segments.splice(i, 1, ...rebuilt);
      used.add(alias.href);
      break;
    }
  }
}

function markSafeTokens(parts: Segment[]): Segment[] {
  // Odd indices are capture groups from SAFE_TOKEN_SPLIT: existing md links
  // and inline code spans must never be modified.
  return parts.map((part, index) =>
    index % 2 === 1 || /^https?:\/\//.test(part.text)
      ? { ...part, safe: true }
      : part,
  );
}

/** Render markdown-style `​[label](href)` replacement segments as text parts. */
function partsToString(segments: Segment[]): string {
  return segments.map((segment) => segment.text).join("");
}

export type FeatureFragment = string | { label: string; href: string };

/**
 * Split plain text (FAQ answers) into plain strings and feature links —
 * the first mention of each feature phrase becomes a link, later mentions
 * stay plain text.
 */
export function splitFeatureMentions(text: string): FeatureFragment[] {
  const segments: Segment[] = markSafeTokens(
    text.split(SAFE_TOKEN_SPLIT).map((part) => ({ text: part, safe: false })),
  );
  linkifySegments(segments, new Set());
  return segments.map((segment) => {
    const replaced = /^\[([^\]]+)\]\((\/[^)]*)\)$/.exec(segment.text);
    if (segment.safe && replaced?.[1]) {
      return { label: replaced[1], href: replaced[2] ?? segment.text };
    }
    return segment.text;
  });
}

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^\s*#{1,6}\s/;

/**
 * Markdown variant of mention linking: replaces the first mention of each
 * feature name in prose with a markdown link. Skips fenced code blocks,
 * headings, existing links, inline code, and URLs.
 */
export function linkifyFeatureMentions(markdown: string): string {
  let inFence = false;
  // Document-level "first mention" tracking across every line.
  const used = new Set<string>();

  const lines = markdown.split("\n").map((line) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence || HEADING_RE.test(line) || !line.trim()) {
      return line;
    }

    const parts = markSafeTokens(
      line.split(SAFE_TOKEN_SPLIT).map((part) => ({
        text: part,
        safe: false,
      })),
    );
    linkifySegments(parts, used);
    return partsToString(parts);
  });

  return lines.join("\n");
}
