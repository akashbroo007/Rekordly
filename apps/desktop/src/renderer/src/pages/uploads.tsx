import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CloudUpload,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageContainer,
  SectionHeader,
  Select,
  Skeleton,
} from '@rekordly/ui';
import { formatBytes } from '@rekordly/shared/format';
import { useToastStore } from '../stores/toast-store';

const STATUS_COLORS: Record<string, 'success' | 'error' | 'info' | 'muted'> = {
  queued: 'muted',
  uploading: 'info',
  paused: 'muted',
  completed: 'success',
  failed: 'error',
  cancelled: 'muted',
};

export function UploadsPage() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [selectedProvider, setSelectedProvider] = useState('gofile');

  // Live updates from the upload worker; progress fires often, so invalidate
  // at most once per second.
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

  const { data: uploads, isLoading, isError } = useQuery({
    queryKey: ['uploads', 'all'],
    queryFn: () => window.desktop.uploads.list(),
  });

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

  useEffect(() => {
    if (settings?.uploadProviders?.defaultProvider) {
      setSelectedProvider(settings.uploadProviders.defaultProvider);
    }
  }, [settings]);

  const selectedMeta = providerMeta?.find((m) => m.id === selectedProvider);
  const availableProviders = providers?.filter((p) => p.authenticated) ?? [];

  const pickAndAdd = useMutation({
    mutationFn: async () => {
      const filePath = await window.desktop.uploads.pickFile();
      if (filePath === null) return null;
      return window.desktop.uploads.add({ providerId: selectedProvider, sourcePath: filePath });
    },
    onSuccess: (added) => {
      if (added !== null) {
        const providerName = selectedMeta?.name ?? selectedProvider;
        pushToast({ title: 'Upload queued', message: `File queued for upload to ${providerName}`, level: 'info' });
      }
      void queryClient.invalidateQueries({ queryKey: ['uploads'] });
    },
  });

  const clearCompleted = useMutation({
    mutationFn: () => window.desktop.uploads.clearCompleted(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uploads'] }),
  });

  const clearFailed = useMutation({
    mutationFn: () => window.desktop.uploads.clearFailed(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uploads'] }),
  });

  const items = uploads ?? [];

  const formatMaxSize = (bytes: number | null): string => {
    if (bytes === null) return 'Unlimited';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${bytes} B`;
  };

  return (
    <PageContainer>
      <SectionHeader
        title="Uploads"
        description="Upload recordings to cloud storage hosts."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => clearCompleted.mutate()}>
              Clear Completed
            </Button>
            <Button variant="secondary" size="sm" onClick={() => clearFailed.mutate()}>
              Clear Failed
            </Button>
            <Button size="sm" onClick={() => pickAndAdd.mutate()} disabled={pickAndAdd.isPending || availableProviders.length === 0}>
              <CloudUpload size={14} /> Upload File
            </Button>
          </div>
        }
      />

      {/* Provider selector and status */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-56">
            <Select
              label="Upload to"
              options={availableProviders.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
            />
          </div>
          {providers !== undefined && providers.length > 0 && (
            <div className="flex items-center gap-2 pb-1">
              {providers.map((p) => (
                <Badge key={p.id} variant={p.healthy ? 'success' : 'muted'}>
                  {p.name}: {p.healthy ? 'online' : 'offline'}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {selectedMeta && (
          <div className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border border-border bg-surface px-3 py-2 text-xs text-foreground-muted">
            <span>
              Max file: <span className="font-medium text-foreground">{formatMaxSize(selectedMeta.maxFileSize)}</span>
            </span>
            <span>
              Speed: <span className={`font-medium ${selectedMeta.downloadSpeed === 'unthrottled' ? 'text-success' : 'text-warning'}`}>{selectedMeta.downloadSpeed}</span>
            </span>
            <span>
              Expiry: <span className="font-medium text-foreground">{selectedMeta.fileExpiry}</span>
            </span>
            {selectedMeta.adsOnDownload && (
              <span className="text-warning">Ads on download page</span>
            )}
          </div>
        )}

        {availableProviders.length === 0 && (
          <p className="text-xs text-warning">
            No upload providers are configured. Go to Settings → Cloud Storage to set up a provider.
          </p>
        )}
      </div>

      {isError && <p className="text-sm text-error">Failed to load uploads.</p>}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CloudUpload}
          title="No uploads yet"
          description="Upload a recording to cloud storage. Select a provider above and click Upload File."
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.destinationPath ?? item.sourcePath.split('\\').pop()?.split('/').pop() ?? item.sourcePath}</p>
                  <p className="text-xs text-foreground-secondary">
                    {item.providerId} · {formatBytes(item.bytesUploaded)}
                    {item.totalBytes > 0 ? ` / ${formatBytes(item.totalBytes)}` : ''}
                    {item.status === 'uploading' && item.speed > 0 ? ` · ${formatBytes(item.speed)}/s` : ''}
                    {item.error ? ` · ${item.error}` : ''}
                  </p>
                </div>
                <Badge variant={STATUS_COLORS[item.status] ?? 'muted'}>{item.status}</Badge>
                <div className="flex shrink-0 items-center gap-1">
                  {item.status === 'uploading' && (
                    <Button variant="ghost" size="icon" aria-label="Pause" onClick={() => window.desktop.uploads.pause(item.id)}>
                      <Pause size={14} />
                    </Button>
                  )}
                  {item.status === 'paused' && (
                    <Button variant="ghost" size="icon" aria-label="Resume" onClick={() => window.desktop.uploads.resume(item.id)}>
                      <Play size={14} />
                    </Button>
                  )}
                  {(item.status === 'failed' || item.status === 'cancelled') && (
                    <Button variant="ghost" size="icon" aria-label="Retry" onClick={() => window.desktop.uploads.retry(item.id)}>
                      <RefreshCw size={14} />
                    </Button>
                  )}
                  {(item.status === 'queued' || item.status === 'uploading' || item.status === 'paused') && (
                    <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => window.desktop.uploads.cancel(item.id)}>
                      <XCircle size={14} />
                    </Button>
                  )}
                  {item.status === 'completed' && item.destinationPath && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Open link"
                      onClick={() => {
                        void navigator.clipboard.writeText(item.destinationPath ?? '');
                        pushToast({ title: 'Link copied', message: item.destinationPath ?? '', level: 'info' });
                      }}
                    >
                      <ExternalLink size={14} />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => window.desktop.uploads.remove(item.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
              {(item.status === 'uploading' || item.status === 'completed') && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hover/60">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${Math.min(100, item.percent)}%` }}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}