/**
 * TitleBarBrand — the title-bar brand block: the "Rekordly" wordmark plus
 * (optionally) the broadcast-tower mark.
 *
 * ponytail: purple RadioTower mark is hidden by default now (title bar is
 * text-only); the app/window/taskbar/tray/installer icons keep coming from
 * src/main/icons.ts and build/ — this component never touches those.
 * One prop flips the mark back for a rebrand:
 *
 *   <TitleBarBrand showMark />
 */
import { RadioTower } from 'lucide-react';

export function TitleBarBrand({ showMark = false }: { showMark?: boolean }) {
  return (
    <span className="flex select-none items-center gap-2">
      {showMark && <RadioTower size={16} className="shrink-0 text-primary" aria-hidden="true" />}
      <span className="text-sm font-semibold tracking-[0.015em] text-foreground">Rekordly</span>
    </span>
  );
}
