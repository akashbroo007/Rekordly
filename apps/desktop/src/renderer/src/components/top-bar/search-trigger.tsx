/**
 * SearchTrigger — the left side of the top bar.
 *
 * A ghost 320px-wide field-shaped button (not a real input — the palette
 * owns the editable field): search glyph, placeholder copy, muted "Ctrl K"
 * key hint on the right end. Clicking it — or pressing Ctrl+K anywhere —
 * opens the shared command palette.
 */
import { Search } from 'lucide-react';
import { openCommandPalette } from '../command-palette';

export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Search or jump to..."
      title="Search or jump to... (Ctrl K)"
      className="flex h-8 w-80 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-border bg-transparent px-2.5 text-sm text-foreground-secondary transition-colors duration-150 outline-none hover:bg-hover hover:text-foreground"
    >
      <Search size={16} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left">Search or jump to...</span>
      <kbd
        aria-hidden="true"
        className="shrink-0 rounded-sm px-1 py-0.5 text-[10px] leading-none tabular-nums text-foreground-muted"
      >
        Ctrl K
      </kbd>
    </button>
  );
}
