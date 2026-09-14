import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Info, Plus, Star, Tags, Trash2, Upload, Users, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CreatorDto, MonitoringJobDto } from '@rekordly/shared';
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
import { CreatorCard } from './creator-card';
import { FilterBar, type PlatformFilterInfo, type StatusChipInfo, type TagFilterInfo } from './filter-bar';
import { activeFilterCount, loadFilters, saveFilters, type CreatorsFilterState } from './filter-model';
import { friendlyErrorMessage } from '../../lib/errors';
import { AddCreatorDialog, DeleteCreatorDialog, EditCreatorDialog, ImportDialog, RecordDialog } from './dialogs';
import { CreatorDetailsDialog } from './details-dialog';
import { BulkTagDialog, CollectionsDialog, TagsDialog } from './tag-dialogs';

const PAGE_SIZE = 20;

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

  // Refetch immediately on monitoring events (live/offline changes)
  useEffect(() => {
    return window.desktop.monitoring.onEvent((event) => {
      if (event.type === 'creator-live' || event.type === 'creator-offline') {
        void refetchJobs();
      }
    });
  }, [refetchJobs]);

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

  // --- Counts + filter option sources ---------------------------------------
  const counts = useMemo(() => {
    let live = 0;
    let issues = 0;
    let favorites = 0;
    let autoRecord = 0;
    for (const creator of creators ?? []) {
      const state = liveJobFor(creator)?.state;
      if (state === 'live') live++;
      if (state === 'failed' || state === 'paused' || state === 'retrying') issues++;
      if (creator.isFavorite) favorites++;
      if (creator.autoRecord) autoRecord++;
    }
    const total = creators?.length ?? 0;
    return { live, issues, favorites, autoRecord, offline: total - live, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creators, monitoringJobs]);

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
    { key: 'favorites', label: 'Favorites', count: counts.favorites },
    { key: 'autoRecord', label: 'Auto-record', count: counts.autoRecord },
    { key: 'issues', label: 'Issues', count: counts.issues },
  ];

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
      const aVal = (a[filters.sortField] ?? '').toString();
      const bVal = (b[filters.sortField] ?? '').toString();
      const cmp = aVal.localeCompare(bVal);
      return filters.sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creators, filters, tagAssignments, monitoringJobs]);

  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const filterKey = JSON.stringify({ ...filters });
  useEffect(() => {
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

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
      // Pro tier gate: bulk enable past the free-tier limit.
      pushToast({
        level: 'warn',
        title: 'Auto-record limit reached',
        message: friendlyErrorMessage(error, 'Could not enable auto-record.'),
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
        // Pro tier gate: the free tier allows auto-record on a limited
        // number of creators — surface the friendly upgrade nudge.
        pushToast({
          level: 'warn',
          title: 'Auto-record limit reached',
          message: friendlyErrorMessage(error, 'Could not enable auto-record.'),
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
    <PageContainer>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
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
          <div
            className={
              filters.view === 'grid'
                ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
                : 'flex flex-col gap-1.5'
            }
          >
            {paged.map((creator) => (
              <CreatorCard
                key={creator.id}
                creator={creator}
                job={liveJobFor(creator)}
                tags={tagAssignments?.[creator.id] ?? []}
                allTags={tags ?? []}
                platformName={pluginNameFor(creator.pluginId)}
                selected={selectedIds.has(creator.id)}
                view={filters.view}
                onToggleFavorite={setFavorite}
                onToggleAutoRecord={requestAutoRecord}
                onDetails={setDetailsCreator}
                onRecord={setRecordCreator}
                onEdit={setEditCreator}
                onDelete={setDeleteCreator}
                onFilterPlatform={(pluginId) => patchFilters({ platforms: [pluginId], status: 'all' })}
                onAssignTag={assignTag}
                onRemoveTag={removeTag}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-xs tabular-nums text-foreground-muted">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
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
