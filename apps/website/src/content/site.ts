/** Absolute origin used for canonical URLs, OG tags, and the sitemap. */
export const siteUrl = "https://rekordly.in";

/**
 * Desktop app version this site build links against — injected by Vite from
 * REKORDLY_VERSION (set by the deploy pipeline from the latest git tag),
 * falling back to 0.1.0 for local builds. The release workflow rewrites
 * public/app-version.json on every release, so `site.appVersion` always
 * equals the version whose installer asset the download links point at.
 */
declare const __APP_VERSION__: string;

export const site = {
  name: "Rekordly",
  /** Version of the release this build's download links are pinned to. */
  appVersion: __APP_VERSION__,
  tagline: "Monitor, record, and download live streams — automatically.",
  description:
    "A free, open-source Windows desktop app for monitoring creators, automatically recording live streams, downloading videos and VODs, and organizing your recordings.",
  repoUrl: "https://github.com/akashbroo007/Rekordly",
  releasesUrl: "https://github.com/akashbroo007/Rekordly/releases",
  latestReleaseUrl: "https://github.com/akashbroo007/Rekordly/releases/latest",
  /**
   * Direct installer download — hits the installer asset on the exact
   * release this build references (REKORDLY_VERSION from the deploy env, so
   * it matches the tag the site shipped with). Not latest/download: that
   * path only redirects when the newest release's assets are fully
   * propagated, and version-pinning keeps the link valid during a release
   * window when assets are still uploading.
   *
   * NOTE: bump the desktop app version (apps/desktop/package.json) whenever
   * releasing a new one — the deploy env sets REKORDLY_VERSION to match.
   */
  installerDownloadUrl: `https://github.com/akashbroo007/Rekordly/releases/download/v${__APP_VERSION__}/Rekordly-Setup-${__APP_VERSION__}.exe`,
  issuesUrl: "https://github.com/akashbroo007/Rekordly/issues",
  discussionsUrl: "https://github.com/akashbroo007/Rekordly/discussions",
  pluginGuideUrl:
    "https://github.com/akashbroo007/Rekordly/blob/main/docs/PLUGIN_GUIDE.md",
  licenseUrl: "https://github.com/akashbroo007/Rekordly/blob/main/LICENSE.txt",
  email: "hello@rekordly.in",
} as const;

/**
 * Primary links shown in the navbar pill, after the Features dropdown.
 * "Features" itself is NOT here — the navbar renders the FeaturesDropdown
 * (with all 7 feature pages) before these; adding it here would duplicate it
 * (see Navbar). Ordered: sell the ecosystem (Marketplace), then learn
 * (Docs, Blog), then act (Download — also echoed by the pill's CTA).
 */
export const navLinks = [
  { label: "Marketplace", href: "/marketplace" },
  { label: "Docs", href: "/docs" },
  { label: "Blog", href: "/blog" },
  { label: "Download", href: "/download" },
] as const;

