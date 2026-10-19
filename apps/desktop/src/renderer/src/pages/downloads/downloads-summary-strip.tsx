/**
 * DownloadsSummaryStrip — the page's single status filter (the separate tab
 * row is gone). One strip: clickable Downloading · Queued · Paused ·
 * Completed · Failed (+ Cancelled when present) counts, plus aggregated
 * total speed and total time remaining across active transfers. Chips reuse
 * the shared summary Chip exports so all pages match. Fetching/selecting a
 * selected chip again folds back to "All" — clicking through is read out by
 * aria-pressed.
 */
import { Activity, Clock } from 'lucide-react';
import { formatSpeed } from '@rekordly/shared/format';
import { Chip } from '../recordings/summary-strip';
import type { DownloadFilterTab } from './downloads-toolbar';
import { formatEta } from '@rekordly/shared/format';

export interface DownloadsSummaryStripProps {
  counts: {
    downloading: number;
    queued: number;
    paused: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  /** Aggregated bytes/s across downloading rows (0 → "0 B/s"). */
  totalSpeed: number;
  /** Aggregated remaining seconds across downloading rows. */
  totalEtaSeconds: number;
  filterTab: DownloadFilterTab;
  onFilterTab: (tab: DownloadFilterTab) => void;
}

export function DownloadsSummaryStrip({
  counts,
  totalSpeed,
  totalEtaSeconds,
  filterTab,
  onFilterTab,
}: DownloadsSummaryStripProps) {
  /** Selected chip again → fold back to "All" (the strip IS the tab row). */
  const filterFor = (tab: DownloadFilterTab) => () =>
    onFilterTab(filterTab === tab ? 'all' : tab);

  return (
    <section
      aria-label="Download summary"
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-1.5"
    >
      <Chip kind="uploading" count={counts.downloading} selected={filterTab === 'downloading'} onFilter={filterFor('downloading')}>
        Downloading
      </Chip>
      <Chip kind="queued" count={counts.queued} selected={filterTab === 'queued'} onFilter={filterFor('queued')}>
        Queued
      </Chip>
      <Chip kind="paused" count={counts.paused} selected={filterTab === 'paused'} onFilter={filterFor('paused')}>
        Paused
      </Chip>
      <Chip kind="completed" count={counts.completed} selected={filterTab === 'completed'} onFilter={filterFor('completed')}>
        Completed
      </Chip>
      <Chip kind="failed" count={counts.failed} selected={filterTab === 'failed'} onFilter={filterFor('failed')}>
        Failed
      </Chip>
      {counts.cancelled > 0 && (
        <Chip kind="neutral" count={counts.cancelled} selected={filterTab === 'cancelled'} onFilter={filterFor('cancelled')}>
          Cancelled
        </Chip>
      )}

      <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />

      <span
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 text-sm text-foreground-secondary"
        title="Total speed across active downloads"
      >
        <Activity size={13} className="text-foreground-muted" aria-hidden="true" />
        <span className="tabular-nums">{formatSpeed(totalSpeed)}</span>
        <span className="text-foreground-muted">total</span>
      </span>
      <span
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 text-sm text-foreground-secondary lg:inline-flex"
        title="Summed remaining time across active downloads (each row may run in parallel)"
      >
        <Clock size={13} className="text-foreground-muted" aria-hidden="true" />
        <span className="tabular-nums">{totalEtaSeconds > 0 ? `${formatEta(totalEtaSeconds)} left` : 'no ETA'}</span>
      </span>
    </section>
  );
}
