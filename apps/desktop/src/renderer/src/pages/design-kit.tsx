/**
 * Design kit — the shared dropdown system's visual test page (hidden hash
 * route /design-kit, not in the sidebar). Shows every component and state:
 * trigger (default/selected/small/disabled), open panels (with search,
 * groups, disabled rows + "Set up"), Combobox, MultiSelect and action Menus
 * (icons, shortcut, destructive divider).
 */
import { useState } from 'react';
import {
  ArrowDownUp,
  Copy,
  FolderOpen,
  Pause,
  Pencil,
  Play,
  Radio,
  Trash2,
} from 'lucide-react';
import { Badge, Combobox, Menu, MultiSelect, PageContainer, SectionHeader, Select } from '@rekordly/ui';
import type { MenuItemDef } from '@rekordly/ui';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'largest', label: 'Largest' },
];

const STATE_OPTIONS = [
  { value: '', label: 'Select...', secondary: undefined },
  { value: 'ready', label: 'Gofile', secondary: 'Ready' },
  { value: 'needs-setup', label: 'Google Drive', secondary: 'Needs setup', disabled: true, disabledReason: 'Needs setup', onSetup: () => {} },
  { value: 'offline', label: 'Catbox', secondary: 'Offline' },
];

const GROUPED_OPTIONS = [
  { value: 'twitch', label: 'Twitch', group: 'Live platforms' },
  { value: 'kick', label: 'Kick', group: 'Live platforms' },
  { value: 'youtube', label: 'YouTube', group: 'Live platforms' },
  { value: 'gofile', label: 'Gofile', group: 'Storage' },
  { value: 'catbox', label: 'Catbox', group: 'Storage' },
];

const MANY_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: `option-${index + 1}`,
  label: `Option ${index + 1}`,
}));

const COMBO_OPTIONS = [
  { value: 'twitch', label: 'Twitch' },
  { value: 'kick', label: 'Kick' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'google-drive', label: 'Google Drive', disabled: true, disabledReason: 'Needs setup — Client ID', onSetup: () => {} },
];

const MULTI_OPTIONS = [
  { value: 'twitch', label: 'Twitch', dot: '#9146FF', count: 12, live: true },
  { value: 'kick', label: 'Kick', dot: '#53FC18', count: 3 },
  { value: 'youtube', label: 'YouTube', dot: '#FF0000' },
  { value: 'gofile', label: 'Gofile', count: 41 },
];

const MENU_ITEMS: MenuItemDef[] = [
  { key: 'details', label: 'View details', icon: <Pencil size={13} />, onSelect: () => {} },
  { key: 'copy', label: 'Copy link', icon: <Copy size={13} />, shortcut: 'Ctrl+C', onSelect: () => {} },
  { key: 'pause', label: 'Pause', icon: <Pause size={13} />, disabled: true, disabledReason: 'Nothing is running', onSelect: () => {} },
  { key: 'open', label: 'Show in folder', icon: <FolderOpen size={13} />, onSelect: () => {} },
  { key: 'delete', label: 'Delete', icon: <Trash2 size={13} />, dangerous: true, onSelect: () => {} },
];

export function DesignKitPage() {
  const [sort, setSort] = useState('newest');
  const [state, setState] = useState('');
  const [grouped, setGrouped] = useState('twitch');
  const [many, setMany] = useState('');
  const [small, setSmall] = useState('oldest');
  const [combo, setCombo] = useState('');
  const [multi, setMulti] = useState<string[]>(['twitch']);
  const [multiSmall, setMultiSmall] = useState<string[]>([]);

  return (
    <PageContainer>
      <SectionHeader
        title="Design kit — dropdown system"
        description="Visual test page for the shared dropdown components (not linked from the sidebar). Hover, open, and drive everything with the keyboard: ↑/↓, Home/End, type-ahead, Enter/Space, Esc."
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Select */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <SectionHeader title="Select" />
            <Badge variant="muted">single choice</Badge>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <Select className="w-44" label="Default (placeholder)" value="" onChange={() => {}} options={SORT_OPTIONS} />
            <Select className="w-44" label="With selection" value={sort} onChange={setSort} options={SORT_OPTIONS} />
            <Select className="w-44" label="Small (28px, toolbar)" small value={small} onChange={setSmall} options={SORT_OPTIONS} />
            <Select className="w-44" label="Disabled" disabled value="ready" onChange={() => {}} options={SORT_OPTIONS} />
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <Select
              className="w-56"
              label="Status rows (+ disabled & Set up)"
              value={state}
              onChange={setState}
              options={STATE_OPTIONS}
            />
            <Select
              className="w-56"
              label="Grouped"
              value={grouped}
              onChange={setGrouped}
              options={GROUPED_OPTIONS}
            />
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <Select
              className="w-56"
              label="12 options — search appears automatically"
              value={many}
              onChange={setMany}
              options={MANY_OPTIONS}
            />
          </div>
        </section>

        {/* Combobox */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <SectionHeader title="Combobox" />
            <Badge variant="muted">search + single choice</Badge>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <Combobox
              className="w-72"
              label="Plugin picker shape (tiles, disabled + Set up)"
              placeholder="Select a plugin..."
              value={combo}
              onChange={setCombo}
              options={COMBO_OPTIONS}
            />
          </div>
          <p className="max-w-sm text-xs text-foreground-muted">
            The Add Creator dialog uses this component with the shared plugin
            tiles, alphabetical order, "Needs setup" rows and the
            "Show developer plugins" preference.
          </p>

          {/* MultiSelect */}
          <div className="mt-2 flex items-center gap-2">
            <SectionHeader title="MultiSelect" />
            <Badge variant="muted">checkbox rows</Badge>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <MultiSelect
              className="w-52"
              label="Default"
              placeholder="All platforms"
              options={MULTI_OPTIONS}
              value={multi}
              onChange={setMulti}
            />
            <MultiSelect
              small
              className="w-44"
              label="Small"
              placeholder="All platforms"
              options={MULTI_OPTIONS}
              value={multiSmall}
              onChange={setMultiSmall}
            />
          </div>
        </section>

        {/* Menu */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <SectionHeader title="Menu" />
            <Badge variant="muted">kebab / "…" actions</Badge>
          </div>
          <div className="flex items-center gap-4">
            <Menu items={MENU_ITEMS} label="Default menu" />
            <Menu
              align="start"
              items={[
                { key: 'play', label: 'Play now', icon: <Play size={13} />, shortcut: 'Space', onSelect: () => {} },
                { key: 'record', label: 'Record', icon: <Radio size={13} />, onSelect: () => {} },
                { key: 'sort', label: 'Sort', icon: <ArrowDownUp size={13} />, disabled: true, disabledReason: 'Already sorted', onSelect: () => {} },
                { key: 'remove', label: 'Remove', icon: <Trash2 size={13} />, dangerous: true, onSelect: () => {} },
              ]}
              label="Menu with shortcuts and destructive divider"
            />
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
