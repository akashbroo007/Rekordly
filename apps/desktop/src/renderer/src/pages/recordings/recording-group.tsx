/**
 * RecordingGroup — day-group header ("Today" / "Yesterday" / "15 Oct 2026")
 * with the list of rows under it, plus AttemptGroup: repeated failed attempts
 * (same creator + stream URL) collapse into one expandable row.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { RecordingJobDto } from '@rekordly/shared/contracts';

export interface RecordingGroupProps {
  /** Header label ("Today", "15 Oct 2026"). */
  label: string;
  count: number;
  /** Row content (already filtered/sorted). */
  children: ReactNode;
}

/** ponytail: the day header used to be sticky — it floated over rows while
 * scrolling and read as visual noise, so it now scrolls away like any label. */
export function RecordingGroup({ label, count, children }: RecordingGroupProps) {
  return (
    <section aria-label={`${label} — ${count} recording${count === 1 ? '' : 's'}`}>
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

export interface AttemptGroup {
  /** Newest attempt first. */
  head: RecordingJobDto;
  /** All attempts (head included), newest first. */
  attempts: RecordingJobDto[];
}

/** Row wrapper rendering an expandable "N attempts" group. */
export function AttemptGroupBox({
  attempts,
  renderRow,
}: {
  attempts: AttemptGroup;
  /** Renders one attempt as a RecordingRow (page supplies callbacks). */
  renderRow: (job: RecordingJobDto, indexInGroup: number, indent: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const head = attempts.head;
  const total = attempts.attempts.length;
  if (total <= 1) return <>{renderRow(head, 0, false)}</>;

  return (
    <div className="space-y-1.5">
      {/* The head row itself carries the "N attempts" chip. */}
      {renderRow(head, 0, false)}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="ml-9 inline-flex cursor-pointer items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-foreground-muted transition-colors hover:bg-hover hover:text-foreground"
      >
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? `Hide ${total - 1} earlier attempt${total - 1 === 1 ? '' : 's'}` : `Show ${total - 1} earlier attempt${total - 1 === 1 ? '' : 's'}`}
      </button>
      {open && (
        <div className="space-y-1">
          {attempts.attempts.map((attempt, index) => renderRow(attempt, index, true))}
        </div>
      )}
    </div>
  );
}

/** Convenience export for the page: renderer signature for grouped rows. */
export type AttemptRowRenderer = (job: RecordingJobDto, index: number, indent: boolean) => ReactNode;
