# Recorder Engine Architecture Hardening — CaptureGem-like 20–30 Stream Target

> Scope: live recordings only. Target: ~30 concurrent copy-only recordings on 4c / 8GB / HDD+SSD.
> Method: inspect → smallest change → typecheck → test. No rewrite. No Rust/Go/custom-HLS engine now.

## 0. Engineering rules (binding)

1. Inspect existing recording architecture before modifying anything.
2. Identify: entry points, yt-dlp usage, FFmpeg spawning, process lifecycle, progress parsing,
   SQLite writes, IPC events, process monitoring, recovery/orphans, post-processing, thumbnails,
   metadata, proxy handling.
3. Map the flow in a short note; reuse existing abstractions; do not duplicate functionality.
4. Preserve user-visible behavior unless explicitly changed below.
5. Small, independently testable changes. `pnpm typecheck` green after every phase.
6. Do not remove retry/recovery behavior until an equivalent or better one exists.
7. Do NOT start with Rust, Go, custom HLS downloading, or a new engine.

## 0.1 Critical implementation constraints (binding)

1. **No forced `yt-dlp -g` for all sites.** Direct-stream-capable sites may use
   `resolve → FFmpeg`; sites requiring persistent yt-dlp (DASH, token-gated, protected
   extraction) retain that fallback as a first-class path. Routing is per-site/capability,
   and the fallback's `RecordingResourceCost{processCount: 2}` is counted in admission.
2. **DownloadManager / ordinary downloads out of scope.** Recording changes remain isolated.
   Shared dependencies (e.g. `ExternalBinary.resolve`, `BackgroundJobService` signatures) may be
   read but not refactored unless a concrete blocker is proven. The downloads 700ms throttle
   (`download-manager.ts:493,87`) stays untouched.
3. **Success is not CPU/RAM alone.** Acceptance additionally requires: recording continuity
   (no silent gaps — restarts produce explicit `.partN` + event, never invisible truncation),
   classified FFmpeg exit counts, reconnect and re-resolve counts, and file integrity
   (probe + playable spot-checks). See §§17–18.
4. **Bandwidth estimates are optional.** Unknown `estimatedNetworkMbps/DiskMbps` degrades
   gracefully and never blocks start; admission falls back to `maxConcurrent` + stagger +
   disk-space guards only.
5. **Lifecycle before mass stress.** The minimum worker FSM (§5) + exit-event child lifecycle
   with async kill (§11) must land and be tested (Phase C) before any 20–30 soak in Phase H
   counts as signal.
6. **Recovery parity gate.** Existing `recoverStaleJobs` / `watchOrphanedJob` semantics
   (re-attach live, fail dead, torn-row safe) stay until the replacement has equivalent tests.
   No swap without test parity.
7. **Post-processing never blocks live.** Finishing enqueues (`POST_PROCESS_QUEUE`, transcode
   pool c=2) and returns; the live worker never awaits ffprobe/remux/thumbnail/metadata/transcode.
   Phase G asserts this invariant.

## 1. Verified current architecture (2026-09-08 audit)

Real engine: `packages/core/src/recording/*`. `packages/recorder/*` is binary-resolution only
(`resolveExecutable`); its `RecordingQueue` FSM (`recorder/src/queue.ts:34`) is unused (only
`queue.test.ts` imports it) — reuse it, don't build a second queue.

```text
UI poll (recordings.tsx:54 2s, dashboard 3s)
  → IPC recording:get-jobs (ipc/recording.ts:93-95)
  → RecordingService (core/src/recording/service.ts)
    → YtDlpService.download() (recording/yt-dlp.ts)
      → if URL contains .m3u8: 1× direct ffmpeg (yt-dlp.ts:549-604)
      → else: 1× persistent yt-dlp + hidden ffmpeg child (yt-dlp.ts:318-386)
    → per-line progress → repo.updateJob() UNTHROTTLED (service.ts:127-134)
    → finish INLINE: normalize → verify → repair → thumb+metadata (service.ts:862-940,1164-1246)
```

Verified facts:

- **No resolve/capture split.** No `-g/--get-url` in recorder. `extractInfo(--dump-json)` is only
  used by `DownloadManager`, never by `RecordingService`. Resolve lives in plugins
  (`extractStream` via `ipc/recording.ts:37`, `main/index.ts:729`); `download()` captures directly.
  Only re-resolve points: `resume` (`service.ts:273` via `resolveStream`) + segment chain
  (`main/index.ts:880` `reExtractAndStart`).
