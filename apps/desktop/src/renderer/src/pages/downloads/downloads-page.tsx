/**
 * DownloadsPage — the redesigned download surface:
 *   • Header with "Add Download", a Pause-all/Resume-all control that shows
 *     only the action that applies (with counts) and a "…" menu holding
 *     "Retry failed (N)", "Clear completed…" and "Clear failed…" (hidden
 *     when they would do nothing; clears confirm first and undo via toast).
 *   • AddDownloadBar ("Paste a link or drop it here") — Enter hands the
 *     link to the full AddDownloadDialog, which probes it FIRST and shows
 *     quality / audio-only / priority / destination BEFORE it queues;
 *     clipboard link offered as an opt-in chip on window focus.
 *   • DownloadsSummaryStrip (the ONE status filter — the separate tab row
 *     is gone) + a sticky DownloadsToolbar (search · source filter ·
 *     Newest/Oldest/Largest/Progress · Privacy mode · select-all).
 *   • DownloadRow for queued/downloading/paused/completed/failed/cancelled
 *     built on the shared TransferRow primitives, day-grouped completed
 *     history with pinned active rows, per-filter empty states, loading
 *     skeleton and a "Load more" flow (pagination removed).
 *   • Multi-select with a bulk bar (Pause/Resume/Retry/Cancel/Remove) where
 *     every action is offered only when the selection supports it, and
 *     removing active rows asks for confirmation first.
 *
 * Data/behavior contract unchanged: the same query keys, the same downloads
 * IPC calls (list/add/pause/resume/cancel/retry/remove/bulk endpoints) and
 * no download-engine logic touched — this file orchestrates presentation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download, PauseCircle, PlayCircle, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Button, Dialog, DialogContent, EmptyState, PageContainer, SectionHeader, Skeleton } from '@rekordly/ui';
import type { DownloadQueueItemDto } from '@rekordly/shared/contracts';
import { KebabMenu, type KebabItem } from '../../components/kebab-menu';
import { platformColor } from '../../components/platform-config';
import { useDrilldownStore } from '../../stores/drilldown-store';
import { useToastStore } from '../../stores/toast-store';
import { dayGroupOf, type DayGroup } from '../recordings/recording-format';
import { mapDownloadError } from './download-errors';
import {
  ACTIVE_DOWNLOAD_STATUSES,
  downloadTitleFor,
  folderLabelFor,
  folderTooltipFor,
  queuePositionOf,
  siteIdFor,
  siteNameFor,
} from './download-format';
import { downloadVariantFor, DownloadRow } from './download-row';
import { DownloadDayGroup } from './download-group';
import {
  DownloadsToolbar,
  type DownloadFilterTab,
  type DownloadSort,
  type DownloadsFilterState,
} from './downloads-toolbar';
import { DownloadsSummaryStrip } from './downloads-summary-strip';
import { AddDownloadBar } from './add-download-bar';
import { AddDownloadDialog } from './add-download-dialog';
import { usePrivacyMode } from '../../components/privacy-mode';

/** "Load more" step for the day-grouped completed history. */
const DEAD_PAGE_SIZE = 50;

const DEFAULT_FILTERS: DownloadsFilterState = {
  tab: 'all',
  search: '',
  sites: [],
  sort: 'newest',
};

interface RowContext {
  title: string;
  siteId: string;
  siteName: string;
  queuePosition: number | null;
  folderLabel: string | null;
  folderTooltip: string | null;
}

interface DayBucket {
  day: DayGroup;
  /** Rows keep the chosen sort order inside each day. */
  entries: DownloadQueueItemDto[];
}

/** Bucket a sorted flat list into day groups, preserving order. */
function bucketByDay(entries: DownloadQueueItemDto[]): DayBucket[] {
  const buckets = new Map<string, DayBucket>();
  for (const entry of entries) {
    const group = dayGroupOf(entry.finishedAt);
    const bucket = buckets.get(group.key);
    if (bucket !== undefined) bucket.entries.push(entry);
    else buckets.set(group.key, { day: group, entries: [entry] });
  }
  return [...buckets.values()];
}

const sizeOf = (item: DownloadQueueItemDto): number =>
  item.totalBytes > 0 ? item.totalBytes : item.bytesDownloaded;

const SORTERS: Record<DownloadSort, (a: DownloadQueueItemDto, b: DownloadQueueItemDto) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  /** Largest first; rows without a size yet sort last. */
  largest: (a, b) => sizeOf(b) - sizeOf(a),
  /** Most progress first, then newest. */
  progress: (a, b) => b.percent - a.percent || b.createdAt.localeCompare(a.createdAt),
};

