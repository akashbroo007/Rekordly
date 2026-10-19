/**
 * RecordingsPage — redesigned recordings surface:
 *   • SummaryStrip (clickable status counts + storage + total recorded time)
 *   • RecordingsToolbar (segmented filter · search · creator · platform
 *     · date range · sort · select-all · Retry All Failed · "…" page menu)
 *   • active recordings pinned at the top (live cards)
 *   • failed & completed grouped by day (plain headers), repeated failed
 *     attempts collapsed into "N attempts" expandable groups
 *   • multi-select with a bulk action bar (Delete · Retry · Upload)
 *   • ~50 rows per page, per-filter empty states, loading skeleton
 *
 * Data/behavior contract unchanged: same query keys, the same recording IPC
 * calls (cancel/pause/resume/retry/removeJob/retry) orchestrated from the UI
 * only — no recording, retry, delete or upload logic changed, no models.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Trash2, Upload, Video, X } from 'lucide-react';
import type { RecordingJobDto } from '@rekordly/shared/contracts';
import { Button, Dialog, DialogContent, EmptyState, PageContainer, SectionHeader, Skeleton } from '@rekordly/ui';
import { platformColor } from '../../components/platform-config';
import { Pagination, usePaged } from '../../components/pagination';
import { VideoPlayerDialog } from '../../components/video-player-dialog';
import { useToastStore } from '../../stores/toast-store';
import { useDrilldownStore } from '../../stores/drilldown-store';
import { friendlyErrorMessage } from '../../lib/errors';
import { dayGroupOf, humanizeJobTitle, jobElapsedSeconds, type DayGroup } from './recording-format';
import { RecordingRow, RECORDING_ROW_ACTIVE_STATUSES, attemptsBadgeLabel } from './recording-row';
import { AttemptGroupBox, RecordingGroup, type AttemptGroup } from './recording-group';
import {
  RecordingsToolbar,
  type RecordingsFilterState,
  type RecordingsFilterTab,
  type RecordingsSort,
} from './recordings-toolbar';
import { SummaryStrip } from './summary-strip';
import { usePrivacyMode } from '../../components/privacy-mode';

const PAGE_SIZE = 50;

const DEFAULT_FILTERS: RecordingsFilterState = {
  tab: 'all',
  search: '',
  creatorIds: [],
  platforms: [],
  from: '',
  to: '',
  sort: 'newest',
};

function normalizeTab(raw: string | null): RecordingsFilterTab {
  return raw === 'active' || raw === 'completed' || raw === 'failed' ? raw : 'all';
}

/** ponytail: same active set the toolbar pill / status bar count. */
function isActiveJob(job: RecordingJobDto): boolean {
  return RECORDING_ROW_ACTIVE_STATUSES.includes(job.status);
}

