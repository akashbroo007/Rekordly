import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Heart,
  Info,
  Pencil,
  Plus,
  Radio,
  Search,
  Star,
  Tags,
  Trash2,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
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
import type { CreatorDto } from '@rekordly/shared/contracts';
import { useToastStore } from '../stores/toast-store';

type SortField = 'displayName' | 'createdAt' | 'updatedAt';
type SortDir = 'asc' | 'desc';

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

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('displayName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [filterAutoRecord, setFilterAutoRecord] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // ponytail: first-time auto-record enable shows a one-time storage warning.
  const { data: appSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
  });
  const [warningCreator, setWarningCreator] = useState<CreatorDto | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editCreator, setEditCreator] = useState<CreatorDto | null>(null);
  const [deleteCreator, setDeleteCreator] = useState<CreatorDto | null>(null);
  const [detailsCreator, setDetailsCreator] = useState<CreatorDto | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [recordCreator, setRecordCreator] = useState<CreatorDto | null>(null);

  const filtered = useMemo(() => {
    let result = creators ?? [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q),
      );
    }
    if (filterFavorites) {
      result = result.filter((c) => c.isFavorite);
    }
    if (filterAutoRecord) {
      result = result.filter((c) => c.autoRecord);
    }
    result.sort((a, b) => {
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      const cmp = aVal.localeCompare(bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [creators, searchQuery, sortField, sortDir, filterFavorites, filterAutoRecord]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => { setPage(0); }, [searchQuery, sortField, sortDir, filterFavorites, filterAutoRecord]);

  /**
   * ponytail: arming auto-record for the first time shows a one-time storage
   * warning; confirming persists the ack (Settings) and proceeds, cancelling
   * changes nothing.
   */
  const requestAutoRecord = (creator: CreatorDto, enable: boolean): void => {
    if (!enable || appSettings?.autoRecordWarningAcknowledged) {
      setWarningCreator(null);
      void window.desktop.creators.setAutoRecord(creator.id, enable);
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
      return;
    }
    setWarningCreator(creator);
  };

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

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search creators..."
            className="pl-8"
          />
        </div>
        <Select
          value={sortField}
          onChange={(e) => setSortField(e.target.value as SortField)}
          options={[
            { value: 'displayName', label: 'Name' },
            { value: 'createdAt', label: 'Date Added' },
            { value: 'updatedAt', label: 'Last Updated' },
          ]}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
        >
          {sortDir === 'asc' ? 'A-Z' : 'Z-A'}
        </Button>
        <div className="flex items-center gap-1.5">
          <Star size={14} className={filterFavorites ? 'text-warning' : 'text-foreground-muted'} />
          <Switch
            checked={filterFavorites}
            onCheckedChange={setFilterFavorites}
            aria-label="Favorites only"
          />
        </div>
        {/* ponytail: one-click "show only auto-record armed models" */}
        <Button
          variant={filterAutoRecord ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setFilterAutoRecord((v) => !v)}
          title="Show only creators with auto-record enabled"
        >
          <Zap size={14} className={filterAutoRecord ? '' : 'text-foreground-muted'} />
          Auto-record
        </Button>
      </div>

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

      {!isLoading && !isError && paged.length === 0 && (
        <EmptyState
          icon={Users}
          title="No creators found"
          description={searchQuery ? 'Try a different search term.' : 'Add a creator to start monitoring.'}
          action={
            !searchQuery ? (
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={14} /> Add Creator
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !isError && paged.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paged.map((creator) => {
              const monitorId = `${creator.pluginId}:${creator.externalId}`;
              const job = monitoringJobs?.find((j) => j.creatorId === monitorId);
              return (
                <CreatorCard
                  key={creator.id}
                  creator={creator}
                  isLive={job?.state === 'live'}
                  jobState={job?.state}
                  onToggleAutoRecord={() => requestAutoRecord(creator, !creator.autoRecord)}
                  onDetails={setDetailsCreator}
                  onRecord={setRecordCreator}
                  onEdit={setEditCreator}
                  onDelete={setDeleteCreator}
                />
              );
            })}
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

      <AddCreatorDialog open={addOpen} onOpenChange={setAddOpen} />
      {/* ponytail: one-time storage warning before the first auto-record arm */}
      <Dialog open={warningCreator !== null} onOpenChange={(v) => { if (!v) setWarningCreator(null); }}>
        <DialogContent
          title="Enable auto-record?"
          description={`Every time ${warningCreator?.displayName ?? 'this creator'} goes live, Rekordly starts recording automatically.`}
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
                    {(warningCreator?.autoRecordQuality ?? 'best') === '480p'
                      ? '≈0.5 GB/hour'
                      : (warningCreator?.autoRecordQuality ?? 'best') === '720p'
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
                onClick={() => setWarningCreator(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const creator = warningCreator;
                  setWarningCreator(null);
                  if (creator !== null) {
                    void window.desktop.creators.setAutoRecord(creator.id, true);
                    void window.desktop.settings.set({
                      ...(appSettings as NonNullable<typeof appSettings>),
                      autoRecordWarningAcknowledged: true,
                    });
                    void queryClient.invalidateQueries({ queryKey: ['creators'] });
                    void queryClient.invalidateQueries({ queryKey: ['settings'] });
                    pushToast({
                      level: 'info',
                      title: 'Auto-record enabled',
                      message: `${creator.displayName} will be recorded automatically when live.`,
                    });
                  }
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

function CreatorCard({
  creator,
  isLive,
  jobState,
  onToggleAutoRecord,
  onDetails,
  onRecord,
  onEdit,
  onDelete,
}: {
  creator: CreatorDto;
  isLive?: boolean;
  jobState?: string;
  onToggleAutoRecord: () => void;
  onDetails: (c: CreatorDto) => void;
  onRecord: (c: CreatorDto) => void;
  onEdit: (c: CreatorDto) => void;
  onDelete: (c: CreatorDto) => void;
}) {
  const queryClient = useQueryClient();

  const toggleFav = useMutation({
    mutationFn: () => window.desktop.creators.setFavorite(creator.id, !creator.isFavorite),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['creators'] }),
  });

  // ponytail: per-creator monitoring status — failed/paused must not look
  // like a normal "offline" (they mean checks are broken or stopped).
  const statusLine = (() => {
    if (isLive) return 'Live now';
    if (jobState === 'failed') return 'Checks failing — will retry';
    if (jobState === 'paused') return 'Monitoring paused';
    if (jobState === 'retrying') return 'Retrying…';
    return 'Monitored — waiting for live';
  })();

  return (
    <Card className="group flex flex-col gap-3 transition-all duration-150 hover:border-primary/30 hover:bg-elevated/50">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-elevated text-foreground-muted transition-colors group-hover:border-primary/40"
          onClick={() => onDetails(creator)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onDetails(creator); }}
        >
          {creator.avatarUrl ? (
            <img src={creator.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <Users size={18} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className="cursor-pointer truncate text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
              onClick={() => onDetails(creator)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onDetails(creator); }}
            >
              {creator.displayName}
            </h3>
            {isLive && <Badge variant="success">Live</Badge>}
            {creator.autoRecord && !isLive && <Badge variant="info">Auto</Badge>}
            <button
              type="button"
              onClick={() => toggleFav.mutate()}
              className="shrink-0"
              aria-label={creator.isFavorite ? 'Unfavorite' : 'Favorite'}
            >
              <Heart
                size={14}
                className={creator.isFavorite ? 'fill-warning text-warning' : 'text-foreground-muted'}
              />
            </button>
          </div>
          <p className="text-[11px] uppercase tracking-wide text-foreground-muted">@{creator.username}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="info">{creator.pluginId}</Badge>
          {/* ponytail: per-creator auto-record arm switch — one click, with
              tooltip explaining exactly what it does. */}
          <Button
            variant="ghost"
            size="icon"
            className={
              creator.autoRecord
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'text-foreground-muted hover:bg-primary/10 hover:text-primary'
            }
            onClick={onToggleAutoRecord}
            aria-label={creator.autoRecord ? 'Disable auto-record' : 'Enable auto-record'}
            aria-pressed={creator.autoRecord}
            title={
              creator.autoRecord
                ? 'Auto-record ON — records automatically whenever this creator goes live. Click to disable.'
                : 'Auto-record OFF — click to record this creator automatically whenever they go live.'
            }
          >
            <Zap size={14} className={creator.autoRecord ? 'fill-primary' : ''} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground-muted hover:bg-primary/10 hover:text-primary"
            onClick={() => onEdit(creator)}
            aria-label={`Edit ${creator.displayName}`}
            title="Edit creator"
          >
            <Pencil size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground-muted hover:bg-error/10 hover:text-error"
            onClick={() => onDelete(creator)}
            aria-label={`Delete ${creator.displayName}`}
            title="Delete creator"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
      {creator.notes && (
        <p className="line-clamp-2 border-l-2 border-border pl-2 text-xs leading-relaxed text-foreground-muted">{creator.notes}</p>
      )}
      {/* ponytail: prominent, always-visible record action — solid red while
          the creator is live, clearly disabled (with reason) otherwise. */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground-disabled">
          {statusLine}
        </p>
        {isLive ? (
          <Button size="sm" className="bg-error text-white hover:bg-error/90" onClick={() => onRecord(creator)}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
            Record Now
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled title={`${creator.displayName} is offline — recording is available when they go live.`}>
            <Radio size={14} />
            Record
          </Button>
        )}
      </div>
    </Card>
  );
}

interface CreatorFieldHints {
  idLabel: string;
  idPlaceholder: string;
  usernameLabel: string;
  usernamePlaceholder: string;
  displayNameLabel: string;
  displayNamePlaceholder: string;
  guide: string[];
}

// ponytail: per-platform entry hints for the manual Add Creator form; the
// fallback keeps unknown plugins working with generic wording.
const PLUGIN_CREATOR_HINTS: Record<string, CreatorFieldHints> = {
  youtube: {
    idLabel: 'Channel ID, @handle or channel URL',
    idPlaceholder: 'e.g. UCXuqSBlHAE6Xw-yeJA0Tunw or @mkbhd',
    usernameLabel: 'Handle (without @)',
    usernamePlaceholder: 'e.g. mkbhd',
    displayNameLabel: 'Channel Name',
    displayNamePlaceholder: 'e.g. Marques Brownlee',
    guide: [
      'Channel ID: open the channel on YouTube and copy the "UC..." ID from the URL (youtube.com/channel/UC....). This is the most reliable option.',
      'Handle: you can also enter the @handle (e.g. @mkbhd) or just paste the channel URL - both are cleaned up automatically.',
      'Handle and Channel Name are only labels shown in the app; Rekordly monitors the ID/handle entered above.',
      'Make sure a YouTube API key is configured under Plugins > YouTube > Settings, otherwise live status cannot be checked.',
    ],
  },
  twitch: {
    idLabel: 'Channel name or channel URL',
    idPlaceholder: 'e.g. shroud or https://twitch.tv/shroud',
    usernameLabel: 'Username (login name)',
    usernamePlaceholder: 'e.g. shroud',
    displayNameLabel: 'Display Name',
    displayNamePlaceholder: 'e.g. Shroud',
    guide: [
      'Enter the channel login name exactly as it appears in the channel URL: twitch.tv/<name> (e.g. "shroud").',
      'You can also paste the full channel URL - it is cleaned to the login name automatically.',
      'Username should be the lowercase login name; Display Name can use capitals (e.g. "Shroud").',
      'Make sure a Twitch Client-ID and Secret are configured under Plugins > Twitch > Settings, otherwise live status cannot be checked.',
    ],
  },
};

const GENERIC_CREATOR_HINTS: CreatorFieldHints = {
  idLabel: 'Creator URL or Username',
  idPlaceholder: 'e.g. username or profile URL',
  usernameLabel: 'Username',
  usernamePlaceholder: 'e.g. john_doe',
  displayNameLabel: 'Display Name',
  displayNamePlaceholder: 'e.g. John Doe',
  guide: [
    'Enter the creator username exactly as it appears in their profile URL on the platform.',
    'You can usually paste the full profile URL instead - it will be cleaned automatically where possible.',
  ],
};

function normalizeExternalId(pluginId: string, raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (pluginId === 'youtube') {
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        if (url.pathname.startsWith('/channel/')) {
          const id = url.pathname.split('/').filter(Boolean)[1];
          if (id) return id;
        }
        const handle = url.pathname.split('/').filter(Boolean)[0];
        if (handle) return handle.startsWith('@') ? handle : `@${handle}`;
      } catch {
        /* fall through to raw value */
      }
    }
    return value;
  }
  if (pluginId === 'twitch') {
    if (/^https?:\/\//i.test(value)) {
      try {
        const name = new URL(value).pathname.split('/').filter(Boolean)[0];
        if (name) return name.toLowerCase();
      } catch {
        /* fall through to raw value */
      }
    }
    return value.toLowerCase().replace(/^@/, '');
  }
  return value;
}

function AddCreatorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const { data: plugins } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
  });

  const [pluginId, setPluginId] = useState('');
  const [externalId, setExternalId] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [notes, setNotes] = useState('');
  // ponytail: explicit per-creator opt-in at add time (default OFF).
  const [autoRecord, setAutoRecord] = useState(false);
  const [autoRecordQuality, setAutoRecordQuality] = useState('best');

  // ponytail: segment length comes from the global setting — shown so the
  // user knows how files will be split before committing.
  const { data: appSettingsForAdd } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
  });
  const segmentMin = appSettingsForAdd?.autoRecordSegmentMinutes ?? 30;
  const autoRecordSegmentLabel = segmentMin > 0 ? `${segmentMin} min parts` : 'a single file';

  const hints = PLUGIN_CREATOR_HINTS[pluginId] ?? GENERIC_CREATOR_HINTS;

  const create = useMutation({
    mutationFn: (values: { externalId: string; username: string }) =>
      window.desktop.creators.create({
        pluginId,
        externalId: values.externalId,
        username: values.username,
        displayName,
        autoRecord,
        autoRecordQuality,
        notes: notes || null,
      }),
    onSuccess: () => {
      pushToast({
        level: 'info',
        title: 'Creator added',
        message: autoRecord
          ? `${displayName} has been added — recording starts automatically when they go live.`
          : `${displayName} has been added.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
      onOpenChange(false);
      setPluginId(''); setExternalId(''); setUsername(''); setDisplayName(''); setNotes(''); setAutoRecord(false); setAutoRecordQuality('best');
    },
    onError: (err: unknown) => {
      pushToast({ level: 'error', title: 'Failed to add creator', message: err instanceof Error ? err.message : 'Unknown error' });
    },
  });

  const enabledPlugins = (plugins ?? []).filter((p) => p.enabled);
  const isValid = pluginId && externalId && username && displayName;

  const submit = () => {
    const cleanedId = normalizeExternalId(pluginId, externalId);
    setExternalId(cleanedId);
    const derivedUsername = username.trim() || cleanedId.replace(/^@/, '').toLowerCase();
    setUsername(derivedUsername);
    create.mutate({ externalId: cleanedId, username: derivedUsername });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add Creator" description="Add a new creator to monitor.">
        <div className="space-y-4">
          <Select
            label="Plugin"
            value={pluginId}
            onChange={(e) => setPluginId(e.target.value)}
            options={[
              { value: '', label: 'Select a plugin...' },
              ...enabledPlugins.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          {pluginId !== '' && (
            <div className="rounded-sm border border-border bg-elevated px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                <Info size={12} className="text-info" />
                What to enter
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-foreground-secondary">
                {hints.guide.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <Input
            label={hints.idLabel}
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            placeholder={hints.idPlaceholder}
          />
          <Input
            label={`${hints.usernameLabel} (optional - auto-filled if empty)`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={hints.usernamePlaceholder}
          />
          <Input
            label={hints.displayNameLabel}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={hints.displayNamePlaceholder}
          />
          <Textarea
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
          />
          {/* ponytail: per-creator auto-record opt-in at add time */}
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Zap size={13} className="text-primary" /> Auto-record when live
              </p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                Recording starts automatically every time this creator goes live (uses disk — see Settings → Recording).
              </p>
            </div>
            <Switch
              checked={autoRecord}
              onCheckedChange={setAutoRecord}
              aria-label="Auto-record when live"
            />
          </div>
          {autoRecord && (
            <>
              <Select
                label="Auto-record quality"
                hint="Set once — used for every future auto-recording of this creator. Lower quality = far less disk."
                value={autoRecordQuality}
                onChange={(e) => setAutoRecordQuality(e.target.value)}
                options={[
                  { value: 'best', label: 'Best (source quality)' },
                  { value: '1080p', label: '1080p' },
                  { value: '720p', label: '720p' },
                  { value: '480p', label: '480p' },
                ]}
              />
              <p className="text-[11px] text-foreground-muted">
                Estimated disk: ≈2–3 GB/hr at Best · ≈1 GB/hr at 720p · ≈0.5 GB/hr at 480p. Recordings are split every{' '}
                {autoRecordSegmentLabel} (Settings → Recording).
              </p>
            </>
          )}
          <Button loading={create.isPending} disabled={!isValid} onClick={submit} className="w-full">
            Add Creator
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditCreatorDialog({
  creator,
  open,
  onOpenChange,
}: {
  creator: CreatorDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const [displayName, setDisplayName] = useState(creator.displayName);
  const [username, setUsername] = useState(creator.username);
  const [notes, setNotes] = useState(creator.notes ?? '');
  // ponytail: per-creator auto-record settings editable here too — quality
  // is set ONCE here and applies to all future auto-recordings.
  const [autoRecord, setAutoRecord] = useState(creator.autoRecord);
  const [autoRecordQuality, setAutoRecordQuality] = useState(creator.autoRecordQuality ?? 'best');

  const update = useMutation({
    mutationFn: () =>
      window.desktop.creators.update(creator.id, {
        displayName,
        username,
        autoRecord,
        autoRecordQuality,
        notes: notes || null,
      }),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Creator updated', message: `${displayName} has been updated.` });
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit Creator" description={`Editing ${creator.displayName}`}>
        <div className="space-y-4">
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Textarea
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {/* ponytail: per-creator auto-record settings — set once here */}
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Zap size={13} className="text-primary" /> Auto-record when live
              </p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                Recording starts automatically every time this creator goes live.
              </p>
            </div>
            <Switch
              checked={autoRecord}
              onCheckedChange={setAutoRecord}
              aria-label="Auto-record when live"
            />
          </div>
          {autoRecord && (
            <Select
              label="Auto-record quality"
              hint="Used for all future auto-recordings of this creator."
              value={autoRecordQuality}
              onChange={(e) => setAutoRecordQuality(e.target.value)}
              options={[
                { value: 'best', label: 'Best (source quality)' },
                { value: '1080p', label: '1080p' },
                { value: '720p', label: '720p' },
                { value: '480p', label: '480p' },
              ]}
            />
          )}
          <Button loading={update.isPending} onClick={() => update.mutate()} className="w-full">
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCreatorDialog({
  creator,
  open,
  onOpenChange,
}: {
  creator: CreatorDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const remove = useMutation({
    mutationFn: () => window.desktop.creators.remove(creator.id),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Creator deleted', message: `${creator.displayName} has been removed.` });
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Delete Creator" description={`Are you sure you want to remove ${creator.displayName}?`}>
        <p className="text-sm text-foreground-muted">
          This action cannot be undone. All associated data will be removed.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreatorDetailsDialog({
  creator,
  open,
  onOpenChange,
}: {
  creator: CreatorDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={creator.displayName} description={`@${creator.username}`}>
    <dl className="divide-y divide-border text-sm">
      <DetailRow label="Plugin" value={creator.pluginId} />
      <DetailRow label="External ID" value={creator.externalId} />
      <DetailRow label="Created" value={new Date(creator.createdAt).toLocaleString()} />
      <DetailRow label="Updated" value={new Date(creator.updatedAt).toLocaleString()} />
      <DetailRow label="Favorite" value={creator.isFavorite ? 'Yes' : 'No'} />
      {creator.notes && <DetailRow label="Notes" value={creator.notes} />}
    </dl>
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

function TagsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const { data: tags } = useQuery({
    queryKey: ['creator-tags'],
    queryFn: () => window.desktop.creators.getTags(),
  });

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('');

  const createTag = useMutation({
    mutationFn: () => window.desktop.creators.createTag(newTagName, newTagColor || undefined),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Tag created', message: `${newTagName} tag created.` });
      void queryClient.invalidateQueries({ queryKey: ['creator-tags'] });
      setNewTagName('');
      setNewTagColor('');
    },
  });

  const removeTag = useMutation({
    mutationFn: (id: string) => window.desktop.creators.removeTag(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['creator-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Manage Tags" description="Create and manage creator tags.">
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name"
              className="flex-1"
            />
            <Input
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              placeholder="Color (hex)"
              className="w-24"
            />
            <Button
              size="sm"
              disabled={!newTagName.trim()}
              loading={createTag.isPending}
              onClick={() => createTag.mutate()}
            >
              <Plus size={14} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(tags ?? []).map((tag) => (
              <Badge key={tag.id} variant="default" className="gap-1">
                {tag.color && (
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                )}
                {tag.name}
                <button
                  type="button"
                  onClick={() => removeTag.mutate(tag.id)}
                  className="ml-1 text-foreground-muted hover:text-error"
                >
                  <X size={12} />
                </button>
              </Badge>
            ))}
            {(tags ?? []).length === 0 && (
              <p className="text-sm text-foreground-muted">No tags yet.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CollectionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const { data: collections } = useQuery({
    queryKey: ['creator-collections'],
    queryFn: () => window.desktop.creators.getCollections(),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createCollection = useMutation({
    mutationFn: () => window.desktop.creators.createCollection(name, description || undefined),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Collection created', message: `${name} collection created.` });
      void queryClient.invalidateQueries({ queryKey: ['creator-collections'] });
      setName('');
      setDescription('');
    },
  });

  const removeCollection = useMutation({
    mutationFn: (id: string) => window.desktop.creators.removeCollection(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['creator-collections'] }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Manage Collections" description="Organize creators into collections.">
        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
            />
            <Button
              size="sm"
              disabled={!name.trim()}
              loading={createCollection.isPending}
              onClick={() => createCollection.mutate()}
            >
              Create
            </Button>
          </div>
          <div className="space-y-2">
            {(collections ?? []).map((col) => (
              <div key={col.id} className="flex items-center justify-between rounded-sm border border-border bg-elevated px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{col.name}</p>
                  {col.description && <p className="text-xs text-foreground-muted">{col.description}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCollection.mutate(col.id)}
                  aria-label={`Delete ${col.name}`}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            {(collections ?? []).length === 0 && (
              <p className="text-sm text-foreground-muted">No collections yet.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [text, setText] = useState('');

  const importData = useMutation({
    mutationFn: (data: string) =>
      format === 'json' ? window.desktop.creators.importJson(data) : window.desktop.creators.importCsv(data),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
      if (result.errors.length > 0) {
        pushToast({ level: 'warn', title: 'Import completed with errors', message: result.errors.join('; ') });
      } else {
        pushToast({ level: 'info', title: 'Import successful', message: `Imported ${result.imported} creators.` });
      }
      onOpenChange(false);
      setText('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Import Creators" description="Import creators from JSON or CSV.">
        <div className="space-y-4">
          <Select
            label="Format"
            value={format}
            onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}
            options={[
              { value: 'json', label: 'JSON' },
              { value: 'csv', label: 'CSV' },
            ]}
          />
          <Textarea
            label="Paste data"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={format === 'json' ? '[{"pluginId":"...", "externalId":"...", "username":"...", "displayName":"..."}]' : 'pluginId,externalId,username,displayName\n...'}
          />
          <Button
            loading={importData.isPending}
            disabled={!text.trim()}
            onClick={() => importData.mutate(text)}
            className="w-full"
          >
            Import
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecordDialog({
  creator,
  open,
  onOpenChange,
}: {
  creator: CreatorDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pushToast = useToastStore((state) => state.push);

  // ponytail: '' means "until stream ends"; otherwise minutes.
  const [duration, setDuration] = useState('');
  const [quality, setQuality] = useState('best');
  // ponytail: '' means single file; otherwise split into parts every N min.
  const [segment, setSegment] = useState('');

  const startRecording = useMutation({
    mutationFn: () =>
      window.desktop.recording.startForCreator(creator.id, {
        // ponytail: the select values are already minutes — no conversion.
        // Splitting and stop-after are mutually exclusive (split wins).
        durationMinutes: segment !== '' ? undefined : duration === '' ? undefined : Number(duration),
        quality,
        segmentMinutes: segment === '' ? undefined : Number(segment),
      }),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Recording started', message: `Recording ${creator.displayName}.` });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      pushToast({ level: 'error', title: 'Recording failed', message: err instanceof Error ? err.message : 'Unknown error' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Record ${creator.displayName}`} description="Configure and start recording.">
        <div className="space-y-4">
          <Select
            label="Quality"
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            options={[
              { value: 'best', label: 'Best (auto)' },
              { value: '1080p', label: '1080p' },
              { value: '720p', label: '720p' },
              { value: '480p', label: '480p' },
            ]}
          />
          <Select
            label="Duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            options={[
              { value: '', label: 'Until stream ends' },
              { value: '2', label: '2 minutes' },
              { value: '5', label: '5 minutes' },
              { value: '15', label: '15 minutes' },
              { value: '30', label: '30 minutes' },
              { value: '60', label: '1 hour' },
              { value: '120', label: '2 hours' },
            ]}
          />
          {/* ponytail: long streams → timestamped parts instead of one huge file */}
          <Select
            label="Split into parts (optional)"
            hint="Each part is saved to the Library as it finishes — recommended for long streams."
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            options={[
              { value: '', label: 'No split (single file)' },
              { value: '15', label: 'Every 15 minutes' },
              { value: '30', label: 'Every 30 minutes' },
              { value: '60', label: 'Every hour' },
            ]}
          />
          <Button loading={startRecording.isPending} onClick={() => startRecording.mutate()} className="w-full">
            <Radio size={14} /> Start Recording
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
