import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@rekordly/ui';

// --- Pagination bar ------------------------------------------------------------

interface PaginationProps {
  /** Zero-based current page. */
  page: number;
  /** Total page count (>= 1). */
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Optional total item count shown after the page counter. */
  total?: number;
  /** Plural noun describing the items, e.g. 'recordings' or 'entries'. */
  noun?: string;
}

/**
 * Shared Previous / "Page X of Y" / Next control bar — one consistent control
 * across every paginated list in the app.
 *
 * Always visible while the list has items — even a single page shows
 * "Page 1 of 1 · N items" (both arrows disabled), so the count is always on
 * screen. Hidden only when the list is empty (the empty state covers that).
 */
export function Pagination({ page, pageCount, onPageChange, total, noun = 'items' }: PaginationProps) {
  if (total !== undefined && total <= 0) return null;

  return (
    <div className="flex items-center justify-center gap-2">
      <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft size={14} /> Previous
      </Button>
      <span className="text-xs tabular-nums text-foreground-muted">
        Page {page + 1} of {pageCount}
        {total !== undefined ? ` · ${total} ${noun}` : ''}
      </span>
      <Button variant="ghost" size="sm" disabled={page >= pageCount - 1} onClick={() => onPageChange(page + 1)}>
        Next <ChevronRight size={14} />
      </Button>
    </div>
  );
}

// --- Client-side paging hook ----------------------------------------------------

/**
 * Slices a fully loaded client-side list into pages. The page is clamped when
 * the list shrinks (deletes, filter changes), and jumps back to page 0
 * whenever `resetKey` changes — pass a string built from the active filters,
 * e.g. `${search}|${levelIds.join(',')}`.
 */
export function usePaged<T>(items: readonly T[], pageSize: number, resetKey?: string) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (resetKey !== undefined) setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Clamp so a shrinking list can't strand the view on a nonexistent page.
  const safePage = Math.min(page, pageCount - 1);
  const paged = useMemo(
    () => items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [items, safePage, pageSize],
  );

  return { page: safePage, setPage, pageCount, paged, total };
}
