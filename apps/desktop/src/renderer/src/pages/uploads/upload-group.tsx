/**
 * UploadDayGroup — day header ("Today" · "Yesterday" · "15 Oct 2026")
 * followed by its rows. The header scrolls away with the page like the
 * Recordings page's headers (nothing stays pinned while scrolling).
 */
import type { ReactNode } from 'react';

export interface UploadDayGroupProps {
  /** Header label ("Today", "15 Oct 2026"). */
  label: string;
  count: number;
  children: ReactNode;
}

export function UploadDayGroup({ label, count, children }: UploadDayGroupProps) {
  return (
    <section aria-label={`${label} — ${count} upload${count === 1 ? '' : 's'}`}>
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
