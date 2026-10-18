# Rekordly — Agent Notes

Rules in this file apply to every agent session working in this repo. Keep this file short.

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
