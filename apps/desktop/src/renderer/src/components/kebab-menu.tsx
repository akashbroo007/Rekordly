/**
 * Shared " … " (kebab) menu used by CreatorCards, PluginRows/Cards,
 * RecordingRows, Download/Upload rows and the toolbars.
 *
 * Migrated onto the shared dropdown system (packages/ui dropdown/Menu):
 * same public API as before (items + label), now with the shared panel
 * tokens — raised surface, 10px radius, shadow-menu, 120ms one-shot
 * fade/scale, portal + auto-flip + viewport clamp, focus returned to the
 * trigger on close. Items support icons (leading, inherit row color),
 * muted right-aligned keyboard shortcuts and the red destructive item
 * separated by a thin divider.
 */
import type { ReactNode } from 'react';
import { Menu, type MenuItemDef } from '@rekordly/ui';

export interface KebabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Red destructive item (gets its own divider). */
  dangerous?: boolean;
  /** Muted shortcut hint on the right (only where an accelerator exists). */
  shortcut?: string;
  onSelect: () => void;
}

/** Same data shape, new rendering — old call sites need no edits. */
function toMenuItems(items: KebabItem[]): MenuItemDef[] {
  return items.map(({ key, label, icon, dangerous, shortcut, onSelect }) => ({
    key,
    label,
    icon,
    dangerous,
    shortcut,
    onSelect,
  }));
}

export function KebabMenu({ items, label = 'More actions' }: { items: KebabItem[]; label?: string }) {
  return <Menu items={toMenuItems(items)} label={label} />;
}