- **Copy-only violated once:** `best` → `-c copy` (`yt-dlp.ts:589`) OK; any requested height →
  `-vf scale=-2:'min(ih,H)' -c:v libx264 -preset veryfast -crf 23 -c:a copy` live (`yt-dlp.ts:581`).
- **Concurrency guard weak:** `repo.listJobs('recording').length >= effectiveMaxConcurrent`
  (`service.ts:152,261,413`; default `maxConcurrent:3`, LRM forces `1` in `service.ts:147-149`).
  Misses preparing/stopping/paused; check-then-`createJob` race; fire-and-forget `processRecording`.
- **Hottest write:** recording progress per ffmpeg/yt-dlp stderr line → `updateJob{bytes,speed,eta,percent}`
  with no throttle, no txn, no `updatedAt` (`recording-repo.ts:127-128`; DB is WAL in `client.ts:22`
  but zero batching). Downloads already throttle 700ms (`download-manager.ts:493,87`); recordings do not.
  No recording-progress IPC event exists (only lifecycle events in `shared/src/recording.ts:7-24`) —
  fixing DB writes automatically relieves UI-poll pressure.
- **Blocking kills:** `execFileSync(taskkill /T /F, tasklist, powershell Get-CimInstance*)` in
  `yt-dlp.ts:20,43,80`, hit on every stop (`:719,748`), per stale job at boot (`service.ts:544,556`),
  and every 5s per orphan (`service.ts:639`, `POLL_MS:619`, `MAX_IDLE 60×5s`). Monitors themselves are
  async (`process-monitor 2000ms`, `network-monitor 1500ms` in `services/*` + `main/index.ts:580,587`)
  but too frequent at 30 streams and must not be the primary lifecycle signal.
- **Finish amplification:** `ensureMp4Container → verifier.verify → repairPartialFile(remux) →
  generateThumbnail(scale=640:-1, tries [10,1,0], 30s each) → getMetadata` (`ffmpeg.ts:43,103,121,134,195,224`;
  `container.ts:22`; `verifier.ts:15`) all inline in `processRecording`. `BackgroundJobService`
  exists (`processing.size>=2` → effectively 1-at-a-time, `background-job-service.ts:81`) but recordings
  don't use it.
- **Recovery works, expensively:** pid+path persisted (`service.ts:140,771`); `recoverStaleJobs`
  (`:527-605`) re-attaches live (`:563-576`) or fails (`:578-582`); `watchOrphanedJob` (`:615-661`)
  polls file size 5s. Keep semantics; batch + defer ffprobe/remux.
- **Monitoring/proxy bounded:** `Scheduler maxConcurrent 5` (`monitoring/service.ts:65-71`, tick 5s in
  `scheduler.ts:39`), `BrowserPool maxPages 10` (`browser-pool.ts:35`), `extractionSlots = Semaphore(2)`
  (`main/index.ts:204`) on auto-record path only (`:727-734`) — manual `extractStream`
  (`ipc/recording.ts:37-43`) bypasses it. Stripchat `MAX_ACTIVE_PROXIES=2` + LRU + 90s idle + 15s
  sweeper (`plugins/stripchat/src/index.ts:29,810-853`; `mouflon-proxy.ts:53,174-192`) — keep, fix bypass.

## 2. Target architecture

```text
Electron UI (poll + lifecycle events only)
    | IPC
    v
RecorderManager (model/stream state, scheduler, admission, recovery)
    v
RecorderBackend  ← seam: FfmpegCopyBackend now, RustSidecarBackend later
    +-- FfmpegCopyBackend (+ yt-dlp fallback where required)
    v
Recording Worker (resolve → capture → reconnect → re-resolve → stop)
    v
FFmpeg -c copy → fragmented MP4 / configured container → disk
    v
BackgroundJobQueue (verify, repair/remux, thumb, metadata, explicit transcode) → Library/SQLite
```

Live path stays short: `resolve → FFmpeg copy → disk`. No thumb/verify/metadata/remux/transcode live.

Backend seam (adapt names to repo conventions; concept):

```ts
interface RecorderBackend {
  resolve(input: StreamInput): Promise<ResolvedStream>;
  capture(stream: ResolvedStream, options: CaptureOptions): Promise<RecordingHandle>;
}
interface RecordingHandle {
  pid?: number;
  progress(): RecordingProgress;
  stop(reason?: StopReason): Promise<void>;
  wait(): Promise<RecordingResult>;
}
```

