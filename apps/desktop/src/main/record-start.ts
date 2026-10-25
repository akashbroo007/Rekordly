/**
 * Shared "record this creator now" + batch "Record All Live" logic.
 *
 * ponytail: this used to be inlined twice — once in main/index.ts (Telegram
 * button taps) and once in main/ipc/recording.ts (the renderer's Record
 * dialog) — with the duplicate-session guard only present in the index copy.
 * One module now backs both paths plus the batch endpoint, so plugin
 * extraction, FK-safe creator ids and the duplicate guard stay in sync.
 *
 * The plugin is the source of truth for live state: the stored check result
 * (monitoring job `lastResult.streamUrl`) is a cache that can legitimately
 * be missing or stale — a creator added seconds ago has never been checked,
 * and a live status can lack a resolvable URL at the moment of the last
 * poll. The helper asks the plugin (or falls back) instead of refusing.
 */

import type { CreatorRecord, CreatorRepo } from '@rekordly/database';
import type { MonitoringService, PluginManager, RecordingService } from '@rekordly/core';
import type { StreamObject } from '@rekordly/shared';
import type {
  RecordAllLiveOptionsDto,
  RecordAllLiveOutcomeDto,
  RecordAllLiveProgressDto,
  RecordAllLiveResultDto,
} from '@rekordly/shared';

export interface RecordStartDeps {
  creatorRepo: CreatorRepo;
  pluginManager: PluginManager;
  monitoring: MonitoringService;
  recording: RecordingService;
}

export interface PerCreatorRecordOptions {
  durationMinutes?: number;
  quality?: string;
  segmentMinutes?: number;
  /** ponytail: per-recording stream variant pick (plugin-defined, e.g. 'vr'). */
  streamType?: string;
}

/** Statuses that mean "a recording session is still running on this creator". */
export const ACTIVE_RECORDING_JOB_STATUSES = ['queued', 'preparing', 'recording', 'paused', 'stopping'] as const;

/** Thrown when the plugin reports the creator is not (or no longer) live. */
export class NotLiveError extends Error {
  constructor(displayName: string) {
    super(`${displayName} is not live or has no stream URL`);
    this.name = 'NotLiveError';
  }
}

/** Thrown when the creator already has an active recording session. */
export class AlreadyRecordingError extends Error {
  constructor(displayName: string) {
    super(`${displayName} already has an active recording.`);
    this.name = 'AlreadyRecordingError';
  }
}

function hasActiveRecordingSession(
  deps: Pick<RecordStartDeps, 'recording'>,
  creatorDbId: string,
): boolean {
  return deps.recording
    .getJobs()
    .some(
      (j) =>
        (ACTIVE_RECORDING_JOB_STATUSES as readonly string[]).includes(j.status) &&
        j.creatorId !== null &&
        j.creatorId === creatorDbId,
    );
}

/**
 * Records one creator now, no matter who asked — the same steps the Record
 * dialog, Telegram taps and the batch flow all take:
 * plugin live-check (cached result as fallback) → extractStream (with the
 * dialog's stream-type pick) → FK-safe creator ids → duplicate guard →
 * `startRecording`. Returns the recording job id.
 */
