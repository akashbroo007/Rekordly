import { CheckCircle2, Download, ExternalLink, RefreshCw, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@rekordly/ui';
import type { AppInfo, UpdateStatusDto } from '@rekordly/shared/contracts';
import { FEATURE_URLS, releaseNotesUrl } from '../../lib/site-links';

/**
 * ponytail: Settings → General card for the in-app updater — the same
 * GitHub-Releases check the title-bar banner runs, mirrored as a manual
 * control so users can re-check on demand ("Check for updates") and pick
 * up a pending install on their own schedule. Nothing ever downloads
 * without a click (see main/updater.ts autoDownload:false).
 */
export function AppUpdatesCard() {
  const [status, setStatus] = useState<UpdateStatusDto | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.desktop.updates.getStatus().then(setStatus);
    void window.desktop.app.getInfo().then(setAppInfo);
    return window.desktop.updates.onEvent((next) => {
      setStatus(next);
      setBusy(false);
    });
  }, []);

  if (status === null) return null;

  const check = (): void => {
    setBusy(true);
    void window.desktop.updates
      .check()
      .then((next) => {
        setStatus(next);
        setBusy(false);
      })
      .catch(() => setBusy(false));
  };

  const statusLine = (() => {
    switch (status.state) {
      case 'checking':
        return 'Checking for updates…';
      case 'available':
        return `Rekordly v${status.version ?? 'newer version'} is available.`;
      case 'downloading':
        return `Downloading update — ${status.downloadPercent ?? 0}%`;
      case 'downloaded':
        return status.version !== undefined
          ? `Update v${status.version} downloaded — restart to install it.`
          : 'Update downloaded — restart to install it.';
      case 'not-available':
        return `You're on the latest version${appInfo !== null ? ` (v${appInfo.version})` : ''}.`;
      case 'error':
        return `Update check failed — ${status.error ?? 'unknown error'}. It will retry on the next schedule.`;
      case 'idle':
      default:
        return appInfo !== null
          ? `Running Rekordly v${appInfo.version}. Updates are checked automatically every 6 hours.`
          : 'Updates are checked automatically every 6 hours.';
    }
  })();

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <p className="text-sm font-medium text-foreground">App updates</p>
      <p className="mt-1 text-xs text-foreground-muted">{statusLine}</p>
      {!status.supported ? (
        <p className="mt-1 text-xs text-foreground-muted">
          Automatic updates are unavailable for this build (portable or development) — grab the
          latest installer from the releases page instead.
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        {status.supported && status.state === 'downloaded' ? (
          <Button size="sm" className="gap-1.5" onClick={() => void window.desktop.updates.install()}>
            <RotateCw size={14} />
            Restart &amp; update
          </Button>
        ) : null}

        {status.supported && status.state === 'available' ? (
          <Button size="sm" className="gap-1.5" onClick={() => void window.desktop.updates.download()}>
            <Download size={14} />
            Download update
          </Button>
        ) : null}

        {status.supported && status.state === 'available' ? (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => void window.desktop.app.openUrl(releaseNotesUrl(status.version))}
          >
            <ExternalLink size={14} />
            What&apos;s new
          </Button>
        ) : null}

        {status.supported && status.state === 'downloading' ? null : (
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            className="gap-1.5"
            onClick={check}
          >
            <RefreshCw size={14} />
            Check for updates
          </Button>
        )}

        {!status.supported ? (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => void window.desktop.app.openUrl(FEATURE_URLS.releases)}
          >
            <ExternalLink size={14} />
            View releases
          </Button>
        ) : null}
      </div>
      {status.supported && status.state === 'not-available' ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-foreground-muted">
          <CheckCircle2 size={13} className="shrink-0 text-primary" />
          No action needed — you'll be notified when a new version publishes.
        </p>
      ) : null}
    </div>
  );
}
