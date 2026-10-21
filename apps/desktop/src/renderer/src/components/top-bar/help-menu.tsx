/**
 * HelpMenu — the "?" icon button of the top bar.
 *
 * Opens the shared Menu with the site help links plus the local keyboard
 * shortcut reference. All links go through the existing external-link
 * helper (window.desktop.app.openUrl), which fails silently when the
 * machine is offline. Site URLs are built from the SITE_BASE_URL constant.
 */
import { useState } from 'react';
import { BookOpen, Bug, CircleHelp, Compass, Keyboard, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, Menu, type MenuItemDef } from '@rekordly/ui';
import { SITE_BASE_URL, releaseNotesUrl } from '../../lib/site-links';
import { ISSUES_URL } from '../settings/bug-report';

/** ponytail: site slugs built off the one base constant (rekordly.in). */
const HELP_URLS = {
  documentation: `${SITE_BASE_URL}/docs`,
  featureGuides: `${SITE_BASE_URL}/features`,
} as const;

interface ShortcutRow {
  label: string;
  keys: string;
}

/** The shortcuts that actually exist in the app — keep this in sync with them. */
const SHORTCUTS: ShortcutRow[] = [
  { label: 'Search or jump to...', keys: 'Ctrl K' },
  { label: 'Add a creator', keys: 'Ctrl N' },
  { label: 'Search within the Creators page', keys: '/' },
  { label: 'Close dialog, menu or palette', keys: 'Esc' },
];

export function HelpMenu() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openUrl = (url: string): void => void window.desktop.app.openUrl(url);

  const items: MenuItemDef[] = [
    { key: 'documentation', label: 'Documentation', icon: <BookOpen size={13} />, onSelect: () => openUrl(HELP_URLS.documentation) },
    { key: 'guides', label: 'Feature guides', icon: <Compass size={13} />, onSelect: () => openUrl(HELP_URLS.featureGuides) },
    {
      key: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: <Keyboard size={13} />,
      onSelect: (): void => setShortcutsOpen(true),
    },
    { key: 'whats-new', label: "What's new", icon: <Sparkles size={13} />, onSelect: (): void => openUrl(releaseNotesUrl()) },
    { key: 'report', label: 'Report an issue', icon: <Bug size={13} />, onSelect: () => openUrl(ISSUES_URL) },
  ];

  return (
    <>
      <Menu
        items={items}
        label="Help"
        /* ? icon trigger styled like the sibling icon buttons (bell, …). Radix's
           asChild needs the bare element, so it is inlined here. */
        trigger={
          <button
            type="button"
            aria-label="Help"
            title="Help"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-foreground-secondary transition-colors duration-150 hover:bg-hover hover:text-foreground"
          >
            <CircleHelp size={16} />
          </button>
        }
      />
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent title="Keyboard shortcuts" description="Keys that work anywhere in the app.">
          <ul className="divide-y divide-border">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.label} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <span className="text-sm text-foreground">{shortcut.label}</span>
                <kbd className="shrink-0 rounded-sm border border-border bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-foreground-secondary">
                  {shortcut.keys}
                </kbd>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
