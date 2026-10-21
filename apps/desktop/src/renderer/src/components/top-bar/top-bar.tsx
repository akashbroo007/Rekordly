/**
 * TopBar — the app-wide chrome bar (below the title bar, above the content).
 *
 * Identical on every page: 48px high, content background token, 1px bottom
 * border. Left: the search trigger. Right, in order: conditional status
 * chips → Help menu → notifications → "+ New". Every control keeps the
 * shared actions/events of the app it sits in — this file only composes
 * them.
 */
import { SearchTrigger } from './search-trigger';
import { StatusChips } from './status-chips';
import { HelpMenu } from './help-menu';
import { NewButton } from './new-button';
import { NotificationCenter } from '../notification-center';

export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-canvas px-4">
      <SearchTrigger />
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <StatusChips />
        <HelpMenu />
        <NotificationCenter />
        <NewButton />
      </div>
    </header>
  );
}
