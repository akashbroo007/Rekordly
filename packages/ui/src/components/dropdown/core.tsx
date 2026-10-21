/**
 * Dropdown system — shared panel pieces (tokens + behavior).
 *
 * One panel style backs Select / Combobox / MultiSelect and every action
 * Menu (menu.tsx), plus page-local composites (the Uploads destination
 * picker) built from these same pieces:
 *
 *   • Panel        raised surface token (bg-elevated), 1px border, radius 10,
 *                  p-1, shadow-menu, width of the trigger (min 200px),
 *                  max-h 320px with the app's thin scrollbar.
 *   • Animation    one-time 120ms fade + 98%→100% scale on open (theme.css),
 *                  auto-disabled under prefers-reduced-motion.
 *   • Positioning  Radix popover primitive — portal (never clipped by
 *                  modals/scroll containers), auto-flip when no room below,
 *                  clamped to the viewport.
 *   • Focus        Esc closes and focus returns to the trigger.
 *
 * Built on the Radix UI primitives this package already depends on rather
 * than implementing positioning from scratch.
 */
import * as Popover from '@radix-ui/react-popover';
import { Search, X } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { useCallback, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/* ── Trigger ─────────────────────────────────────────────────────────────── */

/**
 * Trigger token spec: 36px (small 28px), radius 8, card surface, 1px border,
 * primary text, muted placeholder, muted chevron on the right. Hover =
 * raised surface; open = brighter border (data-state); disabled = 50%. The
 * 2px accent focus ring comes from the global :focus-visible rule.
 */
export function dropdownTriggerClass(
  small: boolean,
  state: { hasValue?: boolean; disabled?: boolean } = {},
): string {
  return [
    'flex min-w-0 shrink-0 select-none items-center gap-2 rounded-md border border-border bg-surface',
    'text-sm text-left transition-colors duration-150',
    small ? 'h-7 px-2 text-xs' : 'h-9 px-2.5',
    state.hasValue === true ? 'text-foreground' : 'text-foreground-muted',
    'hover:bg-elevated',
    'data-[state=open]:border-foreground/25',
    state.disabled === true ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
  ].join(' ');
}

/** Muted chevron on the trigger's right edge; rotates once when open. */
export function DropdownChevron({ small, open }: { small: boolean; open: boolean }) {
  const size = small ? 12 : 14;
  return (
    <span aria-hidden="true" className="flex shrink-0 text-foreground-muted">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

/* ── Radix wiring ────────────────────────────────────────────────────────── */

export interface DropdownContentProps {
  /** Control directly from the owning root: <Popover open onOpenChange>. */
  children: ReactNode;
  /** The trigger element (used for width matching + focus return). */
  anchorRef: RefObject<HTMLElement | null>;
  align?: 'start' | 'center' | 'end';
  /** Panel width follows the trigger width (min 200px). */
  matchTriggerWidth?: boolean;
  /** Focus the trigger when the panel closes (default true). */
  returnFocusOnClose?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * The shared panel: portal + auto-flip + viewport clamping (collision
 * padding 8px, side-offset 4px), panel tokens, trigger-width matching, and
 * focus return on close. Render inside <Popover.Root> after the Trigger.
 */
export function DropdownContent({
  children,
  anchorRef,
  align = 'start',
  matchTriggerWidth = true,
  returnFocusOnClose = true,
  className,
  ariaLabel,
}: DropdownContentProps) {
  const [width, setWidth] = useState<number | undefined>(undefined);

  // Measure BEFORE first paint of the open panel (flicker-free width match).
  useLayoutEffect(() => {
    if (!matchTriggerWidth) return;
    const el = anchorRef.current;
    if (el === null) return;
    setWidth(Math.max(200, el.getBoundingClientRect().width));
    const ro = new ResizeObserver(() => {
      setWidth(Math.max(200, el.getBoundingClientRect().width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchorRef, matchTriggerWidth]);

  const returnFocus = useCallback(() => {
    if (!returnFocusOnClose) return;
    window.requestAnimationFrame(() => anchorRef.current?.focus());
  }, [anchorRef, returnFocusOnClose]);

  return (
    <Popover.Portal>
      <Popover.Content
        role="dialog"
        aria-label={ariaLabel}
        aria-modal={false}
        side="bottom"
        align={align}
        sideOffset={4}
        collisionPadding={8}
        // Radix handles flip + viewport clamping; sticky keeps it glued while
        // the trigger scrolls within the open frame.
        avoidCollisions
        // Focus steering is per variant (search inputs land first etc.).
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
        style={
          matchTriggerWidth && width !== undefined
            ? { width, maxWidth: 'min(60vw, 640px)' }
            : { minWidth: 200, maxWidth: 'min(60vw, 640px)' }
        }
        className={`dropdown-panel z-50 min-w-[200px] overflow-x-hidden rounded-[10px] border border-border bg-elevated p-1 shadow-menu ${className ?? ''}`}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  );
}

/* ── Search bar (Combobox + auto >7-option panels) ───────────────────────── */

export interface DropdownSearchBarProps {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function DropdownSearchBar({
  value,
  onValueChange,
  id,
  placeholder = 'Search...',
  autoFocus = true,
  ref,
}: DropdownSearchBarProps) {
  return (
    <div className="relative px-1 pb-1 pt-1">
      <Search
        size={12}
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground-muted"
      />
      <input
        id={id}
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        aria-expanded="true"
        className="h-8 w-full rounded-sm border border-border bg-surface pl-7 pr-7 text-sm text-foreground placeholder:text-foreground-muted focus:border-foreground/25 focus:outline-none"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onValueChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-sm p-0.5 text-foreground-muted transition-colors hover:bg-hover hover:text-foreground"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/* ── Groups / structure ──────────────────────────────────────────────────── */

/** Small sentence-case group label inside the panel (12px · muted · 500). */
export function DropdownGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden="true" className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-foreground-muted">
      {children}
    </div>
  );
}

/** Thin separator used between groups and around destructive menu items. */
export function DropdownDivider({ className }: { className?: string }) {
  return <div aria-hidden="true" className={`my-1 h-px shrink-0 bg-border ${className ?? ''}`} />;
}

/** Scroll viewport — max 320px, thin app-wide custom scrollbar. */
export function DropdownScroll({
  children,
  className,
  scrollRef,
}: {
  children: ReactNode;
  className?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={scrollRef}
      className={`max-h-[320px] overflow-y-auto ${className ?? ''}`}
      style={{ scrollbarGutter: 'stable' }}
    >
      {children}
    </div>
  );
}

/** "No results" empty state for searched panels. */
export function DropdownEmpty({ children = 'No results' }: { children?: ReactNode }) {
  return <div className="px-2.5 py-3 text-center text-sm text-foreground-muted">{children}</div>;
}

/* Re-export for the variants that need the raw Popover namespace (Trigger). */
export { Popover };
