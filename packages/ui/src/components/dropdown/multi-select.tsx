/**
 * MultiSelect — checkbox rows + count/summary in the trigger.
 *
 * Same trigger and panel tokens as Select (36px or small 28px trigger,
 * raised panel, 320px viewport, portal + flip, 120ms one-shot fade) with:
 *   • neutral 16px checkbox rows (no accent fill) toggling on click;
 *   • the panel STAYS OPEN while toggling — closing is explicit (outside
 *     click / Esc / the footer action);
 *   • trigger summary: first two labels, else "N selected", plus a muted
 *     count chip; an optional leading icon is kept from the old API;
 *   • a "Clear selection" footer row when anything is selected;
 *   • aria-multiselectable listbox inside the panel.
 *
 * Options additionally support a brand `dot` (platform color), `live` dot
 * and a muted `count`.
 */
import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import {
  DropdownChevron,
  DropdownContent,
  DropdownDivider,
  DropdownEmpty,
  DropdownSearchBar,
  DropdownScroll,
  Popover,
  dropdownTriggerClass,
} from './core';
import { OptionRow } from './option-row';
import type { MultiSelectOption } from './types';
import { useListboxNav } from './use-listbox';

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Shown inside the trigger when nothing is selected. */
  placeholder?: string;
  /** Optional form label rendered above the trigger (like Select). */
  label?: string;
  /** Optional leading icon inside the trigger. */
  icon?: ReactNode;
  /** Search bar shown by default; searchable={false} hides it. */
  searchable?: boolean;
  /** 28px toolbar trigger. */
  small?: boolean;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

function optionMatches(option: MultiSelectOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return option.label.toLowerCase().includes(q);
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  label,
  icon,
  searchable = true,
  small = false,
  className,
  disabled = false,
  ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const filtered = searchable ? options.filter((o) => optionMatches(o, query)) : options;
  const selected = options.filter((o) => value.includes(o.value));
  const summary =
    selected.length === 0 ? null : selected.length <= 2 ? selected.map((o) => o.label).join(', ') : `${selected.length} selected`;

  const toggle = (optionValue: string): void => {
    onChange(value.includes(optionValue) ? value.filter((v) => v !== optionValue) : [...value, optionValue]);
  };

  const { handleKeyDown, focusInitial } = useListboxNav({ containerRef: viewportRef, active: open });

  // Open focus: searchable panels keep focus in the search input (autoFocus).
  useEffect(() => {
    if (!open || searchable) return;
    const raf = window.requestAnimationFrame(() => focusInitial(undefined));
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className={`relative flex flex-col gap-1.5 ${className ?? ''}`}>
      {label !== undefined && (
        <label htmlFor={listboxId} className="text-xs font-medium text-foreground-secondary">
          {label}
        </label>
      )}
      <Popover.Root
        modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
      >
        <Popover.Trigger asChild>
          <button
            ref={buttonRef}
            type="button"
            id={listboxId}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={ariaLabel ?? placeholder}
            className={`${dropdownTriggerClass(small, { hasValue: selected.length > 0, disabled })} w-full ${small ? 'px-2 text-xs' : 'px-2.5'}`}
          >
            {icon}
            <span className="min-w-0 flex-1 truncate text-left">{summary ?? placeholder}</span>
            {selected.length > 0 && (
              <span className="shrink-0 rounded-sm bg-white/[0.08] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground-secondary">
                {selected.length}
              </span>
            )}
            <DropdownChevron small={small} open={open} />
          </button>
        </Popover.Trigger>
        <DropdownContent anchorRef={buttonRef} align="start" ariaLabel={ariaLabel ?? placeholder}>
          <div onKeyDown={handleKeyDown}>
            {searchable && <DropdownSearchBar id={`${listboxId}-search`} value={query} onValueChange={setQuery} />}
            {filtered.length === 0 ? (
              <DropdownEmpty>No results</DropdownEmpty>
            ) : (
              <DropdownScroll scrollRef={viewportRef}>
                <ul role="listbox" aria-multiselectable="true" aria-label={ariaLabel ?? placeholder}>
                  {filtered.map((option) => {
                    const isSelected = value.includes(option.value);
                    return (
                      <OptionRow
                        key={option.value}
                        id={option.value}
                        label={option.label}
                        dot={option.dot}
                        live={option.live}
                        count={option.count}
                        disabled={option.disabled}
                        checkbox
                        selected={isSelected}
                        onSelect={toggle}
                        // Multi stays open while toggling.
                        onClose={() => {}}
                      />
                    );
                  })}
                </ul>
              </DropdownScroll>
            )}
            {selected.length > 0 && (
              <>
                <DropdownDivider />
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="flex h-9 w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 text-left text-sm text-foreground-muted outline-none transition-colors duration-100 hover:bg-white/[0.06] hover:text-foreground focus-visible:bg-white/[0.06] focus-visible:text-foreground focus-visible:outline-none"
                >
                  <Check size={13} className="shrink-0" aria-hidden="true" />
                  Clear selection
                </button>
              </>
            )}
          </div>
        </DropdownContent>
      </Popover.Root>
    </div>
  );
}