const dateStampOf = (job: RecordingJobDto): number => {
  const ts = new Date(job.createdAt).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const durationOfIsh = (job: RecordingJobDto): number => jobElapsedSeconds(job.startedAt, job.finishedAt) ?? -1;

const SORTERS: Record<RecordingsSort, (a: RecordingJobDto, b: RecordingJobDto) => number> = {
  newest: (a, b) => dateStampOf(b) - dateStampOf(a),
  oldest: (a, b) => dateStampOf(a) - dateStampOf(b),
  longest: (a, b) => durationOfIsh(b) - durationOfIsh(a),
  largest: (a, b) => b.bytesDownloaded - a.bytesDownloaded,
};

/** Merge two same-direction sorted lists preserving global order via cmp. */
function mergeSorted(
  a: RecordingJobDto[],
  b: RecordingJobDto[],
  cmp: (x: RecordingJobDto, y: RecordingJobDto) => number,
): RecordingJobDto[] {
  const merged: RecordingJobDto[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (cmp(a[i]!, b[j]!) <= 0) merged.push(a[i++]!);
    else merged.push(b[j++]!);
  }
  while (i < a.length) merged.push(a[i++]!);
  while (j < b.length) merged.push(b[j++]!);
  return merged;
}

/** Group failed/cancelled attempts by creator + stream URL (newest first). */
function groupAttempts(sortedDeadJobs: RecordingJobDto[]): AttemptGroup[] {
  const map = new Map<string, RecordingJobDto[]>();
  for (const job of sortedDeadJobs) {
    const key = `${job.creatorId ?? job.title}::${job.streamUrl}`;
    const list = map.get(key);
    if (list !== undefined) list.push(job);
    else map.set(key, [job]);
  }
  return [...map.values()].map((attempts) => ({ head: attempts[0]!, attempts }));
}

interface FlatEntry {
  job: RecordingJobDto;
  attempts?: AttemptGroup;
}

interface DayBucket {
  day: DayGroup;
  /** Entries keep the chosen sort order inside each day. */
  entries: FlatEntry[];
}

/** Bucket a sorted flat entry list into day groups, preserving order. */
function bucketByDay(entries: FlatEntry[]): DayBucket[] {
  const buckets = new Map<string, DayBucket>();
  for (const entry of entries) {
    const group = dayGroupOf(entry.job.createdAt);
    const bucket = buckets.get(group.key);
    if (bucket !== undefined) bucket.entries.push(entry);
    else buckets.set(group.key, { day: group, entries: [entry] });
  }
  return [...buckets.values()];
}

export function RecordingsPage() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const navigate = useNavigate();
  // ponytail: honour ?filter= deep links (e.g. dashboard → failed jobs).
  const [searchParams] = useSearchParams();
  const filterParam = searchParams.get('filter');

  const [filters, setFilters] = useState<RecordingsFilterState>(() => ({
    ...DEFAULT_FILTERS,
    tab: normalizeTab(filterParam),
  }));
  const patchFilters = (patch: Partial<RecordingsFilterState>): void =>
    setFilters((prev) => ({ ...prev, ...patch }));
  const resetFilters = (): void => setFilters((prev) => ({ ...DEFAULT_FILTERS, tab: prev.tab }));

  // Privacy mode — the global blur toggle (thumbnails + titles).
  const [privacy, setPrivacy] = usePrivacyMode();

  // ponytail: dashboard deep-links mutate ?filter= while the page is mounted.
  useEffect(() => {
    const tab = normalizeTab(filterParam);
    if (tab !== 'all') setFilters((prev) => (prev.tab === tab ? prev : { ...prev, tab }));
  }, [filterParam]);

  // --- data ------------------------------------------------------------------
  const { data: jobs, isLoading, isError } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
    refetchInterval: 2000,
  });

  const { data: creators } = useQuery({ queryKey: ['creators'], queryFn: () => window.desktop.creators.list() });
  const { data: plugins } = useQuery({ queryKey: ['plugins'], queryFn: () => window.desktop.plugins.list() });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => window.desktop.settings.getAll() });
  const { data: uploadProviders } = useQuery({
    queryKey: ['upload-providers'],
    queryFn: () => window.desktop.uploads.providers(),
  });

  const authenticatedProviders = useMemo(
    () => (uploadProviders ?? []).filter((p) => p.authenticated),
    [uploadProviders],
  );

  const creatorById = useMemo(() => new Map((creators ?? []).map((c) => [c.id, c])), [creators]);
  const pluginNames = useMemo(() => new Map((plugins ?? []).map((p) => [p.id, p.name])), [plugins]);
  const pluginNameFor = useCallback(
    (pluginId: string): string => pluginNames.get(pluginId) ?? pluginId,
    [pluginNames],
  );

  const creatorNameFor = useCallback(
    (job?: RecordingJobDto): string => {
      if (job === undefined) return 'Recording';
      const creator = job.creatorId !== null && job.creatorId !== undefined ? creatorById.get(job.creatorId) : undefined;
      if (creator !== undefined && creator.displayName !== '') return creator.displayName;
      return humanizeJobTitle(job.title);
    },
    [creatorById],
  );

  const avatarFor = useCallback(
    (job: RecordingJobDto): string | null => {
      const creator = job.creatorId !== null && job.creatorId !== undefined ? creatorById.get(job.creatorId) : undefined;
      return creator?.avatarUrl ?? null;
    },
    [creatorById],
  );

  const maxLengthMinutes = settings?.autoRecordSegmentMinutes ?? 0;

  // --- undoable "Clear All Failed" (two-phase: hide → commit; Undo restores) ---
  // ponytail: removeJob deletes the history row for good, so "clear" is made
  // undoable by delaying the destructive call until the toast would expire.
  // Rows hide instantly; "Undo" cancels the pending commit. No backend change.
  const [pendingClear, setPendingClear] = useState<Set<string> | null>(null);
  const pendingClearRef = useRef<Set<string> | null>(null);
  pendingClearRef.current = pendingClear;
  const commitClearTimerRef = useRef<number | null>(null);

  const commitClear = useCallback(
    (ids: Set<string>): void => {
      setPendingClear(null);
      pendingClearRef.current = null;
      void Promise.allSettled([...ids].map((id) => window.desktop.recording.removeJob(id))).then(() => {
        void queryClient.invalidateQueries({ queryKey: ['recording-jobs'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      });
    },
    [queryClient],
  );

  useEffect(() => {
    return () => {
      // ponytail: on unmount, commit what was confirmed so a hidden clear
      // never silently comes back on the next visit.
      const pending = pendingClearRef.current;
      if (pending !== null && commitClearTimerRef.current !== null) {
        window.clearTimeout(commitClearTimerRef.current);
        commitClearTimerRef.current = null;
        commitClear(pending);
      }
    };
  }, [commitClear]);

  const scheduleClearCommit = useCallback(
    (ids: Set<string>): void => {
      // Undo window: at least the toast duration, bounded to a sane minimum
      // so a very short toast setting can't shrink the chance to undo.
      const ttl = Math.max(settings?.toastDurationMs ?? 6000, 4000);
      if (commitClearTimerRef.current !== null) window.clearTimeout(commitClearTimerRef.current);
      commitClearTimerRef.current = window.setTimeout(() => {
        commitClearTimerRef.current = null;
        commitClear(ids);
      }, ttl);
    },
    [commitClear, settings?.toastDurationMs],
  );

  // --- base lists ---------------------------------------------------------------
  const allRawJobs = useMemo(() => [...(jobs ?? [])], [jobs]);
  const allJobs = useMemo(() => {
    const hidden = pendingClearRef.current;
    return hidden === null ? allRawJobs : allRawJobs.filter((job) => !hidden.has(job.id));
    // ponytail: pendingClear flips rows into "hidden" state immediately.
  }, [allRawJobs, pendingClear]);

  const activeJobs = allJobs.filter(isActiveJob);
  const completedJobs = allJobs.filter((j) => j.status === 'completed');
  // ponytail: cancelled jobs are dead jobs too — grouped with Failed so they
  // never vanish from the page (previous UX bug, intentionally preserved).
  const failedJobs = allJobs.filter((j) => j.status === 'failed' || j.status === 'cancelled');

  const counts = useMemo(
    () => ({
      all: allJobs.length,
      active: activeJobs.length,
      completed: completedJobs.length,
      failed: failedJobs.length,
    }),
    [allJobs.length, activeJobs.length, completedJobs.length, failedJobs.length],
  );

  // --- mutations ---------------------------------------------------------------
  const invalidate = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: ['recording-jobs'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  }, [queryClient]);

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => window.desktop.recording.cancel(jobId),
    onSuccess: (_data, jobId) => {
      pushToast({ level: 'info', title: 'Recording cancelled', message: `${creatorNameFor(jobs?.find((j) => j.id === jobId))} is no longer recording.` });
      invalidate();
    },
    onError: (error: unknown) => {
      pushToast({ level: 'error', title: 'Could not cancel recording', message: friendlyErrorMessage(error) });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (jobId: string) => window.desktop.recording.pause(jobId),
    onSuccess: invalidate,
    onError: (error: unknown) => {
      pushToast({ level: 'error', title: 'Could not pause recording', message: friendlyErrorMessage(error) });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (jobId: string) => window.desktop.recording.resume(jobId),
    onSuccess: invalidate,
    // ponytail: resuming a cancelled recording fails when the broadcast has
    // ended — surface that as a clear error instead of a silent no-op.
    onError: (error: unknown) => {
      pushToast({ level: 'error', title: 'Cannot resume recording', message: friendlyErrorMessage(error, 'Unknown error') });
    },
  });

  const removeBulk = useMutation({
    mutationFn: async (jobIds: string[]) => {
      await Promise.allSettled(jobIds.map((id) => window.desktop.recording.removeJob(id)));
      return jobIds.length;
    },
  });

  const retryBulk = useMutation({
    mutationFn: async (jobIds: string[]) => {
      let queued = 0;
      for (const id of jobIds) {
        try {
          await window.desktop.recording.retry(id);
          queued += 1;
        } catch {
          /* counted as skipped; error toasts come from the single retry path */
        }
      }
      return queued;
    },
    onSuccess: (queued) => {
      pushToast({
        level: 'info',
        title: 'Retrying failed jobs',
        message: queued > 0 ? `Queued ${queued} ${queued === 1 ? 'job' : 'jobs'} for retry.` : 'No failed jobs to retry.',
      });
      invalidate();
    },
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: string) => window.desktop.recording.retry(jobId),
    onSuccess: invalidate,
    onError: (error: unknown) => {
      pushToast({ level: 'error', title: 'Cannot retry recording', message: friendlyErrorMessage(error) });
    },
  });

  // --- filter option sources ------------------------------------------------------
  const creatorOptions = useMemo(() => {
    const acc = new Map<string, { id: string; name: string; pluginId: string; count: number }>();
    for (const job of allJobs) {
      const key = job.creatorId ?? `title:${job.title}`;
      const name = creatorNameFor(job);
      const entry = acc.get(key);
      if (entry !== undefined) entry.count += 1;
      else acc.set(key, { id: key, name, pluginId: job.pluginId, count: 1 });
    }
    return [...acc.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .map((c) => ({ value: c.id, label: c.name, count: c.count, dot: platformColor(c.pluginId) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allJobs, creatorNameFor]);

  const platformOptions = useMemo(() => {
    const acc = new Map<string, number>();
    for (const job of allJobs) acc.set(job.pluginId, (acc.get(job.pluginId) ?? 0) + 1);
    return [...acc.entries()]
      .sort((a, b) => pluginNameFor(a[0]).localeCompare(pluginNameFor(b[0])))
      .map(([pluginId, count]) => ({
        value: pluginId,
        label: pluginNameFor(pluginId),
        count,
        dot: platformColor(pluginId),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allJobs, pluginNameFor]);

  // --- filtering + sorting ---------------------------------------------------------
  const q = filters.search.trim().toLowerCase();

  const matches = useCallback(
    (job: RecordingJobDto): boolean => {
      if (q !== '') {
        const haystack = `${creatorNameFor(job)} ${job.title} ${job.platformId} ${job.pluginId} ${job.streamUrl}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.creatorIds.length > 0) {
        const key = job.creatorId ?? `title:${job.title}`;
        if (!filters.creatorIds.includes(key)) return false;
      }
      if (filters.platforms.length > 0 && !filters.platforms.includes(job.pluginId)) return false;
      if (filters.from !== '' || filters.to !== '') {
        const stamp = dateStampOf(job);
        if (stamp <= 0) return false;
        if (filters.from !== '' && stamp < new Date(`${filters.from}T00:00:00`).getTime()) return false;
        if (filters.to !== '' && stamp > new Date(`${filters.to}T23:59:59.999`).getTime()) return false;
      }
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, filters.creatorIds, filters.platforms, filters.from, filters.to, creatorNameFor],
  );

  const sortedByTab = useMemo(() => {
    const sort = SORTERS[filters.sort];
    if (filters.tab === 'active') return { active: [...activeJobs].filter(matches).sort(sort), dead: [] };
    if (filters.tab === 'completed') return { active: [], dead: completedJobs.filter(matches).sort(sort) };
    if (filters.tab === 'failed') return { active: [], dead: failedJobs.filter(matches).sort(sort) };
    return {
      active: [...activeJobs].filter(matches).sort(sort),
      // 'all' interleaves completed + failed correctly for the chosen sort.
      dead: mergeSorted(completedJobs.filter(matches).sort(sort), failedJobs.filter(matches).sort(sort), sort),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobs, completedJobs, failedJobs, filters.tab, filters.sort, matches]);

  // Dead entries: repeated attempts (same creator + stream URL) collapse into
  // one entry; the newest attempt is the head row, pinned to that newest
  // attempt's position in the chosen sort order.
  const deadEntries = useMemo<FlatEntry[]>(() => {
    const cmp = SORTERS[filters.sort];
    const completed: FlatEntry[] = sortedByTab.dead
      .filter((j) => j.status === 'completed')
      .map((job) => ({ job }));
    const groups = groupAttempts(sortedByTab.dead.filter((j) => j.status !== 'completed'));
    const attemptEntries: FlatEntry[] = groups.map((group) => ({ job: group.head, attempts: group }));
    // ponytail: attempt heads and completed rows are each already sorted
    // sub-sequences of the same list — a stable merge with the identical
    // comparator restores the global order (a plain concat would dump all
    // singles after every collapsed group).
    const entries: FlatEntry[] = [];
    let i = 0;
    let j = 0;
    while (i < attemptEntries.length && j < completed.length) {
      if (cmp(attemptEntries[i]!.job, completed[j]!.job) <= 0) entries.push(attemptEntries[i++]!);
      else entries.push(completed[j++]!);
    }
    while (i < attemptEntries.length) entries.push(attemptEntries[i++]!);
    while (j < completed.length) entries.push(completed[j++]!);
    return entries;
  }, [sortedByTab, filters.sort]);

  // --- pagination ------------------------------------------------------------------
  // Shared pagination — resets to page 0 whenever the filter state changes.
  const filterKey = JSON.stringify(filters);
  const {
    page: safePage,
    setPage,
    pageCount: totalPages,
    total: totalEntries,
    paged: visibleEntries,
  } = usePaged(deadEntries, PAGE_SIZE, filterKey);
  const visibleBuckets = useMemo(() => bucketByDay(visibleEntries), [visibleEntries]);

  // --- selection -----------------------------------------------------------------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (jobId: string): void =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  const clearSelection = (): void => setSelectedIds(new Set());

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(allRawJobs.map((j) => j.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [allRawJobs]);

  const selectableOnPage = visibleEntries.filter((e) => e.job.status !== 'recording');
  const selectedOnPageCount = selectableOnPage.filter((e) => selectedIds.has(e.job.id)).length;
  const selectAllChecked = selectableOnPage.length > 0 && selectedOnPageCount === selectableOnPage.length;
  const selectAllIndeterminate = selectedOnPageCount > 0 && selectedOnPageCount < selectableOnPage.length;
  const toggleSelectAll = (checked: boolean): void =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const e of selectableOnPage) {
        if (checked) next.add(e.job.id);
        else next.delete(e.job.id);
      }
      return next;
    });

  const selectedJobs = useMemo(() => allJobs.filter((j) => selectedIds.has(j.id)), [allJobs, selectedIds]);
  const selectedFailed = selectedJobs.filter((j) => j.status === 'failed' || j.status === 'cancelled');
  const selectedCompleted = selectedJobs.filter(
    (j) => j.status === 'completed' && j.filePath !== null && j.filePath !== undefined && j.filePath !== '',
  );

  // --- dialogs ---------------------------------------------------------------------
  const [deleteDialog, setDeleteDialog] = useState<RecordingJobDto[] | null>(null);
  const [discardDialog, setDiscardDialog] = useState<RecordingJobDto | null>(null);
  const [clearFailedDialog, setClearFailedDialog] = useState(false);
  const [player, setPlayer] = useState<{ title: string; filePath: string; posterPath: string | null } | null>(null);

  const beginClearFailed = (): void => {
    const ids = new Set(failedJobs.map((j) => j.id));
    setClearFailedDialog(false);
    if (ids.size === 0) return;
    setPendingClear(ids);
    pushToast({
      level: 'info',
      title: `${ids.size} failed ${ids.size === 1 ? 'job' : 'jobs'} cleared`,
      message: 'Removed from the list — files on disk are not touched.',
      action: {
        label: 'Undo',
        onAction: () => {
          if (commitClearTimerRef.current !== null) window.clearTimeout(commitClearTimerRef.current);
          commitClearTimerRef.current = null;
          pendingClearRef.current = null;
          setPendingClear(null);
          pushToast({ level: 'info', title: 'Clear undone', message: 'Failed recordings are back in the list.' });
        },
      },
    });
    scheduleClearCommit(ids);
  };

  // --- row actions ----------------------------------------------------------------
  const playJob = (job: RecordingJobDto): void => {
    if (job.filePath === null || job.filePath === undefined || job.filePath === '') return;
    setPlayer({
      title: job.status === 'completed' ? creatorNameFor(job) : `${creatorNameFor(job)} — partial file`,
      filePath: job.filePath,
      posterPath: job.thumbnailPath ?? null,
    });
  };

  // ponytail: Play/Show-in-folder folded into one Library jump — the Library
  // owns playback for finished files. The push pre-fills its search with the
  // job's generated title, which is exactly what Library rows store.
  const openJobInLibrary = (job: RecordingJobDto): void => {
    useDrilldownStore.getState().setLibrarySearch(job.title);
    navigate('/library');
  };

  const uploadJobs = useCallback(
    async (targets: RecordingJobDto[]): Promise<void> => {
      if (authenticatedProviders.length === 0) {
        pushToast({
          level: 'warn',
          title: 'No upload provider connected',
          message: 'Connect a provider in Settings → Cloud Storage first.',
        });
        return;
      }
      const provider = authenticatedProviders[0]!;
      let queued = 0;
      for (const job of targets) {
        if (job.filePath === null || job.filePath === undefined || job.filePath === '') continue;
        try {
          await window.desktop.uploads.add({ providerId: provider.id, sourcePath: job.filePath });
          queued += 1;
        } catch {
          /* toast below reports what actually happened */
        }
      }
      if (queued > 0) {
        pushToast({
          level: 'info',
          title: 'Upload queued',
          message: `${queued} ${queued === 1 ? 'file' : 'files'} queued for ${provider.name}.`,
        });
      }
    },
    [authenticatedProviders, pushToast],
  );

  const retryAllFailedNow = (): void => {
    void retryBulk.mutateAsync(failedJobs.map((j) => j.id));
  };

  const retrySelected = (): void => {
    void retryBulk.mutateAsync(selectedFailed.map((j) => j.id)).then(() => clearSelection());
  };

  // --- derived view state -------------------------------------------------------------
  const showActive = filters.tab === 'all' || filters.tab === 'active';
  const visibleActive = sortedByTab.active;
  const contentVisible = visibleActive.length > 0 || totalEntries > 0;
  const sectionEmpty =
    filters.tab !== 'all' ? counts[filters.tab] === 0 : allJobs.length === 0;

  const activeFilterCount =
    (filters.search.trim() !== '' ? 1 : 0) +
    filters.creatorIds.length +
    filters.platforms.length +
    (filters.from !== '' || filters.to !== '' ? 1 : 0);

  const renderDeadRow = (job: RecordingJobDto, indent: boolean, entry: FlatEntry): ReactNode => (
    <RecordingRow
      variant={job.status === 'completed' ? 'completed' : 'failed'}
      job={job}
      platformName={pluginNameFor(job.pluginId)}
      creatorName={creatorNameFor(job)}
      creatorAvatarUrl={avatarFor(job)}
      selectable
      selected={selectedIds.has(job.id)}
      onToggleSelect={() => toggleSelect(job.id)}
      onRetry={job.status !== 'completed' ? () => retryMutation.mutate(job.id) : undefined}
      onPlayPartial={job.status !== 'completed' ? () => playJob(job) : undefined}
      onResume={job.status !== 'completed' ? () => resumeMutation.mutate(job.id) : undefined}
      onOpenInLibrary={job.status === 'completed' && job.filePath ? () => openJobInLibrary(job) : undefined}
      onUpload={job.status === 'completed' && job.filePath ? () => void uploadJobs([job]) : undefined}
      onDelete={() => setDeleteDialog([job])}
      // ponytail: delete always flows through the confirm dialog → removeBulk;
      // the "Removing…" veil lights up for rows currently in that batch.
      deleting={removeBulk.isPending && (removeBulk.variables ?? []).includes(job.id)}
      // ponytail: only the head row carries the "N attempts" chip —
      // expanded child attempts must not repeat it (single entries have no
      // group at all).
      attemptsBadge={
        !indent && entry.attempts !== undefined && entry.attempts.attempts.length > 1
          ? attemptsBadgeLabel(entry.attempts.attempts.length)
          : undefined
      }
      attemptsTooltip="Earlier attempts of this exact stream are collapsed inside."
      indent={indent}
      maxLengthMinutes={maxLengthMinutes}
      onFilterPlatform={(pluginId) => patchFilters({ platforms: [pluginId], tab: filters.tab })}
      privacy={privacy}
    />
  );

  return (
    <PageContainer className={selectedJobs.length > 0 ? 'pb-28' : undefined}>
      <SectionHeader title="Recordings" description="Live captures, completed files and failed attempts." />

      <SummaryStrip
        counts={{ active: counts.active, completed: counts.completed, failed: counts.failed, total: counts.all }}
        filterTab={filters.tab}
        onFilterTab={(tab) => patchFilters({ tab })}
        jobs={allJobs}
      />

      {isError && <p className="text-sm text-error">Failed to load recordings — the list will retry automatically.</p>}

      {/* Toolbar (scrolls with the page; full-bleed via -mx-6) */}
      <RecordingsToolbar
          filters={filters}
          onChange={patchFilters}
          onReset={resetFilters}
          activeFilterCount={activeFilterCount}
          resultCount={totalEntries + visibleActive.length}
          counts={counts}
          creatorOptions={creatorOptions}
          platformOptions={platformOptions}
          selectAll={
            selectableOnPage.length > 0
              ? {
                  checked: selectAllChecked,
                  indeterminate: selectAllIndeterminate,
                  onChange: toggleSelectAll,
                  label: 'Select all on this page',
                }
              : undefined
          }
          onRetryAllFailed={counts.failed > 0 ? retryAllFailedNow : undefined}
          retryAllFailedLoading={retryBulk.isPending}
          privacy={{ on: privacy, onToggle: () => setPrivacy(!privacy) }}
          pageMenuItems={
            counts.failed > 0
              ? [
                  {
                    key: 'clear-failed',
                    label: 'Clear All Failed…',
                    icon: <Trash2 size={13} />,
                    dangerous: true,
                    onSelect: () => setClearFailedDialog(true),
                  },
                ]
              : undefined
          }
      />

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-[84px] w-full rounded-md" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[60px] w-full rounded-md" />
            ))}
          </div>
        </div>
      )}

      {/* Empty states */}
      {!isLoading && !isError && allJobs.length === 0 && (
        <EmptyState
          icon={Video}
          title="No recordings"
          description="Start a recording from Creators, or wait for monitored creators to go live."
        />
      )}

      {!isLoading && !isError && allJobs.length > 0 && !contentVisible && sectionEmpty && (
        <EmptyState
          icon={Video}
          title={
            filters.tab === 'active'
              ? 'No active recordings'
              : filters.tab === 'completed'
                ? 'No completed recordings'
                : filters.tab === 'failed'
                  ? 'No failed recordings'
                  : 'No recordings'
          }
          description={
            filters.tab === 'active'
              ? 'Start one from Creators or wait for auto-record.'
              : filters.tab === 'completed'
                ? 'Finished sessions will appear here.'
                : filters.tab === 'failed'
                  ? 'Everything is healthy — nothing needs retrying.'
                  : 'Start a recording to see it here.'
          }
        />
      )}

      {!isLoading && !isError && allJobs.length > 0 && !contentVisible && !sectionEmpty && (
        <EmptyState
          icon={Search}
          title="Nothing matches your filters"
          description="Try a different filter or search term."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              <X size={14} /> Clear filters
            </Button>
          }
        />
      )}

      {/* Active recordings — pinned at the top, never paginated */}
      {!isLoading && showActive && visibleActive.length > 0 && (
        <section aria-label="Active recordings" className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Active recordings</h2>
            <span className="rounded-sm bg-elevated px-1.5 py-0.5 text-xs font-semibold leading-none tabular-nums text-foreground-secondary">
              {visibleActive.length}
            </span>
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-2.5">
            {visibleActive.map((job) => (
              <RecordingRow
                key={job.id}
                variant="active"
                job={job}
                platformName={pluginNameFor(job.pluginId)}
                creatorName={creatorNameFor(job)}
                creatorAvatarUrl={avatarFor(job)}
                privacy={privacy}
                selectable={false}
                selected={false}
                onStopAndSave={() => cancelMutation.mutate(job.id)}
                onPause={() => pauseMutation.mutate(job.id)}
                onResume={() => resumeMutation.mutate(job.id)}
                onDiscard={() => setDiscardDialog(job)}
                onFilterPlatform={(pluginId) => patchFilters({ platforms: [pluginId] })}
              />
            ))}
          </div>
        </section>
      )}

      {/* Completed + failed — plain day groups (headers scroll with content) */}
      {!isLoading && visibleBuckets.length > 0 && (
        <div className="space-y-5">
          {visibleBuckets.map((bucket) => (
            <RecordingGroup key={bucket.day.key} label={bucket.day.label} count={bucket.entries.length}>
              {bucket.entries.map((entry) => (
                <AttemptGroupBox
                  key={entry.job.id}
                  attempts={{ head: entry.job, attempts: entry.attempts?.attempts ?? [entry.job] }}
                  renderRow={(job, _index, indent) => renderDeadRow(job, indent, entry)}
                />
              ))}
            </RecordingGroup>
          ))}
        </div>
      )}

      {/* Pagination — shared Previous / Page x of y / Next bar */}
      {!isLoading && (
        <Pagination page={safePage} pageCount={totalPages} onPageChange={setPage} total={totalEntries} noun="recordings" />
      )}

      {/* Bulk action bar */}
      {selectedJobs.length > 0 && (
        <div className="fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 shadow-md">
          <span className="text-xs font-semibold tabular-nums text-foreground">{selectedJobs.length} selected</span>
          {selectedFailed.length > 0 && (
            <Button variant="ghost" size="sm" loading={retryBulk.isPending} onClick={retrySelected}>
              Retry {selectedFailed.length}
            </Button>
          )}
          {selectedCompleted.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void uploadJobs(selectedCompleted);
                clearSelection();
              }}
            >
              <Upload size={13} /> Upload {selectedCompleted.length}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-error hover:bg-error/10" onClick={() => setDeleteDialog(selectedJobs)}>
            <Trash2 size={13} /> Delete
          </Button>
          <Button variant="ghost" size="icon" onClick={clearSelection} aria-label="Clear selection">
            <X size={13} />
          </Button>
        </div>
      )}

      {/* Discard confirm */}
      <Dialog open={discardDialog !== null} onOpenChange={(v) => { if (!v) setDiscardDialog(null); }}>
        <DialogContent
          title="Discard recording?"
          description={discardDialog !== null ? `${creatorNameFor(discardDialog)} stops recording now.` : undefined}
        >
          <p className="text-sm font-medium text-error">
            The live capture stops immediately — the captured portion stays on disk as a cancelled file.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDiscardDialog(null)}>Keep recording</Button>
            <Button variant="danger" loading={cancelMutation.isPending} onClick={() => {
              const target = discardDialog;
              setDiscardDialog(null);
              if (target !== null) void cancelMutation.mutateAsync(target.id);
            }}>
              Discard
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm (single + bulk) */}
      <Dialog open={deleteDialog !== null} onOpenChange={(v) => { if (!v) setDeleteDialog(null); }}>
        <DialogContent
          title={deleteDialog !== null && deleteDialog.length > 1 ? `Delete ${deleteDialog.length} recordings?` : 'Delete recording?'}
          description="Only the list entry is removed — recordings on disk are not touched."
        >
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={removeBulk.isPending}
              onClick={() => {
                const target = deleteDialog;
                setDeleteDialog(null);
                if (target !== null) {
                  void removeBulk.mutateAsync(target.map((j) => j.id)).then(() => {
                    pushToast({
                      level: 'info',
                      title: target.length === 1 ? 'Recording deleted' : `${target.length} recordings deleted`,
                      message: 'Removed from the list — files on disk are not touched.',
                    });
                    invalidate();
                    clearSelection();
                  });
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear All Failed confirm — shows the count */}
      <Dialog open={clearFailedDialog} onOpenChange={setClearFailedDialog}>
        <DialogContent title="Clear all failed recordings?" description={`${counts.failed} failed attempt${counts.failed === 1 ? '' : 's'} will be removed from the list.`}>
          <p className="text-sm text-foreground-secondary">Files on disk are not touched. You can undo right after clearing.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setClearFailedDialog(false)}>Cancel</Button>
            <Button variant="danger" onClick={beginClearFailed}>Clear {counts.failed}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {player !== null && (
        <VideoPlayerDialog
          title={player.title}
          filePath={player.filePath}
          posterPath={player.posterPath}
          open
          onOpenChange={(v) => {
            if (!v) setPlayer(null);
          }}
        />
      )}
    </PageContainer>
  );
}
