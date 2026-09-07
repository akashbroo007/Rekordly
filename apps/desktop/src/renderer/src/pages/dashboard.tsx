import { useState } from 'react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  Database,
  DownloadCloud,
  FolderInput,
  HardDrive,
  LayoutDashboard,
  Library,
  Logs,
  MemoryStick,
  Network,
  Puzzle,
  Radio,
  RefreshCw,
  Settings,
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
import { formatBytes, formatPercent } from '@rekordly/shared/format';
import { QuickDownloadDialog } from '../components/quick-download-dialog';

/* ------------------------------------------------------------------ */
/*  Dashboard — same refined "data terminal" language as Analytics:    */
/*  editorial micro-labels, tabular numerals, corner glows, hairline   */
/*  dividers, gradient accents.                                        */
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

export function DashboardPage() {
  const [quickDownloadOpen, setQuickDownloadOpen] = useState(false);
  const openQuickDownload = () => setQuickDownloadOpen(true);
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();

  const refresh = (): void => {
    // ponytail: refresh every dashboard data source — stats, jobs, recent
    // recordings, monitoring, system usage and plugins.
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['recording-jobs'] });
    void queryClient.invalidateQueries({ queryKey: ['recordings-recent'] });
    void queryClient.invalidateQueries({ queryKey: ['monitoring-dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['monitoring-status'] });
    void queryClient.invalidateQueries({ queryKey: ['system-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    void queryClient.invalidateQueries({ queryKey: ['logs-recent'] });
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
      <WelcomeHeader />
      <QuickActions onQuickDownload={openQuickDownload} />
      <StatsRow onQuickDownload={openQuickDownload} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <MonitoringStatus />
        <ActiveRecordings />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentRecordings />
        <RecentActivity />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <PluginHealth />
        <StorageUsage />
      </div>
      <SystemStatus />
      <QuickDownloadDialog open={quickDownloadOpen} onOpenChange={setQuickDownloadOpen} />
    </PageContainer>
  );
}

function WelcomeHeader() {
  const { data: info } = useQuery({
    queryKey: ['app-info'],
    queryFn: () => window.desktop.app.getInfo(),
    staleTime: Infinity,
  });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
          <LayoutDashboard size={20} className="text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{greeting}</h2>
          <p className="text-sm text-foreground-muted">
            Rekordly {info?.version ? `v${info.version}` : ''} is running.
          </p>
        </div>
      </div>
    </Card>
  );
}

function QuickActions({ onQuickDownload }: { onQuickDownload: () => void }) {
  const navigate = useNavigate();
  const actions: { label: string; icon: typeof Users; path?: string; onClick?: () => void }[] = [
    // ponytail: ordered by usage frequency — the most common actions first.
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

function StatsRow({ onQuickDownload }: { onQuickDownload: () => void }) {
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

  const cards = stats
    ? [
        { label: 'Creators', value: String(stats.totalCreators), icon: Users, accent: 'var(--color-primary)' },
        { label: 'Recordings', value: String(stats.totalRecordings), icon: Video, accent: '#34d399' },
        { label: 'Plugins', value: String(stats.totalPlugins), icon: Puzzle, accent: '#38bdf8' },
        { label: 'Storage Used', value: formatBytes(stats.totalStorageBytes), icon: HardDrive, accent: '#fbbf24' },
        { label: 'Live', value: String(monitorDashboard?.liveCreators ?? 0), icon: Radio, accent: '#34d399' },
        { label: 'Monitoring', value: String(monitorDashboard?.totalJobs ?? 0), icon: Activity, accent: '#38bdf8' },
        { label: 'Active Jobs', value: String(stats.activeJobs), icon: Clock, accent: 'var(--color-primary)' },
        { label: 'Failed', value: String(stats.failedRecordings), icon: XCircle, accent: '#f87171' },
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
      {cards.map((card) => {
        const isLiveCard = card.label === 'Live';
        return (
          <Card
            key={card.label}
            className={isLiveCard ? 'cursor-pointer transition-colors hover:bg-elevated/60' : ''}
            onClick={isLiveCard ? onQuickDownload : undefined}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border"
                style={{ color: card.accent, borderColor: 'color-mix(in srgb, currentColor 25%, transparent)', background: 'color-mix(in srgb, currentColor 8%, transparent)' }}
              >
                <card.icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground-muted">{card.label}</p>
                <p className="text-lg font-semibold tabular-nums leading-tight text-foreground">{card.value}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ActiveRecordings() {
  const { data: jobs, isLoading } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
    refetchInterval: 3000,
  });

  const active = (jobs ?? []).filter((j) => ['recording', 'queued', 'preparing'].includes(j.status));

  return (
    <Card className="lg:col-span-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Active Recordings</h3>
          <p className="text-xs text-foreground-muted">Jobs currently in the pipeline</p>
        </div>
        {active.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-primary">
            {active.length}
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : active.length === 0 ? (
        <EmptyState
          icon={Video}
          title="No active recordings"
          description="Recordings in progress will appear here."
        />
      ) : (
        <div className="max-h-64 overflow-y-auto pr-1">
          <ul className="divide-y divide-border">
            {active.map((job) => (
              <li key={job.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    job.status === 'recording' ? 'animate-pulse bg-error' : job.status === 'queued' ? 'bg-primary' : 'bg-warning'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{job.title}</p>
                  <p className="text-[10px] uppercase tracking-wide text-foreground-muted">
                    {job.status} · {job.pluginId}
                  </p>
                </div>
                {job.percent > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-foreground-muted">{Math.round(job.percent)}%</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function RecentRecordings() {
  const { data: recordings, isLoading } = useQuery({
    queryKey: ['recordings-recent'],
    queryFn: () => window.desktop.recordings.recent(20),
  });

  return (
    <Card>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Recent Recordings</h3>
        <p className="text-xs text-foreground-muted">Latest captures added to your library</p>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : (recordings ?? []).length === 0 ? (
        <EmptyState
          icon={Video}
          title="No recordings yet"
          description="Your recording history will appear here."
        />
      ) : (
        <div className="max-h-64 overflow-y-auto pr-1">
          <ul className="divide-y divide-border">
            {recordings!.map((rec) => (
              <li key={rec.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    rec.status === 'completed' ? 'bg-success' : rec.status === 'failed' ? 'bg-error' : 'bg-warning'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{rec.title}</p>
                  <p className="text-[10px] uppercase tracking-wide text-foreground-muted">
                    {rec.platformId} · {rec.sizeBytes ? formatBytes(rec.sizeBytes) : '—'}
                  </p>
                </div>
                <Badge variant={rec.status === 'completed' ? 'success' : rec.status === 'failed' ? 'error' : 'warning'}>
                  {rec.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

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
        <EmptyState
          icon={Activity}
          title="No activity yet"
          description="Events will appear here as they happen."
        />
      ) : (
        <div className="max-h-64 overflow-y-auto pr-1">
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

function PluginHealth() {
  const [showAllErrors, setShowAllErrors] = useState(false);
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
    <Card className="lg:col-span-3">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Plugin Health</h3>
        <p className="text-xs text-foreground-muted">Status of installed platform plugins</p>
      </div>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : (plugins ?? []).length === 0 ? (
        <EmptyState
          icon={Puzzle}
          title="No plugins installed"
          description="Install a plugin to see health status."
        />
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
                    <li key={p.id} className="flex items-center gap-2 rounded-sm border border-error/30 bg-error/10 px-2 py-1 text-xs text-error">
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

function MiniStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-sm border border-border bg-elevated px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground-muted">{label}</p>
      <p className={`text-lg font-semibold tabular-nums leading-tight ${accent ? '' : 'text-foreground'}`} style={accent ? { color: accent } : undefined}>
        {value}
      </p>
    </div>
  );
}

function MonitoringStatus() {
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

  return (
    <Card className="lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Monitoring Status</h3>
          <p className="text-xs text-foreground-muted">Live-check engine overview</p>
        </div>
        <Badge variant={status?.running ? 'success' : 'muted'}>
          {status?.running ? 'Running' : 'Stopped'}
        </Badge>
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
        </div>
      )}
    </Card>
  );
}

function StorageUsage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => window.desktop.dashboard.getStats(),
    refetchInterval: 10000,
  });

  const { data: sysStats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: () => window.desktop.app.getSystemStats(),
    refetchInterval: 5000,
  });

  return (
    <Card className="lg:col-span-2">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Storage Usage</h3>
        <p className="text-xs text-foreground-muted">Recording & download consumption</p>
      </div>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-secondary">Recording Storage</span>
            <span className="text-sm font-medium tabular-nums text-foreground">{formatBytes(stats?.recordingStorageBytes ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-secondary">Downloads Storage</span>
            <span className="text-sm font-medium tabular-nums text-foreground">{formatBytes(stats?.downloadStorageBytes ?? 0)}</span>
          </div>
          {/* ponytail: segmented bar — recordings vs downloads proportion */}
          <div className="flex h-2 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(100, ((stats?.recordingStorageBytes ?? 0) / (10 * 1024 * 1024 * 1024)) * 100)}%` }}
            />
            <div
              className="h-full bg-[#38bdf8] transition-all duration-500"
              style={{ width: `${Math.min(100, ((stats?.downloadStorageBytes ?? 0) / (10 * 1024 * 1024 * 1024)) * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground-muted">System Memory</span>
            <span className="tabular-nums text-foreground-secondary">
              {sysStats ? `${formatBytes(sysStats.memoryRss)} / ${formatBytes(sysStats.memoryTotal)}` : '—'}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
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

  const { data: plugins } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
    refetchInterval: 10000,
  });

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

  const activeJobs = (jobs ?? []).filter((j) => ['recording', 'queued', 'preparing', 'paused'].includes(j.status));
  const recorderStatus = activeJobs.length > 0 ? `Recording (${activeJobs.length})` : 'Idle';

  // Calculate totals including child processes
  const totalCpu = (stats?.cpuUsage ?? 0) + (stats?.childCpuUsage ?? 0);
  const totalMemory = (stats?.memoryRss ?? 0) + (stats?.childMemoryBytes ?? 0);

  const items = [
    { label: 'CPU Usage', value: stats ? formatPercent(totalCpu) : '—', icon: Cpu },
    { label: 'Memory', value: stats ? formatBytes(totalMemory) : '—', icon: MemoryStick },
    {
      label: 'Disk Space',
      value:
        stats?.diskFreeBytes != null && stats?.diskTotalBytes != null
          ? `${formatBytes(stats.diskFreeBytes)} free of ${formatBytes(stats.diskTotalBytes)}`
          : '—',
      icon: HardDrive,
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
    { label: 'Database', value: 'Connected', icon: Database },
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
          <div key={item.label} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0">
            <dt className="flex items-center gap-2 text-sm text-foreground-muted">
              <item.icon size={14} />
              {item.label}
            </dt>
            <dd className="text-sm font-medium tabular-nums text-foreground">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}