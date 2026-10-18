/**
 * Feature-link integrity check — run before every website build.
 *
 * Fails the build when any link in the features config points to a route
 * that is not registered as a page, a missing section anchor, a missing
 * sitemap entry, or a missing route/render. Exit code 0 = all good.
 *
 * Run directly: node scripts/checkFeatureLinks.mjs
 * (imports the app's features config via Node's native TS type-stripping)
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");

const { FEATURES_HUB_PATH, featureBoxes, featurePages: pages } =
  await import(pathToFileURL(join(src, "content", "featuresConfig.ts")).href);

const problems = [];

function fail(message) {
  problems.push(message);
}

// --- 1. Internal link parser: boxes + alias hrefs must resolve --------------

const pagePaths = new Set([FEATURES_HUB_PATH]);
for (const page of pages) {
  if (pagePaths.has(page.path)) {
    fail(`Duplicate feature page path: ${page.path}`);
    continue;
  }
  pagePaths.add(page.path);

  if (!page.path.startsWith("/features")) {
    fail(`Feature page path must start with /features: ${page.path}`);
  }
  if (!page.name?.trim()) fail(`Feature page ${page.path} has no name`);
  if (!page.metaTitle?.trim()) fail(`Feature page ${page.path} has no metaTitle`);
  if (!page.metaDescription?.trim()) {
    fail(`Feature page ${page.path} has no metaDescription`);
  }
  if (!page.sections?.length) {
    fail(`Feature page ${page.path} has no sections`);
  }
  const sectionIds = new Set();
  for (const section of page.sections ?? []) {
    if (!section.id?.trim() || !section.heading?.trim()) {
      fail(`Feature page ${page.path} has a section with missing id/heading`);
      continue;
    }
    if (sectionIds.has(section.id)) {
      fail(`Duplicate section id "${section.id}" on ${page.path}`);
    }
    sectionIds.add(section.id);
    if (!section.lead?.trim()) {
      fail(`Section ${page.path}#${section.id} has no lead copy`);
    }
  }
}

/**
 * Validate plain internal hrefs of the shape "/features/<page>#<anchor>".
 */
function validateFeatureHref(href, source) {
  const hashIndex = href.indexOf("#");
  const path = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const anchor = hashIndex === -1 ? null : href.slice(hashIndex + 1);

  if (!pagePaths.has(path)) {
    fail(`${source} -> "${href}": page "${path}" is not a registered route`);
    return;
  }
  if (anchor !== null) {
    const page = pages.find((p) => p.path === path);
    if (path === FEATURES_HUB_PATH || !page) {
      fail(`${source} -> "${href}": cannot anchor to the hub page`);
      return;
    }
    const hasAnchor = page.sections.some((section) => section.id === anchor);
    if (!hasAnchor) {
      fail(
        `${source} -> "${href}": section id "${anchor}" does not exist on ${path}`,
      );
    }
  }
}

for (const box of featureBoxes) {
  validateFeatureHref(box.href, `FeatureBox "${box.title}"`);
  if (!box.description?.trim()) {
    fail(`FeatureBox "${box.title}" has no description`);
  }
  if (box.featured && !box.featuredHeadline) {
    fail(`Featured FeatureBox "${box.title}" has no featuredHeadline`);
  }
}

// --- 2. Sitemap coverage -----------------------------------------------------

const sitemapText = readFileSync(
  join(here, "..", "public", "sitemap.xml"),
  "utf8",
);
const sitemapPaths = new Set(
  [...sitemapText.matchAll(/<loc>https:\/\/rekordly\.in([^<]*)<\/loc>/g)].map(
    (match) => match[1],
  ),
);

for (const path of pagePaths) {
  if (!sitemapPaths.has(path)) {
    fail(`Sitemap is missing feature URL: ${path}`);
  }
}

// --- 3. Every feature page is actually routed + rendered in App.tsx ----------

