/**
 * SummaryStrip — the compact replacement for the old three big stat cards.
 * One strip: clickable Active / Completed / Failed counts (they drive the
 * page filter), plus total storage used and total recorded time.
 */
import { CheckCircle2, Clock, HardDrive } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { formatBytes } from '@rekordly/shared/format';
import type { RecordingJobDto } from '@rekordly/shared/contracts';

const PRIMARY = 'var(--color-primary)';

export interface SummaryStripProps {
  counts: {
    active: number;
    completed: number;
    failed: number;
    total: number;
  };
  filterTab: 'all' | 'active' | 'completed' | 'failed';
  onFilterTab: (tab: 'all' | 'active' | 'completed' | 'failed') => void;
  jobs: RecordingJobDto[];
}

/** "5d 03h 15m" — human readable total recorded time. */
function formatTotalRecordedTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Chip visual shared by the Recordings page, the Uploads page AND the
 * Downloads page summary strips (exported so all strips stay
 * pixel-identical). `uploading` is an in-flight tone: pulsing info dot,
 * exactly like a queued/active upload. The Downloads strip additionally
 * uses `queued`, `paused` and `neutral`.
 */
export type SummaryChipKind = 'active' | 'completed' | 'failed' | 'info' | 'uploading' | 'queued' | 'paused' | 'neutral';

export interface SummaryChipProps {
  kind: SummaryChipKind;
  count?: number;
  selected?: boolean;
  onFilter?: () => void;
  children: React.ReactNode;
}

export function Chip({
  kind,
  count,
  selected,
  onFilter,
  children,
}: SummaryChipProps) {
  const tone =
    kind === 'active'
      ? 'text-error'
      : kind === 'completed'
        ? 'text-success'
        : kind === 'failed'
          ? 'text-error'
          : kind === 'paused'
            ? 'text-warning'
            : kind === 'neutral'
              ? 'text-foreground-secondary'
              : 'text-info';
  const border = selected ? 'border-primary/70 bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-hover';
  const Element = onFilter !== undefined ? 'button' : 'div';
  return (
    <Element
      type={onFilter !== undefined ? 'button' : undefined}
      onClick={onFilter}
      aria-pressed={onFilter !== undefined ? selected : undefined}
      className={`flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border bg-surface px-2.5 text-xs text-foreground-secondary transition-all duration-150 hover:-translate-y-px ${border} ${
        selected ? 'shadow-[inset_0_0_0_1px_var(--color-primary)]' : ''
      }`}
    >
      {count !== undefined && <ChipDot kind={kind} />}
      <span className={`font-medium ${tone}`}>{count !== undefined ? count : children}</span>
      {count !== undefined && children}
    </Element>
  );
}

/** 6px solid status dot; color alone distinguishes working states. */
export function ChipDot({ kind }: { kind: SummaryChipKind }) {
  const color =
    kind === 'uploading' || kind === 'info' || kind === 'queued'
      ? 'bg-info'
      : kind === 'completed'
        ? 'bg-success'
        : kind === 'paused'
          ? 'bg-warning'
          : kind === 'neutral'
            ? 'bg-foreground-disabled'
            : 'bg-error';
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

export function SummaryStrip({ counts, jobs, filterTab, onFilterTab }: SummaryStripProps) {
  const { data: dashboardStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => window.desktop.dashboard.getStats(),
    // ponytail: shares the status bar's cache — no extra polling here.
    refetchInterval: 10_000,
  });

  const totalRecordedSeconds = jobs.reduce((acc, job) => {
    if (job.status !== 'completed' || job.startedAt === null || job.startedAt === undefined) return acc;
    const end = job.finishedAt !== null && job.finishedAt !== undefined ? new Date(job.finishedAt).getTime() : Date.now();
    const start = new Date(job.startedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return acc;
    return acc + Math.max(0, (end - start) / 1000);
  }, 0);

  return (
    <section
      aria-label="Recording summary"
      style={{ ['--strip-accent' as string]: PRIMARY }}
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-1.5"
    >
      <Chip kind="active" count={counts.active} selected={filterTab === 'active'} onFilter={() => onFilterTab('active')}>
        Active
      </Chip>
      <Chip kind="completed" count={counts.completed} selected={filterTab === 'completed'} onFilter={() => onFilterTab('completed')}>
        Completed
      </Chip>
      <Chip kind="failed" count={counts.failed} selected={filterTab === 'failed'} onFilter={() => onFilterTab('failed')}>
        Failed
      </Chip>

      <Divider />

      <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 text-xs text-foreground-secondary">
        <HardDrive size={13} className="text-foreground-muted" aria-hidden="true" />
        <span className="tabular-nums">{formatBytes(dashboardStats?.recordingStorageBytes ?? 0)}</span> storage used
      </span>
      <span
        className="hidden h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 text-xs text-foreground-secondary lg:inline-flex"
        title="Total recorded time across completed recordings"
      >
        <Clock size={13} className="text-foreground-muted" aria-hidden="true" />
        <span className="tabular-nums">{formatTotalRecordedTime(totalRecordedSeconds)}</span> recorded
      </span>
      <span
        className="hidden h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 text-xs text-foreground-secondary xl:inline-flex"
        title="Completed recordings in the list"
      >
        <CheckCircle2 size={13} className="text-foreground-muted" aria-hidden="true" />
        <span className="tabular-nums">{counts.total}</span> total
      </span>
    </section>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />;
}