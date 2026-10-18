import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Info, Plus, Star, Tags, Trash2, Upload, Users, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CreatorDto, MonitoringJobDto, RecordingJobDto } from '@rekordly/shared';
import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  PageContainer,
  SectionHeader,
  Skeleton,
} from '@rekordly/ui';
import { useToastStore } from '../../stores/toast-store';
import { CreatorCard, type CreatorCardStatus } from './creator-card';
import { FilterBar, type PlatformFilterInfo, type StatusChipInfo, type TagFilterInfo } from './filter-bar';
import { activeFilterCount, loadFilters, saveFilters, type CreatorsFilterState } from './filter-model';
import { friendlyErrorMessage } from '../../lib/errors';
import { AddCreatorDialog, DeleteCreatorDialog, EditCreatorDialog, ImportDialog, RecordDialog } from './dialogs';
import { CreatorDetailsDialog } from './details-dialog';
import { usePaged, Pagination } from '../../components/pagination';
import { BulkTagDialog, CollectionsDialog, TagsDialog } from './tag-dialogs';

const PAGE_SIZE = 20;

/** ponytail: same "active" set the toolbar counts — recording, queued or
 * preparing jobs all mean this creator is currently being recorded. */
const ACTIVE_RECORDING_STATUSES = ['recording', 'queued', 'preparing'];

/** Section header above the card grid ("Live now (N)" / "Offline / Monitored (N)"). */
function CardSection({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: 'live' | 'muted';
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5" aria-label={`${title} — ${count}`}>
      <div className="flex items-center gap-2">
        {tone === 'live' ? (
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-foreground-disabled" aria-hidden="true" />
        )}
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        <span
          className={`rounded-sm px-1.5 py-0.5 text-xs font-semibold leading-none tabular-nums ${
            tone === 'live' ? 'bg-success/15 text-success' : 'bg-elevated text-foreground-muted'
          }`}
        >
          {count}
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      {children}
    </section>
  );
}

