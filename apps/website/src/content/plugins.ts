/**
 * Plugin marketplace catalog.
 *
 * This mirrors the real plugin manifests in /plugins — each entry is derived
 * from a manifest.json so the website stays in sync with what actually ships.
 * When a new plugin is added to the repo, add a matching entry here.
 */

export type PluginCapability =
  | "auth"
  | "creator-search"
  | "live-detection"
  | "stream-extraction"
  | "settings"
  | "health-check"
  | "metadata";

/**
 * Plugin category. "platform" = generic live-streaming platform (Twitch,
 * YouTube, Kick, …); "cam" = live-cam sites. Generic platforms are always
 * listed first in the marketplace — Rekordly is presented as platform
 * recording/monitoring technology, not an adult-stream recorder.
 */
export type PluginCategory = "platform" | "cam";

export interface PluginEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: PluginCategory;
  /** Short domain hint, e.g. "chaturbate.com" — shown on the card. */
  domain?: string;
  capabilities: PluginCapability[];
  permissions: string[];
  /** "2d" | "vr" when the plugin declares stream types. */
  streamTypes?: readonly string[];
  /** Optional note shown on the card, e.g. API key requirements. */
  setupHint?: string;
  /** True when the plugin ships bundled with the app. */
  bundled: boolean;
  /** True when the site supports video/VOD downloads (mirrors the platform matrix). */
  downloads?: boolean;
}

