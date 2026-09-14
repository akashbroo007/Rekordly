import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Circle,
  Clock,
  Cpu,
  Database,
  DownloadCloud,
  Eye,
  FolderInput,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  Library,
  Logs,
  MemoryStick,
  Network,
  Pause,
  Play,
  Puzzle,
  Radio,
  RefreshCw,
  Settings,
  Shield,
  Square,
  Users,
  Video,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageContainer,
  SectionHeader,
  Skeleton,
} from '@rekordly/ui';
import {
  formatBytes,
  formatDuration,
  formatEta,
  formatPercent,
  formatSpeed,
} from '@rekordly/shared/format';
import type {
  CreatorDto,
  MonitoringJobDto,
  ProxyStatusDto,
  RecordingDto,
  RecordingJobDto,
} from '@rekordly/shared/contracts';
import { QuickDownloadDialog } from '../components/quick-download-dialog';
import { toMediaUrl, VideoPlayerDialog } from '../components/video-player-dialog';
import { useToastStore } from '../stores/toast-store';
import { friendlyErrorMessage } from '../lib/errors';

/* ------------------------------------------------------------------ */
/*  Dashboard — same refined "data terminal" language as Analytics:    */
/*  editorial micro-labels, tabular numerals, hairline dividers,       */
/*  gradient accents — now push-driven instead of poll-lagged.         */
/* ------------------------------------------------------------------ */

/** ponytail: same active set the main process counts (ipc/dashboard.ts) —
 * the UI filter previously dropped paused/verifying/processing/stopping,
 * so those jobs vanished from this card while still being counted. */
const ACTIVE_JOB_STATUSES = ['queued', 'preparing', 'recording', 'paused', 'verifying', 'processing', 'stopping'];
/** Pipeline states where byte progress is meaningless — show a shimmer bar. */
const INDETERMINATE_STATUSES = ['preparing', 'verifying', 'processing', 'stopping'];

/** ponytail: MonitoringJobDto.creatorId is the plugin-scoped composite id —
 * join via `pluginId:externalId`, exactly like quick-download-dialog.tsx. */
function joinLiveCreators(
  creators: CreatorDto[] | undefined,
  monitoringJobs: MonitoringJobDto[] | undefined,
): { creator: CreatorDto; job: MonitoringJobDto }[] {
  const byMonitorId = new Map<string, CreatorDto>(
    (creators ?? []).map((c) => [`${c.pluginId}:${c.externalId}`, c] as const),
  );
  return (monitoringJobs ?? [])
    .filter((job) => job.state === 'live')
    .map((job) => {
      const creator = byMonitorId.get(job.creatorId);
      return creator === undefined ? null : { creator, job };
    })
    .filter((entry): entry is { creator: CreatorDto; job: MonitoringJobDto } => entry !== null);
}

function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M watching`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K watching`;
  return `${count} watching`;
}

/* ------------------------------------------------------------------ */
/*  Event bridge — invalidate affected caches the instant an event      */
/*  lands, instead of waiting out the refetch interval.                 */
/* ------------------------------------------------------------------ */

function useDashboardEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = (keys: string[]): void => {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
    };
    const offRecording = window.desktop.recording.onEvent(() => {
      invalidate(['recording-jobs', 'dashboard-stats', 'recordings-recent']);
    });
    const offMonitoring = window.desktop.monitoring.onEvent((event) => {
      // creator-checked fires per creator per interval — only state changes
      // are worth an invalidation.
      if (
        event.type === 'creator-live' ||
        event.type === 'creator-offline' ||
        event.type === 'stats-updated' ||
        event.type === 'worker-started' ||
        event.type === 'worker-stopped' ||
        event.type === 'scheduler-started' ||
        event.type === 'scheduler-stopped'
      ) {
        invalidate(['monitoring-jobs', 'monitoring-dashboard', 'monitoring-status']);
      }
    });
    const offDownloads = window.desktop.downloads.onEvent((event) => {
      // download-progress fires every second; the dashboard-stats handler
      // does disk pruning, so keep it out of the progress-event hot path.
      if (event.type !== 'download-progress') {
        invalidate(['dashboard-stats']);
      }
    });
    return () => {
      offRecording();
      offMonitoring();
      offDownloads();
    };
  }, [queryClient]);
}

/** 1 Hz ticker — re-renders while `enabled`, for live elapsed-time displays. */
function useTick(enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return tick;
}

