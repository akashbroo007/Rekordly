/**
 * NewButton — the "+ New" trigger of the top bar (last item on the right).
 *
 * Ghost/secondary style (32px high, radius 8, 1px border token): plus icon,
 * "New" label and a chevron — never filled, because pages keep their own
 * filled primary actions in their page headers. Opens the shared Menu with
 * the five quick actions; each one runs the existing dialog/flow, nothing
 * was re-implemented:
 *
 *   · Record all live → RecordAllLiveDialog (same batch the Creators header opens)
 *   · Add creator   → AddCreatorDialog (also bound to Ctrl+N, free)
 *   · Add download  → AddDownloadDialog
 *   · Upload file   → the Uploads page add flow
 *   · Install plugin→ window.desktop.plugins.installFromDirectory()
 */
import { useEffect, useState } from 'react';
import { ChevronDown, Download, CloudUpload, FolderInput, Plus, Radio, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Menu, type MenuItemDef } from '@rekordly/ui';
import { AddCreatorDialog, RecordAllLiveDialog } from '../../pages/creators/dialogs';
import { AddDownloadDialog } from '../../pages/downloads/add-download-dialog';
import { usePluginInstallAction } from './quick-actions';

/** Skip accelerator handling while the user is typing in a form field. */
function isTypingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

export function NewButton() {
  const navigate = useNavigate();
  const installPlugin = usePluginInstallAction();

  const [addCreatorOpen, setAddCreatorOpen] = useState(false);
  const [addDownloadOpen, setAddDownloadOpen] = useState(false);
  // Same dialog the Creators page header opens — mounted here so "Record
  // All Live" works from any page.
  const [recordAllOpen, setRecordAllOpen] = useState(false);

  // Ctrl+N is free — bind it to Add creator (mirrors the menu item).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
        if (isTypingIn(e.target)) return;
        e.preventDefault();
        setAddCreatorOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const items: MenuItemDef[] = [
    {
      key: 'record-all-live',
      label: 'Record All Live',
      icon: <Radio size={13} />,
      onSelect: (): void => setRecordAllOpen(true),
    },
    {
      key: 'add-creator',
      label: 'Add Creator',
      icon: <Users size={13} />,
      shortcut: 'Ctrl N',
      onSelect: (): void => setAddCreatorOpen(true),
    },
    { key: 'add-download', label: 'Add Download', icon: <Download size={13} />, onSelect: (): void => setAddDownloadOpen(true) },
    { key: 'upload-file', label: 'Upload file', icon: <CloudUpload size={13} />, onSelect: () => navigate('/uploads') },
    { key: 'install-plugin', label: 'Install plugin', icon: <FolderInput size={13} />, onSelect: installPlugin },
  ];

  return (
    <>
      <Menu
        items={items}
        label="New"
        trigger={
          <button
            type="button"
            aria-label="New"
            title="New"
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5 text-sm font-medium text-foreground-secondary transition-colors duration-150 outline-none hover:bg-hover hover:text-foreground"
          >
            <Plus size={15} strokeWidth={2} className="shrink-0" aria-hidden="true" />
            <span>New</span>
            <ChevronDown size={13} className="shrink-0 text-foreground-muted" aria-hidden="true" />
          </button>
        }
      />
      <AddCreatorDialog open={addCreatorOpen} onOpenChange={setAddCreatorOpen} />
      <AddDownloadDialog open={addDownloadOpen} onOpenChange={setAddDownloadOpen} />
      <RecordAllLiveDialog open={recordAllOpen} onOpenChange={setRecordAllOpen} />
    </>
  );
}