export function CreatorsPage() {
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();

  const { data: creators, isLoading, isError } = useQuery({
    queryKey: ['creators'],
    queryFn: () => window.desktop.creators.list(),
  });

  const { data: monitoringJobs, refetch: refetchJobs } = useQuery({
    queryKey: ['monitoring-jobs'],
    queryFn: () => window.desktop.monitoring.getJobs(),
    refetchInterval: 30_000,
  });

  // ponytail: recording jobs drive the REC badge + "Recording" filter chip;
  // shares the toolbar's query key so the cache stays consistent.
  const { data: recordingJobs } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
    refetchInterval: 3000,
  });

  // Refetch immediately on monitoring events (live/offline changes)
  useEffect(() => {
    return window.desktop.monitoring.onEvent((event) => {
      if (event.type === 'creator-live' || event.type === 'creator-offline') {
        void refetchJobs();
      }
    });
  }, [refetchJobs]);

  // ponytail: PROFILE PHOTOS — the main process backfills missing/stale
  // avatars after checks and live transitions (`creator-checked` /
  // `creator-live`). Refresh the list throttled (at most every 60s) so new
  // profile photos appear without a manual refresh.
  const lastAvatarRefreshAt = useRef(0);
  useEffect(() => {
    return window.desktop.monitoring.onEvent((event) => {
      if (event.type !== 'creator-checked' && event.type !== 'creator-live') return;
      const now = Date.now();
      if (now - lastAvatarRefreshAt.current < 60_000) return;
      lastAvatarRefreshAt.current = now;
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
    });
  }, [queryClient]);

  // ponytail: a completed/finalized recording matures "Last live …" instantly
  // and drops the card's REC badge state.
  useEffect(() => {
    return window.desktop.recording.onEvent((event) => {
      if (event.type === 'recording-completed' || event.type === 'recording-finalized') {
        void queryClient.invalidateQueries({ queryKey: ['creators-last-live'] });
        void queryClient.invalidateQueries({ queryKey: ['recording-jobs'] });
      }
    });
  }, [queryClient]);

  const { data: plugins } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
  });

  const { data: tags } = useQuery({
    queryKey: ['creator-tags'],
    queryFn: () => window.desktop.creators.getTags(),
  });

  const { data: tagAssignments } = useQuery({
    queryKey: ['creator-tag-assignments'],
    queryFn: () => window.desktop.creators.getAllTagAssignments(),
  });

  // ponytail: first-time auto-record enable shows a one-time storage warning.
  const { data: appSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
  });

  // --- Filter state (persisted) ---------------------------------------------
  const [filters, setFilters] = useState<CreatorsFilterState>(loadFilters);
  const patchFilters = (patch: Partial<CreatorsFilterState>): void =>
    setFilters((prev) => ({ ...prev, ...patch }));
  const resetFilters = (): void =>
    setFilters((prev) => ({ ...prev, search: '', platforms: [], tagIds: [], status: 'all' }));

  useEffect(() => {
    saveFilters(filters);
  }, [filters]);

  // ponytail: "/" focuses the creator search from anywhere on the page.
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (event.key === '/' && !typing) {
        event.preventDefault();
        document.getElementById('creators-search-input')?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // --- Live-status lookup ----------------------------------------------------
  const liveJobFor = (creator: CreatorDto): MonitoringJobDto | undefined => {
    const monitorId = `${creator.pluginId}:${creator.externalId}`;
    return monitoringJobs?.find((j) => j.creatorId === monitorId);
  };

  // ponytail: recording_jobs.creator_id is the DB creator id (a uuid) on
  // every start path — join by creator.id, exactly like the dashboard's
  // active-recording lookup does.
  const recordingJobFor = (creator: CreatorDto): RecordingJobDto | undefined => {
    return recordingJobs?.find(
      (j) => j.creatorId === creator.id && ACTIVE_RECORDING_STATUSES.includes(j.status),
    );
  };

  /** Card state — recording outranks live; everything else is offline. */
  const statusFor = (creator: CreatorDto): CreatorCardStatus => {
    if (recordingJobFor(creator) !== undefined) return 'recording';
    if (liveJobFor(creator)?.state === 'live') return 'live';
    return 'offline';
  };

  // --- Counts + filter option sources ---------------------------------------
  const counts = useMemo(() => {
    let live = 0;
    let recording = 0;
    let issues = 0;
    let favorites = 0;
    let autoRecord = 0;
    for (const creator of creators ?? []) {
      if (recordingJobFor(creator) !== undefined) recording++;
      const state = liveJobFor(creator)?.state;
      if (state === 'live') live++;
      if (state === 'failed' || state === 'paused' || state === 'retrying') issues++;
      if (creator.isFavorite) favorites++;
      if (creator.autoRecord) autoRecord++;
    }
    const total = creators?.length ?? 0;
    return { live, recording, issues, favorites, autoRecord, offline: total - live, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creators, monitoringJobs, recordingJobs]);

  const platforms: PlatformFilterInfo[] = useMemo(() => {
    const names = new Map((plugins ?? []).map((p) => [p.id, p.name]));
    const acc = new Map<string, { count: number; liveCount: number }>();
    for (const creator of creators ?? []) {
      const entry = acc.get(creator.pluginId) ?? { count: 0, liveCount: 0 };
      entry.count++;
      if (liveJobFor(creator)?.state === 'live') entry.liveCount++;
      acc.set(creator.pluginId, entry);
    }
    return [...acc.entries()]
      .map(([pluginId, info]) => ({ pluginId, name: names.get(pluginId) ?? pluginId, ...info }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creators, plugins, monitoringJobs]);

  const tagInfos: TagFilterInfo[] = useMemo(() => {
    const assignments = tagAssignments ?? {};
    return (tags ?? []).map((tag) => ({
      ...tag,
      count: Object.values(assignments).filter((list) => list.some((t) => t.id === tag.id)).length,
    }));
  }, [tags, tagAssignments]);

  const statusChips: StatusChipInfo[] = [
    { key: 'all', label: 'All', count: counts.total },
    { key: 'live', label: 'Live', count: counts.live },
    { key: 'offline', label: 'Offline', count: counts.offline },
    { key: 'recording', label: 'Recording', count: counts.recording },
    { key: 'favorites', label: 'Favorites', count: counts.favorites },
  ];

  // --- "Last live" timestamps ------------------------------------------------
  // ponytail: no persisted last-live timestamp exists upstream, but recordings
  // only ever start while a creator is live — so the library aggregate
  // (stats.lastRecordedAt) is a faithful "last seen live" signal, fetched in
  // one batch keyed to the creator list.
  const { data: lastLiveById } = useQuery({
    queryKey: ['creators-last-live'],
    queryFn: async (): Promise<Record<string, number>> => {
      const list = creators ?? [];
      if (list.length === 0) return {};
      const settled = await Promise.allSettled(list.map((c) => window.desktop.creators.stats(c.id)));
      const map: Record<string, number> = {};
      settled.forEach((result, index) => {
        const creator = list[index];
        if (result.status === 'fulfilled' && creator !== undefined && result.value.lastRecordedAt) {
          map[creator.id] = new Date(result.value.lastRecordedAt).getTime();
        }
      });
      return map;
    },
    enabled: creators !== undefined,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // --- Filtering + sorting ---------------------------------------------------
  const filtered = useMemo(() => {
    let result = creators ?? [];
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q),
      );
    }
    if (filters.platforms.length > 0) {
      result = result.filter((c) => filters.platforms.includes(c.pluginId));
    }
    if (filters.tagIds.length > 0) {
      result = result.filter((c) => {
        const creatorTags = tagAssignments?.[c.id] ?? [];
        return filters.tagIds.some((tagId) => creatorTags.some((t) => t.id === tagId));
      });
    }
    result = result.filter((c) => {
      const state = liveJobFor(c)?.state;
      switch (filters.status) {
        case 'live':
          return state === 'live';
        case 'recording':
          return recordingJobFor(c) !== undefined;
        case 'issues':
          return state === 'failed' || state === 'paused' || state === 'retrying';
        case 'favorites':
          return c.isFavorite;
        case 'autoRecord':
          return c.autoRecord;
        case 'offline':
          return state !== 'live' && state !== 'failed' && state !== 'paused' && state !== 'retrying';
        case 'all':
        default:
          return true;
      }
    });
    result = [...result];
    result.sort((a, b) => {
      switch (filters.sortField) {
        case 'liveFirst': {
          // Sections handle the live/offline split visually; inside a section
          // (and for hidden "issues"/"recording" stragglers) sort by name.
          const aTier = statusFor(a) === 'offline' ? 1 : 0;
          const bTier = statusFor(b) === 'offline' ? 1 : 0;
          if (aTier !== bTier) return aTier - bTier;
          return a.displayName.localeCompare(b.displayName);
        }
        case 'lastLive': {
          const aTime = lastLiveById?.[a.id] ?? Number.NEGATIVE_INFINITY;
          const bTime = lastLiveById?.[b.id] ?? Number.NEGATIVE_INFINITY;
          if (aTime !== bTime) return bTime - aTime; // most recent first
          return a.displayName.localeCompare(b.displayName);
        }
        default: {
          const cmp = a.displayName.localeCompare(b.displayName);
          return filters.sortDir === 'asc' ? cmp : -cmp;
        }
      }
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creators, filters, tagAssignments, monitoringJobs, recordingJobs, lastLiveById]);

  // Shared pagination — resets to page 0 whenever the filter state changes.
  const filterKey = JSON.stringify({ ...filters });
  const { page, setPage, pageCount: totalPages, paged } = usePaged(filtered, PAGE_SIZE, filterKey);

  // ponytail: section split — live/recording cards always float to the top,
  // everything else is grouped under "Offline / Monitored" below.
  const liveNow: CreatorDto[] = [];
  const offlineRows: CreatorDto[] = [];
  for (const creator of paged) {
    (statusFor(creator) === 'offline' ? offlineRows : liveNow).push(creator);
  }

  const renderCard = (creator: CreatorDto) => (
    <CreatorCard
      key={creator.id}
      creator={creator}
      status={statusFor(creator)}
      platformId={creator.pluginId}
      platformName={pluginNameFor(creator.pluginId)}
      avatarUrl={creator.avatarUrl}
      viewers={liveJobFor(creator)?.lastResult?.viewerCount}
      lastLiveAt={lastLiveById?.[creator.id] ?? null}
      isFavorite={creator.isFavorite}
      recordingStartedAt={recordingJobFor(creator)?.startedAt ?? null}
      job={liveJobFor(creator)}
      tags={tagAssignments?.[creator.id] ?? []}
      allTags={tags ?? []}
      selected={selectedIds.has(creator.id)}
      view={filters.view}
      onToggleFavorite={setFavorite}
      onToggleAutoRecord={requestAutoRecord}
      onDetails={setDetailsCreator}
      onRecord={setRecordCreator}
      onEdit={setEditCreator}
      onDelete={setDeleteCreator}
      onPauseMonitoring={pauseMonitoring}
      onFilterPlatform={(pluginId) => patchFilters({ platforms: [pluginId], status: 'all' })}
      onAssignTag={assignTag}
      onRemoveTag={removeTag}
      onToggleSelect={toggleSelect}
    />
  );

  const cardGridClass =
    filters.view === 'grid'
      ? // ponytail: auto-fill keeps cards whole at any window width — no
        // squeezed or overflowing last column.
        'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]'
      : 'flex flex-col gap-1.5';
  // --- Bulk selection --------------------------------------------------------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (creatorId: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(creatorId)) next.delete(creatorId);
      else next.add(creatorId);
      return next;
    });
  };
  const clearSelection = (): void => setSelectedIds(new Set());
  const selectAllFiltered = (): void =>
    setSelectedIds(new Set(filtered.map((c) => c.id)));

  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const invalidateCreators = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['creators'] });
    void queryClient.invalidateQueries({ queryKey: ['creator-tag-assignments'] });
    // ponytail: a finished recording changes a creator's "last seen live".
    void queryClient.invalidateQueries({ queryKey: ['creators-last-live'] });
  };

  const bulkFavorite = useMutation({
    mutationFn: () => window.desktop.creators.bulkFavorite([...selectedIds], true),
    onSuccess: () => {
      invalidateCreators();
      pushToast({ level: 'info', title: 'Favorites updated', message: `${selectedIds.size} creators favorited.` });
      clearSelection();
    },
  });

  const bulkAutoRecord = useMutation({
    mutationFn: (enabled: boolean) => window.desktop.creators.bulkSetAutoRecord([...selectedIds], enabled),
    onSuccess: (_data, enabled) => {
      invalidateCreators();
      pushToast({
        level: 'info',
        title: 'Auto-record updated',
        message: `Auto-record ${enabled ? 'enabled' : 'disabled'} for ${selectedIds.size} creators.`,
      });
      clearSelection();
    },
    onError: (error) => {
      pushToast({
        level: 'warn',
        title: 'Could not enable auto-record',
        message: friendlyErrorMessage(error, 'Something went wrong — please try again.'),
      });
    },
  });

  const bulkRemove = useMutation({
    mutationFn: () => window.desktop.creators.bulkRemove([...selectedIds]),
    onSuccess: () => {
      invalidateCreators();
      pushToast({ level: 'info', title: 'Creators deleted', message: `${selectedIds.size} creators removed.` });
      clearSelection();
      setBulkDeleteOpen(false);
    },
  });

  // --- Single-creator mutations ----------------------------------------------
  const setFavorite = (creator: CreatorDto): void => {
    void window.desktop.creators.setFavorite(creator.id, !creator.isFavorite);
    void queryClient.invalidateQueries({ queryKey: ['creators'] });
  };

  const assignTag = (creator: CreatorDto, tagId: string): void => {
    void window.desktop.creators.addTag(creator.id, tagId);
    void queryClient.invalidateQueries({ queryKey: ['creator-tag-assignments'] });
    void queryClient.invalidateQueries({ queryKey: ['creators'] });
  };

  const removeTag = (creator: CreatorDto, tagId: string): void => {
    void window.desktop.creators.removeTagFromCreator(creator.id, tagId);
    void queryClient.invalidateQueries({ queryKey: ['creator-tag-assignments'] });
  };

  // --- Pause / resume monitoring (… menu + context menu) -----------------------
  const pauseMonitoring = (creator: CreatorDto): void => {
    const monitorId = `${creator.pluginId}:${creator.externalId}`;
    const isPaused = liveJobFor(creator)?.state === 'paused';
    const action = isPaused
      ? window.desktop.monitoring.resume(monitorId)
      : window.desktop.monitoring.pause(monitorId);
    void action
      .then(() => {
        pushToast({
          level: 'info',
          title: isPaused ? 'Monitoring resumed' : 'Monitoring paused',
          message: isPaused
            ? `${creator.displayName} is checked for live status again.`
            : `${creator.displayName} will not be checked until you resume monitoring.`,
        });
      })
      .catch((error: unknown) => {
        pushToast({
          level: 'warn',
          title: 'Could not update monitoring',
          message: friendlyErrorMessage(error, 'Something went wrong — please try again.'),
        });
      });
    void queryClient.invalidateQueries({ queryKey: ['monitoring-jobs'] });
  };

  // --- Auto-record flow (one-time storage warning) ----------------------------
  interface AutoRecordWarning {
    label: string;
    quality: string;
    onConfirm: () => void;
  }
  const [warning, setWarning] = useState<AutoRecordWarning | null>(null);

  const confirmAutoRecord = (label: string, quality: string, onConfirm: () => void): void => {
    if (appSettings?.autoRecordWarningAcknowledged) {
      onConfirm();
      invalidateCreators();
      return;
    }
    setWarning({ label, quality, onConfirm });
  };

  const requestAutoRecord = (creator: CreatorDto): void => {
    // ponytail: disabling never needs the storage warning - only arming does.
    if (creator.autoRecord) {
      void window.desktop.creators.setAutoRecord(creator.id, false);
      invalidateCreators();
      return;
    }
    confirmAutoRecord(creator.displayName, creator.autoRecordQuality ?? 'best', () => {
      window.desktop.creators.setAutoRecord(creator.id, true).catch((error: unknown) => {
        pushToast({
          level: 'warn',
          title: 'Could not enable auto-record',
          message: friendlyErrorMessage(error, 'Something went wrong — please try again.'),
        });
      });
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    });
  };

  const requestBulkAutoRecord = (): void => {
    confirmAutoRecord(
      `${selectedIds.size} selected creators`,
      'best',
      () => bulkAutoRecord.mutate(true),
    );
  };

  // --- Dialog state ------------------------------------------------------------
  const [addOpen, setAddOpen] = useState(false);
  const [editCreator, setEditCreator] = useState<CreatorDto | null>(null);
  const [deleteCreator, setDeleteCreator] = useState<CreatorDto | null>(null);
  const [detailsCreator, setDetailsCreator] = useState<CreatorDto | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [recordCreator, setRecordCreator] = useState<CreatorDto | null>(null);

  const exportJson = useMutation({
    mutationFn: () => window.desktop.creators.exportJson(),
    onSuccess: (data) => {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'creators.json';
      a.click();
      URL.revokeObjectURL(url);
      pushToast({ level: 'info', title: 'Exported creators', message: 'JSON file downloaded.' });
    },
  });

  const pluginNameFor = (pluginId: string): string =>
    platforms.find((p) => p.pluginId === pluginId)?.name ?? pluginId;

  return (
    <PageContainer
      // ponytail: keep room below the last card so the grid never looks cut
      // off at the scroll edge (extra when the bulk toolbar overlays it).
      className={selectedIds.size > 0 ? 'pb-28' : 'pb-12'}
    >
      <SectionHeader
        title="Creators"
        description="Manage the creators you monitor."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setTagsOpen(true)}>
              <Tags size={14} /> Tags
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCollectionsOpen(true)}>
              Collections
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Upload size={14} /> Import
            </Button>
            <Button variant="secondary" size="sm" loading={exportJson.isPending} onClick={() => exportJson.mutate()}>
              <Download size={14} /> Export
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> Add Creator
            </Button>
          </div>
        }
      />

      <FilterBar
        filters={filters}
        onChange={patchFilters}
        onReset={resetFilters}
        activeCount={activeFilterCount(filters)}
        resultCount={filtered.length}
        totalCount={counts.total}
        platforms={platforms}
        tags={tagInfos}
        statusChips={statusChips}
      />

      {isError && (
        <p className="text-sm text-error">Failed to load creators.</p>
      )}

      {isLoading && (
        <div className={cardGridClass}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className={i % 3 === 0 ? 'h-44' : 'h-36'} />
          ))}
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState
          icon={Users}
          title="No creators found"
          description={
            activeFilterCount(filters) > 0
              ? 'No creators match the current filters — try clearing them.'
              : counts.total > 0
                ? 'All creators are hidden by the active filters.'
                : 'Add a creator to start monitoring.'
          }
          action={
            activeFilterCount(filters) > 0 ? (
              <Button variant="secondary" onClick={resetFilters}>
                <X size={14} /> Clear filters
              </Button>
            ) : (
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={14} /> Add Creator
              </Button>
            )
          }
        />
      )}

      {!isLoading && !isError && paged.length > 0 && (
        <>
          <div className="space-y-6">
            {liveNow.length > 0 && (
              <CardSection title="Live now" count={liveNow.length} tone="live">
                <div className={cardGridClass}>{liveNow.map((creator) => renderCard(creator))}</div>
              </CardSection>
            )}
            {offlineRows.length > 0 && (
              <CardSection title="Offline / Monitored" count={offlineRows.length} tone="muted">
                <div className={cardGridClass}>{offlineRows.map((creator) => renderCard(creator))}</div>
              </CardSection>
            )}
          </div>
          <Pagination page={page} pageCount={totalPages} onPageChange={setPage} total={filtered.length} noun="creators" />
        </>
      )}

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 shadow-md">
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {selectedIds.size} selected
          </span>
          {selectedIds.size < filtered.length && (
            <Button variant="ghost" size="sm" onClick={selectAllFiltered}>
              Select all {filtered.length}
            </Button>
          )}
          <div className="mx-1 h-5 w-px bg-border" />
          <Button variant="ghost" size="sm" onClick={() => bulkFavorite.mutate()}>
            <Star size={13} /> Favorite
          </Button>
          <Button variant="ghost" size="sm" onClick={requestBulkAutoRecord}>
            <Zap size={13} /> Auto-record on
          </Button>
          <Button variant="ghost" size="sm" onClick={() => bulkAutoRecord.mutate(false)}>
            <Zap size={13} /> Off
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setBulkTagOpen(true)}>
            <Tags size={13} /> Tag
          </Button>
          <Button variant="ghost" size="sm" className="text-error hover:bg-error/10" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 size={13} /> Delete
          </Button>
          <Button variant="ghost" size="icon" onClick={clearSelection} aria-label="Clear selection">
            <X size={13} />
          </Button>
        </div>
      )}

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent
          title="Delete creators"
          description={`Remove ${selectedIds.size} selected creators?`}
        >
          <p className="text-sm text-foreground-muted">
            Monitoring stops for every selected creator. This action cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={bulkRemove.isPending} onClick={() => bulkRemove.mutate()}>
              Delete {selectedIds.size}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk tag picker */}
      <BulkTagDialog
        open={bulkTagOpen}
        onOpenChange={setBulkTagOpen}
        ids={[...selectedIds]}
        count={selectedIds.size}
      />

      <AddCreatorDialog open={addOpen} onOpenChange={setAddOpen} />
      {/* ponytail: one-time storage warning before the first auto-record arm */}
      <Dialog open={warning !== null} onOpenChange={(v) => { if (!v) setWarning(null); }}>
        <DialogContent
          title="Enable auto-record?"
          description={`Every time ${warning?.label ?? 'this creator'} goes live, Rekordly starts recording automatically.`}
        >
          <div className="space-y-4">
            <div className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning">
                <Info size={12} /> Storage notice
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-foreground-secondary">
                <li>
                  Livestreams consume roughly{' '}
                  <span className="font-medium text-foreground">
                    {warning?.quality === '480p'
                      ? '≈0.5 GB/hour'
                      : warning?.quality === '720p'
                        ? '≈1 GB/hour'
                        : '2–3 GB/hour'}
                  </span>{' '}
                  at this quality (change it any time via Edit → Auto-record quality).
                </li>
                <li>
                  Recordings are split into{' '}
                  <span className="font-medium text-foreground">
                    {(appSettings?.autoRecordSegmentMinutes ?? 30) > 0
                      ? `${appSettings?.autoRecordSegmentMinutes}-minute parts`
                      : 'a single file'}
                  </span>{' '}
                  and continue until the stream ends, even if you are away.
                </li>
                <li>You can set a free-disk limit in Settings → Recording; auto-record pauses below it.</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setWarning(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setWarning(null);
                  void window.desktop.settings.set({
                    ...(appSettings as NonNullable<typeof appSettings>),
                    autoRecordWarningAcknowledged: true,
                  });
                  void queryClient.invalidateQueries({ queryKey: ['settings'] });
                  warning?.onConfirm();
                }}
              >
                <Zap size={14} /> Enable auto-record
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {editCreator && (
        <EditCreatorDialog creator={editCreator} open onOpenChange={() => setEditCreator(null)} />
      )}
      {deleteCreator && (
        <DeleteCreatorDialog creator={deleteCreator} open onOpenChange={() => setDeleteCreator(null)} />
      )}
      {detailsCreator && (
        <CreatorDetailsDialog creator={detailsCreator} open onOpenChange={() => setDetailsCreator(null)} />
      )}
      <TagsDialog open={tagsOpen} onOpenChange={setTagsOpen} />
      <CollectionsDialog open={collectionsOpen} onOpenChange={setCollectionsOpen} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      {recordCreator && (
        <RecordDialog creator={recordCreator} open onOpenChange={() => setRecordCreator(null)} />
      )}
    </PageContainer>
  );
}
