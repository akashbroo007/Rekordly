import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Play, Radio, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from '@rekordly/ui';
import type { CreatorDto, MonitoringJobDto } from '@rekordly/shared/contracts';
import { useToastStore } from '../stores/toast-store';

interface LiveCreator {
  creator: CreatorDto;
  job: MonitoringJobDto;
  isRecording: boolean;
}

const ACTIVE_RECORDING_STATUSES = ['queued', 'preparing', 'recording'];

export function QuickDownloadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  // ponytail: per-download duration/quality — '' means "until stream ends".
  const [duration, setDuration] = useState('');
  const [quality, setQuality] = useState('best');

  const { data: creators } = useQuery({
    queryKey: ['creators'],
    queryFn: () => window.desktop.creators.list(),
    enabled: open,
  });

  const { data: monitoringJobs, isLoading: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ['monitoring-jobs'],
    queryFn: () => window.desktop.monitoring.getJobs(),
    refetchInterval: 10_000,
    enabled: open,
  });

  const { data: recordingJobs } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
    refetchInterval: 5_000,
    enabled: open,
  });

  const { data: monitorStatus } = useQuery({
    queryKey: ['monitoring-status'],
    queryFn: () => window.desktop.monitoring.getStatus(),
    enabled: open,
  });

  // Refetch immediately when a creator goes live/offline while the dialog is open.
  useEffect(() => {
    if (!open) return;
    return window.desktop.monitoring.onEvent((event) => {
      if (event.type === 'creator-live' || event.type === 'creator-offline') {
        void refetchJobs();
      }
    });
  }, [open, refetchJobs]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const liveCreators = useMemo<LiveCreator[]>(() => {
    const byMonitorId = new Map<string, CreatorDto>(
      (creators ?? []).map((c) => [`${c.pluginId}:${c.externalId}`, c] as const),
    );
    const activeRecordingCreatorIds = new Set(
      (recordingJobs ?? [])
        .filter((j) => ACTIVE_RECORDING_STATUSES.includes(j.status))
        .map((j) => j.creatorId)
        .filter((id): id is string => typeof id === 'string'),
    );

    return (monitoringJobs ?? [])
      .filter((job) => job.state === 'live')
      .map((job) => {
        const creator = byMonitorId.get(job.creatorId);
        if (creator === undefined) return null;
        return { creator, job, isRecording: activeRecordingCreatorIds.has(creator.id) };
      })
      .filter((entry): entry is LiveCreator => entry !== null)
      .filter(({ creator }) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          creator.displayName.toLowerCase().includes(q) ||
          creator.username.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.creator.displayName.localeCompare(b.creator.displayName));
  }, [creators, monitoringJobs, recordingJobs, search]);

  const startDownload = useMutation({
    mutationFn: (creator: CreatorDto) =>
      window.desktop.recording.startForCreator(creator.id, {
        durationMinutes: duration === '' ? undefined : Number(duration),
        quality,
      }),
    onSuccess: (_jobId, creator) => {
      pushToast({
        level: 'info',
        title: 'Download started',
        message: `Recording ${creator.displayName}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['recording-jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      pushToast({
        level: 'error',
        title: 'Download failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Quick Download"
        description="Models that are live right now. Pick one to start recording instantly."
        className="max-w-lg"
      >
        <div className="space-y-3">
          {monitorStatus && !monitorStatus.running && (
            <div className="flex items-center justify-between gap-2 rounded-sm border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <span>Monitoring is not running — live status may be stale.</span>
              <Button size="sm" variant="secondary" onClick={() => void window.desktop.monitoring.start()}>
                <Play size={12} /> Start
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              className="flex-1"
              placeholder="Search live models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* ponytail: per-recording duration + quality selection */}
          <div className="grid grid-cols-2 gap-2">
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
            <Select
              label="Quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              options={[
                { value: 'best', label: 'Best available' },
                { value: '1080p', label: '1080p' },
                { value: '720p', label: '720p' },
                { value: '480p', label: '480p' },
              ]}
            />
          </div>

          {jobsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : liveCreators.length === 0 ? (
            <EmptyState
              icon={Radio}
              title="No models are live right now"
              description="When a monitored model goes live it will appear here for instant download."
            />
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {liveCreators.map(({ creator, job, isRecording }) => (
                <div
                  key={creator.id}
                  className="flex items-center gap-3 rounded-sm border border-border bg-elevated px-3 py-2"
                >
                  {creator.avatarUrl ? (
                    <img
                      src={creator.avatarUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                      {creator.displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {creator.displayName}
                      </p>
                      <Badge variant="success">Live</Badge>
                      {isRecording && <Badge variant="info">Recording</Badge>}
                    </div>
                    <p className="truncate text-[11px] text-foreground-muted">
                      {creator.pluginId}
                      {job.lastResult?.title ? ` · ${job.lastResult.title}` : ''}
                      {typeof job.lastResult?.viewerCount === 'number' && (
                        <span className="inline-flex items-center gap-1">
                          {' '}
                          · <Eye size={10} /> {job.lastResult.viewerCount}
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    loading={
                      startDownload.isPending &&
                      startDownload.variables?.id === creator.id
                    }
                    disabled={isRecording}
                    onClick={() => startDownload.mutate(creator)}
                  >
                    {isRecording ? (
                      <>
                        <Video size={14} /> Recording
                      </>
                    ) : (
                      <>
                        <Download size={14} /> Download
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}