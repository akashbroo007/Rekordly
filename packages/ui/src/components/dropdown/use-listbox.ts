/**
 * Dropdown system — shared listbox keyboard + type-ahead behavior.
 *
 * Keyboard model (in addition to the host panel's outside-click/Esc):
 *   ↑/↓   move the highlight among enabled option rows
 *   Home/End jump to the first/last enabled row
 *   type-ahead  printable characters jump between rows whose label starts
 *   with the typed prefix (cycling, ~1s buffer)
 *   Enter/Space choose the focused row (native on <button>).
 *
 * Rows carry DOM focus (the APG "focusable option" listbox pattern); the
 * navigation skips disabled rows ([aria-disabled]) and never touches the
 * search input — focus moves through the rows only.
 */
import type { KeyboardEvent, RefObject } from 'react';
import { useCallback, useRef } from 'react';

export interface ListboxNavOptions {
  /** Element containing the role=option rows (the scroll viewport). */
  containerRef: RefObject<HTMLElement | null>;
  /** Only navigate while the panel is open. */
  active: boolean;
}

const TYPEAHEAD_RESET_MS = 1000;

export function useListboxNav({ containerRef, active }: ListboxNavOptions) {
  const typeahead = useRef<{ chars: string; at: number }>({ chars: '', at: 0 });

  const enabledRows = useCallback((): HTMLButtonElement[] => {
    const root = containerRef.current;
    if (root === null) return [];
    return Array.from(
      root.querySelectorAll<HTMLButtonElement>(
        '[role="option"]:not([aria-disabled="true"])',
      ),
    );
  }, [containerRef]);

  /** Open focus: land on the selected row, else the first enabled one. */
  const focusInitial = useCallback(
    (selectedValue: string | null | undefined): void => {
      const rows = enabledRows();
      if (rows.length === 0) return;
      const selected =
        selectedValue !== null && selectedValue !== undefined
          ? rows.find((row) => row.dataset.value === selectedValue)
          : undefined;
      (selected ?? rows[0]!)?.focus({ preventScroll: false });
    },
    [enabledRows],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (!active) return;
      const rows = enabledRows();
      if (rows.length === 0) return;
      const current = rows.findIndex((row) => row === document.activeElement);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        (rows[current === -1 || current === rows.length - 1 ? 0 : current + 1] ?? rows[0])?.focus({ preventScroll: false });
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        (rows[current === -1 || current <= 0 ? rows.length - 1 : current - 1] ?? rows[0])?.focus({ preventScroll: false });
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        event.stopPropagation();
        rows[0]?.focus({ preventScroll: false });
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        event.stopPropagation();
        rows[rows.length - 1]?.focus({ preventScroll: false });
        return;
      }

      // Type-ahead: printable characters cycle rows starting with the latest
      // ~1s chars buffer. Skipped when the event comes from a text field
      // (the panel's search input) so typing filters the list naturally —
      // arrows still move from the input into the rows.
      const key = event.key;
      const fromInput = event.target instanceof HTMLInputElement;
      if (
        !fromInput &&
        key.length === 1 &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        /[a-z0-9]/i.test(key)
      ) {
        event.stopPropagation();
        const now = Date.now();
        const { chars, at } = typeahead.current;
        const prefix = (now - at > TYPEAHEAD_RESET_MS ? '' : chars) + key.toLowerCase();
        typeahead.current = { chars: prefix, at: now };
        const rowText = (row: HTMLButtonElement): string => (row.textContent ?? '').trim().toLowerCase();
        const start = current + 1;
        const next =
          rows.findIndex((row, index) => index >= start && rowText(row).startsWith(prefix)) >= 0
            ? rows.findIndex((row, index) => index >= start && rowText(row).startsWith(prefix))
            : rows.findIndex((row) => rowText(row).startsWith(prefix));
        if (next >= 0) {
          event.preventDefault();
          rows[next]?.focus({ preventScroll: false });
        }
        return;
      }
      if (key.length === 1) typeahead.current = { chars: '', at: 0 };
    },
    [active, enabledRows],
  );

  return { handleKeyDown, focusInitial };
}
