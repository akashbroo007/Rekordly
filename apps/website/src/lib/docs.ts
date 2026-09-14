import overviewMd from "../content/docs/overview.md?raw";
import installationMd from "../content/docs/installation.md?raw";
import gettingStartedMd from "../content/docs/getting-started.md?raw";
import monitoringMd from "../content/docs/monitoring.md?raw";
import autoRecordMd from "../content/docs/auto-record.md?raw";
import recordingDownloadsMd from "../content/docs/recording-downloads.md?raw";
import blockedNetworksMd from "../content/docs/blocked-networks.md?raw";
import libraryAnalyticsMd from "../content/docs/library-analytics.md?raw";
import editorMd from "../content/docs/editor.md?raw";
import cloudUploadsMd from "../content/docs/cloud-uploads.md?raw";
import desktopIntegrationMd from "../content/docs/desktop-integration.md?raw";
import platformsMd from "../content/docs/platforms.md?raw";
import pluginsMd from "../content/docs/plugins.md?raw";
import troubleshootingMd from "../content/docs/troubleshooting.md?raw";
import faqMd from "../content/docs/faq.md?raw";
import licenseMd from "../content/docs/license.md?raw";

export interface DocMeta {
  slug: string;
  title: string;
  group: string;
  description: string;
  content: string;
}

export interface DocGroup {
  group: string;
  docs: DocMeta[];
}

export const docGroups: DocGroup[] = [
  {
    group: "Getting Started",
    docs: [
      {
        slug: "overview",
        title: "Overview",
        group: "Getting Started",
        description:
          "What Rekordly is, how it works end to end, and where to go next.",
        content: overviewMd,
      },
      {
        slug: "installation",
        title: "Installation",
        group: "Getting Started",
        description:
          "Installer vs portable build, system requirements, and auto-updates.",
        content: installationMd,
      },
      {
        slug: "getting-started",
        title: "Getting Started",
        group: "Getting Started",
        description:
          "Add your first creator, enable Auto-Record, and explore your library.",
        content: gettingStartedMd,
      },
    ],
  },
  {
    group: "Features",
    docs: [
      {
        slug: "monitoring",
        title: "Live Monitoring",
        group: "Features",
        description:
          "Track creators across sites with configurable check intervals and live status.",
        content: monitoringMd,
      },
      {
        slug: "auto-record",
        title: "Auto-Record",
        group: "Features",
        description:
          "Unattended recording with master pause, disk guardrail, and crash recovery.",
        content: autoRecordMd,
      },
      {
        slug: "recording-downloads",
        title: "Recording & Downloads",
        group: "Features",
        description:
          "Capture streams, download VODs and clips, extract audio, and manage the queue.",
        content: recordingDownloadsMd,
      },
      {
        slug: "blocked-networks",
        title: "Recording on Blocked Networks",
        group: "Features",
        description:
          "The built-in Secure Proxy for ISP-blocked sites, and the free Cloudflare WARP speed upgrade.",
        content: blockedNetworksMd,
      },
      {
        slug: "library-analytics",
        title: "Library & Analytics",
        group: "Features",
        description:
          "Searchable library with tags, collections, favorites, notes, and storage insights.",
        content: libraryAnalyticsMd,
      },
      {
        slug: "editor",
        title: "Built-in Video Editor",
        group: "Features",
        description:
          "Trim, cut out sections, and extract audio from recordings — non-destructive, with a filmstrip timeline.",
        content: editorMd,
      },
      {
        slug: "cloud-uploads",
        title: "Cloud Uploads",
        group: "Features",
        description:
          "Push finished recordings to Gofile, Catbox, MixDrop, or Google Drive.",
        content: cloudUploadsMd,
      },
      {
        slug: "desktop-integration",
        title: "Desktop Integration",
        group: "Features",
        description:
          "System tray, notifications, startup behavior, themes, and low-resource mode.",
        content: desktopIntegrationMd,
      },
    ],
  },
  {
    group: "Advanced",
    docs: [
      {
        slug: "platforms",
        title: "Supported Platforms",
        group: "Advanced",
        description:
          "Which sites are supported and how support ships as plugins.",
        content: platformsMd,
      },
      {
        slug: "plugins",
        title: "Plugins",
        group: "Advanced",
        description:
          "The plugin system and how to write your own site plugin.",
        content: pluginsMd,
      },
      {
        slug: "troubleshooting",
        title: "Troubleshooting",
        group: "Advanced",
        description:
          "Crash recovery, disk-space guardrails, and low-resource mode.",
        content: troubleshootingMd,
      },
    ],
  },
  {
    group: "Help",
    docs: [
      {
        slug: "faq",
        title: "FAQ",
        group: "Help",
        description: "Frequently asked questions about Rekordly.",
        content: faqMd,
      },
      {
        slug: "license",
        title: "License",
        group: "Help",
        description:
          "Rekordly's licensing model: free for personal use, paid commercial licenses.",
        content: licenseMd,
      },
    ],
  },
];