/** Secondary links live in the footer (and the mobile menu), not the navbar. */
export const secondaryNavLinks = [
  { label: "Plugins", href: "/plugins" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Contact", href: "/contact" },
] as const;

export const hero = {
  badge: "Open source — Apache-2.0",
  titleLead: "Never miss a",
  titleAccent: "live stream",
  titleTail: "again",
  subtitle:
    "A free, open-source Windows app for monitoring creators, automatically recording live streams, downloading videos and VODs, and organizing your recordings.",
  primaryCta: {
    label: "Download for Windows",
    // One-click: straight to the pinned `Rekordly Setup <ver>.exe` asset on
    // GitHub Releases (version comes from app-version.json/REKORDLY_VERSION,
    // so the release pipeline keeps it in sync). The full /download page
    // stays available from the navbar "Download" link.
    href: site.installerDownloadUrl,
  },  secondaryCta: { label: "View on GitHub", href: site.repoUrl },
  stats: [
    { value: "13", label: "Sites supported" },
    { value: "0", label: "Setup — yt-dlp & ffmpeg bundled" },
    { value: "100%", label: "Free — personal and commercial use" },
  ],
} as const;

export const steps = [
  {
    title: "Add a creator",
    description:
      "Pick a site plugin, enter the username, and start tracking. Live status, viewer counts, and stream titles update in real time.",
  },
  {
    title: "Enable Auto-Record",
    description:
      "Flip the per-creator switch. Recording starts the moment they go live and stops cleanly when the stream ends.",
  },
  {
    title: "It lands in your library",
    description:
      "Every capture is organized into a searchable library with tags, collections, favorites, and notes. Watch or upload, your call.",
  },
] as const;

export const features = [
  {
    title: "Live Monitoring",
    description:
      "Track creators across multiple streaming sites from one dashboard. Rekordly checks each creator on a configurable interval and shows live/offline status, viewer counts, and stream titles in real time.",
  },
  {
    title: "Auto-Record with safety rails",
    description:
      "Opt any creator in to automatic recording. A master pause switch, disk-space guardrail, segment splitting, and crash recovery keep unattended recording safe and reliable.",
  },
  {
    title: "Recording & Downloads",
    description:
      "High-quality capture powered by vendored yt-dlp + ffmpeg — zero external installs. Pause, resume, and retry downloads, set priorities and bandwidth limits, or extract audio-only MP3s.",
  },
  {
    title: "Works on blocked networks",
    description:
      "Your ISP blocks cam sites? A built-in Secure Proxy handles it with one per-creator toggle — no VPN subscription, no configuration. Install Cloudflare WARP (free) and recordings automatically go full speed.",
  },
  {
    title: "Library & Analytics",
    description:
      "A searchable library with tags, collections, favorites, and notes. Scan folders to import existing media, then dig into dashboard stats, storage breakdowns, and job outcomes.",
  },
  {
    title: "Built-in Video Editor",
    description:
      "Trim, cut out sections, and combine recordings without leaving the app. A filmstrip-and-waveform timeline with one-frame stepping, silence detection, audio-only MP3/M4A extraction, and non-destructive exports — the original is never modified.",
  },
  {
    title: "VR Recording & Playback",
    description:
      "Record VR (3D) shows from Dreamcam and Stripchat and watch them in the built-in look-around player — drag to look, wheel to zoom, just like the site's own VR player.",
  },
  {
    title: "Cloud Uploads",
    description:
      "Push finished recordings straight to the cloud. Built-in providers include Gofile, Catbox, MixDrop, and Google Drive — each with its own credential handling.",
  },
  {
    title: "Desktop Integration",
    description:
      "System tray with live status, close-to-tray mode, launch at startup, native notifications, dark and light themes, and a low-resource mode for weaker machines.",
  },
  {
    title: "Push Notifications",
    description:
      "Get pinged on your phone the moment a creator goes live or a recording starts, finishes, or fails — via Discord or Telegram. Fire-and-forget delivery that never delays a recording.",
  },
  {
    title: "Remote Control via Telegram",
    description:
      "The Telegram push becomes a control surface: start a recording with one tap — defaults or the full options wizard — and pause, resume, or stop a running capture straight from your phone.",
  },
  {
    title: "Post-Recording Automation",
    description:
      "A background pipeline for every finished capture: tag → compress → move → upload → delete. Each step optional, failures never block the rest, and your library entry always survives.",
  },
] as const;

export const safetyRails = [
  {
    title: "Master pause switch",
    description:
      "Halt every auto-recording instantly from Settings. One switch, zero orphaned jobs.",
  },
  {
    title: "Disk-space guardrail",
    description:
      "Auto-record skips creators when free space drops below your configured limit. Your drive never fills silently.",
  },
  {
    title: "Segment splitting",
    description:
      "Split marathon sessions into parts every N minutes so no single file becomes unmanageable.",
  },
  {
    title: "Crash recovery",
    description:
      "Interrupted recordings are reconciled on next launch. A power cut never costs you the whole stream.",
  },
] as const;

export const platforms = [
  { name: "Twitch", live: true, recording: true, downloads: true, vr: false },
  { name: "YouTube", live: true, recording: true, downloads: true, vr: false },
  { name: "Rumble", live: true, recording: true, downloads: true, vr: false },
  { name: "Kick", live: true, recording: true, downloads: true, vr: false },
  { name: "Chaturbate", live: true, recording: true, downloads: true, vr: false },
  { name: "Stripchat", live: true, recording: true, downloads: true, vr: true },
  { name: "BongaCams", live: true, recording: true, downloads: false, vr: false },
  { name: "Cam4", live: true, recording: true, downloads: false, vr: false },
  { name: "CamSoda", live: true, recording: true, downloads: false, vr: false },
  { name: "Jerkmate", live: true, recording: true, downloads: false, vr: false },
  { name: "Streamate", live: true, recording: true, downloads: false, vr: false },
  { name: "MyFreeCams", live: true, recording: true, downloads: false, vr: false },
  { name: "Dreamcam", live: true, recording: true, downloads: false, vr: true },
] as const;

export const faqs = [
  {
    question: "Is Rekordly really free?",
    answer:
      "Yes — completely. Rekordly is free and open-source software under the Apache License 2.0. Everything is included: unlimited creator monitoring, unlimited live recordings, unlimited downloads, push notifications with remote control via Telegram, and full access to the library and plugins. The vendored yt-dlp and ffmpeg binaries keep their own licenses — see the License page for details.",
  },
  {
    question: "Do I need to install ffmpeg or yt-dlp?",
    answer:
      "No. Both are vendored inside the app — download the installer, run it, and you are done. Nothing else to install.",
  },
  {
    question: "Which platforms are supported?",
    answer:
      "Twitch, YouTube, Rumble, Kick, Chaturbate, Stripchat, BongaCams, Cam4, CamSoda, Jerkmate, Streamate, MyFreeCams, and Dreamcam are supported out of the box for live detection and recording — Stripchat and Dreamcam including VR (3D) shows. A Tango Live plugin is also available from the Plugin Marketplace. New sites can be added as plugins without touching the core app.",
  },
  {
    question: "My ISP blocks one of the sites — can I still record?",
    answer:
      "Yes. Rekordly ships with a built-in Secure Proxy: enable it per creator with one toggle and the app routes that creator's traffic through it automatically — the proxy runtime downloads itself on first use. It runs on the Tor network, so it's slower; if you install Cloudflare WARP (free), Rekordly detects it and recordings automatically go full speed.",
  },
  {
    question: "How do updates work?",
    answer:
      "Rekordly updates itself. When a new release is published on GitHub, you get an in-app notification and can download and restart with one click.",
  },
  {
    question: "Where is my data stored?",
    answer:
      "Everything — creators, recordings, the library database — lives locally on your machine in an SQLite database. Nothing is uploaded anywhere unless you explicitly configure a cloud provider.",
  },
  {
    question: "Can I record shows from Stripchat, BongaCams, or Chaturbate?",
    answer:
      "Yes — all three are supported out of the box with automatic recording: the moment a creator goes live, Rekordly records the stream at original quality and files it into your library. Stripchat and Chaturbate also support VOD/clip downloads, and Stripchat plus Dreamcam include VR (3D) show recording. Support is per-plugin — see the platform guides and the capability matrix on the cam recording page.",
  },
  {
    question: "Is recording streams allowed?",
    answer:
      "You are responsible for using Rekordly in a way that respects the terms of the platforms you record from and the laws in your jurisdiction. Please record responsibly.",
  },
] as const;

/**
 * The 5 FAQs shown on the homepage — free/use, install, platforms, ISP
 * blocking, and data locality. The full list stays on /docs/faq and is what
 * `faqs` above feeds.
 */
export const homepageFaqs = [
  faqs[0],
  faqs[1],
  faqs[2],
  faqs[3],
  faqs[5],
] as const;

export const contactChannels = [
  {
    title: "Bug report",
    description:
      "Found something broken? Open an issue with your Rekordly version and the steps to reproduce.",
    label: "GitHub Issues",
    href: site.issuesUrl,
  },
  {
    title: "Feature ideas & questions",
    description:
      "Discuss ideas, get help from the community, and vote on what ships next.",
    label: "GitHub Discussions",
    href: site.discussionsUrl,
  },
  {
    title: "General inquiries",
    description:
      "For everything else — press, partnerships, or anything that does not fit a public repo.",
    label: site.email,
    href: `mailto:${site.email}`,
  },
] as const;

// --- Development roadmap ------------------------------------------------------

export type RoadmapStatus = "shipped" | "in-progress" | "planned";

export interface RoadmapItem {
  title: string;
  description: string;
  /** Milestone/version where the work lands, e.g. "1.0" or "Next". */
  target: string;
  /** GitHub issue URL when the work is tracked publicly. */
  issueUrl?: string;
}

export interface RoadmapGroup {
  status: RoadmapStatus;
  title: string;
  description: string;
  items: RoadmapItem[];
}

export const roadmap: RoadmapGroup[] = [
  {
    status: "shipped",
    title: "Shipped",
    description: "Released and available in the latest build.",
    items: [
      {
        title: "Core app — v0.1.0",
        description:
          "Dashboard, creator management, monitoring engine, recording queue, searchable library, download & upload managers, analytics, logs, command palette, and the plugin system with SDK.",
        target: "0.1.0",
      },
      {
        title: "Bundled site plugins",
        description:
          "Twitch, YouTube, Rumble, Kick, Chaturbate, Stripchat, BongaCams, Cam4, CamSoda, Jerkmate, Streamate, MyFreeCams, and Dreamcam — each with live detection, auto-record, and manual recording, plus VR (3D) capture on Dreamcam and Stripchat.",
        target: "0.1.0",
      },
      {
        title: "Push notifications & Telegram remote control",
        description:
          "Discord and Telegram pushes for live events and recordings — fire-and-forget, plus interactive control: record, pause, resume, and stop from the Telegram buttons.",
        target: "0.1.x",
      },
      {
        title: "Post-recording automation",
        description:
          "A background pipeline for every finished capture: tag → compress → move → upload → delete. Each step optional, failures never block the rest.",
        target: "0.1.x",
      },
      {
        title: "Built-in video editor",
        description:
          "Trim, cut, and combine recordings on a filmstrip-and-waveform timeline with silence detection and audio-only exports — all non-destructive.",
        target: "0.1.x",
      },
      {
        title: "Secure Proxy + WARP detection",
        description:
          "One per-creator toggle routes recording through a built-in proxy on blocked networks, with automatic full-speed detection of Cloudflare WARP.",
        target: "0.1.x",
      },
      {
        title: "Cloud uploads",
        description:
          "Push finished recordings to Gofile, Catbox, MixDrop, or Google Drive with per-provider credential handling.",
        target: "0.1.x",
      },
      {
        title: "In-app bug reporting & auto-updater",
        description:
          "Report problems from Settings with environment info attached (a prepared report is copied to your clipboard for a GitHub issue), and one-click self-updates against GitHub Releases.",
        target: "1.0.0",
      },
      {
        title: "In-app plugin install",
        description:
          "Install an unpacked site-plugin folder from inside the app — the Plugins page, the top-bar New menu, and the command palette all wire into the same managed-install flow with SDK validation.",
        target: "1.0.0",
      },
    ],
  },
  {
    status: "in-progress",
    title: "In Progress",
    description: "Actively being worked on right now.",
    items: [
      {
        title: "Plugin developer mode",
        description:
          "Unpacked plugin folders already load automatically in dev builds and can be installed from disk in packaged builds — hot-reloading is next, so community plugin development stays instant.",
        target: "Next release",
        issueUrl: site.discussionsUrl,
      },
    ],
  },
  {
    status: "planned",
    title: "Planned",
    description: "On the roadmap, not started yet.",
    items: [
      {
        title: "Recording scheduler",
        description:
          "Schedule recordings ahead of time and build automation rules for recurring captures.",
        target: "1.1",
      },
      {
        title: "Generic webhook delivery",
        description:
          "Push recording events to any HTTP endpoint — Discord and Telegram are already shipped.",
        target: "1.1",
      },
      {
        title: "Marketplace browsing in-app",
        description:
          "Browse the website's plugin marketplace from inside the app and install a listing with one click. Installing a built plugin folder from disk already works.",
        target: "1.2",
      },
      {
        title: "Cross-platform support",
        description:
          "Bring Rekordly to macOS and Linux alongside Windows.",
        target: "2.0",
      },
      {
        title: "Advanced plugin APIs & sync profiles",
        description:
          "Deeper plugin hooks plus syncing your creators, tags, and settings between machines.",
        target: "2.0",
      },
    ],
  },
];

export const legal = {
  lastUpdated: "October 21, 2026",
  contactLine: `Questions about this document? Contact us at ${site.email} or open a discussion on GitHub.`,
} as const;
