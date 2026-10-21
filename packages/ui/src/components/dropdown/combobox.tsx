/**
 * Combobox — single choice with a search field in the panel.
 *
 * A preset of the shared Select architecture: same trigger/panel/row tokens,
 * same ARIA listbox pattern and keyboard model, but the search input is part
 * of the component's contract (autofocused, placeholder "Search...", clear
 * button, "No results" empty state). Use it wherever a choice benefits from
 * typed lookup — the Add Creator plugin picker is the canonical site. Options
 * may carry platform tiles, status notes and disabled "Set up" rows.
 */
import { Select } from './select';
import type { SelectOption } from './types';

export interface ComboboxProps {
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  small?: boolean;
  disabled?: boolean;
  align?: 'start' | 'center' | 'end';
  triggerClassName?: string;
  className?: string;
  ariaLabel?: string;
}

export function Combobox(props: ComboboxProps) {
  return <Select searchable {...props} />;
}
