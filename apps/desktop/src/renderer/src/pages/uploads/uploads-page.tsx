/**
 * UploadsPage — redesigned upload surface:
 *   • ProviderPicker (custom dropdown w/ provider tiles, status dots, limit
 *     summaries and inline "Set up" for needs-setup hosts) + ProviderInfoCard
 *     (Retention · Max file size · Speed · Ads — tooltips, amber downsides)
 *   • UploadDropzone ("Drop recordings here or Browse", compact when the list
 *     has rows) + "Choose from Recordings" picker of completed captures
 *   • UploadsSummaryStrip (Uploading · Completed · Failed · Total uploaded
 *     size — clickable filters) and an UploadsToolbar (segmented
 *     All/Uploading/Completed/Failed with counts · search · provider · sort ·
 *     select-all · "Clear history…" menu)
 *   • UploadRow (queued | uploading | completed | failed), day-grouped
 *     headers that scroll with the page, multi-select with a bulk bar,
 *     per-filter empty states
 *     and a loading skeleton; failed rows show mapUploadError() reasons and
 *     get an undoable two-phase clear with the mandated confirm copy.
 *
 * Data/behavior contract unchanged: the same query keys, the same uploads
 * IPC calls (add/remove/pause/resume/cancel/retry/clearCompleted/failed) and
 * no upload/provider logic touched — this file orchestrates presentation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CloudUpload, Copy, ExternalLink, Search, Trash2, Upload, X } from 'lucide-react';
import type {
  CreatorDto,
  RecordingDto,
  RecordingJobDto,
  UploadProviderMetaDto,
  UploadQueueItemDto,
} from '@rekordly/shared/contracts';
import { Button, Dialog, DialogContent, EmptyState, PageContainer, SectionHeader, Skeleton } from '@rekordly/ui';
import { providerColor } from '../../components/platform-config';
import { Pagination, usePaged } from '../../components/pagination';
import { FEATURE_URLS } from '../../lib/site-links';
import { useToastStore } from '../../stores/toast-store';
import { dayGroupOf, formatRowStamp, jobElapsedSeconds, type DayGroup } from '../recordings/recording-format';
import { mapUploadError } from './upload-errors';
import { creatorFromFileName, fileBaseName } from './uploads-format';
import { ProviderPicker, type ProviderPickerState } from './provider-picker';
import { ProviderInfoCard } from './provider-info-card';
import { UploadDropzone } from './upload-dropzone';
import { uploadVariantFor, UploadRow } from './upload-row';
import { UploadDayGroup } from './upload-group';
import {
  UploadsToolbar,
  type UploadFilterTab,
  type UploadSort,
  type UploadsFilterState,
} from './uploads-toolbar';
import { UploadsSummaryStrip } from './summary-strip';
import { ChooseFromRecordingsDialog } from './recordings-picker-dialog';
import type { KebabItem } from '../../components/kebab-menu';

const DEFAULT_FILTERS: UploadsFilterState = {
  tab: 'all',
  search: '',
  providers: [],
  sort: 'newest',
};

/** ponytail: matches the recordings page — day-grouped upload history stays
 * scannable in one reasonable screen of rows per page. */
const UPLOAD_PAGE_SIZE = 50;

/** In-flight statuses; 'Uploading' is the umbrella the UI shows for them. */
const ACTIVE_UPLOAD_STATUSES: readonly string[] = ['queued', 'uploading', 'paused'];

interface UploadRowContext {
  title: string;
  fileName: string;
  avatarUrl: string | null;
  thumbPath: string | null;
  durationSeconds: number | null;
}

interface DayBucket {
  day: DayGroup;
  /** Rows keep the chosen sort order inside each day. */
  entries: UploadQueueItemDto[];
}

/** Bucket a sorted flat list into day groups, preserving order. */
function bucketByDay(entries: UploadQueueItemDto[]): DayBucket[] {
  const buckets = new Map<string, DayBucket>();
  for (const entry of entries) {
    const group = dayGroupOf(entry.createdAt);
    const bucket = buckets.get(group.key);
    if (bucket !== undefined) bucket.entries.push(entry);
    else buckets.set(group.key, { day: group, entries: [entry] });
  }
  return [...buckets.values()];
}

const SORTERS: Record<UploadSort, (a: UploadQueueItemDto, b: UploadQueueItemDto) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  // Largest first; rows without a size yet sort last.
  largest: (a, b) => uploadSizeFor(b) - uploadSizeFor(a),
};

function uploadSizeFor(item: UploadQueueItemDto): number {
  if (item.totalBytes > 0) return item.totalBytes;
  if (item.bytesUploaded > 0) return item.bytesUploaded;
  return 0;
}

