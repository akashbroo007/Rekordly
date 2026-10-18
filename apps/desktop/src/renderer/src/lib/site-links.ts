/**
 * Marketing-site links used inside the app.
 *
 * The base URL is the one constant every site link is built from, and the
 * slugs mirror the routes registered in the website's featuresConfig
 * (apps/website/src/content/featuresConfig.ts), which is validated at build
 * time by its link-integrity check — a slug pointing at a missing page
 * fails the build.
 *
 * Links open in the system's default browser via window.desktop.app.openUrl
 * and fail silently when the machine is offline (no dialog, no toast).
 */
export const SITE_BASE_URL = 'https://rekordly.in';

/** Feature page slugs under the marketing site (featuresConfig.ts is the source of truth for the shape). */
const FEATURE_SLUGS = {
  automation: '/features/automation',
} as const;

/** Absolute URLs for the in-app feature links. */
export const FEATURE_URLS = {
  automation: `${SITE_BASE_URL}${FEATURE_SLUGS.automation}`,
  // ponytail: not a site page — the updater pulls from GitHub Releases, so
  // the manual-download fallback goes straight to the releases list.
  releases: 'https://github.com/akashbroo007/Rekordly/releases',
} as const;