const appSource = readFileSync(join(src, "App.tsx"), "utf8");
for (const path of pagePaths) {
  if (!appSource.includes(`"${path}"`)) {
    fail(`App.tsx has no route for ${path}`);
  }
}

// --- 4. Docs pages referenced by name exist in the docs folder ---------------

const docsDir = join(src, "content", "docs");
const docSlugs = new Set(
  readdirSync(docsDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -3)),
);

// --- 5. Docs/blog internal links point at real pages -------------------------

const knownRoutes = new Set([
  "/",
  "/features",
  "/download",
  "/blog",
  "/plugins",
  "/marketplace",
  "/adult-stream-recording",
  "/contact",
  "/roadmap",
  "/terms",
  "/privacy",
  "/docs",
  ...pagePaths,
]);

const blogSource = readFileSync(join(src, "content", "blog.ts"), "utf8");
for (const slug of blogSource.matchAll(/slug:\s*"([^"]+)"/g) ?? []) {
  knownRoutes.add(`/blog/${slug[1]}`);
}

function validateMarkdownLink(href, source) {
  if (href.startsWith("http") || href.startsWith("mailto:")) return;
  const path = href.split("#")[0] || "/";
  if (path.startsWith("/docs/")) {
    const slug = path.slice("/docs/".length);
    if (!docSlugs.has(slug)) {
      fail(`${source} links to missing docs page: ${path}`);
    }
    return;
  }
  if (knownRoutes.has(path)) return;
  fail(`${source} links to unknown internal route: ${path}`);
}

for (const file of readdirSync(docsDir)) {
  if (!file.endsWith(".md")) continue;
  const content = readFileSync(join(docsDir, file), "utf8");
  for (const match of content.matchAll(/\]\((\/[^)\s]+)\)/g) ?? []) {
    validateMarkdownLink(match[1], `docs/${file}`);
  }
}
for (const match of blogSource.matchAll(/\]\((\/[^)\s]+)\)/g) ?? []) {
  validateMarkdownLink(match[1], "blog.ts");
}

// --- 6. Desktop app links point at real pages --------------------------------

// The desktop app links to the marketing site (site-links.ts). Import it the
// same way the config is imported and validate every URL against the routes
// registered above — so a slug that points at a missing page fails THIS
// build, on both the website and the desktop.
const { siteUrl } = await import(pathToFileURL(join(src, "content", "site.ts")).href);

const desktopLinksPath = join(
  here,
  "..",
  "..",
  "desktop",
  "src",
  "renderer",
  "src",
  "lib",
  "site-links.ts",
);
try {
  const { SITE_BASE_URL, FEATURE_URLS } = await import(
    pathToFileURL(desktopLinksPath).href
  );
  if (SITE_BASE_URL !== siteUrl) {
    fail(
      `Desktop SITE_BASE_URL (${SITE_BASE_URL}) differs from the website origin (${siteUrl})`,
    );
  }
  for (const [key, url] of Object.entries(FEATURE_URLS ?? {})) {
    if (typeof url !== "string" || !url.startsWith(`${SITE_BASE_URL}/`)) {
      fail(
        `Desktop FEATURE_URLS.${key} is not a ${SITE_BASE_URL} URL: ${String(url)}`,
      );
      continue;
    }
    validateFeatureHref(
      url.slice(SITE_BASE_URL.length),
      `Desktop FEATURE_URLS.${key}`,
    );
  }
} catch (error) {
  fail(
    `Could not load the desktop site-links module: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

// ---------------------------------------------------------------------------

if (problems.length > 0) {
  console.error("\n✖ Feature link check failed:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(`\n${problems.length} problem(s) found. Fix them before building.\n`);
  process.exit(1);
}

console.log(
  `✓ Feature links OK — ${featureBoxes.length} boxes, ${pages.length} pages, ` +
    `anchors resolve, routes registered, sitemap covered, desktop links valid.`,
);
