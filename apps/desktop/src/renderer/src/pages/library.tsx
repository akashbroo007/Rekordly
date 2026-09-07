import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FolderOpen,
  Heart,
  LayoutGrid,
  Library,
  List,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Tags,
  Trash2,
  Video,
  X,
  FileText,
  CheckSquare,
  Square,
  GripVertical,
} from 'lucide-react';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  PageContainer,
  SectionHeader,
  Select,
  Skeleton,
  Switch,
  Textarea,
} from '@rekordly/ui';
import type { RecordingDto, DownloadQueueItemDto, LibraryFiltersDto, LibrarySortDto } from '@rekordly/shared/contracts';
import { useToastStore } from '../stores/toast-store';
import { formatBytes, formatDuration } from '@rekordly/shared/format';
import { toMediaUrl, VideoPlayerDialog } from '../components/video-player-dialog';

type ViewMode = 'grid' | 'list' | 'compact' | 'details';
type SortField = 'title' | 'createdAt' | 'startedAt' | 'durationSeconds' | 'sizeBytes' | 'platformId';
type SortDir = 'asc' | 'desc';
/** Top-level library sections: live recordings vs finished generic downloads. */
type LibraryTab = 'recordings' | 'downloads';

const STORAGE_KEY = 'Rekordly:library-view';
const TAB_STORAGE_KEY = 'Rekordly:library-tab';

/** Mirrors DownloadManager.deriveSiteFolder — display only. */
function siteFolderOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const parts = host.split('.').filter((p) => p.length > 0);
    const name = parts.length >= 2 ? parts[parts.length - 2]! : (parts[0] ?? '');
    const safe = name.replace(/[^a-z0-9_-]/g, '').slice(0, 64);
    return safe.length > 0 ? safe : 'misc';
  } catch {
    return 'misc';
  }
}

