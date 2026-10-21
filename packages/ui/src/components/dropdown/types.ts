/**
 * Dropdown system — shared types.
 *
 * Every listbox-family component (Select, Combobox, MultiSelect) renders
 * these shapes; page composites (Uploads destination picker) build their own
 * richer rows from the same panel primitives.
 */
import type { ReactNode } from 'react';

export type { DropdownOptionBase } from './option-row';

export interface SelectOption {
  value: string;
  label: string;
  /** Muted text on the right (status note like "Ready" / "Needs setup"). */
  secondary?: string;
  disabled?: boolean;
  disabledReason?: string;
  onSetup?: () => void;
  setupLabel?: string;
  /** Leading 20px icon/tile. */
  leading?: ReactNode;
  /** Rows sharing a group render under one small group label. */
  group?: string;
}

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional count shown muted after the label (e.g. matching creators). */
  count?: number;
  /** Optional 8px brand dot shown before the label. */
  dot?: string;
  /** Optional trailing live dot. */
  live?: boolean;
  disabled?: boolean;
}

export type DropdownAlign = 'start' | 'center' | 'end';