## 3. Resolve vs capture (per-site routing — no forced `yt-dlp -g`)

```text
Direct-capable:  StreamObject → short resolve → ResolvedStream → persistent ffmpeg -c copy
yt-dlp-required: StreamObject → persistent yt-dlp + ffmpeg fallback (first-class, cost = 2 procs)
```

- Do not keep yt-dlp alive when only resolution was needed; do not force `-g` where the plugin
  already supplies a direct URL or where extraction requires persistent yt-dlp (constraint §0.1.1).
- Preserve cookies/headers/UA/referer/auth (see current forwarding `yt-dlp.ts:551-566`); never log credentials.
- Fallback (DASH/token/protected sites): `1 stream = yt-dlp + ffmpeg`, counted explicitly in
  `RecordingResourceCost` and admission.

## 4. Three failure classes (do not conflate)

- **A. Transient connection failure** → ffmpeg `-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5`
  (already in `yt-dlp.ts:570`), same URL.
- **B. Expired/invalid URL** (401/403/token) → re-resolve (`plugin.extractStream`) → new ffmpeg.
- **C. Genuine end/offline** → finalize normally → `POST_PROCESS_QUEUE`.
- Respect existing timeout/retry/offline-wait/error-wait settings; add jitter/backoff; no infinite loops.

## 5. Explicit worker state machine (source of truth)

`QUEUED, OFFLINE, RESOLVING, STARTING, RECORDING, RECONNECTING, RE_RESOLVING, STOPPING, FINALIZING, FAILED`
(internal; UI sees subset). Examples:

```text
OFFLINE → RESOLVING → STARTING → RECORDING → RECONNECTING → RECORDING
RECORDING → RE_RESOLVING → STARTING → RECORDING
RECORDING → STREAM_ENDED → FINALIZING → POST_PROCESS_QUEUE
```

## 6. One logical worker per stream (no hard-coded proc count)

Default direct-HLS: `1 stream = 1 ffmpeg`. Fallbacks may cost 2. Expose:

```ts
type RecordingResourceCost = {
  processCount: number;
  estimatedNetworkMbps?: number;
  estimatedDiskMbps?: number;
  requiresTranscode: boolean;
};
```

Scheduler reasons about cost, not just stream count.

## 7. Copy-only means copy-only

`quality = best`/unset → `-c copy`, verified by a test that scans generated ffmpeg args
(absence of `-vf scale`, `libx264/5` on copy path). Current violator: `yt-dlp.ts:581`.

## 8. Transcode = post-processing only

```text
LIVE (source-quality file) → BackgroundJobQueue → TranscodePool (default maxTranscodes = 2)
```

5 needing transcode → 2 active + 3 queued. Live never waits. UI: `Transcode slots full / Queued`.
Reuse `settings-service.ts` patterns; do not invent a second settings store.

## 9. Admission: ceiling + stagger first, resource-aware later (estimates optional)

- Keep hard `maxConcurrent` ceiling (raise to 30–50), but add staggered-start queue:
  `1 start → wait ~2s → next` (queue, never sleep in main/UI).
- Track `activeStreams, activeProcesses, estNetMbps, estDiskMbps, active/queuedTranscodes`
  (estimate → refine from observed throughput; no per-stream speed tests). Per constraint §0.1.4,
  unknown estimates degrade gracefully and never block start — admission then uses ceiling +
  stagger + disk-space guards only.
- Recording changes stay isolated from DownloadManager/downloads (constraint §0.1.2).
- 30 is a safety limit, not a guarantee for every stream mix.

## 10. Coalesce progress / DB / IPC (high priority)

```text
ffmpeg → progress accumulator → flush every 2–5s → DB + IPC (skip unchanged)
```

Target ≤0.5 DB writes/s/stream at 30. UI gets state updates, not raw ffmpeg lines.
Investigate `ffmpeg -progress pipe:1` (machine-readable) for progress; keep capped stderr
ring-buffer for diagnostics; never store full output in SQLite.

## 11. Process monitoring + startup recovery

- Exit/error events = primary signal; polling = reconciliation (`normal ~2s`, `mass ~10s`).
- No `execFileSync(tasklist/taskkill/powershell)` in hot paths — async only; never block main.
- Boot: discover → classify → reconcile fast; expensive verify/repair in background.
  Target: 30 orphans → reconciled in <30s where achievable.