export function LibraryPage() {
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();

  const [tab, setTab] = useState<LibraryTab>(() => {
    try { return (localStorage.getItem(TAB_STORAGE_KEY) as LibraryTab) || 'recordings'; } catch { return 'recordings'; }
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem(STORAGE_KEY) as ViewMode) || 'grid'; } catch { return 'grid'; }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [filterPluginId, setFilterPluginId] = useState('');
  const [filterResolution, setFilterResolution] = useState('');
  const [filterMinDuration, setFilterMinDuration] = useState('');
  const [filterMaxDuration, setFilterMaxDuration] = useState('');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [detailsRecording, setDetailsRecording] = useState<RecordingDto | null>(null);
  const [playerRecording, setPlayerRecording] = useState<RecordingDto | null>(null);
  const [playerDownload, setPlayerDownload] = useState<DownloadQueueItemDto | null>(null);
  const [editNotes, setEditNotes] = useState<RecordingDto | null>(null);
  const [activeCollection, setActiveCollection] = useState<string>('');
  const pageSize = 50;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, viewMode); } catch { /* noop */ }
  }, [viewMode]);

  useEffect(() => {
    try { localStorage.setItem(TAB_STORAGE_KEY, tab); } catch { /* noop */ }
  }, [tab]);

  // ponytail: numeric filter inputs are minutes — convert to seconds for the API
  const minDurationSec = filterMinDuration.trim() ? Number(filterMinDuration) * 60 : undefined;
  const maxDurationSec = filterMaxDuration.trim() ? Number(filterMaxDuration) * 60 : undefined;

  const filters = useMemo<LibraryFiltersDto>(() => ({
    search: searchQuery || undefined,
    isFavorite: filterFavorites || undefined,
    collectionId: activeCollection || undefined,
    pluginId: filterPluginId || undefined,
    resolution: filterResolution || undefined,
    minDuration: Number.isFinite(minDurationSec) ? minDurationSec : undefined,
    maxDuration: Number.isFinite(maxDurationSec) ? maxDurationSec : undefined,
  }), [searchQuery, filterFavorites, activeCollection, filterPluginId, filterResolution, minDurationSec, maxDurationSec]);

  const sort = useMemo<LibrarySortDto>(() => ({
    field: sortField,
    direction: sortDir,
  }), [sortField, sortDir]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['library', filters, sort, page],
    queryFn: () => window.desktop.library.search(filters, sort, page * pageSize, pageSize),
  });

  const { data: _tags } = useQuery({
    queryKey: ['library-tags'],
    queryFn: () => window.desktop.library.getTags(),
  });

  const { data: collections } = useQuery({
    queryKey: ['library-collections'],
    queryFn: () => window.desktop.library.getCollections(),
  });

  const { data: plugins } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
  });

  const recordings = data?.recordings ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // Map creatorId -> display name so cards can show "Creator · Date" instead
  // of the raw stream title (which is often long/noisy).
  const { data: creators } = useQuery({
    queryKey: ['creators'],
    queryFn: () => window.desktop.creators.list(),
  });
  const creatorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of creators ?? []) map.set(c.id, c.displayName);
    return map;
  }, [creators]);

  useEffect(() => { setPage(0); }, [searchQuery, sortField, sortDir, filterFavorites, activeCollection, filterPluginId, filterResolution, filterMinDuration, filterMaxDuration]);

  const hasActiveFilters =
    filterFavorites || filterPluginId !== '' || filterResolution !== '' ||
    filterMinDuration !== '' || filterMaxDuration !== '' || activeCollection !== '';

  const clearFilters = (): void => {
    setFilterFavorites(false);
    setFilterPluginId('');
    setFilterResolution('');
    setFilterMinDuration('');
    setFilterMaxDuration('');
    setActiveCollection('');
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === recordings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recordings.map((r) => r.id)));
    }
  }, [selectedIds.size, recordings]);

  const toggleFav = useMutation({
    mutationFn: (id: string) => {
      const rec = recordings.find((r) => r.id === id);
      return window.desktop.library.setFavorite(id, !(rec?.isFavorite));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  });

  const bulkFavorite = useMutation({
    mutationFn: () => window.desktop.library.bulkFavorite(Array.from(selectedIds), true),
    onSuccess: () => { setSelectedIds(new Set()); queryClient.invalidateQueries({ queryKey: ['library'] }); },
  });

  const bulkDelete = useMutation({
    mutationFn: () => window.desktop.library.bulkDelete(Array.from(selectedIds)),
    onSuccess: () => {
      setSelectedIds(new Set());
      // ponytail: refresh every view that depends on recordings — the other
      // library tab plus dashboard stats/recent lists.
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['recordings-recent'] });
      pushToast({ level: 'info', title: 'Deleted', message: 'Recordings deleted.' });
    },
  });

  return (
    <PageContainer>
      {/* ponytail: top-level switch between the two library collections —
          each tab keeps its own heading, toolbar and content below. */}
      <div className="flex items-center gap-1">
        <Button variant={tab === 'recordings' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTab('recordings')}>
          <Video size={14} /> Recordings
        </Button>
        <Button variant={tab === 'downloads' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTab('downloads')}>
          <Download size={14} /> Downloads
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-2"
          disabled={isFetching > 0}
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['library'] });
            void queryClient.invalidateQueries({ queryKey: ['downloads'] });
            void queryClient.invalidateQueries({ queryKey: ['library-tags'] });
            void queryClient.invalidateQueries({ queryKey: ['library-collections'] });
          }}
        >
          <RefreshCw size={14} className={isFetching > 0 ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      <SectionHeader
        title={tab === 'recordings' ? 'Recordings' : 'Downloads'}
        description={
          tab === 'recordings'
            ? 'Browse and manage completed recordings.'
            : 'Browse completed video downloads.'
        }
        actions={tab === 'recordings' ? (
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <span className="text-xs text-foreground-muted">{selectedIds.size} selected</span>
                <Button variant="ghost" size="sm" onClick={() => bulkFavorite.mutate()}>
                  <Heart size={14} /> Favorite
                </Button>
                <Button variant="danger" size="sm" onClick={() => bulkDelete.mutate()}>
                  <Trash2 size={14} /> Delete
                </Button>
              </>
            )}
            <Button variant="secondary" size="sm" onClick={() => setTagsOpen(true)}>
              <Tags size={14} /> Tags
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCollectionsOpen(true)}>
              Collections
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const result = await window.desktop.library.scanFolder();
                pushToast({
                  level: result.errors.length > 0 ? 'warn' : 'info',
                  title: 'Folder Scan Complete',
                  message: `Imported ${result.imported} file(s), skipped ${result.skipped}.`,
                });
                void queryClient.invalidateQueries({ queryKey: ['library'] });
              }}
            >
              <FolderOpen size={14} /> Scan Folder
            </Button>
          </div>
        ) : undefined}
      />

      {tab === 'downloads' && <DownloadsLibrary onPlay={setPlayerDownload} />}

      {tab === 'recordings' && (<>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recordings..."
            className="pl-8"
          />
        </div>
        <Select
          value={sortField}
          onChange={(e) => setSortField(e.target.value as SortField)}
          options={[
            { value: 'createdAt', label: 'Date Added' },
            { value: 'startedAt', label: 'Recording Date' },
            { value: 'title', label: 'Title' },
            { value: 'durationSeconds', label: 'Duration' },
            { value: 'sizeBytes', label: 'File Size' },
            { value: 'platformId', label: 'Platform' },
          ]}
        />
        {/* ponytail: A-Z only makes sense for an alphabetical field — clicking
            it while a date/numeric sort is active switches to Title first. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (sortField !== 'title') {
              setSortField('title');
              setSortDir('asc');
            } else {
              setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
            }
          }}
        >
          {sortField === 'title' && sortDir === 'desc' ? 'Z-A' : 'A-Z'}
        </Button>
        <div className="flex items-center gap-1.5">
          <Star size={14} className={filterFavorites ? 'text-warning' : 'text-foreground-muted'} />
          <Switch checked={filterFavorites} onCheckedChange={setFilterFavorites} aria-label="Favorites only" />
        </div>
        <Button variant={filtersOpen ? 'secondary' : 'ghost'} size="sm" onClick={() => setFiltersOpen(!filtersOpen)}>
          <SlidersHorizontal size={14} /> Filters
          {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('grid')}>
            <LayoutGrid size={14} />
          </Button>
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')}>
            <List size={14} />
          </Button>
          <Button variant={viewMode === 'compact' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('compact')}>
            <GripVertical size={14} />
          </Button>
          <Button variant={viewMode === 'details' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('details')}>
            <Eye size={14} />
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <Select
            label="Platform"
            value={filterPluginId}
            onChange={(e) => setFilterPluginId(e.target.value)}
            options={[
              { value: '', label: 'All platforms' },
              ...(plugins ?? []).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <Select
            label="Resolution"
            value={filterResolution}
            onChange={(e) => setFilterResolution(e.target.value)}
            options={[
              { value: '', label: 'Any resolution' },
              { value: '1080p', label: '1080p' },
              { value: '720p', label: '720p' },
              { value: '480p', label: '480p' },
            ]}
          />
          <Input
            label="Min duration (min)"
            type="number"
            min={0}
            value={filterMinDuration}
            onChange={(e) => setFilterMinDuration(e.target.value)}
            placeholder="e.g. 5"
          />
          <div className="space-y-1">
            <Input
              label="Max duration (min)"
              type="number"
              min={0}
              value={filterMaxDuration}
              onChange={(e) => setFilterMaxDuration(e.target.value)}
              placeholder="e.g. 60"
            />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[11px] text-foreground-muted transition-colors hover:text-foreground"
              >
                Clear all filters
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Collection tabs */}
      {collections && collections.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto">
          <Button variant={!activeCollection ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveCollection('')}>
            All
          </Button>
          {collections.map((col) => (
            <Button
              key={col.id}
              variant={activeCollection === col.id ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveCollection(col.id)}
            >
              {col.name}
            </Button>
          ))}
        </div>
      )}

      {isError && <p className="text-sm text-error">Failed to load recordings.</p>}

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      )}

      {!isLoading && !isError && recordings.length === 0 && (
        <EmptyState
          icon={Library}
          title="No recordings found"
          description={searchQuery ? 'Try a different search term.' : 'Recordings will appear here after they are completed.'}
        />
      )}

      {!isLoading && !isError && recordings.length > 0 && (
        <>
          {/* Select all */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={selectAll} className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground">
              {selectedIds.size === recordings.length ? <CheckSquare size={14} /> : <Square size={14} />}
              Select all
            </button>
          </div>

          {/* Grid view */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recordings.map((rec) => (
                <RecordingGridCard
                  key={rec.id}
                  recording={rec}
                  creatorName={rec.creatorId ? creatorNameById.get(rec.creatorId) : undefined}
                  selected={selectedIds.has(rec.id)}
                  onSelect={toggleSelect}
                  onDetails={setDetailsRecording}
                  onEditNotes={setEditNotes}
                  onToggleFavorite={(id) => toggleFav.mutate(id)}
                  onPlay={setPlayerRecording}
                />
              ))}
            </div>
          )}

          {/* List view */}
          {viewMode === 'list' && (
            <div className="space-y-2">
              {recordings.map((rec) => (
                <RecordingListCard
                  key={rec.id}
                  recording={rec}
                  creatorName={rec.creatorId ? creatorNameById.get(rec.creatorId) : undefined}
                  selected={selectedIds.has(rec.id)}
                  onSelect={toggleSelect}
                  onDetails={setDetailsRecording}
                  onEditNotes={setEditNotes}
                  onToggleFavorite={(id) => toggleFav.mutate(id)}
                />
              ))}
            </div>
          )}

          {/* Compact view */}
          {viewMode === 'compact' && (
            <div className="space-y-1">
              {recordings.map((rec) => (
                <RecordingCompactRow
                  key={rec.id}
                  recording={rec}
                  creatorName={rec.creatorId ? creatorNameById.get(rec.creatorId) : undefined}
                  selected={selectedIds.has(rec.id)}
                  onSelect={toggleSelect}
                  onDetails={setDetailsRecording}
                />
              ))}
            </div>
          )}

          {/* Details view */}
          {viewMode === 'details' && (
            <div className="space-y-2">
              {recordings.map((rec) => (
                <RecordingDetailsRow
                  key={rec.id}
                  recording={rec}
                  creatorName={rec.creatorId ? creatorNameById.get(rec.creatorId) : undefined}
                  selected={selectedIds.has(rec.id)}
                  onSelect={toggleSelect}
                  onDetails={setDetailsRecording}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft size={14} /> Previous
              </Button>
              <span className="text-xs tabular-nums text-foreground-muted">
                Page {page + 1} of {totalPages} ({total} recordings)
              </span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                Next <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </>
      )}
      </>)}

      <TagsDialog open={tagsOpen && tab === 'recordings'} onOpenChange={setTagsOpen} />
      <CollectionsDialog open={collectionsOpen && tab === 'recordings'} onOpenChange={setCollectionsOpen} />
      {detailsRecording && (
        <RecordingDetailsDialog
          recording={detailsRecording}
          open
          onOpenChange={() => setDetailsRecording(null)}
          onEditNotes={setEditNotes}
          onPlay={setPlayerRecording}
        />
      )}
      {editNotes && (
        <EditNotesDialog
          recording={editNotes}
          open
          onOpenChange={() => setEditNotes(null)}
        />
      )}
      {playerRecording?.filePath && (
        <VideoPlayerDialog
          title={playerRecording.title}
          filePath={playerRecording.filePath}
          posterPath={playerRecording.thumbnailPath}
          open
          onOpenChange={() => setPlayerRecording(null)}
        />
      )}
      {playerDownload?.filePath && (
        <VideoPlayerDialog
          title={playerDownload.title ?? playerDownload.fileName}
          filePath={playerDownload.filePath}
          posterPath={playerDownload.thumbnailPath ?? undefined}
          open
          onOpenChange={() => setPlayerDownload(null)}
        />
      )}
    </PageContainer>
  );
}

