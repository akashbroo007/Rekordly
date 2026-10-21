/**
 * Dropdown system — one modern, shared replacement for every native
 * `<select>` and ad-hoc popover in the app.
 *
 *   • Select      single choice (+ search above 7 options)
 *   • Combobox    single choice with an always-available search field
 *   • MultiSelect checkbox rows + count/summary trigger + clear action
 *   • Menu        action/"…" menus with icons, shortcuts, red destructive
 *   • core        Panel/DropdownContent/rows/scrollbar/group pieces for
 *                 page-local composites (Uploads destination picker)
 *
 * All share the Panel style and token discipline described in each file's
 * header. See pages/design-kit (visual test page) for every state.
 */
export { Select } from './select';
export type { SelectProps } from './select';
export { Combobox } from './combobox';
export type { ComboboxProps } from './combobox';
export { MultiSelect } from './multi-select';
export type { MultiSelectProps } from './multi-select';
export { Menu } from './menu';
export type { MenuProps, MenuItemDef } from './menu';
export {
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
export { OptionRow } from './option-row';
export type { OptionRowProps, DropdownOptionBase } from './option-row';
export { useListboxNav } from './use-listbox';
export type { MultiSelectOption, SelectOption, DropdownAlign } from './types';
