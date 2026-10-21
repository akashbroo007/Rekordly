/**
 * Master Privacy Mode switch (Settings → General). A BULK ACTION ONLY:
 * switching it on writes privacy mode into every section's key
 * (Recordings, Library, Downloads, Uploads) at once; switching it off
 * clears them all. It is NOT persisted as a linked/global state — each
 * page keeps its own independent toggle and storage key, so the pages
 * drift apart again the moment a page's own toggle is used.
 *
 * When sections are mixed (some blurred, some not), the switch reports
 * "any section is on" rather than all-or-nothing, so re-flipping it in
 * either direction always matches the user's expectation.
 */
import { useState } from 'react';
import { Switch } from '@rekordly/ui';
import { readPrivacyModes, writeAllPrivacyModes, type PrivacyModes } from '../privacy-mode';

export function PrivacyModesCard() {
  const [modes, setModes] = useState<PrivacyModes>(readPrivacyModes);
  const anyOn = modes.recordings || modes.library || modes.downloads || modes.uploads;

  return (
    <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-foreground">Privacy mode — all pages</p>
        <p className="text-xs text-foreground-muted">
          Bulk action: applies Recordings, Library, Downloads and Uploads at once (blur thumbnails + titles while
          screensharing). Each page keeps its own independent toggle afterward.
        </p>
      </div>
      <Switch
        checked={anyOn}
        onCheckedChange={(checked) => {
          writeAllPrivacyModes(checked);
          setModes({ recordings: checked, library: checked, downloads: checked, uploads: checked });
        }}
        aria-label="Privacy mode for all pages"
      />
    </div>
  );
}