export const plugins: PluginEntry[] = [
  // --- Generic live platforms (listed first) -------------------------------
  {
    id: "twitch",
    name: "Twitch",
    description:
      "Monitor and record livestreams from Twitch via the Helix API.",
    author: "Rekordly",
    version: "0.1.0",
    category: "platform",
    domain: "twitch.tv",
    capabilities: [
      "auth",
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    setupHint:
      "Requires a free Twitch Client-ID and Secret. Open Settings for a step-by-step guide.",
    bundled: true,
    downloads: true,
  },
  {
    id: "youtube",
    name: "YouTube",
    description:
      "Monitor and record livestreams from YouTube via the Data API v3.",
    author: "Rekordly",
    version: "0.1.0",
    category: "platform",
    domain: "youtube.com",
    capabilities: [
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    setupHint:
      "Requires a free YouTube Data API v3 key. Open Settings for a step-by-step guide.",
    bundled: true,
    downloads: true,
  },
  {
    id: "kick",
    name: "Kick",
    description:
      "Monitor and record livestreams from Kick (kick.com). Works without an account — optional session cookies raise API rate limits.",
    author: "Rekordly",
    version: "0.1.0",
    category: "platform",
    domain: "kick.com",
    capabilities: [
      "auth",
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    setupHint:
      "Works without an account. Optional session cookies raise API rate limits — paste them in the plugin settings.",
    bundled: true,
    downloads: true,
  },
  // --- Cam sites ------------------------------------------------------------
  {
    id: "chaturbate",
    name: "Chaturbate",
    description:
      "Monitor and record livestreams from Chaturbate (cht.xxx).",
    author: "Rekordly",
    version: "0.1.0",
    category: "cam",
    domain: "cht.xxx",
    capabilities: [
      "auth",
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    bundled: true,
    downloads: true,
  },
  {
    id: "stripchat",
    name: "Stripchat",
    description:
      "Monitor and record livestreams from Stripchat (stripchat.ooo), including VR (3D) cams.",
    author: "Rekordly",
    version: "0.1.0",
    category: "cam",
    domain: "stripchat.ooo",
    capabilities: [
      "auth",
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    streamTypes: ["2d", "vr"],
    bundled: true,
    downloads: true,
  },
  {
    id: "bongacams",
    name: "BongaCams",
    description: "Monitor and record livestreams from BongaCams.",
    author: "Rekordly",
    version: "0.1.0",
    category: "cam",
    capabilities: [
      "auth",
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    bundled: true,
  },
  {
    id: "cam4",
    name: "Cam4",
    description: "Monitor and record livestreams from Cam4 (www.cam4.com).",
    author: "Rekordly",
    version: "0.1.0",
    category: "cam",
    domain: "cam4.com",
    capabilities: [
      "auth",
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    bundled: true,
  },
  {
    id: "camsoda",
    name: "CamSoda",
    description: "Monitor and record livestreams from Camsoda (camsoda.com).",
    author: "Rekordly",
    version: "0.1.0",
    category: "cam",
    domain: "camsoda.com",
    capabilities: [
      "auth",
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    bundled: true,
  },
  {
    id: "dreamcam",
    name: "Dreamcam",
    description:
      "Monitor and record livestreams from Dreamcam (dreamcam.com), including VR (3D) shows.",
    author: "Rekordly",
    version: "0.1.0",
    category: "cam",
    domain: "dreamcam.com",
    capabilities: [
      "auth",
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    streamTypes: ["2d", "vr"],
    setupHint:
      "Works without an account. Optional session cookies enable logged-in quality.",
    bundled: true,
  },
  {
    id: "jerkmate",
    name: "Jerkmate",
    description: "Monitor and record livestreams from Jerkmate (jerkmates.com).",
    author: "Rekordly",
    version: "0.1.0",
    category: "cam",
    domain: "jerkmates.com",
    capabilities: [
      "auth",
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    bundled: true,
  },
  {
    id: "myfreecams",
    name: "MyFreeCams",
    description: "Monitor and record livestreams from MyFreeCams.",
    author: "Rekordly",
    version: "0.1.0",
    category: "cam",
    capabilities: [
      "auth",
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    bundled: true,
  },
  {
    id: "streamate",
    name: "Streamate",
    description: "Monitor and record livestreams from Streamate.",
    author: "Rekordly",
    version: "0.1.0",
    category: "cam",
    capabilities: [
      "auth",
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    bundled: true,
  },
  {
    id: "mock-platform",
    name: "Mock Platform",
    description:
      "Example plugin that validates the Rekordly plugin architecture with mock creators, live status and streams. No real platform is contacted.",
    author: "Rekordly",
    version: "0.1.0",
    category: "platform",
    capabilities: [
      "creator-search",
      "live-detection",
      "stream-extraction",
      "settings",
      "health-check",
      "metadata",
    ],
    permissions: ["network", "cookies", "recording"],
    bundled: false,
  },
];

/** Human-readable labels for capability chips on plugin cards. */
export const capabilityLabels: Record<PluginCapability, string> = {
  auth: "Auth",
  "creator-search": "Creator search",
  "live-detection": "Live detection",
  "stream-extraction": "Stream extraction",
  settings: "Settings",
  "health-check": "Health check",
  metadata: "Metadata",
};

/**
 * Generic live-streaming platforms on the roadmap. Shown in a "coming soon"
 * strip on the marketplace, after the bundled generic platform plugins.
 */
export const plannedPlatforms = [
  "Rumble",
  "Trovo",
  "DLive",
  "Picarto",
  "Bigo Live",
  "TikTok Live",
  "Dailymotion",
  "Bilibili",
  "SOOP",
  "TwitCasting",
  "Facebook Gaming",
  "VK Play Live",
  "Owncast",
] as const;

/**
 * Marketplace sort order: generic platform plugins first, then cam sites.
 * Keeping generic live-streaming platforms at the top presents Rekordly as
 * general platform recording/monitoring technology rather than an
 * adult-stream recorder.
 */
export function sortForMarketplace(list: PluginEntry[]): PluginEntry[] {
  return [...list].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === "platform" ? -1 : 1;
    }
    return 0;
  });
}

/** Filters offered above the marketplace grid. */
export const pluginFilters = [
  { id: "all", label: "All plugins" },
  { id: "recording", label: "Recording" },
  { id: "vr", label: "VR (3D)" },
  { id: "downloads", label: "Downloads" },
] as const;

export type PluginFilterId = (typeof pluginFilters)[number]["id"];
