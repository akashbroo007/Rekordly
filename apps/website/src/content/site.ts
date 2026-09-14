export const site = {
  name: "Rekordly",
  tagline: "Monitor, record, and download live streams — automatically.",
  description:
    "A free, source-available Windows desktop app for monitoring creators, automatically recording live streams, downloading videos and VODs, and organizing your recordings.",
  repoUrl: "https://github.com/akashbroo007/Rekordly",
  releasesUrl: "https://github.com/akashbroo007/Rekordly/releases",
  issuesUrl: "https://github.com/akashbroo007/Rekordly/issues",
  discussionsUrl: "https://github.com/akashbroo007/Rekordly/discussions",
  pluginGuideUrl:
    "https://github.com/akashbroo007/Rekordly/blob/main/docs/PLUGIN_GUIDE.md",
  licenseUrl: "https://github.com/akashbroo007/Rekordly/blob/main/LICENSE.txt",
  email: "hello@rekordly.in",
} as const;

export const navLinks = [
  { label: "Features", href: "/features" },
  { label: "Docs", href: "/docs" },
  { label: "Plugins", href: "/plugins" },
  { label: "Download", href: "/download" },
  { label: "Pricing", href: "/pricing" },
  { label: "Roadmap", href: "/roadmap" },
] as const;

export const hero = {
  badge: "Free for personal use — source available",
  titleLead: "Never miss a",
  titleAccent: "live stream",
  titleTail: "again",
  subtitle:
    "A free, source-available Windows app for monitoring creators, automatically recording live streams, downloading videos and VODs, and organizing your recordings.",
  primaryCta: { label: "Download for Windows", href: site.releasesUrl },
  secondaryCta: { label: "View on GitHub", href: site.repoUrl },
  stats: [
    { value: "7", label: "Sites supported" },
    { value: "0", label: "Setup — yt-dlp & ffmpeg bundled" },
    { value: "100%", label: "Free for personal use" },
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
    title: "Cloud Uploads",
    description:
      "Push finished recordings straight to the cloud. Built-in providers include Gofile, Catbox, MixDrop, and Google Drive — each with its own credential handling.",
  },
  {
    title: "Desktop Integration",
    description:
      "System tray with live status, close-to-tray mode, launch at startup, native notifications, dark and light themes, and a low-resource mode for weaker machines.",
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
  { name: "Chaturbate", live: true, recording: true, downloads: true },
  { name: "Stripchat", live: true, recording: true, downloads: true },
  { name: "BongaCams", live: true, recording: true, downloads: false },
  { name: "CamSoda", live: true, recording: true, downloads: false },
  { name: "MyFreeCams", live: true, recording: true, downloads: false },
  { name: "Twitch", live: true, recording: true, downloads: true },
  { name: "YouTube", live: true, recording: true, downloads: true },
] as const;

export const faqs = [
  {
    question: "Is Rekordly really free?",
    answer:
      "Yes — for personal, educational, and other noncommercial use, under the PolyForm Noncommercial license. The free tier includes unlimited creator monitoring, unlimited downloads, and full access to the library and plugins. Live recordings are capped at 15 minutes, up to 5 at a time, with auto-record on 2 creators — Rekordly Pro removes those limits for people who record everything. Companies and other commercial users need a paid commercial license — see the License page or contact us.",
  },
  {
    question: "Do I need to install ffmpeg or yt-dlp?",
    answer:
      "No. Both are vendored inside the app — download the installer, run it, and you are done. Nothing else to install.",
  },
  {
    question: "Which platforms are supported?",
    answer:
      "Chaturbate, Stripchat, BongaCams, CamSoda, MyFreeCams, Twitch, and YouTube are supported out of the box for live detection and recording. New sites can be added as plugins without touching the core app.",
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
    question: "Is recording streams allowed?",
    answer:
      "You are responsible for using Rekordly in a way that respects the terms of the platforms you record from and the laws in your jurisdiction. Please record responsibly.",
  },
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
          "Chaturbate, Stripchat, Twitch, YouTube, BongaCams, CamSoda, MyFreeCams — each with live detection, auto-record, and manual recording.",
        target: "0.1.0",
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
    ],
  },
  {
    status: "in-progress",
    title: "In Progress",
    description: "Actively being worked on right now.",
    items: [
      {
        title: "In-app bug reporting",
        description:
          "Report a problem from Settings with environment info attached automatically — a prepared report is copied to your clipboard ready for a GitHub issue.",
        target: "Next release",
        issueUrl: site.issuesUrl,
      },
      {
        title: "Plugin developer mode",
        description:
          "Load unpacked plugin folders with hot-reloading for faster community plugin development.",
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
        title: "Notification integrations",
        description:
          "Push recording events to Discord, Telegram, and generic webhooks.",
        target: "1.1",
      },
      {
        title: "Plugin marketplace",
        description:
          "Browse and install community plugins from inside the app.",
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
  lastUpdated: "September 12, 2026",
  contactLine: `Questions about this document? Contact us at ${site.email} or open a discussion on GitHub.`,
} as const;
