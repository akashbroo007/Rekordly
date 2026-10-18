/**
 * PluginsSummaryStrip — "N enabled · N need setup · N updates available ·
 * N errors", in the exact chip style of the Recordings SummaryStrip. Every
 * count chip is clickable and acts as the page filter; a trailing total
 * chip (info tone) resets to All.
 */
import type { PluginsFilterTab } from './plugins-toolbar';

export interface PluginsSummaryCounts {
  enabled: number;
  needsSetup: number;
  updatesAvailable: number;
  errors: number;
}

const TOTAL = 'var(--color-primary)';

export function PluginsSummaryStrip({
  counts,
  poolTotal,
  tab,
  onFilterTab,
}: {
  counts: PluginsSummaryCounts;
  poolTotal: number;
  tab: PluginsFilterTab;
  onFilterTab: (tab: PluginsFilterTab) => void;
}) {
  return (
    <section
      aria-label="Plugin summary"
      style={{ ['--strip-accent' as string]: TOTAL }}
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-1.5"
    >
      <Chip
        kind="success"
        count={counts.enabled}
        selected={tab === 'enabled'}
        onFilter={() => onFilterTab('enabled')}
        plural="enabled"
      >
        enabled
      </Chip>
      <Chip
        kind="warning"
        count={counts.needsSetup}
        selected={tab === 'needs-setup'}
        onFilter={() => onFilterTab('needs-setup')}
        plural="need setup"
      >
        need setup
      </Chip>
      <Chip
        kind="info"
        count={counts.updatesAvailable}
        selected={tab === 'updates'}
        onFilter={() => onFilterTab('updates')}
        plural="updates available"
      >
        updates available
      </Chip>
      <Chip
        kind="error"
        count={counts.errors}
        selected={tab === 'errors'}
        onFilter={() => onFilterTab('errors')}
        plural="errors"
      >
        errors
      </Chip>

      <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />

      <button
        type="button"
        onClick={() => onFilterTab('all')}
        aria-pressed={tab === 'all'}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 text-xs text-foreground-secondary transition-all duration-150 hover:-translate-y-px hover:border-primary/40 hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="font-medium tabular-nums">{poolTotal}</span> plugins total
      </button>
    </section>
  );
}

/**
 * ponytail: one consistent chip style for all attention/health counts.
 * (The disabled-plugins count lives in the toolbar segmented tablist where
 * it belongs — the strip keeps the four headline numbers the brief asks
 * for, plus the total.)
 */
function Chip({
  kind,
  count,
  selected,
  onFilter,
  plural,
  children,
}: {
  kind: 'success' | 'warning' | 'info' | 'error';
  count: number;
  selected?: boolean;
  onFilter?: () => void;
  plural: string;
  children: string;
}) {
  const tone =
    kind === 'error'
      ? 'text-error'
      : kind === 'warning'
        ? 'text-warning'
        : kind === 'success'
          ? 'text-success'
          : 'text-info';
  const border = selected ? 'border-primary/70 bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-hover';
  return (
    <button
      type="button"
      onClick={onFilter}
      aria-pressed={onFilter !== undefined ? selected : undefined}
      className={`flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border bg-surface px-2.5 text-xs text-foreground-secondary transition-all duration-150 hover:-translate-y-px ${border} ${
        selected ? 'shadow-[inset_0_0_0_1px_var(--color-primary)]' : ''
      }`}
    >
      <ChipDot kind={kind} />
      <span className={`font-medium ${tone}`}>{count}</span>
      <span>{count === 1 ? singular(plural) : plural}</span>
    </button>
  );
}

function singular(plural: string): string {
  // "need setup" → "needs setup", "updates available" → "update available"
  if (plural === 'need setup') return 'needs setup';
  if (plural === 'updates available') return 'update available';
  if (plural === 'errors') return 'error';
  return plural;
}

function ChipDot({ kind }: { kind: 'success' | 'warning' | 'info' | 'error' }) {
  const color =
    kind === 'error' ? 'bg-error' : kind === 'warning' ? 'bg-warning' : kind === 'success' ? 'bg-success' : 'bg-info';
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}
