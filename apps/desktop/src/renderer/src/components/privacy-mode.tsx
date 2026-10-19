/**
 * Privacy mode — a global toggle that blurs thumbnails and titles so the
 * screen is safe to share (screen sharing, streaming). Rows and cards stay
 * fully functional; only identifying media (poster images, avatar/initials
 * tiles) and title text are blurred.
 *
 * Every surface opts in per element: rows/cards receive the flag from their
 * page and apply PRIVACY_BLUR_CLASS (text) / PRIVACY_MEDIA_BLUR_CLASS
 * (poster images and thumb tiles). Deliberate click-throughs (player,
 * details dialogs) are never blurred — the user chose to open that item.
 *
 * Renderer-local by design: `AppSettings` is a validated backend contract
 * (zod schema in the settings service) and this preference must not touch
 * data models, so it persists in the renderer's localStorage instead — one
 * key shared by every page (Downloads, Recordings, Uploads, Library), with
 * a one-time read fallback for the pre-global downloads-only key.
 */
import { useCallback, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const STORAGE_KEY = 'rekordly.privacyMode';
/** Pre-global key (the setting originally lived on the Downloads page only). */
const LEGACY_KEY = 'rekordly.downloads.privacyMode';

function readInitial(): boolean {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export function usePrivacyMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(readInitial);

  const toggle = useCallback((next: boolean): void => {
    setOn(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
    } catch {
      /* private-mode browsers may refuse — the session toggle still works */
    }
  }, []);

  return [on, toggle];
}

/** Blur treatment for identifying TEXT (titles, share links, reasons). */
export const PRIVACY_BLUR_CLASS = 'blur-[3px] select-none';

/**
 * Blur treatment for full-size MEDIA (poster images, thumb tiles). Stronger
 * than the text blur (gallery tiles are much larger than row thumbs) and
 * slightly scaled so the soft blur edge never leaks outside overflow-hidden
 * containers.
 */
export const PRIVACY_MEDIA_BLUR_CLASS = 'blur-[10px] scale-[1.15] select-none';

/** The shared toolbar/header toggle (Eye ⇄ EyeOff) used by every page. */
export function PrivacyModeButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={
        on
          ? 'Privacy mode on — thumbnails and titles are blurred for screen sharing'
          : 'Privacy mode — blur thumbnails and titles for screen sharing'
      }
      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
        on ? 'bg-primary/15 text-primary' : 'text-foreground-muted hover:bg-hover hover:text-foreground'
      }`}
    >
      {on ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );
}
