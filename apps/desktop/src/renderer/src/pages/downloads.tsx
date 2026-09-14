import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  XCircle,
  ArrowUpDown,
  PauseCircle,
  PlayCircle,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
} from '@rekordly/ui';
import type { DownloadProbeResultDto, DownloadQueueItemDto } from '@rekordly/shared/contracts';
import { useToastStore } from '../stores/toast-store';
import { formatBytes, formatEta } from '@rekordly/shared/format';

type FilterStatus = 'all' | 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';

export function DownloadsPage() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [addOpen, setAddOpen] = useState(false);

  // ponytail: live updates from the download engine. Progress events fire
  // frequently, so invalidate at most once per second instead of per event.
  const lastInvalidateRef = useRef(0);
  useEffect(() => {
    const unsub = window.desktop.downloads.onEvent((event) => {
      if (event.type === 'download-progress') {
        const now = Date.now();
        if (now - lastInvalidateRef.current < 1000) return;
        lastInvalidateRef.current = now;
      }
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
      void queryClient.invalidateQueries({ queryKey: ['downloads-count'] });
    });
    return unsub;
  }, [queryClient]);

  const { data: downloads, isLoading, isError } = useQuery({
    queryKey: ['downloads', filterStatus],
    queryFn: () => window.desktop.downloads.list(filterStatus === 'all' ? undefined : filterStatus),
  });

  const { data: statusCounts } = useQuery({
    queryKey: ['downloads-count'],
    queryFn: () => window.desktop.downloads.countByStatus(),
  });

  const items = downloads ?? [];
  const counts = statusCounts ?? {};

  const pauseAll = useMutation({
    mutationFn: () => window.desktop.downloads.pauseAll(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const resumeAll = useMutation({
    mutationFn: () => window.desktop.downloads.resumeAll(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const retryAll = useMutation({
    mutationFn: () => window.desktop.downloads.retryAll(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const clearCompleted = useMutation({
    mutationFn: () => window.desktop.downloads.clearCompleted(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const clearFailed = useMutation({
    mutationFn: () => window.desktop.downloads.clearFailed(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  return (
    <PageContainer>
      <SectionHeader
        title="Downloads"
        description="Manage stream downloads and their progress."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => pauseAll.mutate()}>
              <PauseCircle size={14} /> Pause All
            </Button>
            <Button variant="secondary" size="sm" onClick={() => resumeAll.mutate()}>
              <PlayCircle size={14} /> Resume All
            </Button>
            <Button variant="secondary" size="sm" onClick={() => retryAll.mutate()}>
              <RotateCcw size={14} /> Retry All
            </Button>
            <Button variant="secondary" size="sm" onClick={() => clearCompleted.mutate()}>
              Clear Completed
            </Button>
            <Button variant="secondary" size="sm" onClick={() => clearFailed.mutate()}>
              Clear Failed
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Download size={14} /> Add Download
            </Button>
          </div>
        }
      />

      {/* Status tabs */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {(['all', 'queued', 'downloading', 'paused', 'completed', 'failed', 'cancelled'] as const).map((status) => (
          <Button
            key={status}
            variant={filterStatus === status ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterStatus(status)}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
            {status !== 'all' && counts[status] !== undefined && (
              <Badge variant="muted" className="ml-1">{counts[status]}</Badge>
            )}
          </Button>
        ))}
      </div>

      {isError && <p className="text-sm text-error">Failed to load downloads.</p>}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={Download}
          title="No downloads"
          description={filterStatus === 'all' ? 'Add a download to get started.' : `No ${filterStatus} downloads.`}
          action={filterStatus === 'all' ? <Button onClick={() => setAddOpen(true)}><Download size={14} /> Add Download</Button> : undefined}
        />
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <DownloadItem key={item.id} item={item} />
          ))}
        </div>
      )}

      <AddDownloadDialog open={addOpen} onOpenChange={setAddOpen} />
    </PageContainer>
  );
}

function DownloadItem({ item }: { item: DownloadQueueItemDto }) {
  const queryClient = useQueryClient();

  const pause = useMutation({
    mutationFn: () => window.desktop.downloads.pause(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const resume = useMutation({
    mutationFn: () => window.desktop.downloads.resume(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const cancel = useMutation({
    mutationFn: () => window.desktop.downloads.cancel(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const retry = useMutation({
    mutationFn: () => window.desktop.downloads.retry(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const remove = useMutation({
    mutationFn: () => window.desktop.downloads.remove(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const statusVariant = {
    queued: 'info' as const,
    downloading: 'success' as const,
    paused: 'warning' as const,
    completed: 'success' as const,
    failed: 'error' as const,
    cancelled: 'muted' as const,
  }[item.status] ?? 'default' as const;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-medium text-foreground">{item.title ?? item.fileName}</h3>
              <Badge variant={statusVariant}>{item.status}</Badge>
              {!item.audioOnly && item.quality !== 'best' && item.quality !== '' && (
                <Badge variant="info">{item.quality}</Badge>
              )}
              {item.audioOnly && <Badge variant="info">MP3</Badge>}
              {item.priority > 0 && <Badge variant="info">P{item.priority}</Badge>}
            </div>
            <p className="mt-1 text-xs text-foreground-muted">{item.fileName}</p>

            {/* Progress bar */}
            {(item.status === 'downloading' || item.status === 'queued') && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[10px] text-foreground-muted">
                  <span>{item.percent}%</span>
                  <span>{item.speed > 0 ? `${formatBytes(item.speed)}/s` : ''}</span>
                  <span>{formatEta(item.eta)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-foreground-muted">
                  {formatBytes(item.bytesDownloaded)} / {item.totalBytes > 0 ? formatBytes(item.totalBytes) : '?'}
                </p>
              </div>
            )}

            {item.status === 'completed' && (
              <p className="mt-1 text-xs text-success">Completed {item.finishedAt ? new Date(item.finishedAt).toLocaleString() : ''}</p>
            )}

            {item.status === 'failed' && item.error && (
              <p className="mt-1 text-xs text-error">{item.error}</p>
            )}

            {item.status === 'paused' && (
              <p className="mt-1 text-xs text-warning">Paused at {item.percent}%</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {item.status === 'downloading' && (
              <Button variant="ghost" size="icon" onClick={() => pause.mutate()}><Pause size={14} /></Button>
            )}
            {item.status === 'paused' && (
              <Button variant="ghost" size="icon" onClick={() => resume.mutate()}><Play size={14} /></Button>
            )}
            {(item.status === 'failed' || item.status === 'cancelled') && (
              <Button variant="ghost" size="icon" onClick={() => retry.mutate()}><RefreshCw size={14} /></Button>
            )}
            {(item.status !== 'completed') && (
              <Button variant="ghost" size="icon" onClick={() => cancel.mutate()}><XCircle size={14} /></Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => remove.mutate()}><Trash2 size={14} /></Button>
          </div>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {item.status === 'downloading' && <ContextMenuItem onClick={() => pause.mutate()}><Pause size={14} /> Pause</ContextMenuItem>}
        {item.status === 'paused' && <ContextMenuItem onClick={() => resume.mutate()}><Play size={14} /> Resume</ContextMenuItem>}
        {(item.status === 'failed' || item.status === 'cancelled') && <ContextMenuItem onClick={() => retry.mutate()}><RefreshCw size={14} /> Retry</ContextMenuItem>}
        <ContextMenuItem onClick={() => window.desktop.downloads.setPriority(item.id, item.priority + 1)}>
          <ArrowUpDown size={14} /> Increase Priority
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onClick={() => remove.mutate()}>
          <Trash2 size={14} /> Remove
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Mirrors DownloadManager.deriveSiteFolder — preview only, the main process decides. */
function previewSiteFolder(url: string): string {
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

function AddDownloadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [subfolder, setSubfolder] = useState('');
  const [audioOnly, setAudioOnly] = useState(false);
  const [probe, setProbe] = useState<DownloadProbeResultDto | null>(null);
  const [quality, setQuality] = useState('best');

  // ponytail: show where the file will land so the user never has to pick a
  // folder manually — the main process derives <downloadsDir>/<website>/.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
    enabled: open,
  });
  const saveLocation =
    settings !== undefined && url.trim().length > 0
      ? `${settings.downloadsDir}\\${subfolder.trim() || previewSiteFolder(url.trim())}`
      : null;

  const resetProbe = (): void => {
    setProbe(null);
    setQuality('best');
  };

  const checkQualities = useMutation({
    mutationFn: () => window.desktop.downloads.probe(url.trim()),
    onSuccess: (result) => {
      setProbe(result);
      setQuality(result.formats[0]?.value ?? 'best');
    },
  });

  const addDownload = useMutation({
    mutationFn: () => window.desktop.downloads.add({
      url,
      // empty = auto-organize into <downloadsDir>/<website>/; a custom
      // subfolder resolves relative to the download directory.
      destination: subfolder.trim(),
      fileName: fileName || 'download',
      audioOnly,
      quality,
      title: probe?.title,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
      void queryClient.invalidateQueries({ queryKey: ['downloads-count'] });
      pushToast({ level: 'info', title: 'Download added', message: `${fileName || 'Download'} queued.` });
      onOpenChange(false);
      setUrl(''); setFileName(''); setSubfolder(''); setAudioOnly(false); resetProbe();
    },
  });

  const canCheck = url.trim().length > 0 && !checkQualities.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add Download" description="Add a URL to the download queue.">
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input label="URL" value={url} onChange={(e) => { setUrl(e.target.value); resetProbe(); }} placeholder="Video/audio page or direct file URL (YouTube, Vimeo, SoundCloud, .mp4/.mp3 links...)" />
            </div>
            <Button variant="secondary" loading={checkQualities.isPending} disabled={!canCheck} onClick={() => checkQualities.mutate()}>
              Check
            </Button>
          </div>

          {checkQualities.isError && (
            <p className="text-xs text-error">
              {checkQualities.error instanceof Error ? checkQualities.error.message : 'Could not inspect this link.'}
            </p>
          )}

          {probe !== null && (
            <div className="rounded-sm border border-border bg-surface px-3 py-2.5">
              {probe.title !== undefined && (
                <p className="truncate text-sm font-medium text-foreground">{probe.title}</p>
              )}
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-foreground-muted">
                {probe.engine === 'http' ? 'Direct file' : 'Site extraction'} · {probe.formats.length} option{probe.formats.length === 1 ? '' : 's'} available
              </p>
            </div>
          )}

          {probe !== null && !audioOnly && (
            <Select
              label="Quality"
              hint="Only the qualities this link actually offers are listed."
              options={probe.formats.map((f) => ({ value: f.value, label: f.label }))}
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
            />
          )}

          <Input label="File Name" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="Optional file name (without extension)" />
          <Input label="Subfolder (optional)" value={subfolder} onChange={(e) => setSubfolder(e.target.value)} placeholder="Custom subfolder inside the download directory" />
          {saveLocation !== null && (
            <p className="text-[11px] text-foreground-muted">
              Saves to: <span className="text-foreground-secondary">{saveLocation}</span> · change the root in Settings → Downloads
            </p>
          )}
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Audio only (MP3)</p>
              <p className="text-xs text-foreground-muted">Extract just the audio track and convert it to MP3.</p>
            </div>
            <Switch checked={audioOnly} onCheckedChange={setAudioOnly} aria-label="Audio only" />
          </div>
          <Button loading={addDownload.isPending} disabled={!url.trim()} onClick={() => addDownload.mutate()} className="w-full">
            Add Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
