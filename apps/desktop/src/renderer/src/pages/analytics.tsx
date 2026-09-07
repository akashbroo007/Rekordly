import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Film,
  HardDrive,
  Radio,
  Users,
} from 'lucide-react';
import { Card, EmptyState, PageContainer, SectionHeader, Skeleton } from '@rekordly/ui';
import { formatBytes } from '@rekordly/shared/format';
import type { RecordingDto, RecordingJobDto } from '@rekordly/shared/contracts';

/* ------------------------------------------------------------------ */
/*  Analytics — refined "data terminal" aesthetic:                     */
/*  hairline rules, editorial micro-labels, conic-gradient rings,      */
/*  activity columns, leaderboard rows. No chart library —             */
/*  everything is pure CSS so it stays crisp at any DPI.               */
/* ------------------------------------------------------------------ */

export function AnalyticsPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => window.desktop.dashboard.getStats(),
  });

  const { data: recordings } = useQuery({
    queryKey: ['recordings-list', 100],
    queryFn: () => window.desktop.recordings.list(100),
  });

  // ponytail: real session attempts (incl. failed/cancelled) — the library
  // only ever holds finished files, so reliability stats need the jobs.
  const { data: jobs } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
  });

  const { data: storageStats } = useQuery({
    queryKey: ['storage-stats'],
    queryFn: () => window.desktop.storage.getStats(),
  });

  const jobOutcomes = useMemo(() => {
    const counts = stats?.jobStatusCounts ?? {};
    const completed = jobs?.filter((j) => j.status === 'completed').length ?? counts['completed'] ?? 0;
    const failed = jobs?.filter((j) => j.status === 'failed').length ?? counts['failed'] ?? 0;
    const cancelled = jobs?.filter((j) => j.status === 'cancelled').length ?? counts['cancelled'] ?? 0;
    const attempts = completed + failed + cancelled;
    return {
      completed,
      failed,
      cancelled,
      attempts,
      rate: attempts > 0 ? Math.round((completed / attempts) * 100) : 0,
    };
  }, [stats, jobs]);

  const hasData =
    stats !== undefined && (stats.totalRecordings > 0 || jobOutcomes.attempts > 0);

  if (statsLoading) {
    return (
      <PageContainer>
        <SectionHeader title="Analytics" description="Recording trends, storage usage and success rates." />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </PageContainer>
    );
  }

  if (!hasData) {
    return (
      <PageContainer>
        <SectionHeader title="Analytics" description="Recording trends, storage usage and success rates." />
        <EmptyState
          icon={BarChart3}
          title="No analytics yet"
          description="Recording trends and storage statistics will appear here once you start recording."
        />
      </PageContainer>
    );
  }

  const successRate = jobOutcomes.rate;

  return (
    <PageContainer>
      <SectionHeader title="Analytics" description="Recording trends, storage usage and success rates." />

      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={Film}
          label="Total Recordings"
          value={String(stats!.totalRecordings)}
          sub={`${stats!.successfulRecordings} archived`}
          accent="var(--color-primary)"
        />
        <KpiCard
          icon={Users}
          label="Creators"
          value={String(stats!.totalCreators)}
          sub={`${stats!.liveCreators} live now`}
          accent="#34d399"
        />
        <KpiCard
          icon={HardDrive}
          label="Storage Used"
          value={formatBytes(stats!.totalStorageBytes)}
          sub={storageStats ? `${formatBytes(storageStats.availableBytes)} free` : undefined}
          accent="#38bdf8"
        />
        <SuccessRateRing percent={successRate} failed={jobOutcomes.failed + jobOutcomes.cancelled} />
      </div>

      {/* ── Activity chart + status mix ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {recordings && recordings.length > 0 && (
          <ActivityChart recordings={recordings} />
        )}
        {recordings && recordings.length > 0 && (
          <StatusMix recordings={recordings} />
        )}
      </div>

      {/* ── Reliability + platform mix ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ReliabilityPanel outcomes={jobOutcomes} />
        {jobs !== undefined && <PlatformBreakdown jobs={jobs} />}
      </div>

      {/* ── Storage + leaderboard ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {storageStats && <StoragePanel storage={storageStats} />}
        {recordings && recordings.length > 0 && <CreatorLeaderboard recordings={recordings} />}
      </div>

      {/* ── Heaviest files ────────────────────────────────────────── */}
      {storageStats && storageStats.largestRecordings.length > 0 && (
        <HeaviestFiles
          recordings={storageStats.largestRecordings.slice(0, 6).map((r) => ({
            id: r.id,
            title: r.title,
            sizeBytes: r.sizeBytes ?? 0,
          }))}
        />
      )}
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI card                                                           */
/* ------------------------------------------------------------------ */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Film;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <Card className="p-4 transition-colors hover:bg-elevated/60">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">{label}</p>
        <Icon size={14} style={{ color: accent }} className="opacity-80" />
      </div>
      <p className="mt-2 font-semibold tabular-nums tracking-tight text-foreground" style={{ fontSize: '1.65rem', lineHeight: 1.1 }}>
        {value}
      </p>
      {sub !== undefined && <p className="mt-1 text-xs text-foreground-muted">{sub}</p>}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Success-rate ring                                                  */
/* ------------------------------------------------------------------ */

function SuccessRateRing({ percent, failed }: { percent: number; failed: number }) {
  // conic-gradient ring: indigo arc on a faint track
  const deg = Math.round((percent / 100) * 360);
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">Success Rate</p>
        {percent >= 90 ? (
          <ArrowUpRight size={14} className="text-success" />
        ) : (
          <ArrowDownRight size={14} className="text-warning" />
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div
          className="relative h-16 w-16 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(var(--color-primary) ${deg}deg, var(--color-elevated) ${deg}deg)`,
          }}
        >
          <div className="absolute inset-[5px] flex items-center justify-center rounded-full bg-surface">
            <span className="text-sm font-semibold tabular-nums text-foreground">{percent}%</span>
          </div>
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs text-foreground-secondary">
            <span className="font-medium tabular-nums text-success">✓</span>{' '}
            {percent}% healthy
          </p>
          <p className="text-xs text-foreground-muted">
            <span className="font-medium tabular-nums text-error">✕</span> {failed} failed
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Activity chart — 14 days, gradient columns                         */
/* ------------------------------------------------------------------ */

function ActivityChart({ recordings }: { recordings: RecordingDto[] }) {
  const days = useMemo(() => {
    const out: { key: string; label: string; count: number; bytes: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayRecs = recordings.filter((r) => r.createdAt?.startsWith(key));
      out.push({
        key,
        label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
        count: dayRecs.length,
        bytes: dayRecs.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0),
      });
    }
    return out;
  }, [recordings]);

  const maxCount = Math.max(...days.map((d) => d.count), 1);
  const weekNow = days.slice(7).reduce((s, d) => s + d.count, 0);
  const weekPrev = days.slice(0, 7).reduce((s, d) => s + d.count, 0);
  const delta = weekPrev === 0 ? (weekNow > 0 ? 100 : 0) : Math.round(((weekNow - weekPrev) / weekPrev) * 100);

  return (
    <Card className="lg:col-span-3">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Capture Activity</h3>
          <p className="text-xs text-foreground-muted">Recordings per day · last 14 days</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
            delta >= 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
          }`}
        >
          {delta >= 0 ? '+' : ''}
          {delta}% vs prev. week
        </span>
      </div>

      <div className="flex h-36 items-end gap-1.5">
        {days.map((day) => {
          const h = Math.max((day.count / maxCount) * 100, day.count > 0 ? 6 : 2);
          return (
            <div key={day.key} className="group relative flex h-full flex-1 flex-col justify-end">
              {/* tooltip */}
              <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-panel px-2 py-1 text-[10px] tabular-nums text-foreground opacity-0 shadow-menu transition-opacity duration-150 group-hover:opacity-100">
                {day.count} rec{day.count === 1 ? '' : 's'}
                {day.bytes > 0 ? ` · ${formatBytes(day.bytes)}` : ''}
              </div>
              <div
                className="w-full rounded-t-[3px] transition-all duration-300 group-hover:brightness-125"
                style={{
                  height: `${h}%`,
                  background: day.count > 0 ? 'var(--color-primary)' : 'var(--color-elevated)',
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
        {days.map((day) => (
          <span key={day.key} className="flex-1 text-center text-[9px] uppercase text-foreground-muted">
            {day.label}
          </span>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Status mix                                                         */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<string, { color: string; label: string }> = {
  completed: { color: '#34d399', label: 'Completed' },
  recording: { color: '#f87171', label: 'Recording' },
  processing: { color: '#fbbf24', label: 'Processing' },
  queued: { color: '#38bdf8', label: 'Queued' },
  paused: { color: '#a78bfa', label: 'Paused' },
  failed: { color: '#ef4444', label: 'Failed' },
};

function StatusMix({ recordings }: { recordings: RecordingDto[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of recordings) c[r.status] = (c[r.status] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [recordings]);
  const total = recordings.length;

  let acc = 0;
  const segments = counts.map(([status, count]) => {
    const start = (acc / total) * 100;
    acc += count;
    return { status, count, start, end: (acc / total) * 100 };
  });
  const gradient = segments
    .map((s) => `${STATUS_META[s.status]?.color ?? '#666'} ${s.start}% ${s.end}%`)
    .join(', ');

  return (
    <Card className="lg:col-span-2">
      <h3 className="text-sm font-semibold text-foreground">Library Composition</h3>
      <p className="text-xs text-foreground-muted">Status distribution across {total} recordings</p>

      <div
        className="mt-4 h-2.5 w-full rounded-full"
        style={{ background: `linear-gradient(to right, ${gradient})` }}
      />

      <ul className="mt-4 space-y-2.5">
        {counts.map(([status, count]) => {
          const meta = STATUS_META[status] ?? { color: '#666', label: status };
          return (
            <li key={status} className="flex items-center gap-2.5 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
              <span className="flex-1 text-foreground-secondary">{meta.label}</span>
              <span className="tabular-nums text-foreground-muted">{count}</span>
              <span className="w-10 text-right tabular-nums text-foreground-muted">
                {Math.round((count / total) * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Session reliability — real job outcomes with horizontal bars       */
/* ------------------------------------------------------------------ */

interface JobOutcomes {
  completed: number;
  failed: number;
  cancelled: number;
  attempts: number;
  rate: number;
}

function ReliabilityPanel({ outcomes }: { outcomes: JobOutcomes }) {
  const rows = [
    { label: 'Completed', count: outcomes.completed, color: '#34d399' },
    { label: 'Failed', count: outcomes.failed, color: '#ef4444' },
    { label: 'Cancelled', count: outcomes.cancelled, color: '#9ca3af' },
  ];
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <Card className="lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Session Reliability</h3>
          <p className="text-xs text-foreground-muted">
            {outcomes.attempts} recording {outcomes.attempts === 1 ? 'session' : 'sessions'} attempted
          </p>
        </div>
        <Activity size={15} className="text-foreground-muted" />
      </div>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="flex items-baseline gap-2">
              <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ background: row.color }} />
              <span className="flex-1 text-xs text-foreground-secondary">{row.label}</span>
              <span className="text-xs tabular-nums text-foreground-muted">
                {row.count} · {outcomes.attempts > 0 ? Math.round((row.count / outcomes.attempts) * 100) : 0}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max((row.count / max) * 100, row.count > 0 ? 4 : 0)}%`,
                  background: row.color,
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-border pt-3 text-xs text-foreground-muted">
        {outcomes.attempts === 0
          ? 'No sessions attempted yet.'
          : outcomes.rate >= 90
            ? 'Capture pipeline is running smoothly.'
            : `${outcomes.failed + outcomes.cancelled} of ${outcomes.attempts} sessions did not finish — check Recordings → Failed for error details.`}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Platform breakdown — stacked outcome bars per platform             */
/* ------------------------------------------------------------------ */

const OUTCOME_META = [
  { key: 'completed', label: 'Completed', color: '#34d399' },
  { key: 'failed', label: 'Failed', color: '#ef4444' },
  { key: 'cancelled', label: 'Cancelled', color: '#9ca3af' },
] as const;

function PlatformBreakdown({ jobs }: { jobs: RecordingJobDto[] }) {
  const platforms = useMemo(() => {
    const map = new Map<string, { completed: number; failed: number; cancelled: number; total: number; bytes: number }>();
    for (const job of jobs) {
      const platform = job.platformId || 'unknown';
      const entry = map.get(platform) ?? { completed: 0, failed: 0, cancelled: 0, total: 0, bytes: 0 };
      entry.total += 1;
      if (job.status === 'completed') entry.completed += 1;
      else if (job.status === 'failed' || job.status === 'cancelled') {
        if (job.status === 'failed') entry.failed += 1;
        else entry.cancelled += 1;
      }
      entry.bytes += job.bytesDownloaded ?? 0;
      map.set(platform, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [jobs]);

  if (platforms.length === 0) return null;
  const maxTotal = Math.max(...platforms.map(([, p]) => p.total), 1);

  return (
    <Card className="lg:col-span-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Platform Breakdown</h3>
          <p className="text-xs text-foreground-muted">Session outcomes per platform</p>
        </div>
        <div className="flex items-center gap-3">
          {OUTCOME_META.map((o) => (
            <span key={o.key} className="flex items-center gap-1 text-[10px] text-foreground-muted">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: o.color }} /> {o.label}
            </span>
          ))}
        </div>
      </div>

      <ul className="space-y-4">
        {platforms.map(([platform, p]) => (
          <li key={platform}>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium capitalize text-foreground-secondary">{platform}</span>
              <span className="flex-1" />
              <span className="text-xs tabular-nums text-foreground-muted">
                {p.completed}/{p.total} ok · {formatBytes(p.bytes)}
              </span>
            </div>
            {/* stacked outcome bar */}
            <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-elevated" style={{ width: `${Math.max((p.total / maxTotal) * 100, 8)}%` }}>
              {OUTCOME_META.map((o) => {
                const count = p[o.key];
                if (count === 0) return null;
                return (
                  <div
                    key={o.key}
                    title={`${o.label}: ${count}`}
                    className="h-full transition-[width] duration-500"
                    style={{ width: `${(count / p.total) * 100}%`, background: o.color }}
                  />
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Storage panel — donut + legend                                     */
/* ------------------------------------------------------------------ */

function StoragePanel({ storage }: { storage: NonNullable<Awaited<ReturnType<typeof window.desktop.storage.getStats>>> }) {
  const parts = [
    { label: 'Recordings', value: storage.totalSizeBytes, color: 'var(--color-primary)' },
    { label: 'Cache', value: storage.cacheSizeBytes, color: '#38bdf8' },
    { label: 'Logs', value: storage.logSizeBytes, color: '#34d399' },
    { label: 'Temp', value: storage.tempSizeBytes, color: '#fbbf24' },
  ];
  const used = parts.reduce((s, p) => s + p.value, 0);
  const total = Math.max(storage.totalBytes, used, 1);
  const usedPct = Math.min(Math.round((used / total) * 100), 100);

  let accDeg = 0;
  const stops = parts
    .filter((p) => p.value > 0)
    .map((p) => {
      const span = (p.value / total) * 360;
      const seg = `${p.color} ${accDeg}deg ${accDeg + span}deg`;
      accDeg += span;
      return seg;
    })
    .join(', ');
  const donut = stops.length > 0 ? `conic-gradient(${stops}, var(--color-elevated) ${accDeg}deg)` : 'var(--color-elevated)';

  return (
    <Card className="lg:col-span-3">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Storage</h3>
          <p className="text-xs text-foreground-muted">{formatBytes(storage.availableBytes)} available of {formatBytes(storage.totalBytes)}</p>
        </div>
        <HardDrive size={15} className="text-foreground-muted" />
      </div>

      <div className="flex items-center gap-6">
        <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ background: donut }}>
          <div className="absolute inset-[10px] flex flex-col items-center justify-center rounded-full bg-surface">
            <span className="text-lg font-semibold tabular-nums leading-none text-foreground">{usedPct}%</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-wide text-foreground-muted">used</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2">
          {parts.map((p) => (
            <li key={p.label} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="flex-1 truncate text-foreground-secondary">{p.label}</span>
              <span className="tabular-nums text-foreground-muted">{formatBytes(p.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Creator leaderboard                                                */
/* ------------------------------------------------------------------ */

function CreatorLeaderboard({ recordings }: { recordings: RecordingDto[] }) {
  const leaders = useMemo(() => {
    const map = new Map<string, { name: string; count: number; bytes: number }>();
    for (const r of recordings) {
      // naming template is '{creator}_{date}_{time}' → first token is the creator
      const name = r.title.split('_')[0] || r.platformId;
      const entry = map.get(name) ?? { name, count: 0, bytes: 0 };
      entry.count += 1;
      entry.bytes += r.sizeBytes ?? 0;
      map.set(name, entry);
    }
    return [...map.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  }, [recordings]);

  if (leaders.length === 0) return null;
  const maxBytes = Math.max(...leaders.map((l) => l.bytes), 1);
  const rankColor = ['text-warning', 'text-foreground-secondary', 'text-[#cd7f32]'];

  return (
    <Card className="lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Top Creators</h3>
          <p className="text-xs text-foreground-muted">By captured volume</p>
        </div>
        <Radio size={15} className="text-foreground-muted" />
      </div>
      <ol className="space-y-3">
        {leaders.map((leader, i) => (
          <li key={leader.name}>
            <div className="flex items-baseline gap-2">
              <span className={`w-4 shrink-0 text-right text-xs font-semibold tabular-nums ${rankColor[i] ?? 'text-foreground-muted'}`}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground-secondary">{leader.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-foreground-muted">
                {leader.count} · {formatBytes(leader.bytes)}
              </span>
            </div>
            <div className="ml-6 mt-1 h-1 overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max((leader.bytes / maxBytes) * 100, 4)}%`,
                  background: i === 0 ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 45%, transparent)',
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Heaviest files                                                     */
/* ------------------------------------------------------------------ */

interface HeavyFile {
  id: string;
  title: string;
  sizeBytes: number;
}

function HeaviestFiles({ recordings }: { recordings: HeavyFile[] }) {
  const maxSize = Math.max(...recordings.map((r) => r.sizeBytes), 1);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Heaviest Captures</h3>
          <p className="text-xs text-foreground-muted">Largest files in your library</p>
        </div>
        <Film size={15} className="text-foreground-muted" />
      </div>
      <ul className="divide-y divide-border">
        {recordings.map((rec, i) => (
          <li key={rec.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground-muted">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground-secondary">{rec.title}</p>
              <div className="mt-1 h-1 w-full max-w-56 overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${Math.max((rec.sizeBytes / maxSize) * 100, 3)}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-medium tabular-nums text-foreground">{formatBytes(rec.sizeBytes)}</p>
              <p className="text-[10px] uppercase tracking-wide text-foreground-muted">on disk</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}