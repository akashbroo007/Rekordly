# Rekordly — Agent Notes

Rules in this file apply to every agent session working in this repo. Keep this file short.

## Visual refinement prompt — sidebar section (standing)

Dark-theme sidebar rules of the main UI refinement prompt (styling only, no logic changes):

- Groups: Dashboard / Creators, Recordings, Library / Downloads, Uploads / Plugins, Analytics, Logs; Settings pinned above the bottom hairline. 36px rows, 2px gap, radius 8, 18px icons stroke 1.75, 10px icon-label gap, no collapse mode (fixed w-60).
- Count badges: static, tabular numbers, hidden when 0 (Creators green, Recordings red, Downloads/Uploads accent).
- **Active item: transparent background, 3px x 18px accent bar at the row's left edge (a step in toward the icons), primary text color, accent icon.** (Bar is a ::before on the row; it sits `before:left-0`, i.e. 8px in from the sidebar edge, aligned with the hover pill's edge. No background pill, border, or shadow on active; hover must not change an active row's background.)
- Inactive: secondary text/icon color; hover `rgba(255,255,255,0.04)`, radius 8, 120ms ease-out background-color-only transition.
- All rows share identical height/padding/margins (nothing shifts when the active item changes). Focus ring on `:focus-visible` only (global 2px accent outline w/ offset from `packages/ui/src/theme.css`). No new animations; tokens only, no hard-coded colors.

## Release watch rule (standing, from the developer)

Whenever a version release is in play (you pushed a `v*` tag, or one is expected), you must **wait here and watch the `Release` workflow to completion** before ending the task:

1. **Poll the run** (`runs` via GitHub API `repos/akashbroo007/Rekordly/actions/runs`, or the run URL) until `status: completed`. Builds take ~20-45 min. Do not stop at "in progress".
2. **Verify the run concluded `success`** (conclusion: `success`).
3. **Verify the published GitHub Release assets** at `repos/akashbroo007/Rekordly/releases/tags/<tag>`: `Rekordly Setup <ver>.exe`, the portable exe, and `latest.yml` (desktop updater needs `latest.yml`).
4. **Verify the post-release website pin commit** landed on `main` (CI auto-pins `apps/website/public/app-version.json` + download links), i.e. the site's download button serves the new build.

Only after 1-4 report the release as done.

### If the run fails

Read the failing step's log, fix the cause, commit + push to `main`, then move the tag and let CI rebuild:

```
git tag -f v<ver>; git push -f origin v<ver>
```

(Move the tag only when no release object exists for it yet; `GET /releases/tags/v<ver>` returns 404 when none.) Resume waiting per the rule above.

### Pre-tag checklist (known CI gates)

- All `apps/desktop/package.json` + `packages/*/package.json` versions **must equal the tag version** (CI hard-fails on mismatch).
- `node scripts/checkFeatureLinks.mjs` in `apps/website` must pass locally — it gates the workspace build in CI. Desktop `FEATURE_URLS` entries must be rekordly.in URLs except entries pinlisted in `DESKTOP_EXTERNAL_URLS` inside that script (pinned external links, e.g. GitHub Releases).
- Commit `pnpm-lock.yaml` together with dependency changes (CI installs with `--frozen-lockfile`).
