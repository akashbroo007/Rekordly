import {
  roadmap as fallbackRoadmap,
  site,
  type RoadmapGroup,
  type RoadmapItem,
  type RoadmapStatus,
} from "../content/site";

/**
 * Live roadmap fed from GitHub Issues labeled `roadmap`.
 *
 * Status mapping (label on the issue):
 *   `shipped`     → Shipped column (a closed issue is always Shipped)
 *   `in-progress` → In Progress column
 *   `planned`     → Planned column (default)
 * The issue milestone provides the version target. The issue body's first
 * paragraph becomes the description.
 *
 * When the API is unreachable, rate-limited, or the repo is private, the
 * static fallback in content/site.ts is shown instead — the page never
 * breaks, it just isn't live.
 */

const ISSUES_API_URL = `https://api.github.com/repos/${site.repoUrl.replace("https://github.com/", "")}/issues?labels=roadmap&state=all&per_page=100`;
const CACHE_KEY = "rekordly-roadmap-cache";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

export interface RoadmapSource {
  groups: RoadmapGroup[];
  source: "github" | "fallback";
  /** ISO time of the live fetch, when source === "github". */
  fetchedAt?: string;
}

interface GitHubLabel {
  name?: string;
}

interface GitHubIssue {
  number: number;
  title?: string;
  body?: string | null;
  state?: string;
  html_url?: string;
  milestone?: { title?: string } | null;
  labels?: GitHubLabel[];
  pull_request?: unknown;
  created_at?: string;
}

interface CachePayload {
  at: number;
  groups: RoadmapGroup[];
}

function statusOf(issue: GitHubIssue): RoadmapStatus {
  const names = (issue.labels ?? [])
    .map((label) => (label.name ?? "").toLowerCase().trim())
    .filter((name) => name.length > 0);
  if (issue.state === "closed" || names.includes("shipped")) return "shipped";
  if (names.includes("in-progress") || names.includes("in progress")) return "in-progress";
  return "planned";
}

function firstParagraph(body: string | null | undefined): string {
  if (!body) return "";
  const paragraph: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") {
      if (paragraph.length > 0) break;
      continue;
    }
    if (line.startsWith("#") || line.startsWith(">")) continue;
    paragraph.push(line);
    if (paragraph.join(" ").length >= 240) break;
  }
  return paragraph.join(" ").slice(0, 280);
}

function toRoadmapItem(issue: GitHubIssue): RoadmapItem {
  return {
    title: issue.title?.trim() || `Issue #${issue.number}`,
    description:
      firstParagraph(issue.body) ||
      "No description yet — see the GitHub issue for details.",
    target: issue.milestone?.title?.trim() || "TBD",
    issueUrl: issue.html_url,
  };
}

function groupLiveItems(items: RoadmapItem[]): RoadmapGroup[] {
  return fallbackRoadmap.map((group) => ({
    ...group,
    items: items.filter((item) => {
      const liveGroup = (item as RoadmapItem & { __status?: RoadmapStatus }).__status;
      return liveGroup === group.status;
    }),
  }));
}

function readCache(): CachePayload | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (typeof parsed.at !== "number" || !Array.isArray(parsed.groups)) return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(groups: RoadmapGroup[]): void {
  try {
    const payload: CachePayload = { at: Date.now(), groups };
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage unavailable (private mode etc.) — caching is best-effort
  }
}

async function fetchLiveGroups(): Promise<RoadmapGroup[]> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(ISSUES_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub API responded ${response.status}`);
    const issues = (await response.json()) as GitHubIssue[];

    // The issues endpoint also returns pull requests — drop them.
    const roadmapIssues = issues.filter((issue) => issue.pull_request === undefined);

    const withStatus = roadmapIssues
      .sort((a, b) => a.number - b.number)
      .map((issue) => ({ ...toRoadmapItem(issue), __status: statusOf(issue) }));

    if (withStatus.length === 0) {
      // Repo reachable but nothing labeled yet — keep the curated fallback.
      throw new Error("No issues carry the roadmap label yet");
    }
    return groupLiveItems(withStatus);
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Resolve the roadmap: fresh from GitHub when possible, then the session
 * cache, and finally the static content — in that order of preference.
 */
export async function fetchRoadmap(): Promise<RoadmapSource> {
  const cached = readCache();
  try {
    const groups = await fetchLiveGroups();
    writeCache(groups);
    return { groups, source: "github", fetchedAt: new Date().toISOString() };
  } catch {
    if (cached !== null) {
      return { groups: cached.groups, source: "github", fetchedAt: new Date(cached.at).toISOString() };
    }
    return { groups: fallbackRoadmap, source: "fallback" };
  }
}
