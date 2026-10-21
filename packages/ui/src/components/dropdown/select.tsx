/**
 * Select — single-choice dropdown (the native `<select>` replacement).
 *
 * Trigger 36px (small 28) · radius 8 · card surface · 1px border · primary
 * text · muted placeholder · muted chevron; hover = raised surface; open =
 * brighter border; focus-visible = global 2px accent ring; disabled 50%.
 * Panel: raised token, radius 10, p-1, shadow-menu, trigger width (min
 * 200px), max 320px, portal + auto-flip + viewport clamp, one-time 120ms
 * fade/scale, Esc closes with focus returned to the trigger. Rows: 36px,
 * 6px radius, white 6% hover/highlight, check icon in the primary text
 * color, disabled rows with a reason + optional "Set up" action, optional
 * group labels with thin dividers. Search renders automatically above 7
 * options (or via `searchable`). ARIA: trigger has-haspopup=listbox, rows
 * are role=option with aria-selected, keyboard ↑/↓/Home/End/type-ahead.
 *
 * Public API: value-based onChange (the native event shape is gone).
 */
import { useEffect, useId, useRef, useState } from 'react';

import {
  DropdownChevron,
  DropdownContent,
  DropdownDivider,
  DropdownEmpty,
  DropdownGroupLabel,
  DropdownSearchBar,
  DropdownScroll,
  Popover,
  dropdownTriggerClass,
} from './core';
import { OptionRow } from './option-row';
import type { SelectOption } from './types';
import { useListboxNav } from './use-listbox';

export interface SelectProps {
  options: readonly SelectOption[];
  /** Selected value ('' = nothing selected → placeholder). */
  value: string;
  onChange: (value: string) => void;
  /** Form-label wrapper: small label above the trigger. */
  label?: string;
  hint?: string;
  error?: string;
  /** Shown when nothing is selected (muted). */
  placeholder?: string;
  /** 28px toolbar trigger. */
  small?: boolean;
  disabled?: boolean;
  /** Force the search bar; by default it appears above 7 options. */
  searchable?: boolean;
  /** Never render a search bar (small control-heavy toolbars). */
  neverSearch?: boolean;
  align?: 'start' | 'center' | 'end';
  /** Width/extra classes for the visible trigger itself. */
  triggerClassName?: string;
  /** Wrapper class (field layout + width control). */
  className?: string;
  ariaLabel?: string;
}

interface Section {
  group?: string;
  options: SelectOption[];
}

/** Options grouped by their optional group name (first-appearance order). */
function groupOptions(options: readonly SelectOption[]): Section[] {
  const sections: Section[] = [];
  for (const option of options) {
    const last = sections[sections.length - 1];
    if (last !== undefined && last.group === option.group) {
      last.options.push(option);
      continue;
    }
    sections.push({ group: option.group, options: [option] });
  }
  return sections;
}

/** Case-insensitive substring match over label + secondary text. */
function matchOptions(options: readonly SelectOption[], query: string): SelectOption[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...options];
  return options.filter(
    (option) => option.label.toLowerCase().includes(q) || option.secondary?.toLowerCase().includes(q),
  );
}

export function Select({
  options,
  value,
  onChange,
  label,
  hint,
  error,
  placeholder = 'Select...',
  small = false,
  disabled = false,
  searchable,
  neverSearch = false,
  align = 'start',
  triggerClassName,
  className,
  ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const searchId = useId();

  const showSearch = neverSearch ? false : (searchable ?? options.length > 7);
  const selectedOption = options.find((o) => o.value === value);
  const filtered = showSearch && query.trim() !== '' ? matchOptions(options, query) : [...options];
  const resultsEmpty = filtered.length === 0;

  // Keyboard nav binds to the rows only (the search input stays untouched).
  const { handleKeyDown, focusInitial } = useListboxNav({ containerRef: viewportRef, active: open });

  // Open focus: searchable panels keep focus in the search input (autoFocus);
  // plain selects land on the selected row, else the first enabled row.
  useEffect(() => {
    if (!open || showSearch) return;
    const raf = window.requestAnimationFrame(() => focusInitial(selectedOption?.value ?? undefined));
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
            id={listboxId}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={ariaLabel ?? label}
            className={`${dropdownTriggerClass(small, { hasValue: selectedOption !== undefined, disabled })} ${triggerClassName ?? ''}`}
          >
            <span className="min-w-0 flex-1 truncate">
              {selectedOption !== undefined ? selectedOption.label : placeholder}
            </span>
            <DropdownChevron small={small} open={open} />
          </button>
        </Popover.Trigger>
        <DropdownContent anchorRef={buttonRef} align={align} ariaLabel={ariaLabel ?? label ?? placeholder}>
          <div
            // Row keyboard handling: ↑/↓/Home/End/type-ahead (Enter+single
            // result inside the search input chooses immediately).
            onKeyDown={(event) => {
              if (event.key === 'Enter' && document.activeElement?.tagName === 'INPUT' && filtered.length === 1) {
                event.preventDefault();
                setOpen(false);
                onChange(filtered[0]!.value);
                return;
              }
              handleKeyDown(event);
            }}
          >
            {showSearch && (
              <DropdownSearchBar id={searchId} value={query} onValueChange={setQuery} />
            )}
            {resultsEmpty ? (
              <DropdownEmpty>No results</DropdownEmpty>
            ) : (
              <DropdownScroll scrollRef={viewportRef}>
                <ul role="listbox" aria-label={ariaLabel ?? label ?? placeholder}>
                  {groupOptions(filtered).map((section, sectionIndex) => (
                    <li key={section.group ?? `s${sectionIndex}`}>
                      {section.group !== undefined && sectionIndex > 0 && <DropdownDivider />}
                      {section.group !== undefined && (
                        <DropdownGroupLabel>{section.group}</DropdownGroupLabel>
                      )}
                      {section.options.map((option) => (
                        <OptionRow
                          key={option.value}
                          id={`${listboxId}-opt-${option.value}`}
                          dataValue={option.value}
                          label={option.label}
                          secondary={option.secondary}
                          disabled={option.disabled}
                          disabledReason={option.disabledReason}
                          onSetup={option.onSetup}
                          setupLabel={option.setupLabel}
                          leading={option.leading}
                          selected={option.value === value}
                          onSelect={onChange}
                          onClose={() => setOpen(false)}
                        />
                      ))}
                    </li>
                  ))}
                </ul>
              </DropdownScroll>
            )}
          </div>
        </DropdownContent>
      </Popover.Root>
      {error !== undefined ? (
        <p className="text-xs text-error" role="alert">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p className="text-xs text-foreground-muted">{hint}</p>
      ) : null}
    </div>
  );
}