export const allDocs: DocMeta[] = docGroups.flatMap((g) => g.docs);

export function getDoc(slug: string): DocMeta | undefined {
  return allDocs.find((doc) => doc.slug === slug);
}

export function getNeighbors(slug: string): {
  prev?: DocMeta;
  next?: DocMeta;
} {
  const index = allDocs.findIndex((doc) => doc.slug === slug);
  if (index === -1) return {};
  return {
    prev: index > 0 ? allDocs[index - 1] : undefined,
    next: index < allDocs.length - 1 ? allDocs[index + 1] : undefined,
  };
}

// ---------------------------------------------------------------------------
// Heading extraction (for "On this page" TOC)
// ---------------------------------------------------------------------------

export interface TocEntry {
  id: string;
  text: string;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function extractHeadings(markdown: string): TocEntry[] {
  const lines = markdown.split("\n");
  const entries: TocEntry[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = /^(#{2})\s+(.+)$/.exec(line);
    if (match?.[1]) {
      const text = match[2]?.trim().replace(/`/g, "") ?? "";
      entries.push({ id: slugifyHeading(text), text });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Client-side search (flexsearch)
// ---------------------------------------------------------------------------

export interface SearchRecord {
  slug: string;
  title: string;
  heading: string;
  excerpt: string;
}

interface SearchEntry extends SearchRecord {
  id: number;
  text: string;
}

let searchEntries: SearchEntry[] | null = null;
let searchIndex: import("flexsearch").Index | null = null;
let buildPromise: Promise<void> | null = null;

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, " ")
    .replace(/[*_>|#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Load and build the search index once. Safe to call repeatedly and
 * concurrently — every caller awaits the same build promise. Call this
 * eagerly (e.g. when the docs layout mounts or the search modal opens) so
 * the first real query never waits on the flexsearch chunk loading.
 */
export function preloadSearch(): Promise<void> {
  if (searchIndex) return Promise.resolve();
  if (!buildPromise) {
    buildPromise = (async () => {
      searchEntries = [];
      let id = 0;

      for (const doc of allDocs) {
        const plain = stripMarkdown(doc.content);
        searchEntries.push({
          id: id++,
          slug: doc.slug,
          title: doc.title,
          heading: doc.group,
          excerpt: plain.slice(0, 160),
          text: plain,
        });
      }

      const Index = (
        await import("flexsearch")
      ).Index as unknown as new (
        options?: unknown,
      ) => import("flexsearch").Index;
      const index = new Index({ tokenize: "forward", cache: true });

      const built = searchEntries;
      if (built) {
        for (const entry of built) {
          index.add(entry.id, `${entry.title} ${entry.heading} ${entry.text}`);
        }
      }

      searchIndex = index;
    })();
  }
  return buildPromise;
}

export async function searchDocs(
  query: string,
  limit = 8,
): Promise<SearchRecord[]> {
  if (!query.trim()) return [];
  await preloadSearch();
  const index = searchIndex;
  const entries = searchEntries;
  if (!index || !entries) return [];

  // Search each word separately and rank by how many words matched,
  // so multi-word queries don't require an exact all-terms intersection.
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  const scores = new Map<number, number>();
  for (const word of words) {
    const ids = index.search(word, { limit: 100 }) as number[];
    for (const id of ids) {
      scores.set(id, (scores.get(id) ?? 0) + 1);
    }
  }

  const ranked = [...scores.entries()]
    .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
    .slice(0, limit)
    .map(([id]) => entries.find((entry) => entry.id === id))
    .filter((entry): entry is SearchEntry => entry !== undefined);

  return ranked;
}