export function DownloadsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pushToast = useToastStore((state) => state.push);

  // --- data -------------------------------------------------------------------
  // One list query — the page filters, groups and counts client-side.
  const { data: downloads, isLoading, isError } = useQuery({
    queryKey: ['downloads', 'all'],
    queryFn: () => window.desktop.downloads.list(),
  });

  // Live updates from the download engine; progress events fire frequently,
  // so invalidate at most once per second instead of per event (unchanged
  // from the old page — per-row moving values are additionally throttled in
  // DownloadRow itself, max 4 updates per second).
  const lastInvalidateRef = useRef(0);
  useEffect(() => {
    const unsub = window.desktop.downloads.onEvent((event) => {
      if (event.type === 'download-progress') {
        const now = Date.now();
        if (now - lastInvalidateRef.current < 1000) return;
        lastInvalidateRef.current = now;
      }
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
    });
    return unsub;
  }, [queryClient]);

  const refreshDownloads = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: ['downloads'] });
  }, [queryClient]);

  const items = useMemo(() => downloads ?? [], [downloads]);

  // --- buckets -------------------------------------------------------------------
  const downloadingItems = useMemo(() => items.filter((i) => i.status === 'downloading'), [items]);
  const queuedItems = useMemo(() => items.filter((i) => i.status === 'queued'), [items]);
  const pausedItems = useMemo(() => items.filter((i) => i.status === 'paused'), [items]);
  const completedItems = useMemo(() => items.filter((i) => i.status === 'completed'), [items]);
  const failedItems = useMemo(() => items.filter((i) => i.status === 'failed'), [items]);
  const cancelledItems = useMemo(() => items.filter((i) => i.status === 'cancelled'), [items]);

  // Active rows pinned in scheduler-ish order: running, waiting, interrupted.
  const activeItems = useMemo(
    () => [...downloadingItems, ...queuedItems, ...pausedItems],
    [downloadingItems, queuedItems, pausedItems],
  );

  const counts = useMemo(
    () => ({
      downloading: downloadingItems.length,
      queued: queuedItems.length,
      paused: pausedItems.length,
      completed: completedItems.length,
      failed: failedItems.length,
      cancelled: cancelledItems.length,
      all: items.length,
    }),
    [
      downloadingItems.length,
      queuedItems.length,
      pausedItems.length,
      completedItems.length,
      failedItems.length,
      cancelledItems.length,
      items.length,
    ],
  );

  const totalSpeed = useMemo(
    () => downloadingItems.reduce((acc, item) => acc + Math.max(0, item.speed), 0),
    [downloadingItems],
  );
  const totalEtaSeconds = useMemo(
    () => downloadingItems.reduce((acc, item) => acc + Math.max(0, item.eta), 0),
    [downloadingItems],
  );

  // --- filters ---------------------------------------------------------------------
  const [filters, setFilters] = useState<DownloadsFilterState>(DEFAULT_FILTERS);
  const patchFilters = (patch: Partial<DownloadsFilterState>): void =>
    setFilters((prev) => ({ ...prev, ...patch }));
  const resetFilters = (): void => setFilters((prev) => ({ ...DEFAULT_FILTERS, tab: prev.tab }));

  // Privacy mode — this page's own blur toggle; writes ONLY the 'downloads'
  // key (independent of the Library page's Downloads tab and every other page).
  const [privacy, setPrivacy] = usePrivacyMode('downloads');

  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [visibleCount, setVisibleCount] = useState(DEAD_PAGE_SIZE);
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setVisibleCount(DEAD_PAGE_SIZE);
  }, [filterKey]);

  // --- row context (title / site / folder) ----------------------------------------
  const rowContext = useMemo(() => {
    const map = new Map<string, RowContext>();
    for (const item of items) {
      map.set(item.id, {
        title: downloadTitleFor(item),
        siteId: siteIdFor(item),
        siteName: siteNameFor(item),
        queuePosition: null, // filled per item below (needs the whole list)
        folderLabel: folderLabelFor(item.destination),
        folderTooltip: folderTooltipFor(item.destination),
      });
    }
    // Queue positions need the engine's ordering across ALL queued rows.
    for (const item of items) {
      const position = queuePositionOf(item, items);
      const ctx = map.get(item.id);
      if (ctx !== undefined && position !== null) ctx.queuePosition = position;
    }
    return map;
  }, [items]);

  // Source filter options — one entry per site with a brand dot + count.
  const siteOptions = useMemo(() => {
    const perSite = new Map<string, { label: string; count: number }>();
    for (const item of items) {
      const siteId = siteIdFor(item);
      const entry = perSite.get(siteId);
      if (entry !== undefined) entry.count += 1;
      else perSite.set(siteId, { label: siteNameFor(item), count: 1 });
    }
    return [...perSite.entries()]
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([siteId, { label, count }]) => ({ value: siteId, label, count, dot: platformColor(siteId) }));
  }, [items]);

  // --- two-phase undoable clear (rows hide instantly → commit after toast) ----------
  const [pendingClear, setPendingClear] = useState<{ kind: 'completed' | 'failed'; ids: Set<string> } | null>(null);
  const pendingClearRef = useRef(pendingClear);
  pendingClearRef.current = pendingClear;
  const commitClearTimerRef = useRef<number | null>(null);

  const commitClear = useCallback(
    (kind: 'completed' | 'failed'): void => {
      setPendingClear(null);
      pendingClearRef.current = null;
      void (kind === 'completed'
        ? window.desktop.downloads.clearCompleted()
        : window.desktop.downloads.clearFailed()
      ).then(() => refreshDownloads());
    },
    [refreshDownloads],
  );

  useEffect(() => {
    return () => {
      // On unmount, commit what was confirmed so a hidden clear never
      // silently comes back on the next visit.
      const pending = pendingClearRef.current;
      if (pending !== null && commitClearTimerRef.current !== null) {
        window.clearTimeout(commitClearTimerRef.current);
        commitClearTimerRef.current = null;
        commitClear(pending.kind);
      }
    };
  }, [commitClear]);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
  });

  const scheduleClearCommit = useCallback(
    (kind: 'completed' | 'failed'): void => {
      const ttl = Math.max(settings?.toastDurationMs ?? 6000, 4000);
      if (commitClearTimerRef.current !== null) window.clearTimeout(commitClearTimerRef.current);
      commitClearTimerRef.current = window.setTimeout(() => {
        commitClearTimerRef.current = null;
        commitClear(kind);
      }, ttl);
    },
    [commitClear, settings?.toastDurationMs],
  );

  const undoPendingClear = useCallback(
    (kind: 'completed' | 'failed'): void => {
      if (commitClearTimerRef.current !== null) window.clearTimeout(commitClearTimerRef.current);
      commitClearTimerRef.current = null;
      pendingClearRef.current = null;
      setPendingClear(null);
      pushToast({
        level: 'info',
        title: 'Clear undone',
        message: kind === 'completed' ? 'Completed downloads are back in the list.' : 'Failed entries are back in the list.',
      });
    },
    [pushToast],
  );

  // --- row actions (same IPC calls as the old page) -----------------------------------
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const [removeDialog, setRemoveDialog] = useState<null | { ids: string[]; activeCount: number }>(null);

  const actionFor = useCallback(
    (item: DownloadQueueItemDto) => ({
      pause: () => void window.desktop.downloads.pause(item.id).finally(refreshDownloads),
      resume: () => void window.desktop.downloads.resume(item.id).finally(refreshDownloads),
      cancel: () => void window.desktop.downloads.cancel(item.id).finally(refreshDownloads),
      retry: () => void window.desktop.downloads.retry(item.id).finally(refreshDownloads),
      setPriority: (priority: number) =>
        void window.desktop.downloads.setPriority(item.id, priority).finally(refreshDownloads),
      openInLibrary: () => {
        // Play in-app instead of shelling out to the system player: the
        // Library consumes the one-shot push, lands on its Downloads tab
        // and opens its built-in player for this file.
        if (item.filePath !== null && item.filePath !== undefined && item.filePath !== '') {
          useDrilldownStore.getState().setPlayDownload(item);
        }
        navigate('/library');
      },
      showInFolder: () => {
        if (item.filePath !== null && item.filePath !== undefined && item.filePath !== '') {
          void window.desktop.library.revealInExplorer(item.filePath);
        }
      },
      remove: () => {
        // Removing an ACTIVE download asks for confirmation first; finished
        // and failed rows remove immediately. The remove call only deletes
        // the list entry — files on disk are never touched.
        if (ACTIVE_DOWNLOAD_STATUSES.includes(item.status)) {
          setRemoveDialog({ ids: [item.id], activeCount: 1 });
          return;
        }
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
        void window.desktop.downloads.remove(item.id).finally(() => {
          setRemovingIds((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
          refreshDownloads();
        });
      },
    }),
    [refreshDownloads],
  );

  // --- multi-select --------------------------------------------------------------------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string): void =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = (): void => setSelectedIds(new Set());

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(items.map((i) => i.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  // --- filtering + sorting --------------------------------------------------------------
  const q = filters.search.trim().toLowerCase();
  const pendingClearIdSet = pendingClear?.ids;
  const activeSort = SORTERS[filters.sort];

  const matches = useCallback(
    (item: DownloadQueueItemDto): boolean => {
      if (pendingClearIdSet?.has(item.id)) return false; // two-phase hide
      if (filters.sites.length > 0 && !filters.sites.includes(siteIdFor(item))) return false;
      if (q !== '') {
        const ctx = rowContext.get(item.id);
        const haystack = `${ctx?.title ?? ''} ${item.fileName} ${ctx?.siteName ?? siteNameFor(item)} ${item.url}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    },
    [pendingClearIdSet, filters.sites, q, rowContext],
  );

  const filterAndSort = useCallback(
    (list: DownloadQueueItemDto[]): DownloadQueueItemDto[] => list.filter(matches).sort(activeSort),
    [matches, activeSort],
  );

  const filteredActive = useMemo(() => filterAndSort(activeItems), [filterAndSort, activeItems]);
  const filteredCompleted = useMemo(() => filterAndSort(completedItems), [filterAndSort, completedItems]);
  const filteredFailed = useMemo(() => filterAndSort(failedItems), [filterAndSort, failedItems]);
  const filteredCancelled = useMemo(() => filterAndSort(cancelledItems), [filterAndSort, cancelledItems]);
  const filtered = useMemo(
    () =>
      filterAndSort(
        filters.tab === 'downloading'
          ? downloadingItems
          : filters.tab === 'queued'
            ? queuedItems
            : filters.tab === 'paused'
              ? pausedItems
              : filters.tab === 'failed'
                ? failedItems
                : filters.tab === 'cancelled'
                  ? cancelledItems
                  : items,
      ),
    [filterAndSort, filters.tab, downloadingItems, queuedItems, pausedItems, failedItems, cancelledItems, items],
  );
  const filteredCompletedAll = filteredCompleted;

  // "Load more" applies to the growing history (completed); active pinned
  // rows, failed and cancelled lists stay fully in view.
  const completedBuckets = useMemo(
    () => bucketByDay(filteredCompleted.slice(0, visibleCount)),
    [filteredCompleted, visibleCount],
  );
  const completedHidden = Math.max(0, filteredCompletedAll.length - visibleCount);

  // --- selection bookkeeping -----------------------------------------------------------
  // Selectable = the rows visible under the ACTIVE tab layout.
  const selectableRows = useMemo(() => {
    if (filters.tab === 'all') {
      return [...filteredActive, ...filteredCompleted, ...filteredFailed, ...filteredCancelled];
    }
    return filtered;
  }, [filters.tab, filteredActive, filteredCompleted, filteredFailed, filteredCancelled, filtered]);

  const selectedOnView = selectableRows.filter((i) => selectedIds.has(i.id));
  const selectAllChecked = selectableRows.length > 0 && selectedOnView.length === selectableRows.length;
  const selectAllIndeterminate = selectedOnView.length > 0 && selectedOnView.length < selectableRows.length;
  const toggleSelectAll = (checked: boolean): void =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of selectableRows) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });

  const selectedRows = useMemo(() => items.filter((i) => selectedIds.has(i.id)), [items, selectedIds]);
  const selectedDownloading = selectedRows.filter((i) => i.status === 'downloading');
  const selectedPaused = selectedRows.filter((i) => i.status === 'paused');
  const selectedActive = selectedRows.filter((i) => ACTIVE_DOWNLOAD_STATUSES.includes(i.status));
  const selectedRetryable = selectedRows.filter((i) => i.status === 'failed' || i.status === 'cancelled');

  // --- bulk actions (same engine surface, no new endpoints) ------------------------------
  const bulkPause = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.allSettled(ids.map((id) => window.desktop.downloads.pause(id)));
      return ids.length;
    },
    onSuccess: (n) => {
      pushToast({
        level: 'info',
        title: n === 1 ? 'Download paused' : `${n} downloads paused`,
        message: 'Paused rows hold their spot and resume where they left off.',
      });
      refreshDownloads();
      clearSelection();
    },
  });
  const bulkResume = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.allSettled(ids.map((id) => window.desktop.downloads.resume(id)));
      return ids.length;
    },
    onSuccess: (n) => {
      pushToast({
        level: 'info',
        title: n === 1 ? 'Download resumed' : `${n} downloads resumed`,
        message: 'They rejoin the queue at their saved spots.',
      });
      refreshDownloads();
      clearSelection();
    },
  });
  const bulkCancel = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.allSettled(ids.map((id) => window.desktop.downloads.cancel(id)));
      return ids.length;
    },
    onSuccess: (n) => {
      pushToast({
        level: 'info',
        title: n === 1 ? 'Download cancelled' : `${n} downloads cancelled`,
        message: 'Cancelled rows stay in the list — Retry puts them back in the queue.',
      });
      refreshDownloads();
      clearSelection();
    },
  });
  const bulkRetry = useMutation({
    mutationFn: async (ids: string[]) => {
      await window.desktop.downloads.bulkRetry(ids);
      return ids.length;
    },
    onSuccess: (n) => {
      pushToast({ level: 'info', title: 'Retrying', message: `${n} download${n === 1 ? '' : 's'} re-queued.` });
      refreshDownloads();
      clearSelection();
    },
  });
  const bulkRemove = useMutation({
    mutationFn: async (ids: string[]) => {
      await window.desktop.downloads.bulkRemove(ids);
      return ids.length;
    },
    onSuccess: (n) => {
      pushToast({
        level: 'info',
        title: n === 1 ? 'Download removed' : `${n} downloads removed`,
        message: 'Removed from this list — downloaded files stay on disk.',
      });
      refreshDownloads();
      clearSelection();
    },
  });

  // --- header: pause/resume-all + the "…" menu --------------------------------------------
  const pauseAll = useMutation({
    mutationFn: () => window.desktop.downloads.pauseAll(),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'All downloads paused', message: 'Active downloads paused — they resume their spots later.' });
      refreshDownloads();
    },
  });
  const resumeAll = useMutation({
    mutationFn: () => window.desktop.downloads.resumeAll(),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Paused downloads resumed', message: 'Everything paused rejoins the queue.' });
      refreshDownloads();
    },
  });
  const retryAll = useMutation({
    mutationFn: () => window.desktop.downloads.retryAll(),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Retrying failed downloads', message: `${counts.failed} failed download${counts.failed === 1 ? '' : 's'} re-queued.` });
      refreshDownloads();
    },
  });

  const [clearDialog, setClearDialog] = useState<null | 'completed' | 'failed'>(null);

  const headerMenuItems: KebabItem[] = [];
  if (counts.failed > 0) {
    headerMenuItems.push({
      key: 'retry-failed',
      label: `Retry failed (${counts.failed})`,
      icon: <RefreshCw size={13} />,
      onSelect: () => retryAll.mutate(),
    });
  }
  if (counts.completed > 0) {
    headerMenuItems.push({
      key: 'clear-completed',
      label: `Clear completed… (${counts.completed})`,
      onSelect: () => setClearDialog('completed'),
    });
  }
  if (counts.failed > 0) {
    headerMenuItems.push({
      key: 'clear-failed',
      label: `Clear failed… (${counts.failed})`,
      icon: <Trash2 size={13} />,
      dangerous: true,
      onSelect: () => setClearDialog('failed'),
    });
  }

  // --- add flow: the bar hands the link to the dialog (check first, then
  //     options, then "Add Download" queues it — nothing auto-downloads) ---
  const [addDialogSeed, setAddDialogSeed] = useState('');
  const openAddDialogFor = useCallback((link: string): void => {
    setAddDialogSeed(link);
    setAddDialogOpen(true);
  }, []);

  // --- confirm clears (mandated copy) -------------------------------------------------------
  const beginClear = (kind: 'completed' | 'failed'): void => {
    const source = kind === 'completed' ? completedItems : failedItems;
    const ids = new Set(source.map((i) => i.id));
    if (ids.size === 0) return;
    setClearDialog(null);
    setPendingClear({ kind, ids });
    pushToast({
      level: 'info',
      title: `${ids.size} ${kind === 'failed' ? 'failed' : 'completed'} ${ids.size === 1 ? 'download' : 'downloads'} cleared`,
      message: 'Removed from this list — downloaded files stay on disk.',
      action: { label: 'Undo', onAction: () => undoPendingClear(kind) },
    });
    scheduleClearCommit(kind);
  };

  // --- empty-state copy per filter -----------------------------------------------------------
  const emptyFor = ((): { title: string; description: string } => {
    switch (filters.tab) {
      case 'downloading':
        return { title: 'Nothing downloading right now', description: 'Queued items start as soon as a slot frees up.' };
      case 'queued':
        return { title: 'No queued downloads', description: 'Add a link above — new downloads queue here first.' };
      case 'paused':
        return {
          title: 'No paused downloads',
          description: 'Pause something to take a break — it resumes exactly where it left off.',
        };
      case 'completed':
        return { title: 'No completed downloads', description: 'Finished files are grouped here by the day they completed.' };
      case 'failed':
        return {
          title: 'No failed downloads',
          description: 'When a download cannot finish, it shows up here with a reason.',
        };
      case 'cancelled':
        return {
          title: 'No cancelled downloads',
          description: 'Rows you cancel show up here; Retry moves them back to the queue.',
        };
      default:
        return { title: 'No downloads', description: 'Add a download to get started.' };
    }
  })();

  const activeFilterCount = (filters.search.trim() !== '' ? 1 : 0) + filters.sites.length;

  const tabIsEmpty = (): boolean => {
    if (filters.tab === 'completed') {
      return (pendingClear?.kind ?? '') !== 'completed' && completedItems.length === 0;
    }
    if (filters.tab === 'failed') {
      return (pendingClear?.kind ?? '') !== 'failed' && failedItems.length === 0;
    }
    switch (filters.tab) {
      case 'downloading':
        return downloadingItems.length === 0;
      case 'queued':
        return queuedItems.length === 0;
      case 'paused':
        return pausedItems.length === 0;
      case 'cancelled':
        return cancelledItems.length === 0;
      default:
        return items.length === 0;
    }
  };

  const everythingHidden =
    filteredActive.length + filteredCompletedAll.length + filteredFailed.length + filteredCancelled.length === 0;

  // --- row renderer ---------------------------------------------------------------------------
  const renderRow = (item: DownloadQueueItemDto) => {
    const ctx: RowContext = rowContext.get(item.id) ?? {
      title: downloadTitleFor(item),
      siteId: siteIdFor(item),
      siteName: siteNameFor(item),
      queuePosition: queuePositionOf(item, items),
      folderLabel: folderLabelFor(item.destination),
      folderTooltip: folderTooltipFor(item.destination),
    };
    const actions = actionFor(item);
    const dead = item.status === 'failed' || item.status === 'cancelled';
    const retryable = dead ? mapDownloadError(item.error ?? null, item.status).retryable : false;
    return (
      <DownloadRow
        key={item.id}
        item={item}
        variant={downloadVariantFor(item.status)}
        title={ctx.title}
        siteName={ctx.siteName}
        siteId={ctx.siteId}
        queuePosition={ctx.queuePosition}
        folderLabel={ctx.folderLabel}
        folderTooltip={ctx.folderTooltip}
        privacy={privacy}
        selectable
        selected={selectedIds.has(item.id)}
        onToggleSelect={() => toggleSelect(item.id)}
        onSiteFilter={(siteId) => {
          patchFilters({ sites: [siteId] });
          clearSelection();
        }}
        onPause={actions.pause}
        onResume={actions.resume}
        onCancel={actions.cancel}
        onRetry={retryable ? actions.retry : undefined}
        onOpenInLibrary={actions.openInLibrary}
        onShowInFolder={actions.showInFolder}
        onRemove={actions.remove}
        onSetPriority={actions.setPriority}
        deleting={removingIds.has(item.id)}
      />
    );
  };

  return (
    <PageContainer className={selectedIds.size > 0 ? 'pb-28' : undefined}>
      <SectionHeader
        title="Downloads"
        description="Manage stream downloads and their progress."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Pause all / Resume all — the segmented global control shows
                only the action that currently applies, count on the label. */}
            <div
              className="flex shrink-0 rounded-md border border-border bg-surface p-0.5"
              role="group"
              aria-label="Pause or resume all downloads"
            >
              {downloadingItems.length > 0 ? (
                <button
                  type="button"
                  onClick={() => pauseAll.mutate()}
                  disabled={pauseAll.isPending}
                  title="Pause every actively downloading file"
                  className="flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <PauseCircle size={14} />
                  Pause all <span className="tabular-nums">({downloadingItems.length})</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pausedItems.length === 0 || resumeAll.isPending}
                  onClick={() => resumeAll.mutate()}
                  title={pausedItems.length > 0 ? 'Resume every paused download' : 'Nothing paused to resume'}
                  className="flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <PlayCircle size={14} />
                  Resume all <span className="tabular-nums">({pausedItems.length})</span>
                </button>
              )}
            </div>

            {/* "…" — Retry failed / Clear completed / Clear failed (only when they can act) */}
            {headerMenuItems.length > 0 && <KebabMenu items={headerMenuItems} label="More download actions" />}

            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Download size={14} /> Add Download
            </Button>
          </div>
        }
      />

      {isError && <p className="text-sm text-error">Failed to load downloads — the list will retry automatically.</p>}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[72px] w-full rounded-md" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Summary strip — the one status filter (tab row removed) */}
          <DownloadsSummaryStrip
            counts={counts}
            totalSpeed={totalSpeed}
            totalEtaSeconds={totalEtaSeconds}
            filterTab={filters.tab}
            onFilterTab={(tab) => patchFilters({ tab })}
          />

          {/* Sticky toolbar */}
          <DownloadsToolbar
            filters={filters}
            onChange={patchFilters}
            onReset={resetFilters}
            activeFilterCount={activeFilterCount}
            resultCount={filters.tab === 'all' ? everythingHidden ? 0 : selectableRows.length : filtered.length}
            totalCount={counts.all}
            siteOptions={siteOptions}
            selectAll={
              selectableRows.length > 0
                ? {
                    checked: selectAllChecked,
                    indeterminate: selectAllIndeterminate,
                    onChange: toggleSelectAll,
                    label: 'Select all downloads in view',
                  }
                : undefined
            }
            privacy={{ on: privacy, onToggle: () => setPrivacy(!privacy) }}
          />

          {/* Paste a link / drop it here — Enter opens the Add Download dialog, which checks first */}
          <AddDownloadBar onSubmit={openAddDialogFor} />

          {/* Empty states — page, per-filter and no-match */}
          {items.length === 0 ? (
            <EmptyState
              icon={Download}
              title="No downloads yet"
              description="Paste a link above or use Add Download — quality, audio-only, priority and the destination folder are all optional."
              action={
                <div className="w-[26rem] max-w-full">
                  <AddDownloadBar onSubmit={openAddDialogFor} />
                </div>
              }
            />
          ) : (filters.tab !== 'all' && tabIsEmpty()) || (filters.tab === 'all' && everythingHidden) ? (
            <EmptyState
              icon={activeFilterCount > 0 ? Search : Download}
              title={activeFilterCount > 0 ? 'Nothing matches your filters' : emptyFor.title}
              description={activeFilterCount > 0 ? 'Try a different filter or search term.' : emptyFor.description}
              action={
                activeFilterCount > 0 ? (
                  <Button variant="secondary" onClick={resetFilters}>
                    <X size={14} /> Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-5">
              {filters.tab === 'all' && (
                <>
                  {filteredActive.length > 0 && (
                    <DownloadDayGroup label="Active" count={filteredActive.length}>
                      {filteredActive.map((item) => renderRow(item))}
                    </DownloadDayGroup>
                  )}
                  {/* Completed history grouped by day; active rows stay pinned on top */}
                  {completedBuckets.map((bucket) => (
                    <DownloadDayGroup key={bucket.day.key} label={bucket.day.label} count={bucket.entries.length}>
                      {bucket.entries.map((item) => renderRow(item))}
                    </DownloadDayGroup>
                  ))}
                  {filteredFailed.length > 0 && (
                    <DownloadDayGroup label="Failed" count={filteredFailed.length}>
                      {filteredFailed.map((item) => renderRow(item))}
                    </DownloadDayGroup>
                  )}
                  {filteredCancelled.length > 0 && (
                    <DownloadDayGroup label="Cancelled" count={filteredCancelled.length}>
                      {filteredCancelled.map((item) => renderRow(item))}
                    </DownloadDayGroup>
                  )}
                </>
              )}

              {filters.tab !== 'all' && filters.tab !== 'completed' && (
                <DownloadDayGroup label={TAB_TITLE[filters.tab]} count={filtered.length}>
                  {filtered.map((item) => renderRow(item))}
                </DownloadDayGroup>
              )}

              {filters.tab === 'completed' &&
                completedBuckets.map((bucket) => (
                  <DownloadDayGroup key={bucket.day.key} label={bucket.day.label} count={bucket.entries.length}>
                    {bucket.entries.map((item) => renderRow(item))}
                  </DownloadDayGroup>
                ))}

              {/* Load more — replaces the old pagination */}
              {completedHidden > 0 && (filters.tab === 'all' || filters.tab === 'completed') && (
                <div className="flex justify-center">
                  <Button variant="ghost" size="sm" onClick={() => setVisibleCount((n) => n + DEAD_PAGE_SIZE)}>
                    <Plus size={14} /> Load more ({completedHidden} earlier)
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Bulk action bar — an action appears only when the selection supports it */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 shadow-md">
          <span className="text-sm font-semibold tabular-nums text-foreground">{selectedIds.size} selected</span>
          {selectedDownloading.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              loading={bulkPause.isPending}
              onClick={() => void bulkPause.mutateAsync(selectedDownloading.map((i) => i.id))}
            >
              <PauseCircle size={13} /> Pause ({selectedDownloading.length})
            </Button>
          )}
          {selectedPaused.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              loading={bulkResume.isPending}
              onClick={() => void bulkResume.mutateAsync(selectedPaused.map((i) => i.id))}
            >
              <PlayCircle size={13} /> Resume ({selectedPaused.length})
            </Button>
          )}
          {selectedRetryable.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              loading={bulkRetry.isPending}
              onClick={() => void bulkRetry.mutateAsync(selectedRetryable.map((i) => i.id))}
            >
              <RefreshCw size={13} /> Retry ({selectedRetryable.length})
            </Button>
          )}
          {selectedActive.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              loading={bulkCancel.isPending}
              onClick={() => void bulkCancel.mutateAsync(selectedActive.map((i) => i.id))}
              title="Cancel the queued / downloading / paused rows in the selection"
            >
              <X size={13} /> Cancel ({selectedActive.length})
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-error hover:bg-error/10 hover:text-error"
            onClick={() => {
              const ids = [...selectedIds];
              // Removing an active download asks before cancelling it.
              if (selectedActive.length > 0) setRemoveDialog({ ids, activeCount: selectedActive.length });
              else void bulkRemove.mutateAsync(ids);
            }}
          >
            <Trash2 size={13} /> Remove
          </Button>
          <Button variant="ghost" size="icon" onClick={clearSelection} aria-label="Clear selection">
            <X size={13} />
          </Button>
        </div>
      )}

      {/* Clear completed / Clear failed — the clear calls only remove list
          entries, so the mandated copy is the literal truth here. */}
      <Dialog open={clearDialog !== null} onOpenChange={(v) => { if (!v) setClearDialog(null); }}>
        <DialogContent
          title={clearDialog === 'failed' ? 'Clear failed downloads?' : 'Clear completed downloads?'}
          description={
            clearDialog === 'failed'
              ? `${counts.failed} failed ${counts.failed === 1 ? 'entry' : 'entries'} will be removed from this list.`
              : `${counts.completed} completed download${counts.completed === 1 ? '' : 's'} will be removed from this list.`
          }
        >
          <p className="text-sm text-foreground-secondary">
            This removes entries from this list. Downloaded files stay on disk.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setClearDialog(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => clearDialog !== null && beginClear(clearDialog)}>
              Clear {clearDialog === 'failed' ? counts.failed : counts.completed}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation for active rows (cancels them, then removes the entry) */}
      <Dialog
        open={removeDialog !== null}
        onOpenChange={(v) => {
          if (!v) setRemoveDialog(null);
        }}
      >
        <DialogContent
          title={removeDialog !== null && removeDialog.ids.length === 1 ? 'Remove this download?' : `Remove ${removeDialog?.ids.length ?? 0} downloads?`}
          description={
            removeDialog !== null && removeDialog.activeCount === removeDialog.ids.length
              ? removeDialog.ids.length === 1
                ? 'The active download will be cancelled first.'
                : `${removeDialog.activeCount} active download${removeDialog.activeCount === 1 ? '' : 's'} will be cancelled first.`
              : `${removeDialog?.activeCount ?? 0} of them are active and will be cancelled first.`
          }
        >
          <p className="text-sm text-foreground-secondary">
            This removes entries from this list. Downloaded files stay on disk.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoveDialog(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (removeDialog === null) return;
                void bulkRemove.mutateAsync(removeDialog.ids);
                setRemoveDialog(null);
              }}
            >
              Remove {removeDialog?.ids.length ?? 0}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AddDownloadDialog
        open={addDialogOpen}
        onOpenChange={(v) => {
          setAddDialogOpen(v);
          if (!v) setAddDialogSeed('');
        }}
        initialUrl={addDialogSeed}
      />
    </PageContainer>
  );
}

const TAB_TITLE: Record<Exclude<DownloadFilterTab, 'all' | 'completed'>, string> = {
  downloading: 'Downloading',
  queued: 'Queued',
  paused: 'Paused',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
