/**
 * Privacy mode — blurs thumbnails and titles so the screen is safe to share
 * (screen sharing, streaming). Rows and cards stay fully functional; only
 * identifying media (poster images, avatar/initials tiles) and title text
 * are blurred.
 *
 * Each surface opts in per element: rows/cards receive the flag from their
 * page and apply PRIVACY_BLUR_CLASS (text) / PRIVACY_MEDIA_BLUR_CLASS
 * (poster images and thumb tiles). Deliberate click-throughs (player,
 * details dialogs) are never blurred — the user chose to open that item.
 *
 * PER-SECTION STATE (independent keys): Recordings, Library, Downloads and
 * Uploads each own their own mode. A page's toggle reads and writes ONLY
 * its own key — toggling one page never moves another, and every key
 * persists separately so settings survive restarts. The Settings master
 * toggle is a BULK ACTION ONLY (writes all four keys at once); it is not
 * stored as a "linked" state and the pages stay independent afterward.
 *
 * Renderer-local by design: `AppSettings` is a validated backend contract
 * (zod schema in the settings service) and this preference must not touch
 * data models, so it persists in the renderer's localStorage — four keys
 * under one prefix. Sections never written since this per-section build
 * inherit the old single global key (and the pre-global downloads-only
 * key) so the first launch after the change keeps what the user had.
 */
import { useCallback, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export type PrivacySection = 'recordings' | 'library' | 'downloads' | 'uploads';

/** Ordered so UI copy and bulk writes enumerate sections consistently. */
const SECTIONS: PrivacySection[] = ['recordings', 'library', 'downloads', 'uploads'];

/** Independent state object: one boolean per section, no linkage. */
export type PrivacyModes = Record<PrivacySection, boolean>;

const SECTION_KEYS: Record<PrivacySection, string> = {
  recordings: 'rekordly.privacyMode.recordings',
  library: 'rekordly.privacyMode.library',
  downloads: 'rekordly.privacyMode.downloads',
  uploads: 'rekordly.privacyMode.uploads',
};

/** Legacy keys — read-only fallbacks for sections not yet rewritten. */
const LEGACY_GLOBAL_KEY = 'rekordly.privacyMode';
const LEGACY_DOWNLOADS_KEY = 'rekordly.downloads.privacyMode';

/** The section's own persisted value; null = never written since the split. */
function readStored(section: PrivacySection): boolean | null {
  try {
    const value = window.localStorage.getItem(SECTION_KEYS[section]);
    return value === null ? null : value === 'true';
  } catch {
    return null; /* storage unavailable — fall back like the missing case */
  }
}

function writeSection(section: PrivacySection, on: boolean): void {
  try {
    window.localStorage.setItem(SECTION_KEYS[section], on ? 'true' : 'false');
  } catch {
    /* private-mode browsers may refuse — the session toggle still works */
  }
}

/** What the old global single toggle stored (before the per-section split). */
function legacyValue(): boolean {
  try {
    return (window.localStorage.getItem(LEGACY_GLOBAL_KEY) ?? window.localStorage.getItem(LEGACY_DOWNLOADS_KEY)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Read all four sections at once (per-section key first, then the legacy
 * global fallback for untouched sections). Used by the Settings master
 * toggle to report current state.
 */
export function readPrivacyModes(): PrivacyModes {
  return {
    recordings: readStored('recordings') ?? legacyValue(),
    library: readStored('library') ?? legacyValue(),
    downloads: readStored('downloads') ?? legacyValue(),
    uploads: readStored('uploads') ?? legacyValue(),
  };
}

/** Page toggles — write ONLY this one section's key. */
export function writePrivacyMode(section: PrivacySection, on: boolean): void {
  writeSection(section, on);
}

/**
 * Master toggle (Settings → General): one bulk write across all sections.
 * Not persisted as a linked/global state — each page goes back to owning
 * its key alone the moment this returns.
 */
export function writeAllPrivacyModes(on: boolean): void {
  for (const section of SECTIONS) {
    writeSection(section, on);
  }
}

/**
 * A single section's mode. Owner: whichever page passes its own section
 * name — Recordings → 'recordings', Library → 'library', Downloads →
 * 'downloads', Uploads → 'uploads'. State lives with the page instance
 * (seeded once from storage), so other sections can never re-render this
 * page's toggle.
 */
export function usePrivacyMode(section: PrivacySection): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => readStored(section) ?? legacyValue());

  const set = useCallback(
    (next: boolean): void => {
      setOn(next);
      writePrivacyMode(section, next);
    },
    [section],
  );

  return [on, set];
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

/**
 * The page toolbar/header toggle (Eye ⇄ EyeOff). `section` names the page
 * in the tooltip so the user always knows the toggle is scoped to this
 * section alone ("Privacy mode for Recordings only").
 */
export function PrivacyModeButton({ on, onToggle, section }: { on: boolean; onToggle: () => void; section?: string }) {
  const scope = section === undefined ? 'this section' : section;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={`Privacy mode for ${scope}`}
      title={
        on
          ? `Privacy mode for ${scope} only — thumbnails and titles are blurred for screen sharing`
          : `Privacy mode for ${scope} only — blur thumbnails and titles for screen sharing`
      }
      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
        on ? 'bg-primary/15 text-primary' : 'text-foreground-muted hover:bg-hover hover:text-foreground'
      }`}
    >
      {on ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );
}
