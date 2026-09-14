import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Video,
  Pause,
  Play,
  RefreshCw,
  XCircle,

  CheckCircle,
  AlertCircle,
  Clock,
  Loader,
  Trash2,
  Search,
  ChevronDown,
  ChevronUp,
  Copy,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Input, PageContainer, SectionHeader, Skeleton } from '@rekordly/ui';
import type { RecordingJobDto } from '@rekordly/shared/contracts';
import { formatBytes, formatDuration } from '@rekordly/shared/format';
import { useToastStore } from '../stores/toast-store';

const STATUS_CONFIG: Record<string, { color: string; variant: 'success' | 'error' | 'warning' | 'info' | 'muted'; icon: typeof Video }> = {
  queued: { color: 'text-info', variant: 'info', icon: Clock },
  recording: { color: 'text-error', variant: 'error', icon: Loader },
  paused: { color: 'text-warning', variant: 'warning', icon: Pause },
  completed: { color: 'text-success', variant: 'success', icon: CheckCircle },
  failed: { color: 'text-error', variant: 'error', icon: AlertCircle },
  preparing: { color: 'text-info', variant: 'info', icon: Loader },
  verifying: { color: 'text-info', variant: 'info', icon: Loader },
  // ponytail: post-download states — without these the card VANISHED from
  // the list while the pipeline was finishing (stuck ffmpeg etc.), since
  // neither the Active nor the Failed section rendered them.
  processing: { color: 'text-info', variant: 'info', icon: Loader },
  stopping: { color: 'text-warning', variant: 'warning', icon: Loader },
  cancelled: { color: 'text-muted', variant: 'muted', icon: XCircle },
};

type FilterTab = 'all' | 'active' | 'completed' | 'failed';

const ACTIVE_STATUSES = ['queued', 'recording', 'paused', 'preparing', 'verifying', 'processing', 'stopping'];

