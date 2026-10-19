/**
 * DownloadDayGroup — section header ("Active" · "Failed" · "Cancelled") or
 * a day bucket label ("Today" · "Yesterday" · "15 Oct 2026") followed by its
 * rows. Headers scroll with the page like the Recordings/Uploads pages;
 * only the toolbar stays pinned (the redesigned Downloads toolbar is the
 * sticky element).
 */
import type { ReactNode } from 'react';

export interface DownloadDayGroupProps {
  label: string;
  count: number;
  children: ReactNode;
}

export function DownloadDayGroup({ label, count, children }: DownloadDayGroupProps) {
  return (
    <section aria-label={`${label} — ${count} download${count === 1 ? '' : 's'}`}>
      <div className="flex items-center gap-2 border-b border-border py-1.5">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{label}</h2>
        <span className="rounded-sm bg-elevated px-1.5 py-0.5 text-xs font-semibold leading-none tabular-nums text-foreground-secondary">
          {count}
        </span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
      <div className="mt-2 space-y-1.5">{children}</div>
    </section>
  );
}