## 12. File format / crash resilience

Keep frag-mp4 flags (`+frag_keyframe+empty_moov+default_base_moof`, already in `yt-dlp.ts:597`);
verify usability after kill/crash/restart/net-loss. No live remux for cosmetics.
If repair needed: `needsRepair=true → BackgroundJobQueue → repair/remux`.

## 13. Post-proc queue + lazy thumbs + monitor grid + disk policy

- `BackgroundJobService` c=1 for verify/thumb/metadata/repair; transcode c=2. 30 finishes must not
  spawn 30× ffprobe/thumb/remux/transcode at once.
- Library entry on finish; thumbs/metadata idle or on-view.
- Monitor grid derives from local files only (~0 upstream bandwidth), configurable refresh.
- Never throttle live streams; when disk pressure is dangerous, new streams → `QUEUED`.
  Warn on HDD+high-N (measure; don't hard-reject at 15 without data).
- Invariant (constraint §0.1.7): post-processing/transcoding never blocks the live path — finishing
  enqueues and returns; Phase G asserts the live worker never awaits post-proc.

## 14. DB / Electron-main discipline

- Real-time state in memory; SQLite = persistence/recovery/library index, batched where practical.
- Main = orchestration only: no stream parsing, ffmpeg-log processing, FS scans, thumb gen,
  sync proc inspection, or per-line DB writes in hot path.

## 15. Do NOT hard-code `-threads 1`

Benchmark `ffmpeg default` vs `-threads 1` on stream-copy workload (CPU/RAM/ctx-switch/drops/
integrity/startup) before choosing.

## 16. Implementation order

- **A. Inspect + baseline** — this doc, seam shell, 3-stream profile, typecheck.
- **B. Resolve/capture split** — per-site routing (§3), persistent copy, header/cookie forward, A/B/C classification.
- **C. State machine + recovery (gate for H)** — minimum FSM, exit-event lifecycle, async kill,
  batched orphan reconcile + recovery-parity tests (constraint §§0.1.5–0.1.6). No 20–30 soak counts
  as signal until C lands.
- **D. Copy-only gate** — arg-scan test, no live transcode, downgrade = post transcode.
- **E. Overhead cut** — accumulator, batched DB, coalesced IPC, 10s mass polling, async procs.
- **F. Admission** — ceiling + stagger queue + disk guards + optional accounting (estimates degrade per §9).
- **G. Background work** — post queue (1), transcode pool (2), lazy thumbs, local-only monitor;
  assert live never awaits post-proc.
- **H. 30-stream validation** — soak + torture (net cut, URL expiry, kill-1-ffmpeg, stop-all-30,
  app-crash → reconcile). Distinguish `architecturally supports 30` from `soak-tested 30`.

## 17. Acceptance targets (continuity counts — constraint §0.1.3)

30 copy-only streams with approx: `CPU <85%, RAM <6GB, 0 OOM, 0 zombies, DB ≤0.5/s/stream,
no live transcoders, controlled start, reliable reconnect + re-resolve, responsive UI`,
PLUS: recording continuity (no silent gaps; restarts = explicit `.partN` + event), classified
ffmpeg-exit / reconnect / re-resolve counts, and file integrity (probe + playable spot-checks).
Targets, not assumptions — on miss, find the bottleneck, don't add arbitrary throttles.

## 18. Stress + torture (required before claiming 30)

Synthetic local HLS at N=1/3/10/20/30 measuring CPU/RAM/disk/net/DB-writes/IPC/procs,
PLUS continuity/exits/reconnects/re-resolves/integrity/gap-checks/startup/stop-all.
Torture: net cut→reconnect (same URL); forced URL invalid→re-resolve (new ffmpeg, continued
recording); kill one ffmpeg→classified recover; stop-all-30→clean; app kill→orphan reconcile
under recovery-parity gate (§0.1.6). Synthetic validates engine only —
real-site 30-live still required to claim success.

### Harness (implemented)

`packages/core/src/recording/service-stress.test.ts` — gated, NOT in the default
suite. Local live-style HLS origin (complete 60s asset, throttled ~realtime
segments, served with end tag so captures end naturally with a clean moov),
REAL RecordingService + REAL ffmpeg downloader, in-memory repo as DB-write meter:

```powershell
# Engine validation at N=3 (default)
$env:STRESS_HLS = "1"
pnpm --filter @rekordly/core exec vitest run src/recording/service-stress.test.ts

# Full soak shape (minutes; needs a potato-class box for credible numbers)
$env:STRESS_HLS = "1"; $env:STRESS_N = "30"
pnpm --filter @rekordly/core exec vitest run src/recording/service-stress.test.ts
```

Verified at N=3 (2026-09-08): 3 live procs (1/stream), 0.22 DB writes/s/stream,
natural completions with playable files, SIGKILL→same-URL retry→completed,
stop-all with zero strays. Per §26 this is `architecturally supports 30`,
NOT `soak-tested 30` — N=30 + real-site validation remain manual.

### Known limitation: Windows graceful stop (pre-existing, verified 2026-09-08)

Stopping a capture via ffmpeg stdin (`'q'`, `'q\n'`, `'q'`+EOF) was probed
against BOTH the PATH and vendored ffmpeg builds — the process ignores all of
them, so every stop falls through to the 5s-grace force-kill. A force-killed
fragmented MP4 has no moov and is unrecoverable (`moov atom not found`; the
repair remux cannot salvage it). Consequences, all pre-existing:

- Stream-ended/user-stopped captures depend on the kill+repair path; repair
  only succeeds when ffmpeg finalizes a moov (clean exits, yt-dlp TS temps).
- The harness therefore asserts playability on NATURAL completions and
  cleanup-only (rows terminal, zero strays) on stopped captures.
- Retry preservation now probes readability (`getContainerFormat`) and
  discards moov-less generations instead of poisoning the concat merge.

Follow-up (out of this plan, needs approval): capture to MPEG-TS on Windows
(truncation-tolerant by design) + background remux to MP4, or a delivery
mechanism for graceful shutdown that actually works without a console.

## 19. Future Rust

Not now. Seam (§2) is the only migration boundary: later replace `FfmpegCopyBackend` with
`RustSidecarBackend` without touching UI, manager, scheduling, admission, post-proc, library.

## 20. Per-change rule

Inspect → explain current behavior → name bottleneck → smallest change → typecheck → relevant
test → report: files changed, arch delta, tests, benchmarks, risks, which acceptance items are
actually verified vs still needing real 30-stream testing. Priority:
`correctness → reliability → isolation → measured performance → elegance`.

## Tracking

- [x] A. Seam + baseline profile (`backend.ts`, `backend.test.ts` — 5 tests)
- [x] B. Resolve/capture split + A/B/C failures (`failures.ts` + re-resolve loop with part preservation, `service-reresolve.test.ts` — 8 tests). Extended: TRANSIENT same-URL worker retry; unexplained death classifies TRANSIENT (bounded), only local errors are FATAL.
- [x] C. State machine + async lifecycle + orphan batch (`worker-state.ts`, async `isPidAlive`/`listRecorderProcessesAsync`/`stopPidTreeAsync`, async `recoverStaleJobs`, parity `service-recovery.test.ts` — 6 tests, incl. live adoption + bulk-scan fallback against real ffmpeg)
- [x] D. Copy-only gate (`buildDirectFfmpegArgs` extracted; `copy-gate.test.ts` — 8 tests incl. header forwarding + frag/reconnect flags)
- [x] E. Progress/DB/IPC coalesce + mass polling (`progressAcc` 2s flush + skip-unchanged, `progressFlushMs` seam; mass-mode 10s monitor skip wired in `main/index.ts`; `monitors-mass.test.ts` + `service-progress.test.ts`)
- [x] F. Ceiling + stagger queue + guards + accounting (2s-gap start pump, launch-time ceiling/disk-floor admission, park-don't-fail, in-memory `getResourceUsage()`; `service-admission.test.ts` — 5 tests; `getMinFreeBytes` wired from `autoRecordMinFreeDiskGb`)
- [x] G. Post queue (1) + transcode pool (2) + lazy thumbs + local monitor (`post-queue.ts` WorkQueue; entry-now/enrich-later split; live libx264 removed → post derivative entries; `service-postqueue.test.ts` live-never-waits + `service-transcode.test.ts`)
- [x] H. Harness + torture (`service-stress.test.ts`, gated — see §18)

MVP fastest path to 30: A → B → D → E (throttle only) → F (naive stagger). Harden (C/G/H-full) after.

MVP fastest path to 30: A → B → D → E (throttle only) → F (naive stagger). Harden (C/G/H-full) after.