/** Staggered entrance for the page's major sections. */
function FadeIn({ delay = 0, className, children }: { delay?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function DashboardPage() {
  const [quickDownloadOpen, setQuickDownloadOpen] = useState(false);
  const openQuickDownload = () => setQuickDownloadOpen(true);
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();

  useDashboardEvents();

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['recording-jobs'] });
    void queryClient.invalidateQueries({ queryKey: ['recordings-recent'] });
    void queryClient.invalidateQueries({ queryKey: ['recordings-list'] });
    void queryClient.invalidateQueries({ queryKey: ['monitoring-dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['monitoring-status'] });
    void queryClient.invalidateQueries({ queryKey: ['monitoring-jobs'] });
    void queryClient.invalidateQueries({ queryKey: ['system-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    void queryClient.invalidateQueries({ queryKey: ['creators'] });
    void queryClient.invalidateQueries({ queryKey: ['logs-recent'] });
    void queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
  };

  return (
    <PageContainer>
      <SectionHeader
        title="Dashboard"
        description="Overview of recordings, monitoring and plugin health."
        actions={
          <Button variant="secondary" size="sm" disabled={isFetching > 0} onClick={refresh}>
            <RefreshCw size={14} className={isFetching > 0 ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />
      <LowHardwareBanner />
      <SecureProxyBanner />
      <WelcomeHeader onQuickDownload={openQuickDownload} />
      <SetupChecklist onQuickDownload={openQuickDownload} />
      <FadeIn delay={0.04}>
        <LiveNowStrip onQuickDownload={openQuickDownload} />
      </FadeIn>
      <QuickActions onQuickDownload={openQuickDownload} />
      <StatsRow onQuickDownload={openQuickDownload} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <FadeIn delay={0.05} className="lg:col-span-2">
          <MonitoringStatus />
        </FadeIn>
        <FadeIn delay={0.08} className="lg:col-span-3">
          <ActiveRecordings />
        </FadeIn>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FadeIn delay={0.05}>
          <RecentRecordings />
        </FadeIn>
        <FadeIn delay={0.08}>
          <RecentActivity />
        </FadeIn>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <FadeIn delay={0.05} className="lg:col-span-3">
          <PluginHealth />
        </FadeIn>
        <FadeIn delay={0.08} className="lg:col-span-2">
          <StorageUsage />
        </FadeIn>
      </div>
      <FadeIn delay={0.05}>
        <SystemStatus />
      </FadeIn>
      <QuickDownloadDialog open={quickDownloadOpen} onOpenChange={setQuickDownloadOpen} />
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Low-hardware banner                                                */
/* ------------------------------------------------------------------ */

/** Dismissible nudge when weak hardware is detected but Low-Resource Mode is off. */
function LowHardwareBanner() {
  const [dismissed, setDismissed] = useState(false);
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['hardware-profile'],
    queryFn: () => window.desktop.app.getHardwareProfile(),
    staleTime: Infinity,
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
  });

  if (dismissed || profile === undefined || settings === undefined) return null;
  if (!profile.recommendedLowResourceMode || settings.lowResourceMode) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm">
      <p className="text-foreground-secondary">
        This PC has limited resources ({profile.tier} tier{profile.diskType === 'hdd' ? ', HDD storage' : ''}).
        Enable Low-Resource Mode for smoother performance.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            void window.desktop.settings.set({ lowResourceMode: true }).then(() => {
              void queryClient.invalidateQueries({ queryKey: ['settings'] });
            });
          }}
        >
          Enable
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDismissed(true)} aria-label="Dismiss">
          Dismiss
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Welcome header — greeting + last-24h summary                       */
/* ------------------------------------------------------------------ */

/**
 * ponytail: slim secure-proxy status banner — only rendered when the
 * embedded proxy is in use (status ≠ idle), so users who never touch the
 * proxy see nothing. Deep-links to the Secure Proxy page for details.
 */
function useProxyStatusPush(): ProxyStatusDto | undefined {
  const [pushed, setPushed] = useState<ProxyStatusDto | undefined>(undefined);
  useEffect(() => window.desktop.proxy.onEvent((s) => setPushed(s)), []);
  return pushed;
}

function SecureProxyBanner() {
  const navigate = useNavigate();
  const { data: status } = useQuery({
    queryKey: ['proxy-status'],
    queryFn: () => window.desktop.proxy.getStatus(),
  });

  const pushStatus = useProxyStatusPush();
  const effective = pushStatus ?? status;
  if (effective === undefined || effective.state === 'idle') return null;

  const label =
    effective.state === 'active'
      ? 'Secure proxy active'
      : effective.state === 'error'
        ? 'Secure proxy failed'
        : effective.state === 'downloading'
          ? 'Downloading secure proxy runtime…'
          : 'Starting secure proxy…';

  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface px-4 py-3 text-sm">
      <p className="flex items-center gap-2 text-foreground-secondary">
        <Shield size={15} className="text-info" />
        {label}
        {effective.state === 'error' && effective.message !== undefined && (
          <span className="text-error">— {effective.message}</span>
        )}
      </p>
      <Button variant="ghost" size="sm" onClick={() => navigate('/proxy')} aria-label="Open Secure Proxy page">
        Details
      </Button>
    </div>
  );
}

function WelcomeHeader({ onQuickDownload }: { onQuickDownload: () => void }) {
  const navigate = useNavigate();
  const { data: info } = useQuery({
    queryKey: ['app-info'],
    queryFn: () => window.desktop.app.getInfo(),
    staleTime: Infinity,
  });
  const { data: recordings } = useQuery({
    queryKey: ['recordings-list', 100],
    queryFn: () => window.desktop.recordings.list(100),
  });
  const { data: monitorDashboard } = useQuery({
    queryKey: ['monitoring-dashboard'],
    queryFn: () => window.desktop.monitoring.getDashboard(),
    refetchInterval: 10000,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const last24h = (recordings ?? []).filter((r) => new Date(r.createdAt).getTime() >= cutoff);
  const capturedBytes = last24h.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);
  const liveNow = monitorDashboard?.liveCreators ?? 0;

  const hasData = (recordings?.length ?? 0) > 0 || liveNow > 0;

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <LayoutDashboard size={20} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{greeting}</h2>
            {hasData ? (
              <p className="text-sm text-foreground-muted">
                <span className="font-medium tabular-nums text-foreground-secondary">{last24h.length}</span> captured
                in the last 24h
                {capturedBytes > 0 ? <> · {formatBytes(capturedBytes)}</> : null}
                {liveNow > 0 ? (
                  <>
                    {' '}· <span className="font-medium tabular-nums text-success">{liveNow}</span> live now
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-foreground-muted">
                Rekordly {info?.version ? `v${info.version}` : ''} is running — set things up below to start capturing.
              </p>
            )}
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Button variant="secondary" size="sm" onClick={() => navigate('/analytics')}>
            <Activity size={14} /> Analytics
          </Button>
          <Button size="sm" onClick={onQuickDownload}>
            <DownloadCloud size={14} /> Quick Download
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Setup checklist — zero-state guidance, hidden once complete        */
/* ------------------------------------------------------------------ */

function SetupChecklist({ onQuickDownload }: { onQuickDownload: () => void }) {
  const navigate = useNavigate();
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();

  const { data: plugins } = useQuery({ queryKey: ['plugins'], queryFn: () => window.desktop.plugins.list() });
  const { data: creators } = useQuery({ queryKey: ['creators'], queryFn: () => window.desktop.creators.list() });
  const { data: monitorStatus } = useQuery({
    queryKey: ['monitoring-status'],
    queryFn: () => window.desktop.monitoring.getStatus(),
    refetchInterval: 5000,
  });
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => window.desktop.dashboard.getStats(),
  });

  const startMonitoring = useMutation({
    mutationFn: () => window.desktop.monitoring.start(),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Monitoring started', message: 'Live-check engine is running.' });
      void queryClient.invalidateQueries({ queryKey: ['monitoring-status'] });
      void queryClient.invalidateQueries({ queryKey: ['monitoring-dashboard'] });
    },
    onError: (err: unknown) => {
      pushToast({
        level: 'error',
        title: 'Cannot start monitoring',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });

  const pluginsInstalled = (plugins?.length ?? 0) > 0;
  const creatorsAdded = (creators?.length ?? 0) > 0;
  const monitoringOn = monitorStatus?.running ?? false;
  const hasRecordings =
    (stats?.totalRecordings ?? 0) > 0 || (stats?.jobStatusCounts['completed'] ?? 0) > 0;

  if (plugins === undefined || creators === undefined || monitorStatus === undefined || stats === undefined) {
    return null;
  }

  const steps: {
    id: string;
    label: string;
    hint: string;
    done: boolean;
    action: { label: string; to?: string; onClick?: () => void };
  }[] = [
    {
      id: 'plugin',
      label: 'Install a platform plugin',
      hint: pluginsInstalled ? 'Plugin ready' : 'Enable capture for your first platform',
      done: pluginsInstalled,
      action: { label: 'Browse Plugins', to: '/plugins' },
    },
    {
      id: 'creator',
      label: 'Track a creator',
      hint: creatorsAdded ? `${creators!.length} tracked` : 'Add the channels you want to follow',
      done: creatorsAdded,
      action: { label: 'Add Creator', to: '/creators' },
    },
    {
      id: 'monitoring',
      label: 'Start live monitoring',
      hint: monitoringOn ? 'Watching your creators' : 'Watch tracked creators for live sessions',
      done: monitoringOn,
      action: { label: 'Start Monitoring', onClick: () => startMonitoring.mutate() },
    },
    {
      id: 'recording',
      label: 'Capture your first recording',
      hint: hasRecordings ? 'Library is live' : 'Grab a stream the moment one goes live',
      done: hasRecordings,
      action: { label: 'Quick Download', onClick: onQuickDownload },
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Getting Started</h3>
          <p className="text-xs text-foreground-muted">
            {doneCount} of {steps.length} complete
          </p>
        </div>
        <div className="flex h-1.5 w-28 overflow-hidden rounded-full bg-elevated">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
      </div>
      <ul className="divide-y divide-border">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            {step.done ? (
              <CheckCircle size={16} className="shrink-0 text-success" />
            ) : (
              <Circle size={16} className="shrink-0 text-foreground-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${step.done ? 'text-foreground-muted line-through' : 'text-foreground'}`}>
                {step.label}
              </p>
              <p className="text-[11px] text-foreground-muted">{step.hint}</p>
            </div>
            {!step.done && (
              <Button
                variant="secondary"
                size="sm"
                loading={step.id === 'monitoring' && startMonitoring.isPending}
                onClick={() => {
                  if (step.action.to !== undefined) navigate(step.action.to);
                  else step.action.onClick?.();
                }}
              >
                {step.action.label}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Live Now strip — creators currently live, one-click record          */
/* ------------------------------------------------------------------ */

function LiveNowStrip({ onQuickDownload }: { onQuickDownload: () => void }) {
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();

  const { data: creators } = useQuery({ queryKey: ['creators'], queryFn: () => window.desktop.creators.list() });
  const { data: monitoringJobs } = useQuery({
    queryKey: ['monitoring-jobs'],
    queryFn: () => window.desktop.monitoring.getJobs(),
    refetchInterval: 10000,
  });
  const { data: recordingJobs } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
    refetchInterval: 5000,
  });
  const { data: monitorStatus } = useQuery({
    queryKey: ['monitoring-status'],
    queryFn: () => window.desktop.monitoring.getStatus(),
    refetchInterval: 5000,
  });

  const recordingCreatorIds = useMemo(
    () =>
      new Set(
        (recordingJobs ?? [])
          .filter((j) => ACTIVE_JOB_STATUSES.includes(j.status))
          .map((j) => j.creatorId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    [recordingJobs],
  );

  const live = useMemo(
    () =>
      joinLiveCreators(creators, monitoringJobs).sort((a, b) =>
        a.creator.displayName.localeCompare(b.creator.displayName),
      ),
    [creators, monitoringJobs],
  );

  const startRecording = useMutation({
    mutationFn: (creator: CreatorDto) =>
      window.desktop.recording.startForCreator(creator.id, { quality: creator.autoRecordQuality }),
    onSuccess: (_jobId, creator) => {
      pushToast({ level: 'info', title: 'Recording started', message: `Recording ${creator.displayName}.` });
      void queryClient.invalidateQueries({ queryKey: ['recording-jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (err: unknown) => {
      pushToast({
        level: 'error',
        title: 'Cannot start recording',
        message: friendlyErrorMessage(err),
      });
    },
  });

  const startMonitoring = useMutation({
    mutationFn: () => window.desktop.monitoring.start(),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Monitoring started', message: 'Live-check engine is running.' });
      void queryClient.invalidateQueries({ queryKey: ['monitoring-status'] });
      void queryClient.invalidateQueries({ queryKey: ['monitoring-dashboard'] });
    },
    onError: (err: unknown) => {
      pushToast({
        level: 'error',
        title: 'Cannot start monitoring',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });

  const monitoringOn = monitorStatus?.running ?? false;
  const hasTrackedCreators = (creators?.length ?? 0) > 0;

  if (creators === undefined || monitoringJobs === undefined || monitorStatus === undefined) {
    return (
      <div className="flex gap-3 overflow-hidden">
        <Skeleton className="h-24 flex-1" />
        <Skeleton className="h-24 flex-1" />
        <Skeleton className="h-24 hidden flex-1 sm:block" />
      </div>
    );
  }

  if (!monitoringOn) {
    if (!hasTrackedCreators) return null;
    return (
      <Card className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <Radio size={18} className="text-foreground-muted" />
        <p className="text-sm text-foreground-secondary">Monitoring is off — live creators can't be detected.</p>
        <div className="flex items-center gap-2">
          <Button size="sm" loading={startMonitoring.isPending} onClick={() => startMonitoring.mutate()}>
            <Play size={12} /> Start Monitoring
          </Button>
          <Button variant="ghost" size="sm" onClick={onQuickDownload}>
            Browse manually
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-error" />
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-secondary">Live Now</h3>
        </div>
        <span className="text-[11px] tabular-nums text-foreground-muted">
          {live.length} live of {monitoringJobs.length} tracked
        </span>
      </div>
      {live.length === 0 ? (
        <Card className="flex items-center justify-between gap-3 py-3">
          <p className="text-sm text-foreground-muted">
            No creators are live right now — this strip lights up the moment one starts streaming.
          </p>
          <Button variant="secondary" size="sm" onClick={onQuickDownload}>
            <DownloadCloud size={14} /> Quick Download
          </Button>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {live.map(({ creator, job }) => {
            const isRecording = recordingCreatorIds.has(creator.id);
            const result = job.lastResult;
            return (
              <Card
                key={creator.id}
                className="flex w-64 shrink-0 flex-col gap-2 border-border/80 bg-gradient-to-br from-surface to-elevated/60 p-3"
              >
                <div className="flex items-center gap-2.5">
                  {creator.avatarUrl ? (
                    <img src={creator.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-xs font-semibold text-foreground-secondary">
                      {creator.displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{creator.displayName}</p>
                    <p className="flex items-center gap-1 text-[11px] tabular-nums text-foreground-muted">
                      <Eye size={11} />
                      {result?.viewerCount != null ? formatViewerCount(result.viewerCount) : creator.pluginId}
                    </p>
                  </div>
                  <Badge variant="success" className="shrink-0">
                    LIVE
                  </Badge>
                </div>
                {result?.title && <p className="truncate text-[11px] text-foreground-secondary">{result.title}</p>}
                <div className="mt-auto">
                  {isRecording ? (
                    <Badge variant="success" className="w-full justify-center py-1">
                      Recording in progress
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      loading={startRecording.isPending && startRecording.variables?.id === creator.id}
                      onClick={() => startRecording.mutate(creator)}
                    >
                      <Play size={12} /> Record Now
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick actions                                                      */
/* ------------------------------------------------------------------ */

function QuickActions({ onQuickDownload }: { onQuickDownload: () => void }) {
  const navigate = useNavigate();
  const actions: { label: string; icon: typeof Users; path?: string; onClick?: () => void }[] = [
    { label: 'Quick Download', icon: DownloadCloud, onClick: onQuickDownload },
    { label: 'Add Creator', icon: Users, path: '/creators' },
    { label: 'Recordings', icon: Video, path: '/recordings' },
    { label: 'Open Library', icon: Library, path: '/library' },
    { label: 'Install Plugin', icon: FolderInput, path: '/plugins' },
    { label: 'View Logs', icon: Logs, path: '/logs' },
    { label: 'Settings', icon: Settings, path: '/settings' },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => (action.onClick ? action.onClick() : navigate(action.path!))}
          className="group flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-3 text-foreground-secondary transition-all duration-150 hover:border-primary/40 hover:bg-elevated hover:text-foreground"
        >
          <action.icon size={18} className="transition-colors duration-150 group-hover:text-primary" />
          <span className="text-[11px] font-medium">{action.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat cards — clickable, with trend deltas and a success ring       */
/* ------------------------------------------------------------------ */

interface StatCardDef {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Users;
  accent: string;
  /** When set, the icon tile renders as a conic success-ring instead. */
  ringPercent?: number;
  to?: string;
  onClick?: () => void;
}

function StatsRow({ onQuickDownload }: { onQuickDownload: () => void }) {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => window.desktop.dashboard.getStats(),
    refetchInterval: 10000,
  });

  const { data: monitorDashboard } = useQuery({
    queryKey: ['monitoring-dashboard'],
    queryFn: () => window.desktop.monitoring.getDashboard(),
    refetchInterval: 10000,
  });

  const { data: plugins } = useQuery({ queryKey: ['plugins'], queryFn: () => window.desktop.plugins.list() });

  const { data: recordings } = useQuery({
    queryKey: ['recordings-list', 100],
    queryFn: () => window.desktop.recordings.list(100),
  });

  const { data: storageStats } = useQuery({
    queryKey: ['storage-stats'],
    queryFn: () => window.desktop.storage.getStats(),
    refetchInterval: 30000,
  });

  // ponytail: week-over-week capture delta — same math as the Analytics
  // ActivityChart, computed from the latest 100 recordings.
  const weeklyDelta = useMemo(() => {
    if (recordings === undefined) return undefined;
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const weekNow = recordings.filter((r) => now - new Date(r.createdAt).getTime() <= 7 * dayMs).length;
    const weekPrev = recordings.filter((r) => {
      const age = now - new Date(r.createdAt).getTime();
      return age > 7 * dayMs && age <= 14 * dayMs;
    }).length;
    if (weekPrev === 0) return weekNow > 0 ? 100 : undefined;
    return Math.round(((weekNow - weekPrev) / weekPrev) * 100);
  }, [recordings]);

  const enabledPlugins = (plugins ?? []).filter((p) => p.enabled).length;

  const completed = stats?.jobStatusCounts['completed'] ?? 0;
  const failed = stats?.failedRecordings ?? 0;
  const successRate = completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : 0;

  const cards: StatCardDef[] = stats
    ? [
        {
          label: 'Creators',
          value: String(stats.totalCreators),
          sub: `${monitorDashboard?.liveCreators ?? 0} live now`,
          icon: Users,
          accent: 'var(--color-primary)',
          to: '/creators',
        },
        {
          label: 'Recordings',
          value: String(stats.totalRecordings),
          sub: weeklyDelta !== undefined ? `${weeklyDelta >= 0 ? '+' : ''}${weeklyDelta}% this week` : `${completed} completed`,
          icon: Video,
          accent: '#34d399',
          to: '/recordings',
        },
        {
          label: 'Plugins',
          value: String(stats.totalPlugins),
          sub: stats.totalPlugins > 0 ? `${enabledPlugins} enabled` : 'none installed',
          icon: Puzzle,
          accent: '#38bdf8',
          to: '/plugins',
        },
        {
          label: 'Storage Used',
          value: formatBytes(stats.totalStorageBytes),
          sub: storageStats ? `${formatBytes(storageStats.availableBytes)} free` : undefined,
          icon: HardDrive,
          accent: '#fbbf24',
          to: '/library',
        },
        {
          label: 'Live',
          value: String(monitorDashboard?.liveCreators ?? 0),
          sub: 'creators streaming',
          icon: Radio,
          accent: '#34d399',
          onClick: undefined, // opens Quick Download — handled in StatCard
        },
        {
          label: 'Success Rate',
          value: `${successRate}%`,
          sub: `${completed} completed · ${failed} failed`,
          icon: CheckCircle,
          accent: successRate >= 90 ? '#34d399' : successRate >= 50 ? '#fbbf24' : '#f87171',
          ringPercent: successRate,
          to: '/analytics',
        },
        {
          label: 'Active Jobs',
          value: String(stats.activeJobs),
          sub: 'in the pipeline',
          icon: Clock,
          accent: 'var(--color-primary)',
          to: '/recordings?filter=active',
        },
        {
          label: 'Failed',
          value: String(stats.failedRecordings),
          sub: stats.failedRecordings > 0 ? 'needs attention' : 'all clear',
          icon: XCircle,
          accent: '#f87171',
          to: '/recordings?filter=failed',
        },
      ]
    : [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card, idx) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: idx * 0.03, ease: 'easeOut' }}
        >
          <StatCard card={card} isLiveCard={card.label === 'Live'} onLiveClick={onQuickDownload} onNavigate={navigate} />
        </motion.div>
      ))}
    </div>
  );
}

function StatCard({
  card,
  isLiveCard,
  onLiveClick,
  onNavigate,
}: {
  card: StatCardDef;
  isLiveCard: boolean;
  onLiveClick: () => void;
  onNavigate: (to: string) => void;
}) {
  const target = isLiveCard ? undefined : card.to;
  const clickable = target !== undefined || card.onClick !== undefined || isLiveCard;

  const activate = (): void => {
    if (isLiveCard) onLiveClick();
    else if (card.onClick !== undefined) card.onClick();
    else if (target !== undefined) onNavigate(target);
  };

  const deg = Math.round(((card.ringPercent ?? 0) / 100) * 360);

  return (
    <Card
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Open ${card.label}` : undefined}
      className={`${clickable ? 'cursor-pointer transition-colors hover:bg-elevated/60' : ''} h-full`}
      onClick={clickable ? activate : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activate();
              }
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        {card.ringPercent !== undefined ? (
          <div
            className="relative h-9 w-9 shrink-0 rounded-full"
            style={{ background: `conic-gradient(${card.accent} ${deg}deg, var(--color-elevated) ${deg}deg)` }}
          >
            <div className="absolute inset-[4px] rounded-full bg-surface" />
          </div>
        ) : (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border"
            style={{
              color: card.accent,
              borderColor: 'color-mix(in srgb, currentColor 25%, transparent)',
              background: 'color-mix(in srgb, currentColor 8%, transparent)',
            }}
          >
            <card.icon size={16} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground-muted">{card.label}</p>
          <motion.p
            key={card.value}
            initial={{ opacity: 0.35 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
            className="text-lg font-semibold tabular-nums leading-tight text-foreground"
          >
            {card.value}
          </motion.p>
          {card.sub !== undefined && <p className="truncate text-[10px] tabular-nums text-foreground-muted">{card.sub}</p>}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Monitoring status — engine overview + start/stop controls          */
/* ------------------------------------------------------------------ */

function MonitoringStatus() {
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['monitoring-dashboard'],
    queryFn: () => window.desktop.monitoring.getDashboard(),
    refetchInterval: 10000,
  });

  const { data: status } = useQuery({
    queryKey: ['monitoring-status'],
    queryFn: () => window.desktop.monitoring.getStatus(),
    refetchInterval: 5000,
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (status?.running) await window.desktop.monitoring.stop();
      else await window.desktop.monitoring.start();
    },
    onSuccess: () => {
      pushToast({
        level: 'info',
        title: status?.running ? 'Monitoring stopped' : 'Monitoring started',
        message: status?.running
          ? 'Live-check engine paused.'
          : 'Live-check engine is now watching your creators.',
      });
      void queryClient.invalidateQueries({ queryKey: ['monitoring-status'] });
      void queryClient.invalidateQueries({ queryKey: ['monitoring-dashboard'] });
    },
    onError: (err: unknown) => {
      pushToast({
        level: 'error',
        title: 'Monitoring action failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });

  const running = status?.running ?? false;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Monitoring Status</h3>
          <p className="text-xs text-foreground-muted">Live-check engine overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={running ? 'success' : 'muted'}>{running ? 'Running' : 'Stopped'}</Badge>
          <Button
            variant={running ? 'secondary' : 'primary'}
            size="sm"
            loading={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {running ? <Square size={12} /> : <Play size={12} />}
            {running ? 'Stop' : 'Start'}
          </Button>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : dashboard === undefined ? (
        <EmptyState
          icon={Radio}
          title="Monitoring not started"
          description="Start monitoring to track creator live status."
        />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Checking" value={dashboard.currentlyChecking} accent="var(--color-primary)" />
            <MiniStat label="Queued" value={dashboard.queuedJobs} accent="#38bdf8" />
            <MiniStat label="Live" value={dashboard.liveCreators} accent="#34d399" />
            <MiniStat label="Offline" value={dashboard.offlineCreators} />
          </div>
          <div className="flex items-center justify-between rounded-sm border border-border bg-elevated px-3 py-2 text-xs">
            <span className="text-foreground-muted">Avg. Check Duration</span>
            <span className="tabular-nums text-foreground">{Math.round(dashboard.averageCheckDurationMs)}ms</span>
          </div>
          <div className="flex items-center justify-between rounded-sm border border-border bg-elevated px-3 py-2 text-xs">
            <span className="text-foreground-muted">Failed Jobs</span>
            <span className={`tabular-nums ${dashboard.failedJobs > 0 ? 'text-error' : 'text-foreground'}`}>
              {dashboard.failedJobs}
            </span>
          </div>
          {running && (status?.uptime ?? 0) > 0 && (
            <div className="flex items-center justify-between rounded-sm border border-border bg-elevated px-3 py-2 text-xs">
              <span className="text-foreground-muted">Uptime</span>
              <span className="tabular-nums text-foreground">{formatDuration((status!.uptime) / 1000)}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-sm border border-border bg-elevated px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground-muted">{label}</p>
      <p
        className={`text-lg font-semibold tabular-nums leading-tight ${accent ? '' : 'text-foreground'}`}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Active recordings — progress, speed, ETA, REC timer, controls      */
/* ------------------------------------------------------------------ */

function ActiveRecordings() {
  const navigate = useNavigate();
  const { data: jobs, isLoading } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
    refetchInterval: 3000,
  });

  const active = useMemo(() => {
    const rank = (status: string): number => {
      const order = ['recording', 'queued', 'preparing', 'paused', 'verifying', 'processing', 'stopping'];
      const idx = order.indexOf(status);
      return idx === -1 ? 99 : idx;
    };
    return (jobs ?? [])
      .filter((j) => ACTIVE_JOB_STATUSES.includes(j.status))
      .sort((a, b) => rank(a.status) - rank(b.status) || a.createdAt.localeCompare(b.createdAt));
  }, [jobs]);

  return (
    <Card className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Active Recordings</h3>
          <p className="text-xs text-foreground-muted">Jobs currently in the pipeline</p>
        </div>
        {active.length > 0 ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-primary">
            {active.length}
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => navigate('/recordings?filter=active')}>
            View all
          </Button>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : active.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState icon={Video} title="No active recordings" description="Recordings in progress will appear here." />
        </div>
      ) : (
        <div className="max-h-72 min-h-0 flex-1 overflow-y-auto pr-1">
          <ul className="space-y-2">
            {active.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function JobRow({ job }: { job: RecordingJobDto }) {
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();
  useTick(job.status === 'recording');

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['recording-jobs'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };

  const pause = useMutation({
    mutationFn: () => window.desktop.recording.pause(job.id),
    onSuccess: () => invalidate(),
  });
  const resume = useMutation({
    mutationFn: () => window.desktop.recording.resume(job.id),
    onSuccess: () => invalidate(),
    onError: (err: unknown) => {
      pushToast({
        level: 'error',
        title: 'Cannot resume recording',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });
  const cancel = useMutation({
    mutationFn: () => window.desktop.recording.cancel(job.id),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Recording cancelled', message: 'The recording was cancelled.' });
      invalidate();
    },
  });

  const indeterminate = INDETERMINATE_STATUSES.includes(job.status);
  // ponytail: live captures have no known total size, so percent stays 0 —
  // previously that meant NO bar rendered at all and the row looked broken.
  const streaming = job.status === 'recording' && job.percent <= 0;
  const showShimmer = indeterminate || streaming;
  const elapsed =
    job.status === 'recording' && job.startedAt
      ? Math.max(0, (Date.now() - new Date(job.startedAt).getTime()) / 1000)
      : undefined;
  const barColor = job.status === 'recording' ? 'bg-primary' : 'bg-info';

  return (
    <li className="space-y-2 rounded-sm border border-border bg-elevated/40 p-3">
      <div className="flex items-center gap-3">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            job.status === 'recording' ? 'animate-pulse bg-error' : job.status === 'paused' ? 'bg-warning' : 'bg-primary'
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] uppercase tracking-wide text-foreground-muted">
            <span>{job.status}</span>
            <span>· {job.pluginId}</span>
            {job.speed > 0 && <span className="tabular-nums normal-case">↓ {formatSpeed(job.speed)}</span>}
            {job.eta > 0 && <span className="tabular-nums normal-case">ETA {formatEta(job.eta)}</span>}
            {job.bytesDownloaded > 0 && (
              <span className="tabular-nums normal-case">{formatBytes(job.bytesDownloaded)} captured</span>
            )}
            {job.attempts > 1 && <span className="tabular-nums normal-case">attempt {job.attempts}/{job.maxAttempts}</span>}
            {elapsed !== undefined && (
              <span className="flex items-center gap-1 normal-case tabular-nums text-error">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-error" />
                {formatDuration(elapsed)}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {!indeterminate && job.percent > 0 && (
            <span className="mr-1 text-xs tabular-nums text-foreground-muted">{Math.round(job.percent)}%</span>
          )}
          {job.status === 'recording' && (
            <Button variant="ghost" size="icon" aria-label="Pause" disabled={pause.isPending} onClick={() => pause.mutate()}>
              <Pause size={13} />
            </Button>
          )}
          {job.status === 'paused' && (
            <Button variant="ghost" size="icon" aria-label="Resume" disabled={resume.isPending} onClick={() => resume.mutate()}>
              <Play size={13} />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Cancel" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            <XCircle size={13} />
          </Button>
        </div>
      </div>
      {/* always render the track — shimmer for pipeline/streaming states,
      determinate fill once a percent is known */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-background">
        {showShimmer ? (
          <div className={`h-full w-1/3 animate-pulse rounded-full ${barColor}`} />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(100, Math.max(0, job.percent))}%` }}
          />
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent recordings — thumbnails, click-to-play, open folder         */
/* ------------------------------------------------------------------ */

function RecentRecordings() {
  const pushToast = useToastStore((state) => state.push);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [playing, setPlaying] = useState<RecordingDto | null>(null);

  const { data: recordings, isLoading } = useQuery({
    queryKey: ['recordings-recent'],
    queryFn: () => window.desktop.recordings.recent(20),
  });

  const openFolder = async (rec: RecordingDto): Promise<void> => {
    if (rec.filePath === undefined || rec.filePath === null) return;
    try {
      await window.desktop.app.openPath(rec.filePath);
    } catch (err) {
      pushToast({
        level: 'error',
        title: 'Cannot open folder',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recent Recordings</h3>
          <p className="text-xs text-foreground-muted">Latest captures added to your library</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/library')}>
          Open Library
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : (recordings ?? []).length === 0 ? (
        <EmptyState icon={Video} title="No recordings yet" description="Your recording history will appear here." />
      ) : (
        <div className="max-h-72 overflow-y-auto pr-1">
          <ul className="divide-y divide-border">
            {recordings!.map((rec) => {
              const playable = rec.status === 'completed' && rec.filePath != null && rec.filePath !== '';
              return (
                <li key={rec.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="h-9 w-14 shrink-0 overflow-hidden rounded-sm border border-border bg-elevated">
                    {rec.thumbnailPath ? (
                      <img src={toMediaUrl(rec.thumbnailPath)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-foreground-muted">
                        <Video size={13} />
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!playable}
                    onClick={() => playable && setPlaying(rec)}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    <p
                      className={`truncate text-sm ${playable ? 'text-foreground hover:text-primary' : 'text-foreground'}`}
                    >
                      {rec.title}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-foreground-muted">
                      {rec.platformId} · {rec.sizeBytes ? formatBytes(rec.sizeBytes) : '—'}
                      {rec.durationSeconds ? ` · ${formatDuration(rec.durationSeconds)}` : ''}
                    </p>
                  </button>
                  {rec.filePath != null && rec.filePath !== '' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Open folder"
                      onClick={() => {
                        void openFolder(rec);
                      }}
                    >
                      <FolderOpen size={13} />
                    </Button>
                  )}
                  <Badge
                    variant={
                      rec.status === 'completed' ? 'success' : rec.status === 'failed' ? 'error' : 'warning'
                    }
                  >
                    {rec.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <VideoPlayerDialog
        title={playing?.title ?? ''}
        filePath={playing?.filePath ?? ''}
        posterPath={playing?.thumbnailPath ?? null}
        recordingId={playing?.id ?? null}
        fps={playing?.fps ?? null}
        open={playing !== null}
        onOpenChange={(v) => {
          if (!v) setPlaying(null);
        }}
        onEdited={() => {
          void queryClient.invalidateQueries({ queryKey: ['recordings-recent'] });
          void queryClient.invalidateQueries({ queryKey: ['recordings-list'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent activity                                                    */
/* ------------------------------------------------------------------ */

function RecentActivity() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['logs-recent'],
    queryFn: () => window.desktop.logs.list(25),
    refetchInterval: 15000,
  });

  const LEVEL_ICONS: Record<string, typeof Activity> = {
    info: CheckCircle,
    warn: AlertTriangle,
    error: XCircle,
    debug: Activity,
    fatal: XCircle,
  };

  const LEVEL_COLORS: Record<string, string> = {
    info: 'text-success',
    warn: 'text-warning',
    error: 'text-error',
    debug: 'text-foreground-muted',
    fatal: 'text-error',
  };

  return (
    <Card>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
        <p className="text-xs text-foreground-muted">Latest events from the system log</p>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (logs ?? []).length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" description="Events will appear here as they happen." />
      ) : (
        <div className="max-h-72 overflow-y-auto pr-1">
          <ul className="divide-y divide-border">
            {logs!.map((log, idx) => {
              const Icon = LEVEL_ICONS[log.level] ?? Activity;
              const color = LEVEL_COLORS[log.level] ?? 'text-foreground-muted';
              return (
                <li key={`${log.time}-${idx}`} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                  <Icon size={14} className={`mt-0.5 shrink-0 ${color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{log.message}</p>
                    <p className="text-[10px] uppercase tracking-wide text-foreground-muted">
                      {log.scope} · {new Date(log.time).toLocaleTimeString()}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Plugin health                                                      */
/* ------------------------------------------------------------------ */

function PluginHealth() {
  const [showAllErrors, setShowAllErrors] = useState(false);
  const navigate = useNavigate();
  const { data: plugins, isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
    refetchInterval: 10000,
  });

  const enabled = (plugins ?? []).filter((p) => p.enabled);
  const disabled = (plugins ?? []).filter((p) => !p.enabled);
  const errors = (plugins ?? []).filter((p) => p.lastError);
  const visibleErrors = showAllErrors ? errors : errors.slice(0, 3);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Plugin Health</h3>
          <p className="text-xs text-foreground-muted">Status of installed platform plugins</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/plugins')}>
          Manage
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : (plugins ?? []).length === 0 ? (
        <EmptyState icon={Puzzle} title="No plugins installed" description="Install a plugin to see health status." />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Installed" value={plugins!.length} />
            <MiniStat label="Enabled" value={enabled.length} accent="#34d399" />
            <MiniStat label="Disabled" value={disabled.length} />
            <MiniStat label="Errors" value={errors.length} accent={errors.length > 0 ? '#f87171' : undefined} />
          </div>
          {errors.length > 0 && (
            <div className="space-y-2">
              <div className="max-h-28 overflow-y-auto pr-1">
                <ul className="space-y-1">
                  {visibleErrors.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded-sm border border-error/30 bg-error/10 px-2 py-1 text-xs text-error"
                    >
                      <AlertTriangle size={12} />
                      {p.name}: {p.lastError!.message}
                    </li>
                  ))}
                </ul>
              </div>
              {errors.length > 3 && (
                <button
                  type="button"
                  className="text-xs text-foreground-muted transition-colors hover:text-foreground"
                  onClick={() => setShowAllErrors((prev) => !prev)}
                >
                  {showAllErrors ? 'Show fewer errors' : `Show all ${errors.length} errors`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Storage usage — real disk capacity instead of a hardcoded cap      */
/* ------------------------------------------------------------------ */

function StorageUsage() {
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => window.desktop.dashboard.getStats(),
    refetchInterval: 10000,
  });

  const { data: storageStats } = useQuery({
    queryKey: ['storage-stats'],
    queryFn: () => window.desktop.storage.getStats(),
    refetchInterval: 30000,
  });

  const { data: sysStats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: () => window.desktop.app.getSystemStats(),
    refetchInterval: 5000,
  });

  const totalBytes = storageStats?.totalBytes ?? 0;
  const availableBytes = storageStats?.availableBytes ?? 0;
  const usedBytes = totalBytes > 0 ? Math.max(0, totalBytes - availableBytes) : 0;

  // ponytail: segments bounded by actually-used disk space; anything the app
  // didn't create shows as "other system files".
  const recordingsSeg = Math.min(stats?.recordingStorageBytes ?? 0, usedBytes);
  const downloadsSeg = Math.min(stats?.downloadStorageBytes ?? 0, Math.max(0, usedBytes - recordingsSeg));
  const cacheSeg = Math.min(
    (storageStats?.cacheSizeBytes ?? 0) + (storageStats?.tempSizeBytes ?? 0) + (storageStats?.logSizeBytes ?? 0),
    Math.max(0, usedBytes - recordingsSeg - downloadsSeg),
  );
  const otherSeg = Math.max(0, usedBytes - recordingsSeg - downloadsSeg - cacheSeg);

  const usedPct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
  const diskTone = usedPct >= 90 ? 'bg-error' : usedPct >= 75 ? 'bg-warning' : 'bg-primary';
  const textTone = usedPct >= 90 ? 'text-error' : usedPct >= 75 ? 'text-warning' : 'text-foreground';

  return (
    <Card>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Storage Usage</h3>
        <p className="text-xs text-foreground-muted">Recording & download consumption</p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground-secondary">Recording Storage</span>
          <span className="text-sm font-medium tabular-nums text-foreground">
            {formatBytes(stats?.recordingStorageBytes ?? 0)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground-secondary">Downloads Storage</span>
          <span className="text-sm font-medium tabular-nums text-foreground">
            {formatBytes(stats?.downloadStorageBytes ?? 0)}
          </span>
        </div>
        {(storageStats?.cacheSizeBytes ?? 0) + (storageStats?.tempSizeBytes ?? 0) > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-secondary">Cache & Temp</span>
            <span className="text-sm font-medium tabular-nums text-foreground">
              {formatBytes((storageStats?.cacheSizeBytes ?? 0) + (storageStats?.tempSizeBytes ?? 0))}
            </span>
          </div>
        )}
        {/* ponytail: proportion-of-used-disk bar — was previously divided by a
        hardcoded 10 GB, which wildly misrepresented real capacity. */}
        <div className="flex h-2 overflow-hidden rounded-full bg-elevated">
          {totalBytes > 0 && usedBytes > 0 ? (
            <>
              <div
                className={`h-full ${diskTone} transition-all duration-500`}
                style={{ width: `${(recordingsSeg / totalBytes) * 100}%` }}
              />
              <div
                className="h-full bg-[#38bdf8] transition-all duration-500"
                style={{ width: `${(downloadsSeg / totalBytes) * 100}%` }}
              />
              <div
                className="h-full bg-[#fbbf24] transition-all duration-500"
                style={{ width: `${(cacheSeg / totalBytes) * 100}%` }}
              />
              <div
                className="h-full bg-foreground/25"
                style={{ width: `${(otherSeg / totalBytes) * 100}%` }}
              />
            </>
          ) : null}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-muted">Disk</span>
          <span className={`tabular-nums ${textTone}`}>
            {totalBytes > 0
              ? `${usedPct}% used · ${formatBytes(availableBytes)} free of ${formatBytes(totalBytes)}`
              : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-muted">System Memory</span>
          <span className="tabular-nums text-foreground-secondary">
            {sysStats ? `${formatBytes(sysStats.memoryRss)} / ${formatBytes(sysStats.memoryTotal)}` : '—'}
          </span>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  System status — meters with threshold colours                      */
/* ------------------------------------------------------------------ */

interface Meter {
  percent: number;
  warnAt: number;
  dangerAt: number;
}

function meterColor(meter: Meter): string {
  if (meter.percent >= meter.dangerAt) return 'bg-error';
  if (meter.percent >= meter.warnAt) return 'bg-warning';
  return 'bg-primary';
}

function SystemStatus() {
  const { data: info } = useQuery({
    queryKey: ['app-info'],
    queryFn: () => window.desktop.app.getInfo(),
    staleTime: Infinity,
  });

  const { data: stats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: () => window.desktop.app.getSystemStats(),
    refetchInterval: 2000,
  });

  const { data: plugins } = useQuery({ queryKey: ['plugins'], queryFn: () => window.desktop.plugins.list() });

  const { data: jobs } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
    refetchInterval: 3000,
  });

  const { data: monitorStatus } = useQuery({
    queryKey: ['monitoring-status'],
    queryFn: () => window.desktop.monitoring.getStatus(),
    refetchInterval: 5000,
  });

  const pluginStatus = (plugins ?? []).some((p) => p.state === 'error')
    ? 'error'
    : (plugins ?? []).length > 0
      ? 'healthy'
      : 'no plugins';

  const activeJobs = (jobs ?? []).filter((j) => ACTIVE_JOB_STATUSES.includes(j.status));
  const recorderStatus = activeJobs.length > 0 ? `Recording (${activeJobs.length})` : 'Idle';

  const totalCpu = (stats?.cpuUsage ?? 0) + (stats?.childCpuUsage ?? 0);
  const totalMemory = (stats?.memoryRss ?? 0) + (stats?.childMemoryBytes ?? 0);
  const memoryPct =
    stats != null && stats.memoryTotal > 0 ? ((totalMemory / stats.memoryTotal) * 100) : 0;
  const diskUsedPct =
    stats?.diskFreeBytes != null && stats?.diskTotalBytes != null && stats.diskTotalBytes > 0
      ? ((stats.diskTotalBytes - stats.diskFreeBytes) / stats.diskTotalBytes) * 100
      : undefined;

  const items: { label: string; value: string; icon: typeof Cpu; meter?: Meter }[] = [
    {
      label: 'CPU Usage',
      value: stats ? formatPercent(totalCpu) : '—',
      icon: Cpu,
      meter: stats ? { percent: Math.min(100, totalCpu), warnAt: 70, dangerAt: 90 } : undefined,
    },
    {
      label: 'Memory',
      value: stats ? formatBytes(totalMemory) : '—',
      icon: MemoryStick,
      meter: stats ? { percent: Math.min(100, memoryPct), warnAt: 80, dangerAt: 92 } : undefined,
    },
    {
      label: 'Disk Space',
      value:
        stats?.diskFreeBytes != null && stats?.diskTotalBytes != null
          ? `${formatBytes(stats.diskFreeBytes)} free of ${formatBytes(stats.diskTotalBytes)}`
          : '—',
      icon: HardDrive,
      meter:
        diskUsedPct !== undefined
          ? { percent: Math.min(100, diskUsedPct), warnAt: 80, dangerAt: 90 }
          : undefined,
    },
    {
      label: 'Network',
      value: stats
        ? `↓ ${formatSpeed(stats.networkDownloadSpeed)} / ↑ ${formatSpeed(stats.networkUploadSpeed)}`
        : '—',
      icon: Network,
    },
    { label: 'Active Recordings', value: `${stats?.activeRecordings ?? 0}`, icon: Video },
    { label: 'App Version', value: info?.version ? `v${info.version}` : '—', icon: Database },
    { label: 'Plugin System', value: pluginStatus, icon: Puzzle },
    { label: 'Monitoring', value: monitorStatus?.running ? 'Active' : 'Idle', icon: Radio },
    { label: 'Recorder', value: recorderStatus, icon: Video },
  ];

  return (
    <Card>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">System Status</h3>
        <p className="text-xs text-foreground-muted">Runtime health at a glance</p>
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="border-b border-border/60 pb-2 last:border-0">
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-sm text-foreground-muted">
                <item.icon size={14} />
                {item.label}
              </dt>
              <dd className="text-sm font-medium tabular-nums text-foreground">{item.value}</dd>
            </div>
            {item.meter && (
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${meterColor(item.meter)}`}
                  style={{ width: `${Math.min(100, Math.max(0, item.meter.percent))}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </dl>
    </Card>
  );
}