export function RecordingsPage() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  // ponytail: honour ?filter= deep links (e.g. dashboard → failed jobs).
  const [searchParams] = useSearchParams();
  const filterParam = searchParams.get('filter');
  const [filterTab, setFilterTab] = useState<FilterTab>(
    filterParam === 'active' || filterParam === 'completed' || filterParam === 'failed' ? filterParam : 'all',
  );
  const [search, setSearch] = useState('');

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
    refetchInterval: 2000,
  });

  // Listen for recording events to invalidate cache
  useEffect(() => {
    const unsub = window.desktop.recording.onEvent(() => {
      void queryClient.invalidateQueries({ queryKey: ['recording-jobs'] });
    });
    return unsub;
  }, [queryClient]);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['recording-jobs'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };

  const cancel = useMutation({
    mutationFn: (jobId: string) => window.desktop.recording.cancel(jobId),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Recording cancelled', message: 'The recording was cancelled.' });
      invalidate();
    },
  });

  const retry = useMutation({
    mutationFn: (jobId: string) => window.desktop.recording.retry(jobId),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Recording retrying', message: 'The recording is being retried.' });
      invalidate();
    },
  });

  const pause = useMutation({
    mutationFn: (jobId: string) => window.desktop.recording.pause(jobId),
    onSuccess: () => invalidate(),
  });

  const resume = useMutation({
    mutationFn: (jobId: string) => window.desktop.recording.resume(jobId),
    onSuccess: () => invalidate(),
    // ponytail: resuming a cancelled recording fails when the broadcast has
    // ended — surface that as a clear error instead of a silent no-op.
    onError: (error: unknown) => {
      pushToast({
        level: 'error',
        title: 'Cannot resume recording',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const removeJob = useMutation({
    mutationFn: (jobId: string) => window.desktop.recording.removeJob(jobId),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Job removed', message: 'The job was removed from the list.' });
      invalidate();
    },
    onError: (err: unknown) => {
      pushToast({
        level: 'error',
        title: 'Remove failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });

  const clearFailed = useMutation({
    mutationFn: () => window.desktop.recording.clearFailed(),
    onSuccess: (count) => {
      pushToast({
        level: 'info',
        title: 'Failed jobs cleared',
        message: count > 0 ? `Removed ${count} failed ${count === 1 ? 'job' : 'jobs'}.` : 'No failed jobs to clear.',
      });
      invalidate();
    },
    onError: (err: unknown) => {
      pushToast({
        level: 'error',
        title: 'Clear failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });

  const retryAllFailed = useMutation({
    mutationFn: async (jobIds: string[]) => {
      for (const id of jobIds) {
        await window.desktop.recording.retry(id);
      }
      return jobIds.length;
    },
    onSuccess: (count) => {
      pushToast({
        level: 'info',
        title: 'Retrying failed jobs',
        message: count > 0 ? `Queued ${count} ${count === 1 ? 'job' : 'jobs'} for retry.` : 'No failed jobs to retry.',
      });
      invalidate();
    },
  });

  const allJobs = useMemo(() => {
    // newest first
    return [...(jobs ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [jobs]);

  const activeJobs = allJobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
  const completedJobs = allJobs.filter((j) => j.status === 'completed');
  // ponytail: cancelled jobs are dead jobs too — group them with Failed so
  // they show up in a section (previously they were invisible but still
  // counted in the "All" tab, producing an empty list with a non-zero count).
  const failedJobs = allJobs.filter((j) => j.status === 'failed' || j.status === 'cancelled');

  const q = search.trim().toLowerCase();
  const matches = (job: RecordingJobDto): boolean =>
    !q ||
    job.title.toLowerCase().includes(q) ||
    job.platformId.toLowerCase().includes(q);

  const visibleActive = activeJobs.filter(matches);
  const visibleCompleted = completedJobs.filter(matches);
  const visibleFailed = failedJobs.filter(matches);

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allJobs.length },
    { key: 'active', label: 'Active', count: activeJobs.length },
    { key: 'completed', label: 'Completed', count: completedJobs.length },
    { key: 'failed', label: 'Failed', count: failedJobs.length },
  ];

  const showSection = (tab: FilterTab): boolean => filterTab === 'all' || filterTab === tab;

  return (
    <PageContainer>
      <SectionHeader
        title="Recordings"
        description="Active, queued and recent recording sessions."
        actions={
          <div className="flex items-center gap-2">
            {failedJobs.length > 0 && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={retryAllFailed.isPending}
                  onClick={() => retryAllFailed.mutate(failedJobs.map((j) => j.id))}
                >
                  <RefreshCw size={14} /> Retry All Failed
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={clearFailed.isPending}
                  onClick={() => clearFailed.mutate()}
                >
                  <Trash2 size={14} /> Clear All Failed
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard icon={Loader} accent="var(--color-primary)" label="Active" value={activeJobs.length} />
        <SummaryCard icon={CheckCircle} accent="#34d399" label="Completed" value={completedJobs.length} />
        <SummaryCard icon={AlertCircle} accent="#f87171" label="Failed" value={failedJobs.length} />
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border bg-surface p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterTab(tab.key)}
              className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                filterTab === tab.key
                  ? 'bg-primary text-white'
                  : 'text-foreground-secondary hover:bg-hover hover:text-foreground'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 ${filterTab === tab.key ? 'text-white/70' : 'text-foreground-muted'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <Input
            placeholder="Search by title or platform..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && allJobs.length === 0 && (
        <EmptyState
          icon={Video}
          title="No recordings"
          description="Start a recording or wait for monitored creators to go live."
        />
      )}

      {/* No results for current filter/search */}
      {!isLoading && allJobs.length > 0 &&
        visibleActive.length === 0 && visibleCompleted.length === 0 && visibleFailed.length === 0 && (
          <EmptyState
            icon={Search}
            title="Nothing matches your filters"
            description="Try a different tab or search term."
          />
        )}

      {/* Active Jobs */}
      {!isLoading && showSection('active') && visibleActive.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">Active Recordings</h3>
          {visibleActive.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onCancel={() => cancel.mutate(job.id)}
              onPause={() => pause.mutate(job.id)}
              onResume={() => resume.mutate(job.id)}
            />
          ))}
        </div>
      )}

      {/* Failed Jobs */}
      {!isLoading && showSection('failed') && visibleFailed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">Failed</h3>
          {visibleFailed.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onRetry={() => retry.mutate(job.id)}
              onResume={() => resume.mutate(job.id)}
              onRemove={() => removeJob.mutate(job.id)}
              removing={removeJob.isPending && removeJob.variables === job.id}
            />
          ))}
        </div>
      )}

      {/* Completed Jobs */}
      {!isLoading && showSection('completed') && visibleCompleted.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">Completed</h3>
          {visibleCompleted.map((job) => (
            <JobCard key={job.id} job={job} onRemove={() => removeJob.mutate(job.id)} removing={removeJob.isPending && removeJob.variables === job.id} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function SummaryCard({
  icon: Icon,
  accent,
  label,
  value,
}: {
  icon: typeof Video;
  accent: string;
  label: string;
  value: number;
}) {
  return (
    <Card className="flex items-center gap-3 p-3 transition-colors hover:bg-elevated/60">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border`}
        style={{ color: accent, borderColor: 'color-mix(in srgb, currentColor 25%, transparent)', background: 'color-mix(in srgb, currentColor 8%, transparent)' }}
      >
        <Icon size={14} />
      </div>
      <div>
        <p className="text-lg font-semibold tabular-nums leading-tight text-foreground">{value}</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground-muted">{label}</p>
      </div>
    </Card>
  );
}

// ponytail: live elapsed-recorded time. Ticks every second while the job is
// still running so the duration updates without waiting for the 2s refetch.
function useElapsedSeconds(
  startedAt?: string | null,
  finishedAt?: string | null,
): number | null {
  const [, setNow] = useState(() => Date.now());
  const running = Boolean(startedAt) && !finishedAt;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  if (!startedAt) return null;
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  return Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
}

function JobCard({
  job,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onRemove,
  removing,
}: {
  job: RecordingJobDto;
  onCancel?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const [showError, setShowError] = useState(false);
  const [copied, setCopied] = useState(false);
  const config = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued;
  const elapsedSeconds = useElapsedSeconds(job.startedAt, job.finishedAt);
  if (!config) return null;
  const Icon = config.icon;
  const isActive = ACTIVE_STATUSES.includes(job.status);

  const copyError = (): void => {
    if (!job.error) return;
    void navigator.clipboard.writeText(job.error).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Card className="transition-all duration-150 hover:border-primary/25 hover:bg-elevated/50">
      <div className="flex items-start gap-3 p-1">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border ${config.color}`}
          style={{ borderColor: 'color-mix(in srgb, currentColor 25%, transparent)', background: 'color-mix(in srgb, currentColor 8%, transparent)' }}
        >
          <Icon size={14} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">{job.title}</h3>
            <Badge variant={config.variant}>{job.status}</Badge>
            {job.pluginId && <Badge variant="muted">{job.pluginId}</Badge>}
          </div>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-foreground-muted">{job.streamUrl}</p>

          {/* Progress info */}
          {(isActive && (job.speed > 0 || job.bytesDownloaded > 0 || elapsedSeconds !== null)) && (
            <div className="mt-1.5 flex items-center gap-3 text-[10px] tabular-nums text-foreground-muted">
              {elapsedSeconds !== null && (
                <span
                  className={`inline-flex items-center gap-1 ${job.status === 'recording' ? 'text-error' : ''}`}
                  title="Recorded duration"
                >
                  <Clock size={10} /> {formatDuration(elapsedSeconds)}
                </span>
              )}
              {job.bytesDownloaded > 0 && (
                <span>{formatBytes(job.bytesDownloaded)}</span>
              )}
              {job.speed > 0 && (
                <span>{formatBytes(job.speed)}/s</span>
              )}
              <span>Attempt {job.attempts}/{job.maxAttempts}</span>
            </div>
          )}

          {/* Completed info */}
          {job.status === 'completed' && (
            <p className="mt-1 text-xs tabular-nums text-success">
              Completed {job.finishedAt ? new Date(job.finishedAt).toLocaleString() : ''}
              {elapsedSeconds !== null && (
                <span className="ml-2 inline-flex items-center gap-1 text-foreground-muted">
                  <Clock size={10} className="inline" /> {formatDuration(elapsedSeconds)}
                </span>
              )}
            </p>
          )}

          {/* Failed info — collapsible so long errors don't flood the card */}
          {job.status === 'failed' && job.error && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowError((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs text-error hover:text-error/80"
              >
                {showError ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showError ? 'Hide error details' : 'Show error details'}
              </button>
              {showError && (
                <div className="mt-1.5 max-h-40 overflow-y-auto rounded-sm border-l-2 border-error/60 bg-elevated p-2">
                  <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-error">
                    {job.error}
                  </pre>
                  <Button variant="ghost" size="sm" onClick={copyError} className="mt-1.5">
                    <Copy size={12} /> {copied ? 'Copied!' : 'Copy error'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {job.status === 'recording' && onPause && (
            <Button variant="ghost" size="icon" onClick={onPause} aria-label="Pause recording">
              <Pause size={14} />
            </Button>
          )}
          {/* ponytail: cancelled jobs can be resumed while the broadcast is
              still live — the main process rejects it otherwise. */}
          {(job.status === 'paused' || job.status === 'cancelled') && onResume && (
            <Button variant="ghost" size="icon" onClick={onResume} aria-label="Resume recording">
              <Play size={14} />
            </Button>
          )}
          {/* ponytail: failed and cancelled jobs can be retried */}
          {(job.status === 'failed' || job.status === 'cancelled') && onRetry && (
            <Button variant="ghost" size="icon" onClick={onRetry} aria-label="Retry recording">
              <RefreshCw size={14} />
            </Button>
          )}
          {isActive && onCancel && (
            <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel recording">
              <XCircle size={14} />
            </Button>
          )}
          {!isActive && onRemove && (
            <Button
              variant="ghost"
              size="icon"
              loading={removing}
              onClick={onRemove}
              aria-label="Remove job from list"
            >
              {!removing && <Trash2 size={14} />}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}