export async function startRecordingForCreator(
  deps: RecordStartDeps,
  creatorDbId: string,
  startOptions: PerCreatorRecordOptions,
): Promise<string> {
  const creator = deps.creatorRepo.get(creatorDbId);
  if (creator === undefined) throw new Error('Creator not found');

  const monitorId = `${creator.pluginId}:${creator.externalId}`;
  const jobs = deps.monitoring.getJobs();
  const job = jobs.find((j) => j.creatorId === monitorId);
  const managed = deps.pluginManager.get(creator.pluginId);
  const liveDetection = managed?.instance?.capabilities.liveDetection;
  let lastResult = job?.lastResult;
  if (lastResult?.streamUrl === undefined) {
    if (liveDetection === undefined) {
      throw new NotLiveError(creator.displayName);
    }
    const status = await liveDetection.getLiveStatus(monitorId);
    if (!status.isLive) {
      throw new NotLiveError(creator.displayName);
    }
    lastResult = {
      isLive: true,
      title: status.title,
      thumbnail: status.thumbnail,
      viewerCount: status.viewerCount,
      streamUrl: status.streamUrl,
      startedAt: status.startedAt,
      checkedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }

  // Prefer the plugin's extractStream — for platforms like Stripchat the
  // live-check URL is not directly recordable (MOUFLON-obfuscated segments);
  // extractStream returns a prepared StreamObject (local de-obfuscating
  // proxy URL, headers, cookies).
  let stream: StreamObject | null = null;
  const extract = managed?.instance?.capabilities.streamExtraction;
  if (extract !== undefined) {
    try {
      stream = await extract.extractStream(monitorId, {
        streamType: startOptions.streamType,
      });
    } catch {
      /* fall back to the live-check URL below */
    }
  }
  if (stream === null) {
    if (lastResult.streamUrl === undefined) {
      throw new NotLiveError(creator.displayName);
    }
    stream = {
      creatorId: creator.id,
      creatorName: creator.displayName,
      platformId: job?.pluginId ?? creator.pluginId,
      title: lastResult.title ?? `${creator.displayName} live`,
      streamUrl: lastResult.streamUrl,
      thumbnail: lastResult.thumbnail,
      startedAt: lastResult.startedAt,
    };
  } else {
    // extractStream returns the monitor id ("plugin:username") as creatorId,
    // but recording_jobs.creator_id is a FK to creators.id (a DB uuid) —
    // always use the tracked creator row's id.
    stream = { ...stream, creatorId: creator.id, creatorName: creator.displayName };
  }

  // Duplicate guard — same as the auto-record path.
  if (hasActiveRecordingSession(deps, creator.id)) {
    throw new AlreadyRecordingError(creator.displayName);
  }

  return deps.recording.startRecording(stream, startOptions);
}

// --- Batch "Record All Live" -------------------------------------------------

interface LiveCandidate {
  creator: CreatorRecord;
  /** Monitor id (pluginId:externalId) the creator is tracked under. */
  monitorId: string;
}

interface CandidateSelection {
  candidates: LiveCandidate[];
  /** Candidates eliminated before any plugin call, with the reason. */
  skipped: RecordAllLiveOutcomeDto[];
}

/**
 * Builds the batch roster. Without an explicit selection: every tracked
 * creator whose latest monitoring check reports live. With `creatorIds`
 * (the dialog checklist): exactly those — each is RE-VERIFIED at click time
 * by the per-creator helper, so a stale live cache fails that one start
 * ("offline-at-start"), never the whole batch.
 */
export function selectLiveCandidates(
  deps: RecordStartDeps,
  creatorIds?: string[],
): CandidateSelection {
  const skipped: RecordAllLiveOutcomeDto[] = [];
  const candidates: LiveCandidate[] = [];

  if (creatorIds !== undefined) {
    for (const id of creatorIds) {
      const creator = deps.creatorRepo.get(id);
      if (creator === undefined) {
        skipped.push({ creatorId: id, displayName: id, reason: 'not-found' });
        continue;
      }
      candidates.push({ creator, monitorId: `${creator.pluginId}:${creator.externalId}` });
    }
    return { candidates, skipped };
  }

  // Default: everything currently live per monitoring.
  const creatorByMonitorId = new Map<string, CreatorRecord>(
    deps.creatorRepo.list().map((c) => [`${c.pluginId}:${c.externalId}`, c] as const),
  );
  const picked = new Map<string, LiveCandidate>();
  for (const job of deps.monitoring.getJobs()) {
    if (job.lastResult?.isLive !== true) continue;
    const creator = creatorByMonitorId.get(job.creatorId);
    if (creator === undefined || picked.has(creator.id)) continue; // orphaned monitor row — not tracked
    picked.set(creator.id, { creator, monitorId: job.creatorId });
  }
  candidates.push(...picked.values());
  candidates.sort((a, b) => a.creator.displayName.localeCompare(b.creator.displayName));
  return { candidates, skipped };
}

/**
 * The batch's global streamType pick only reaches plugins whose manifest
 * declares it — everyone else records 'auto' (undefined), so a 'vr' pick
 * can never leak into a non-VR plugin's extractStream.
 */
function resolveStreamType(
  deps: Pick<RecordStartDeps, 'pluginManager'>,
  pluginId: string,
  streamType: string | undefined,
): string | undefined {
  if (streamType === undefined || streamType === '') return undefined;
  const declared = deps.pluginManager.get(pluginId)?.record.manifest.streamTypes ?? [];
  return declared.includes(streamType) ? streamType : undefined;
}

/**
 * Batch "Record All Live": one click records every selected creator that is
 * still live, applying the SAME options model as the Record dialog to each.
 *
 * Safety carried over from the auto-record pipeline:
 *  - starts run SEQUENTIALLY (one creator at a time) — plugin local
 *    relays/proxies must not race, and extraction is the delicate step;
 *    RecordingService's staggered start queue then spaces the actual
 *    ffmpeg starts ~2s apart on its own;
 *  - one creator failing never aborts the batch — outcomes come back split
 *    into started / skipped / failed;
 *  - an already-recording creator is skipped WITHOUT any plugin call (the
 *    helper's guard is the backstop).
 */
export async function startAllLive(
  deps: RecordStartDeps,
  options: RecordAllLiveOptionsDto,
  onProgress?: (progress: RecordAllLiveProgressDto) => void,
): Promise<RecordAllLiveResultDto> {
  const { candidates, skipped } = selectLiveCandidates(deps, options.creatorIds);
  const result: RecordAllLiveResultDto = { started: [], skipped, failed: [] };

  const total = candidates.length;
  let done = 0;
  const emitProgress = (
    last?: { displayName: string; outcome: 'started' | 'skipped' | 'failed'; reason?: string },
  ): void => {
    onProgress?.({
      done: Math.min(done, total),
      total,
      started: result.started.length,
      skipped: result.skipped.length,
      failed: result.failed.length,
      lastDisplayName: last?.displayName,
      lastOutcome: last?.outcome,
      lastReason: last?.reason,
    });
  };
  for (const candidate of candidates) {
    // Pre-check WITHOUT touching the plugin: an already-active session skip
    // must not cost an extraction (a second extractStream can tear down a
    // plugin-local proxy the running capture depends on).
    if (hasActiveRecordingSession(deps, candidate.creator.id)) {
      result.skipped.push({
        creatorId: candidate.creator.id,
        displayName: candidate.creator.displayName,
        reason: 'already-recording',
      });
      done++;
      emitProgress({
        displayName: candidate.creator.displayName,
        outcome: 'skipped',
        reason: 'already-recording',
      });
      continue;
    }

    const perCreatorOptions: PerCreatorRecordOptions = {
      quality: options.quality,
      durationMinutes: options.durationMinutes,
      segmentMinutes: options.segmentMinutes,
      streamType: resolveStreamType(deps, candidate.creator.pluginId, options.streamType),
    };

    try {
      const jobId = await startRecordingForCreator(deps, candidate.creator.id, perCreatorOptions);
      result.started.push({
        creatorId: candidate.creator.id,
        displayName: candidate.creator.displayName,
        jobId,
      });
      emitProgress({ displayName: candidate.creator.displayName, outcome: 'started' });
    } catch (err) {
      const skipReason =
        err instanceof AlreadyRecordingError
          ? ('already-recording' as const)
          : err instanceof NotLiveError
            ? ('offline-at-start' as const)
            : undefined;
      if (skipReason !== undefined) {
        result.skipped.push({
          creatorId: candidate.creator.id,
          displayName: candidate.creator.displayName,
          reason: skipReason,
        });
        emitProgress({
          displayName: candidate.creator.displayName,
          outcome: 'skipped',
          reason: skipReason,
        });
      } else {
        result.failed.push({
          creatorId: candidate.creator.id,
          displayName: candidate.creator.displayName,
          reason: err instanceof Error ? err.message : String(err),
        });
        emitProgress({
          displayName: candidate.creator.displayName,
          outcome: 'failed',
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    done++;
  }

  emitProgress();
  return result;
}