export function UploadsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pushToast = useToastStore((state) => state.push);

  // --- data ------------------------------------------------------------------
  const { data: uploads, isLoading, isError } = useQuery({
    queryKey: ['uploads', 'all'],
    queryFn: () => window.desktop.uploads.list(),
  });

  // Live updates from the upload worker; progress fires often, so invalidate
  // at most once per second (unchanged from the previous page).
  const lastInvalidateRef = useRef(0);
  useEffect(() => {
    const unsub = window.desktop.uploads.onEvent((event) => {
      if (event.type === 'upload-progress') {
        const now = Date.now();
        if (now - lastInvalidateRef.current < 1000) return;
        lastInvalidateRef.current = now;
      }
      void queryClient.invalidateQueries({ queryKey: ['uploads'] });
      void queryClient.invalidateQueries({ queryKey: ['uploads-count'] });
    });
    return unsub;
  }, [queryClient]);

  const refreshUploads = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['uploads'] });
    void queryClient.invalidateQueries({ queryKey: ['uploads-count'] });
  };

  const { data: providers } = useQuery({
    queryKey: ['upload-providers'],
    queryFn: () => window.desktop.uploads.providers(),
  });

  const { data: providerMeta } = useQuery({
    queryKey: ['upload-providers-meta'],
    queryFn: () => window.desktop.uploads.providersMeta(),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
  });

  // Source-recording context (thumbnail / creator / duration) from the
  // existing recording sources — shared keys, no new backend surface.
  const { data: jobs } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
  });
  const { data: creators } = useQuery({
    queryKey: ['creators'],
    queryFn: () => window.desktop.creators.list(),
  });
  const { data: libraryRecordings } = useQuery({
    queryKey: ['recordings-list', 100],
    queryFn: () => window.desktop.recordings.list(100),
  });

  const items = useMemo(() => uploads ?? [], [uploads]);

  // --- provider state ---------------------------------------------------------
  const allProviders = useMemo(() => {
    return (providerMeta ?? []).map((meta) => {
      const live = providers?.find((p) => p.id === meta.id);
      const available = live?.authenticated ?? false;
      const healthy = live?.healthy ?? false;
      const state: ProviderPickerState = !available ? 'needs-setup' : healthy ? 'ready' : 'offline';
      return {
        id: meta.id,
        name: meta.name,
        state,
        meta: {
          maxFileSize: meta.maxFileSize,
          requiresAccount: meta.requiresAccount,
          requiresApiKey: meta.requiresApiKey,
        },
      };
    });
  }, [providerMeta, providers]);

  const availableProviders = useMemo(
    () => (providers ?? []).filter((p) => p.authenticated),
    [providers],
  );

  // Selectable = every non-needs-setup provider (the old page allowed
  // authenticated-but-unhealthy hosts too — only setup-blocked ones are off).
  const usableIds = useMemo(
    () => allProviders.filter((p) => p.state !== 'needs-setup').map((p) => p.id),
    [allProviders],
  );
  const defaultProviderId = settings?.uploadProviders?.defaultProvider ?? '';

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // Resolve the initial selection: prefer the user's default provider when it
  // is usable, else the first usable one. Once something valid is chosen it
  // is never clobbered by later refetches.
  const usableKey = usableIds.join('|');
  useEffect(() => {
    if (providers === undefined) return;
    setSelectedProvider((prev) => {
      if (prev !== null && usableIds.includes(prev)) return prev;
      if (defaultProviderId !== '' && usableIds.includes(defaultProviderId)) return defaultProviderId;
      return usableIds[0] ?? null;
    });
  }, [usableKey, providers, defaultProviderId]);

  const selectedMeta: UploadProviderMetaDto | undefined =
    providerMeta?.find((m) => m.id === selectedProvider);
  const selectedIsUsable = selectedProvider !== null && usableIds.includes(selectedProvider);

  const providerNameFor = useCallback(
    (providerId: string): string => providerMeta?.find((m) => m.id === providerId)?.name ?? providerId,
    [providerMeta],
  );

  // --- row context (thumbnail/graph creator/duration) -------------------------
  const contextForItems = useCallback(
    (list: UploadQueueItemDto[]): Map<string, UploadRowContext> => {
      const jobsByPath = new Map<string, RecordingJobDto>();
      const jobsById = new Map<string, RecordingJobDto>();
      for (const job of jobs ?? []) {
        jobsById.set(job.id, job);
        if (job.filePath !== null && job.filePath !== undefined && job.filePath !== '') {
          jobsByPath.set(job.filePath, job);
        }
      }
      const recordingsById = new Map<string, RecordingDto>();
      const recordingsByFileName = new Map<string, RecordingDto>();
      for (const recording of libraryRecordings ?? []) {
        recordingsById.set(recording.id, recording);
        if (recording.fileName !== null && recording.fileName !== undefined && recording.fileName !== '') {
          recordingsByFileName.set(recording.fileName.toLowerCase(), recording);
        }
      }
      const creatorById = new Map<string, CreatorDto>();
      const creatorByTitle = new Map<string, CreatorDto>();
      for (const creator of creators ?? []) {
        creatorById.set(creator.id, creator);
        if (creator.displayName !== '') creatorByTitle.set(creator.displayName.toLowerCase(), creator);
        if (creator.username !== '') creatorByTitle.set(creator.username.toLowerCase(), creator);
      }

      const result = new Map<string, UploadRowContext>();
      for (const item of list) {
        const fileName = fileBaseName(item.sourcePath);
        const parsedTitle = creatorFromFileName(item.sourcePath);
        // Match order: this upload's own recording id → a recording job whose
        // file path equals the upload's source → the library row with the
        // same file name → (creator still unknown → fall through).
        const library =
          (item.recordingId !== null && item.recordingId !== undefined
            ? recordingsById.get(item.recordingId)
            : undefined) ??
          recordingsByFileName.get(fileName.toLowerCase());
        const job =
          jobsByPath.get(item.sourcePath) ??
          (library?.jobId !== null && library?.jobId !== undefined ? jobsById.get(library.jobId) : undefined);
        const creatorId = job?.creatorId ?? library?.creatorId ?? null;
        const creator =
          creatorId !== null && creatorId !== undefined
            ? (creatorById.get(creatorId) ?? undefined)
            : (parseCreatorFallback(parsedTitle, creatorByTitle) ?? undefined);

        const title =
          creator !== undefined && creator.displayName !== '' ? creator.displayName : parsedTitle;

        const libDuration =
          library?.durationSeconds !== null && library?.durationSeconds !== undefined
            ? library.durationSeconds
            : null;
        const durationSeconds = libDuration !== null && libDuration > 0 ? libDuration : jobElapsedSeconds(job?.startedAt, job?.finishedAt);

        result.set(item.id, {
          title,
          fileName,
          avatarUrl: creator?.avatarUrl ?? null,
          thumbPath: job?.thumbnailPath ?? library?.thumbnailPath ?? null,
          durationSeconds: Number.isFinite(durationSeconds ?? -1) ? durationSeconds : null,
        });
      }
      return result;
    },
    [jobs, creators, libraryRecordings],
  );

  const rowContext = useMemo(() => contextForItems(items), [contextForItems, items]);

  // --- buckets ----------------------------------------------------------------
  const uploadingItems = useMemo(
    () => items.filter((i) => ACTIVE_UPLOAD_STATUSES.includes(i.status)),
    [items],
  );
  const completedItems = useMemo(
    () => items.filter((i) => i.status === 'completed'),
    [items],
  );
  // ponytail: cancelled uploads are dead rows too — grouped with Failed so
  // they never disappear (same rule as the Recordings page).
  const failedItems = useMemo(
    () => items.filter((i) => i.status === 'failed' || i.status === 'cancelled'),
    [items],
  );

  const totalUploadedBytes = useMemo(
    () => completedItems.reduce((acc, item) => acc + Math.max(0, item.bytesUploaded), 0),
    [completedItems],
  );

  // --- undoable "Clear history" (two-phase hide → commit; Undo restores) ------
  // clearCompleted/clearFailed delete history rows for good, so "clear" is
  // made undoable by delaying the destructive call until the toast expires.
  // Rows hide instantly; "Undo" cancels the pending commit. No backend change.
  const [pendingClear, setPendingClear] = useState<
    { kind: 'completed' | 'failed'; ids: Set<string> } | null
  >(null);
  const pendingClearRef = useRef(pendingClear);
  pendingClearRef.current = pendingClear;
  const commitClearTimerRef = useRef<number | null>(null);

  const commitClear = useCallback(
    (kind: 'completed' | 'failed'): void => {
      setPendingClear(null);
      pendingClearRef.current = null;
      void (kind === 'completed'
        ? window.desktop.uploads.clearCompleted()
        : window.desktop.uploads.clearFailed()
      ).then(() => refreshUploads());
    },
    // refreshUploads is stable-by-construction (no deps); keep eslint quiet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    return () => {
      // ponytail: on unmount, commit what was confirmed so a hidden clear
      // never silently comes back on the next visit.
      const pending = pendingClearRef.current;
      if (pending !== null && commitClearTimerRef.current !== null) {
        window.clearTimeout(commitClearTimerRef.current);
        commitClearTimerRef.current = null;
        commitClear(pending.kind);
      }
    };
  }, [commitClear]);

  const scheduleClearCommit = useCallback(
    (kind: 'completed' | 'failed'): void => {
      // Undo window: at least the toast duration, bounded to a sane minimum.
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
        message: kind === 'completed' ? 'Completed uploads are back in the list.' : 'Failed entries are back in the list.',
      });
    },
    [pushToast],
  );

  const beginClear = useCallback(
    (kind: 'completed' | 'failed'): void => {
      const source = kind === 'completed' ? completedItems : failedItems;
      const ids = new Set(source.map((i) => i.id));
      if (ids.size === 0) return;
      setClearDialog(null);
      setPendingClear({ kind, ids });
      pushToast({
        level: 'info',
        title: `${ids.size} ${kind} ${ids.size === 1 ? 'upload' : 'uploads'} cleared`,
        message: 'Removed from this list — files stay on the host.',
        action: { label: 'Undo', onAction: () => undoPendingClear(kind) },
      });
      scheduleClearCommit(kind);
    },
    [completedItems, failedItems, pushToast, scheduleClearCommit, undoPendingClear],
  );

  // --- adding files (original add-path preserved) ------------------------------
  const pickAndAdd = useMutation({
    mutationFn: async () => {
      if (selectedProvider === null) return null;
      const filePath = await window.desktop.uploads.pickFile();
      if (filePath === null) return null;
      return window.desktop.uploads.add({ providerId: selectedProvider, sourcePath: filePath });
    },
    onSuccess: (added) => {
      if (added !== null) {
        const providerName = selectedMeta?.name ?? selectedProvider ?? 'the selected host';
        pushToast({ title: 'Upload queued', message: `File queued for upload to ${providerName}`, level: 'info' });
      }
      void queryClient.invalidateQueries({ queryKey: ['uploads'] });
    },
  });

  // Drop-zone / recordings-picker ingest — same add call per file, with an
  // aggregated toast instead of one per entry.
  const addFiles = useMutation({
    mutationFn: async (paths: string[]) => {
      if (selectedProvider === null) return 0;
      let added = 0;
      for (const path of paths) {
        try {
          await window.desktop.uploads.add({ providerId: selectedProvider, sourcePath: path });
          added += 1;
        } catch {
          /* counted as skipped; failed adds surface when the upload fails */
        }
      }
      return added;
    },
    onSuccess: (added) => {
      const providerName = selectedMeta?.name ?? selectedProvider ?? 'the selected host';
      if (added === 1) {
        pushToast({ title: 'Upload queued', message: `File queued for upload to ${providerName}`, level: 'info' });
      } else if (added > 1) {
        pushToast({ title: `${added} uploads queued`, message: `Queued for ${providerName}`, level: 'info' });
      }
      refreshUploads();
    },
  });

  const [chooseDialogOpen, setChooseDialogOpen] = useState(false);
  const queueFromRecordings = useMutation({
    mutationFn: async (targets: RecordingJobDto[]) => {
      if (selectedProvider === null) return 0;
      let added = 0;
      for (const job of targets) {
        if (job.filePath === null || job.filePath === undefined || job.filePath === '') continue;
        try {
          await window.desktop.uploads.add({ providerId: selectedProvider, sourcePath: job.filePath });
          added += 1;
        } catch {
          /* aggregate toast below */
        }
      }
      return added;
    },
    onSuccess: (added) => {
      const providerName = selectedMeta?.name ?? selectedProvider ?? 'the selected host';
      if (added > 0) {
        pushToast({
          title: added === 1 ? 'Upload queued' : `${added} uploads queued`,
          message: `Recording${added === 1 ? '' : 's'} queued for upload to ${providerName}`,
          level: 'info',
        });
      }
      refreshUploads();
    },
  });

  const completedRecordings = useMemo(
    () =>
      (jobs ?? []).filter((j) => j.status === 'completed' && j.filePath !== null && j.filePath !== undefined && j.filePath !== ''),
    [jobs],
  );

  // --- row actions (same IPC calls as before) ----------------------------------
  const actionFor = (uploadId: string) => ({
    pause: () => window.desktop.uploads.pause(uploadId).finally(refreshUploads),
    resume: () => window.desktop.uploads.resume(uploadId).finally(refreshUploads),
    cancel: () => window.desktop.uploads.cancel(uploadId).finally(refreshUploads),
    retry: () => window.desktop.uploads.retry(uploadId).finally(refreshUploads),
    remove: () => window.desktop.uploads.remove(uploadId).finally(refreshUploads),
  });

  const openCloudStorageUrl = (): void => {
    // The existing provider setup surface — Settings → Cloud Storage.
    navigate('/settings?tab=cloud-storage');
  };

  // --- links / CSV -------------------------------------------------------------
  const linksOf = useCallback(
    (list: UploadQueueItemDto[]): string[] => list.map((i) => i.destinationPath ?? '').filter((l) => l !== ''),
    [],
  );

  const copyAllLinks = (list: UploadQueueItemDto[], scopeLabel: string): void => {
    const links = linksOf(list);
    if (links.length === 0) {
      pushToast({ title: 'No links yet', message: 'None of these uploads finished, so there is nothing to copy.', level: 'info' });
      return;
    }
    void navigator.clipboard.writeText(links.join('\n')).then(() => {
      pushToast({ title: `${links.length} link${links.length === 1 ? '' : 's'} copied`, message: `Copied as plain text. ${scopeLabel}`, level: 'info' });
    });
  };

  const exportLinksCsv = (list: UploadQueueItemDto[]): void => {
    const rows = ['File,Creator,Provider,Uploaded,Size (bytes),Link'];
    for (const item of list) {
      const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
      rows.push(
        [
          csvEscape(fileBaseName(item.sourcePath)),
          csvEscape(rowContext.get(item.id)?.title ?? ''),
          csvEscape(providerNameFor(item.providerId)),
          csvEscape(item.finishedAt ?? item.updatedAt),
          String(uploadSizeFor(item)),
          csvEscape(item.destinationPath ?? ''),
        ].join(','),
      );
    }
    const csv = rows.join('\n');
    const fallback = (): void =>
      void navigator.clipboard.writeText(csv).then(() => {
        pushToast({ title: 'Links exported (CSV)', message: 'CSV copied to the clipboard — paste it into a spreadsheet and save.', level: 'info' });
      });
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'rekordly-upload-links.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      pushToast({
        title: 'Links exported (CSV)',
        message: 'Saving rekordly-upload-links.csv — uploaded files stay on the host.',
        level: 'info',
      });
    } catch {
      fallback();
    }
  };

  // --- multi-select -------------------------------------------------------------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (uploadId: string): void =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uploadId)) next.delete(uploadId);
      else next.add(uploadId);
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

  const bulkRemove = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.allSettled(ids.map((id) => window.desktop.uploads.remove(id)));
      return ids.length;
    },
    onSuccess: (count) => {
      pushToast({
        title: count === 1 ? 'Upload removed' : `${count} uploads removed`,
        message: 'Removed from this list — uploaded files stay on the host.',
        level: 'info',
      });
      refreshUploads();
      clearSelection();
    },
  });

  const selectedRows = useMemo(() => items.filter((i) => selectedIds.has(i.id)), [items, selectedIds]);
  const selectedRetryable = selectedRows.filter((i) => i.status === 'failed' || i.status === 'cancelled');
  const selectedCompletedWithLinks = selectedRows.filter(
    (i) => i.status === 'completed' && (i.destinationPath ?? '') !== '',
  );

  const bulkRetry = useMutation({
    mutationFn: async (ids: string[]) => {
      let queued = 0;
      for (const id of ids) {
        try {
          await window.desktop.uploads.retry(id);
          queued += 1;
        } catch {
          /* counted as skipped */
        }
      }
      return queued;
    },
    onSuccess: (queued) => {
      pushToast({
        title: queued > 0 ? 'Retrying failed uploads' : 'Nothing to retry',
        message: queued > 0 ? `Queued ${queued} upload${queued === 1 ? '' : 's'} for retry.` : 'No failed uploads in the selection.',
        level: 'info',
      });
      refreshUploads();
      clearSelection();
    },
  });

  // --- filtering + sorting -------------------------------------------------------
  const [filters, setFilters] = useState<UploadsFilterState>(DEFAULT_FILTERS);
  const patchFilters = (patch: Partial<UploadsFilterState>): void =>
    setFilters((prev) => ({ ...prev, ...patch }));
  const resetFilters = (): void => setFilters((prev) => ({ ...DEFAULT_FILTERS, tab: prev.tab }));

  const visibleBase = useMemo(() => {
    if (filters.tab === 'uploading') return uploadingItems;
    if (filters.tab === 'completed') return completedItems;
    if (filters.tab === 'failed') return failedItems;
    return items;
  }, [filters.tab, uploadingItems, completedItems, failedItems, items]);

  const q = filters.search.trim().toLowerCase();
  const providerInclude = (item: UploadQueueItemDto): boolean =>
    filters.providers.length === 0 || filters.providers.includes(item.providerId);

  const filteredVisible = useMemo(() => {
    const hidden = pendingClearRef.current;
    return visibleBase
      .filter((item) => {
        const ctx = rowContext.get(item.id);
        if (hidden !== null && hidden.ids.has(item.id)) return false; // two-phase hide
        if (!providerInclude(item)) return false;
        if (q !== '') {
          const haystack = [
            ctx?.title ?? '',
            ctx?.fileName ?? '',
            item.destinationPath ?? '',
            item.providerId,
            providerNameFor(item.providerId),
            item.sourcePath,
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort(SORTERS[filters.sort]);
    // providerInclude is derived from filters.providers; included via filters dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleBase, rowContext, q, filters.providers, filters.sort, pendingClear, providerNameFor]);

  // --- pagination ------------------------------------------------------------------
  // Shared pagination over the flat row list, applied before day-grouping so
  // each page holds exactly PAGE_SIZE rows and the visible day groups always
  // end cleanly at the page boundary. Resets whenever filters change.
  const { page: safePage, setPage, pageCount: totalPages, total: totalVisible, paged: visibleRows } = usePaged(
    filteredVisible,
    UPLOAD_PAGE_SIZE,
    JSON.stringify({ tab: filters.tab, q: filters.search, providers: filters.providers, sort: filters.sort }),
  );

  // No rows at all vs rows hidden behind filters — distinct empty states.
  // Rows already on a pending-clear path count as gone (they are mid-Undo).
  const realRows = useMemo(
    () => ({ uploading: uploadingItems, completed: completedItems, failed: failedItems }),
    [uploadingItems, completedItems, failedItems],
  );
  const bucketIsEmpty = (tab: UploadFilterTab): boolean => {
    if (tab === 'completed') {
      return (pendingClear?.kind ?? '') !== 'completed' && realRows.completed.length === 0;
    }
    if (tab === 'failed') {
      return (pendingClear?.kind ?? '') !== 'failed' && realRows.failed.length === 0;
    }
    if (tab === 'uploading') return realRows.uploading.length === 0;
    return items.length === 0;
  };

  const dayBuckets = useMemo(() => bucketByDay(visibleRows), [visibleRows]);

  // Toolbar/strip counts
  const counts = useMemo(
    () => ({
      all: items.length,
      uploading: uploadingItems.length,
      completed: completedItems.length,
      failed: failedItems.length,
    }),
    [items.length, uploadingItems.length, completedItems.length, failedItems.length],
  );

  const providerOptions = useMemo(() => {
    const countsByProvider = new Map<string, number>();
    for (const item of items) countsByProvider.set(item.providerId, (countsByProvider.get(item.providerId) ?? 0) + 1);
    return [...countsByProvider.entries()]
      .sort((a, b) => providerNameFor(a[0]).localeCompare(providerNameFor(b[0])))
      .map(([providerId, count]) => ({
        value: providerId,
        label: providerNameFor(providerId),
        count,
        dot: providerColor(providerId),
      }));
  }, [items, providerNameFor]);

  const activeFilterCount =
    (filters.search.trim() !== '' ? 1 : 0) + filters.providers.length;

  // Select-all over the visible rows
  const selectableRows = filteredVisible;
  const selectedOnPageCount = selectableRows.filter((i) => selectedIds.has(i.id)).length;
  const selectAllChecked = selectableRows.length > 0 && selectedOnPageCount === selectableRows.length;
  const selectAllIndeterminate = selectedOnPageCount > 0 && selectedOnPageCount < selectableRows.length;
  const toggleSelectAll = (checked: boolean): void =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of selectableRows) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });

  // --- clear-history dialogs ------------------------------------------------------
  const [clearDialog, setClearDialog] = useState<null | 'completed' | 'failed'>(null);

  const clearHistoryItems: KebabItem[] = [];
  if (completedItems.length > 0) {
    clearHistoryItems.push({
      key: 'clear-completed',
      label: 'Clear completed…',
      icon: <Trash2 size={13} />,
      onSelect: () => setClearDialog('completed'),
    });
  }
  if (failedItems.length > 0) {
    clearHistoryItems.push({
      key: 'clear-failed',
      label: 'Clear failed…',
      icon: <Trash2 size={13} />,
      dangerous: true,
      onSelect: () => setClearDialog('failed'),
    });
  }

  const providerMetaById = useMemo(() => {
    const map = new Map<string, UploadProviderMetaDto>();
    for (const meta of providerMeta ?? []) map.set(meta.id, meta);
    return map;
  }, [providerMeta]);

  const renderRow = (item: UploadQueueItemDto) => {
    const ctx = rowContext.get(item.id) ?? {
      title: creatorFromFileName(item.sourcePath),
      fileName: fileBaseName(item.sourcePath),
      avatarUrl: null,
      thumbPath: null,
      durationSeconds: null,
    };
    const actions = actionFor(item.id);
    const failedVariant = item.status === 'failed' || item.status === 'cancelled';
    const mapped = mapUploadError(item.error ?? null, item.status);
    const chosenProviderName = providerNameFor(item.providerId);
    return (
      <UploadRow
        key={item.id}
        variant={uploadVariantFor(item.status)}
        item={item}
        providerName={chosenProviderName}
        providerMeta={providerMetaById.get(item.providerId)}
        title={ctx.title}
        fileName={ctx.fileName}
        stamp={formatRowStamp(item.finishedAt ?? item.createdAt)}
        stampFull={item.createdAt}
        durationSeconds={ctx.durationSeconds}
        creatorAvatarUrl={ctx.avatarUrl}
        thumbPath={ctx.thumbPath}
        selectable
        selected={selectedIds.has(item.id)}
        onToggleSelect={() => toggleSelect(item.id)}
        onFilterProvider={(providerId) => {
          patchFilters({ providers: [providerId] });
          clearSelection();
        }}
        onPause={actions.pause}
        onResume={actions.resume}
        onCancel={actions.cancel}
        onRetry={failedVariant && mapped.retryable ? actions.retry : undefined}
        retryTooltip={
          mapped.missingFile
            ? 'The source file no longer exists on disk — retrying cannot recover it. Remove the entry instead.'
            : 'The host rejected this upload. Finish its setup in Settings → Cloud Storage first.'
        }
        onRemove={actions.remove}
        onCopyLink={(link) => {
          void navigator.clipboard.writeText(link).then(() => {
            pushToast({ title: 'Link copied', message: link, level: 'info' });
          });
        }}
        onOpenLink={(link) => void window.desktop.app.openUrl(link)}
        onShowInFolder={() => void window.desktop.library.revealInExplorer(item.sourcePath)}
      />
    );
  };

  return (
    <PageContainer className={selectedIds.size > 0 ? 'pb-28' : undefined}>
      <SectionHeader
        title="Uploads"
        description="Push recordings to cloud storage hosts — copy the link, share, done."
        actions={
          <Button
            size="sm"
            onClick={() => pickAndAdd.mutate()}
            disabled={pickAndAdd.isPending || addFiles.isPending || !selectedIsUsable}
          >
            <CloudUpload size={14} /> Upload File
          </Button>
        }
      />

      {/* Opens in the system's default browser — fails silently when offline. */}
      <button
        type="button"
        onClick={() => void window.desktop.app.openUrl(FEATURE_URLS.automation)}
        className="-mt-4 inline-flex w-fit items-center gap-1.5 text-xs text-foreground-muted transition-colors hover:text-foreground-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        Automate uploads with Post-Recording Automation
        <ExternalLink size={12} aria-hidden="true" />
      </button>

      {isError && <p className="text-sm text-error">Failed to load uploads — the list will retry automatically.</p>}

      {/* Destination picker + provider info card */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-76 min-w-[260px]">
            <span className="mb-1.5 block text-xs font-medium text-foreground-secondary">Upload to</span>
            <ProviderPicker
              options={allProviders}
              value={selectedProvider}
              onChange={setSelectedProvider}
              onSetup={openCloudStorageUrl}
              disabled={providerMeta === undefined || providers === undefined}
            />
          </div>
          {availableProviders.length === 0 && (
            <p className="flex items-center gap-2 pb-1 text-xs text-warning">
              No upload host is set up yet. Go to Settings → Cloud Storage to connect one.
              <Button variant="ghost" size="sm" onClick={openCloudStorageUrl}>
                Set up
              </Button>
            </p>
          )}
        </div>

        {selectedMeta !== undefined && <ProviderInfoCard meta={selectedMeta} />}
      </div>

      {/* Summary strip — clickable filters */}
      <UploadsSummaryStrip
        uploading={counts.uploading}
        completed={counts.completed}
        failed={counts.failed}
        uploadedBytes={totalUploadedBytes}
        filterTab={filters.tab}
        onFilterTab={(tab) => patchFilters({ tab })}
      />

      {/* Toolbar (scrolls with the page; full-bleed via -mx-6) */}
      <UploadsToolbar
        filters={filters}
        onChange={patchFilters}
        onReset={resetFilters}
        activeFilterCount={activeFilterCount}
        resultCount={filteredVisible.length}
        totalCount={counts.all}
        counts={counts}
        providerOptions={providerOptions}
        selectAll={
          selectableRows.length > 0
            ? {
                checked: selectAllChecked,
                indeterminate: selectAllIndeterminate,
                onChange: toggleSelectAll,
                label: 'Select all uploads in view',
              }
            : undefined
        }
        pageMenuItems={clearHistoryItems}
      />

      {/* Drop zone — compact once the list below has rows */}
      <UploadDropzone
        compact={filteredVisible.length > 0}
        disabled={!selectedIsUsable || pickAndAdd.isPending || addFiles.isPending}
        onBrowse={() => pickAndAdd.mutate()}
        onChooseFromRecordings={() => setChooseDialogOpen(true)}
        onSetup={openCloudStorageUrl}
        onFiles={(paths) => addFiles.mutate(paths)}
      />

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-[72px] w-full rounded-md" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[64px] w-full rounded-md" />
            ))}
          </div>
        </div>
      )}

      {/* Empty states — per filter + no-match */}
      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={CloudUpload}
          title="No uploads yet"
          description="Drop a recording above, pick one from your recordings, or use Upload File — the completed link lands here to copy."
        />
      )}

      {!isLoading && items.length > 0 && bucketIsEmpty(filters.tab) && (
        <EmptyState
          icon={CloudUpload}
          title={
            filters.tab === 'uploading'
              ? 'Nothing uploading right now'
              : filters.tab === 'completed'
                ? 'No completed uploads'
                : 'No failed uploads'
          }
          description={
            filters.tab === 'uploading'
              ? 'Queued files will appear here as soon as a host accepts them.'
              : filters.tab === 'completed'
                ? 'Finished uploads with share links will appear here.'
                : 'Everything came through — nothing needs attention.'
          }
        />
      )}

      {!isLoading && !bucketIsEmpty(filters.tab) && filteredVisible.length === 0 && (
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

      {/* Day-grouped list (headers scroll with the page) */}
      {!isLoading && dayBuckets.length > 0 && (
        <div className="space-y-5">
          {dayBuckets.map((bucket) => (
            <UploadDayGroup key={bucket.day.key} label={bucket.day.label} count={bucket.entries.length}>
              {bucket.entries.map((item) => renderRow(item))}
            </UploadDayGroup>
          ))}
        </div>
      )}

      {/* Pagination — shared Previous / Page x of y / Next bar */}
      {!isLoading && (
        <Pagination
          page={safePage}
          pageCount={totalPages}
          onPageChange={setPage}
          total={totalVisible}
          noun="uploads"
        />
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 shadow-md">
          <span className="text-xs font-semibold tabular-nums text-foreground">{selectedIds.size} selected</span>
          {selectedCompletedWithLinks.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => copyAllLinks(selectedCompletedWithLinks, 'Bulk selection.')}>
              <Copy size={13} /> Copy links
            </Button>
          )}
          {selectedRetryable.length > 0 && (
            <Button variant="ghost" size="sm" loading={bulkRetry.isPending} onClick={() => void bulkRetry.mutateAsync(selectedRetryable.map((i) => i.id))}>
              Retry {selectedRetryable.length}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-error hover:bg-error/10 hover:text-error"
            onClick={() => void bulkRemove.mutateAsync([...selectedIds])}
          >
            <Trash2 size={13} /> Remove
          </Button>
          <Button variant="ghost" size="icon" onClick={clearSelection} aria-label="Clear selection">
            <X size={13} />
          </Button>
        </div>
      )}

      {/* Choose from Recordings */}
      <ChooseFromRecordingsDialog
        open={chooseDialogOpen}
        onOpenChange={setChooseDialogOpen}
        jobs={completedRecordings}
        providerName={selectedMeta?.name ?? 'your upload host'}
        onQueue={(chosen) => void queueFromRecordings.mutate(chosen)}
        queuePending={queueFromRecordings.isPending}
      />

      {/* Clear completed — with pre-clear link tools */}
      <Dialog open={clearDialog === 'completed'} onOpenChange={(v) => { if (!v) setClearDialog(null); }}>
        <DialogContent
          title="Clear completed uploads?"
          description={`${counts.completed} completed upload${counts.completed === 1 ? '' : 's'} will be removed from this list.`}
        >
          <p className="text-sm text-foreground-secondary">
            This removes entries from this list. Uploaded files stay on the host.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => copyAllLinks(completedItems, 'You can paste these anywhere, then clear.')}>
              <Copy size={12} /> Copy all links
            </Button>
            <Button variant="secondary" size="sm" onClick={() => exportLinksCsv(completedItems)}>
              <Upload size={12} /> Export links (CSV)
            </Button>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setClearDialog(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => beginClear('completed')}>
              Clear {counts.completed}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear failed */}
      <Dialog open={clearDialog === 'failed'} onOpenChange={(v) => { if (!v) setClearDialog(null); }}>
        <DialogContent
          title="Clear failed uploads?"
          description={`${counts.failed} failed ${counts.failed === 1 ? 'entry' : 'entries'} will be removed from this list.`}
        >
          <p className="text-sm text-foreground-secondary">
            This removes entries from this list. Uploaded files stay on the host.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setClearDialog(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => beginClear('failed')}>
              Clear {counts.failed}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

/* --- local helpers ---------------------------------------------------------------- */

/** Creator match purely from the file name prefix (no recording row). */
function parseCreatorFallback(
  parsedTitle: string,
  creatorByTitle: Map<string, CreatorDto>,
): CreatorDto | null {
  return creatorByTitle.get(parsedTitle.toLowerCase()) ?? null;
}

