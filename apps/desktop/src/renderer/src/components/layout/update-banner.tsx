import { CheckCircle2, Download, RotateCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UpdateStatusDto } from '@rekordly/shared/contracts';
import { releaseNotesUrl } from '../../lib/site-links';

/**
 * ponytail: slim in-app update strip shown under the TitleBar. It replaces
 * "uninstall + reinstall to update": a published release shows up on its
 * own (GitHub Releases check by the main process) and the user drives it —
 * download, then restart. Nothing stays hidden for version changes: the
 * dismiss is per-version, so the next release brings the banner back.
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatusDto | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    void window.desktop.updates.getStatus().then(setStatus);
    return window.desktop.updates.onEvent((next) => {
      setStatus(next);
    });
  }, []);

  if (status === null || !status.supported) return null;
  const { state, version, downloadPercent } = status;
  const visible = state === 'available' || state === 'downloading' || state === 'downloaded';
  if (!visible) return null;
  // "Later" only clears the current release — the next release reappears.
  if (state !== 'downloading' && version !== undefined && dismissedVersion === version) return null;

  return (
    <div className="flex h-9 shrink-0 select-none items-center gap-3 border-b border-border bg-panel px-4">
      {state === 'downloading' ? (
        <>
          <RotateCw size={14} className="shrink-0 animate-spin text-primary" />
          <span className="text-xs text-foreground-secondary">
            Downloading Rekordly{version !== undefined ? ` v${version}` : ''} — {downloadPercent ?? 0}%
          </span>
        </>
      ) : state === 'downloaded' ? (
        <>
          <CheckCircle2 size={14} className="shrink-0 text-primary" />
          <span className="text-xs text-foreground-secondary">
            Update ready{version !== undefined ? ` (v${version})` : ''} — restart to install
          </span>
          <button
            type="button"
            onClick={() => void window.desktop.updates.install()}
            className="cursor-pointer rounded-md border border-primary/40 bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary transition-colors duration-150 hover:bg-primary/25"
          >
            Restart &amp; update
          </button>
        </>
      ) : (
        <>
          <Download size={14} className="shrink-0 text-primary" />
          <span className="text-xs text-foreground-secondary">
            Rekordly v{version ?? 'newer version'} is available — install the patched build without reinstalling
          </span>
          <button
            type="button"
            onClick={() => void window.desktop.app.openUrl(releaseNotesUrl(version))}
            title="See what changed in this release"
            className="cursor-pointer text-xs font-medium text-primary underline-offset-2 transition-colors duration-150 hover:underline"
          >
            What&apos;s new
          </button>
          <button
            type="button"
            onClick={() => void window.desktop.updates.download()}
            className="cursor-pointer rounded-md border border-primary/40 bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary transition-colors duration-150 hover:bg-primary/25"
          >
            Download update
          </button>
          {version !== undefined ? (
            <button
              type="button"
              aria-label="Skip this release"
              title="Skip this release (next release will notify again)"
              onClick={() => setDismissedVersion(version)}
              className="cursor-pointer rounded-md p-1 text-foreground-secondary transition-colors duration-150 hover:bg-hover hover:text-foreground"
            >
              <X size={13} />
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