// --- Downloads Library -------------------------------------------------------

function DownloadsLibrary({ onPlay }: { onPlay: (item: DownloadQueueItemDto) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const { data: items, isLoading, isError } = useQuery({
    queryKey: ['downloads', 'library'],
    queryFn: async () => {
      const completed = await window.desktop.downloads.list('completed');
      const failed = await window.desktop.downloads.list('failed');
      return [...completed, ...failed];
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => window.desktop.downloads.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
      void queryClient.invalidateQueries({ queryKey: ['downloads-count'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      pushToast({ level: 'info', title: 'Removed', message: 'Download removed from the library.' });
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
      </div>
    );
  }

  if (isError) return <p className="text-sm text-error">Failed to load downloads.</p>;

  const list = items ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        icon={Download}
        title="No downloads yet"
        description="Completed video downloads will appear here. Add one from the Downloads page."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {list.map((item) => (
        <ContextMenu key={item.id}>
          <ContextMenuTrigger asChild>
            <Card
              className={`flex cursor-pointer flex-col gap-2 transition-colors hover:bg-elevated/50 ${item.filePath ? '' : 'opacity-60'} ${item.status === 'failed' ? 'ring-1 ring-error/50' : ''}`}
              onClick={() => item.filePath !== null && item.filePath !== undefined && item.status !== 'failed' && onPlay(item)}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-elevated">
                {item.thumbnailPath ? (
                  <img src={toMediaUrl(item.thumbnailPath)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-foreground-muted">
                    <Play size={24} />
                  </div>
                )}
                {item.status === 'failed' && (
                  <div className="absolute top-1 right-1">
                    <Badge variant="error" className="text-[9px]">Failed</Badge>
                  </div>
                )}
                {item.filePath != null && item.status !== 'failed' && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/40">
                    <span className="rounded-full bg-primary/90 p-3 text-white opacity-0 shadow-lg transition-opacity hover:opacity-100">
                      <Play size={22} />
                    </span>
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 px-2 pb-2">
                <h3 className="line-clamp-1 text-sm font-medium text-foreground">{item.title ?? item.fileName}</h3>
                <div className="flex items-center gap-2 text-[10px] text-foreground-muted">
                  <Badge variant="muted">{siteFolderOf(item.url)}</Badge>
                  {item.totalBytes > 0 && <span>{formatBytes(item.totalBytes)}</span>}
                  {item.audioOnly && <span>MP3</span>}
                </div>
                {item.status === 'failed' && item.error && (
                  <p className="line-clamp-2 text-[10px] text-error" title={item.error}>
                    {item.error}
                  </p>
                )}
                <p className="text-[10px] text-foreground-disabled">
                  {item.finishedAt ? new Date(item.finishedAt).toLocaleDateString() : ''}
                </p>
              </div>
            </Card>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {item.filePath != null && item.status !== 'failed' && (
              <>
                <ContextMenuItem onClick={() => onPlay(item)}><Play size={14} /> Play</ContextMenuItem>
                <ContextMenuItem onClick={() => window.desktop.library.revealInExplorer(item.destination)}>
                  <FolderOpen size={14} /> Open Folder
                </ContextMenuItem>
                <ContextMenuItem onClick={() => navigator.clipboard.writeText(item.filePath!)}>
                  <Copy size={14} /> Copy Path
                </ContextMenuItem>
              </>
            )}
            {item.status === 'failed' && (
              <ContextMenuItem onClick={() => window.desktop.downloads.retry(item.id)}>
                <RefreshCw size={14} /> Retry
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem destructive onClick={() => remove.mutate(item.id)}>
              <Trash2 size={14} /> Remove from Library
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </div>
  );
}

// --- Grid Card ---------------------------------------------------------------

function RecordingGridCard({
  recording,
  creatorName,
  selected,
  onSelect,
  onDetails,
  onEditNotes,
  onToggleFavorite,
  onPlay,
}: {
  recording: RecordingDto;
  creatorName?: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onDetails: (r: RecordingDto) => void;
  onEditNotes: (r: RecordingDto) => void;
  onToggleFavorite: (id: string) => void;
  onPlay: (r: RecordingDto) => void;
}) {
  const queryClient = useQueryClient();

  const deleteRec = useMutation({
    mutationFn: () => window.desktop.library.bulkDelete([recording.id]),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['recordings-recent'] });
    },
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          className={`flex cursor-pointer flex-col gap-2 transition-colors hover:bg-elevated/50 ${selected ? 'ring-1 ring-primary' : ''}`}
          onClick={() => onDetails(recording)}
        >
          <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-elevated">
            {recording.thumbnailPath ? (
              <img src={toMediaUrl(recording.thumbnailPath)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-foreground-muted">
                <Play size={24} />
              </div>
            )}
            {/* ponytail: click-to-play overlay */}
            {recording.filePath && (
              <button
                type="button"
                aria-label="Play recording"
                onClick={(e) => { e.stopPropagation(); onPlay(recording); }}
                className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/40"
              >
                <span className="rounded-full bg-primary/90 p-3 text-white opacity-0 shadow-lg transition-opacity hover:opacity-100 group-hover:opacity-100">
                  <Play size={22} />
                </span>
              </button>
            )}
            {recording.durationSeconds && (
              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">
                {formatDuration(recording.durationSeconds)}
              </span>
            )}
            <button
              type="button"
              className="absolute left-1 top-1"
              onClick={(e) => { e.stopPropagation(); onSelect(recording.id); }}
            >
              {selected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} className="text-white/70" />}
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-1 px-2 pb-2">
            <div className="flex items-start justify-between gap-1">
              <h3
                className="line-clamp-1 text-sm font-medium text-foreground"
                title={recording.title}
              >
                {creatorName ?? recording.title}
                {creatorName && recording.startedAt && (
                  <span className="text-foreground-muted"> · {new Date(recording.startedAt).toLocaleDateString()}</span>
                )}
              </h3>
              <button type="button" onClick={(e) => { e.stopPropagation(); onToggleFavorite(recording.id); }} className="shrink-0">
                <Heart size={12} className={recording.isFavorite ? 'fill-warning text-warning' : 'text-foreground-muted'} />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-foreground-muted">
              <span>{recording.platformId}</span>
              {recording.resolution && <span>{recording.resolution}</span>}
              {recording.sizeBytes && <span>{formatBytes(recording.sizeBytes)}</span>}
            </div>
            <p className="text-[10px] text-foreground-disabled" title={recording.title}>
              {recording.startedAt ? new Date(recording.startedAt).toLocaleDateString() : ''}
            </p>
          </div>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onDetails(recording)}>
          <Eye size={14} /> Details
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onEditNotes(recording)}>
          <FileText size={14} /> Notes
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onToggleFavorite(recording.id)}>
          <Heart size={14} /> {recording.isFavorite ? 'Unfavorite' : 'Favorite'}
        </ContextMenuItem>
        {recording.filePath && (
          <ContextMenuItem onClick={() => window.desktop.library.revealInExplorer(recording.filePath!)}>
            <FolderOpen size={14} /> Open Folder
          </ContextMenuItem>
        )}
        {recording.filePath && (
          <ContextMenuItem onClick={() => navigator.clipboard.writeText(recording.filePath!)}>
            <Copy size={14} /> Copy Path
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem destructive onClick={() => deleteRec.mutate()}>
          <Trash2 size={14} /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// --- List Card ---------------------------------------------------------------

function RecordingListCard({
  recording,
  creatorName,
  selected,
  onSelect,
  onDetails,
  onEditNotes,
  onToggleFavorite,
}: {
  recording: RecordingDto;
  creatorName?: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onDetails: (r: RecordingDto) => void;
  onEditNotes: (r: RecordingDto) => void;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          className={`flex cursor-pointer items-center gap-3 transition-colors hover:bg-elevated/50 ${selected ? 'ring-1 ring-primary' : ''}`}
          onClick={() => onDetails(recording)}
        >
          <button
            type="button"
            className="ml-2 shrink-0"
            onClick={(e) => { e.stopPropagation(); onSelect(recording.id); }}
          >
            {selected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} className="text-foreground-muted" />}
          </button>
          <div className="h-12 w-20 shrink-0 overflow-hidden rounded-sm bg-elevated">
            {recording.thumbnailPath ? (
              <img src={toMediaUrl(recording.thumbnailPath)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-foreground-muted"><Play size={14} /></div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium text-foreground" title={recording.title}>
              {creatorName ?? recording.title}
              {creatorName && recording.startedAt && (
                <span className="text-foreground-muted"> · {new Date(recording.startedAt).toLocaleDateString()}</span>
              )}
            </h3>
            <p className="text-xs text-foreground-muted">{recording.platformId} {recording.resolution ? `· ${recording.resolution}` : ''}</p>
          </div>
          <div className="hidden shrink-0 text-right text-xs text-foreground-muted sm:block">
            {recording.durationSeconds ? formatDuration(recording.durationSeconds) : '-'}
          </div>
          <div className="hidden shrink-0 text-right text-xs text-foreground-muted sm:block">
            {recording.sizeBytes ? formatBytes(recording.sizeBytes) : '-'}
          </div>
          <div className="hidden shrink-0 text-right text-xs text-foreground-muted md:block">
            {recording.startedAt ? new Date(recording.startedAt).toLocaleDateString() : '-'}
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); onToggleFavorite(recording.id); }} className="shrink-0">
            <Heart size={14} className={recording.isFavorite ? 'fill-warning text-warning' : 'text-foreground-muted'} />
          </button>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onDetails(recording)}><Eye size={14} /> Details</ContextMenuItem>
        <ContextMenuItem onClick={() => onEditNotes(recording)}><FileText size={14} /> Notes</ContextMenuItem>
        {recording.filePath && <ContextMenuItem onClick={() => window.desktop.library.revealInExplorer(recording.filePath!)}><FolderOpen size={14} /> Open Folder</ContextMenuItem>}
        {recording.filePath && <ContextMenuItem onClick={() => navigator.clipboard.writeText(recording.filePath!)}><Copy size={14} /> Copy Path</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>
  );
}

// --- Compact Row -------------------------------------------------------------

function RecordingCompactRow({
  recording,
  creatorName,
  selected,
  onSelect,
  onDetails,
}: {
  recording: RecordingDto;
  creatorName?: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onDetails: (r: RecordingDto) => void;
}) {
  return (
    <div
      className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm transition-colors hover:bg-elevated/50 ${selected ? 'bg-elevated ring-1 ring-primary' : ''}`}
      onClick={() => onDetails(recording)}
    >
      <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(recording.id); }}>
        {selected ? <CheckSquare size={12} className="text-primary" /> : <Square size={12} className="text-foreground-muted" />}
      </button>
      <span className="min-w-0 flex-1 truncate text-foreground" title={recording.title}>
        {creatorName ?? recording.title}
        {creatorName && recording.startedAt && (
          <span className="text-foreground-muted"> · {new Date(recording.startedAt).toLocaleDateString()}</span>
        )}
      </span>
      <span className="hidden w-20 shrink-0 text-right text-xs text-foreground-muted md:block">{recording.platformId}</span>
      <span className="hidden w-16 shrink-0 text-right text-xs text-foreground-muted sm:block">{recording.durationSeconds ? formatDuration(recording.durationSeconds) : '-'}</span>
      <span className="hidden w-16 shrink-0 text-right text-xs text-foreground-muted sm:block">{recording.sizeBytes ? formatBytes(recording.sizeBytes) : '-'}</span>
    </div>
  );
}

// --- Details Row -------------------------------------------------------------

function RecordingDetailsRow({
  recording,
  creatorName,
  selected,
  onSelect,
  onDetails,
}: {
  recording: RecordingDto;
  creatorName?: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onDetails: (r: RecordingDto) => void;
}) {
  return (
    <Card
      className={`flex cursor-pointer items-center gap-3 transition-colors hover:bg-elevated/50 ${selected ? 'ring-1 ring-primary' : ''}`}
      onClick={() => onDetails(recording)}
    >
      <button type="button" className="ml-2 shrink-0" onClick={(e) => { e.stopPropagation(); onSelect(recording.id); }}>
        {selected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} className="text-foreground-muted" />}
      </button>
      <div className="h-16 w-24 shrink-0 overflow-hidden rounded-sm bg-elevated">
        {recording.thumbnailPath ? (
          <img src={toMediaUrl(recording.thumbnailPath)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-foreground-muted"><Play size={16} /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-foreground" title={recording.title}>
          {creatorName ?? recording.title}
          {creatorName && recording.startedAt && (
            <span className="text-foreground-muted"> · {new Date(recording.startedAt).toLocaleDateString()}</span>
          )}
        </h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground-muted">
          <span>{recording.platformId}</span>
          {recording.resolution && <span>{recording.resolution}</span>}
          {recording.durationSeconds && <span>{formatDuration(recording.durationSeconds)}</span>}
          {recording.sizeBytes && <span>{formatBytes(recording.sizeBytes)}</span>}
          {recording.videoCodec && <span>{recording.videoCodec}</span>}
          {recording.audioCodec && <span>{recording.audioCodec}</span>}
          {recording.fps && <span>{recording.fps}fps</span>}
        </div>
        {recording.notes && <p className="mt-1 line-clamp-1 text-xs text-foreground-muted">{recording.notes}</p>}
      </div>
      <div className="hidden shrink-0 text-right text-xs text-foreground-muted md:block">
        {recording.startedAt ? new Date(recording.startedAt).toLocaleDateString() : '-'}
      </div>
    </Card>
  );
}

// --- Dialogs -----------------------------------------------------------------

function TagsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const { data: tags } = useQuery({ queryKey: ['library-tags'], queryFn: () => window.desktop.library.getTags() });
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('');

  const createTag = useMutation({
    mutationFn: () => window.desktop.library.createTag(newTagName, newTagColor || undefined),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['library-tags'] }); setNewTagName(''); setNewTagColor(''); pushToast({ level: 'info', title: 'Tag created', message: `${newTagName} created.` }); },
  });

  const removeTag = useMutation({
    mutationFn: (id: string) => window.desktop.library.removeTag(id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['library-tags'] }); void queryClient.invalidateQueries({ queryKey: ['library'] }); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Manage Tags" description="Create and manage recording tags.">
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Tag name" className="flex-1" />
            <Input value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} placeholder="Color" className="w-24" />
            <Button size="sm" disabled={!newTagName.trim()} loading={createTag.isPending} onClick={() => createTag.mutate()}>
              <Plus size={14} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(tags ?? []).map((tag) => (
              <Badge key={tag.id} variant="default" className="gap-1">
                {tag.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />}
                {tag.name}
                <button type="button" onClick={() => removeTag.mutate(tag.id)} className="ml-1 text-foreground-muted hover:text-error">
                  <X size={12} />
                </button>
              </Badge>
            ))}
            {(tags ?? []).length === 0 && <p className="text-sm text-foreground-muted">No tags yet.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CollectionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const { data: collections } = useQuery({ queryKey: ['library-collections'], queryFn: () => window.desktop.library.getCollections() });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createCollection = useMutation({
    mutationFn: () => window.desktop.library.createCollection(name, description || undefined),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['library-collections'] }); setName(''); setDescription(''); pushToast({ level: 'info', title: 'Collection created', message: `${name} created.` }); },
  });

  const removeCollection = useMutation({
    mutationFn: (id: string) => window.desktop.library.removeCollection(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['library-collections'] }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Manage Collections" description="Organize recordings into collections.">
        <div className="space-y-4">
          <div className="space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Collection name" />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />
            <Button size="sm" disabled={!name.trim()} loading={createCollection.isPending} onClick={() => createCollection.mutate()}>Create</Button>
          </div>
          <div className="space-y-2">
            {(collections ?? []).map((col) => (
              <div key={col.id} className="flex items-center justify-between rounded-sm border border-border bg-elevated px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{col.name}</p>
                  {col.description && <p className="text-xs text-foreground-muted">{col.description}</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeCollection.mutate(col.id)}><Trash2 size={14} /></Button>
              </div>
            ))}
            {(collections ?? []).length === 0 && <p className="text-sm text-foreground-muted">No collections yet.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecordingDetailsDialog({
  recording,
  open,
  onOpenChange,
  onEditNotes,
  onPlay,
}: {
  recording: RecordingDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEditNotes: (r: RecordingDto) => void;
  onPlay: (r: RecordingDto) => void;
}) {
  const { data: tags } = useQuery({ queryKey: ['library-tags'], queryFn: () => window.desktop.library.getTags() });
  const { data: recordingTags } = useQuery({
    queryKey: ['library-recording-tags', recording.id],
    queryFn: () => window.desktop.library.listRecordingTags(recording.id),
  });
  const queryClient = useQueryClient();

  const addTag = useMutation({
    mutationFn: (tagId: string) => window.desktop.library.addTag(recording.id, tagId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library-recording-tags', recording.id] }),
  });

  const removeTag = useMutation({
    mutationFn: (tagId: string) => window.desktop.library.removeTagFromRecording(recording.id, tagId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library-recording-tags', recording.id] }),
  });

  const assignedTagIds = new Set((recordingTags ?? []).map((t) => t.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={recording.title} description={recording.platformId} className="max-w-lg">
        <div className="space-y-4">
          {recording.thumbnailPath && (
            <img src={toMediaUrl(recording.thumbnailPath)} alt="" className="w-full rounded-sm object-cover" />
          )}
          <dl className="space-y-2 text-sm">
            <DetailRow label="Platform" value={recording.platformId} />
            <DetailRow label="Resolution" value={recording.resolution ?? '-'} />
            <DetailRow label="Duration" value={recording.durationSeconds ? formatDuration(recording.durationSeconds) : '-'} />
            <DetailRow label="File Size" value={recording.sizeBytes ? formatBytes(recording.sizeBytes) : '-'} />
            <DetailRow label="Video Codec" value={recording.videoCodec ?? '-'} />
            <DetailRow label="Audio Codec" value={recording.audioCodec ?? '-'} />
            <DetailRow label="Bitrate" value={recording.bitrate ? `${(recording.bitrate / 1000).toFixed(0)} kbps` : '-'} />
            <DetailRow label="FPS" value={recording.fps ? String(recording.fps) : '-'} />
            <DetailRow label="Status" value={recording.status} />
            <DetailRow label="Created" value={new Date(recording.createdAt).toLocaleString()} />
            {recording.startedAt && <DetailRow label="Recorded" value={new Date(recording.startedAt).toLocaleString()} />}
            {recording.filePath && <DetailRow label="Path" value={recording.filePath} />}
          </dl>

          {/* Notes */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground-muted">Notes</span>
              <Button variant="ghost" size="sm" onClick={() => onEditNotes(recording)}>
                <Pencil size={12} /> Edit
              </Button>
            </div>
            <p className="rounded-sm bg-elevated p-2 text-sm text-foreground-secondary">
              {recording.notes || 'No notes'}
            </p>
          </div>

          {/* Tags */}
          <div>
            <span className="mb-1 block text-xs font-medium text-foreground-muted">Tags</span>
            <div className="flex flex-wrap gap-1">
              {(recordingTags ?? []).map((tag) => (
                <Badge key={tag.id} variant="default" className="gap-1">
                  {tag.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />}
                  {tag.name}
                  <button type="button" onClick={() => removeTag.mutate(tag.id)} className="ml-1 text-foreground-muted hover:text-error">
                    <X size={10} />
                  </button>
                </Badge>
              ))}
              {(tags ?? []).filter((t) => !assignedTagIds.has(t.id)).map((tag) => (
                <Button key={tag.id} variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => addTag.mutate(tag.id)}>
                  + {tag.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {recording.filePath && (
              <>
                <Button variant="secondary" size="sm" onClick={() => onPlay(recording)}>
                  <Play size={14} /> Play
                </Button>
                <Button variant="secondary" size="sm" onClick={() => window.desktop.library.revealInExplorer(recording.filePath!)}>
                  <FolderOpen size={14} /> Open Folder
                </Button>
                <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(recording.filePath!)}>
                  <Copy size={14} /> Copy Path
                </Button>
              </>
            )}
            <Button variant="secondary" size="sm" onClick={() => window.desktop.library.verifyFile(recording.id)}>
              Verify
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditNotesDialog({
  recording,
  open,
  onOpenChange,
}: {
  recording: RecordingDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [notes, setNotes] = useState(recording.notes ?? '');

  const save = useMutation({
    mutationFn: () => window.desktop.library.setNotes(recording.id, notes || null),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['library'] }); onOpenChange(false); pushToast({ level: 'info', title: 'Notes updated', message: 'Notes have been saved.' }); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit Notes" description={recording.title}>
        <div className="space-y-4">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes about this recording..." rows={6} />
          <Button loading={save.isPending} onClick={() => save.mutate()} className="w-full">Save Notes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className="max-w-[60%] truncate text-right tabular-nums text-foreground-secondary" title={value}>{value}</dd>
    </div>
  );
}
