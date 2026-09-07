import { Lock } from 'lucide-react';
import { Card } from '@rekordly/ui';

interface Section {
  title: string;
  body: string;
}

const SECTIONS: Section[] = [
  {
    title: 'Overview',
    body:
      'Rekordly is a local desktop application for recording and downloading media. ' +
      'This policy explains what data the application handles and where it lives. ' +
      'The short version: everything stays on your machine.',
  },
  {
    title: 'Data stored locally',
    body:
      'All application data is stored in a local SQLite database and plain files inside your user data folder: ' +
      'recordings and downloads, tracked creators, plugin metadata, application logs, notifications, and your preferences. ' +
      'None of this data is transmitted to us or to any analytics service.',
  },
  {
    title: 'Network activity',
    body:
      'Rekordly only makes network requests that you initiate or configure: checking whether monitored creators are live, ' +
      'downloading streams and media from the platforms and URLs you choose, and checking for application updates. ' +
      'Requests go directly to those third-party platforms; we do not proxy, log remotely, or inspect your traffic.',
  },
  {
    title: 'Credentials & cookies',
    body:
      "Any credentials or cookies you provide to plugins are stored locally in the plugin's own data directory and are used " +
      'solely to authenticate against the corresponding platform. They are never sent anywhere else.',
  },
  {
    title: 'Plugins',
    body:
      'Third-party plugins run locally with the permissions you explicitly grant them (for example network access). ' +
      "A plugin's own behavior is governed by its author; review a plugin before installing it.",
  },
  {
    title: 'No telemetry',
    body:
      'Rekordly contains no telemetry, crash reporting, usage tracking, or advertising SDKs.',
  },
  {
    title: 'Deleting your data',
    body:
      'You can remove all stored data at any time via Settings → Developer → Reset Database, by deleting the recordings folder, ' +
      'or simply uninstalling the application. Uninstalling does not delete recordings you made unless you delete them yourself.',
  },
];

export function PrivacyPolicyContent() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-start gap-3 p-4">
        <Lock size={16} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Local-first by design</p>
          <p className="mt-1 text-xs text-foreground-muted">
            Rekordly stores every byte of your data on this computer. There is no account, no cloud sync, and no server
            operated by Rekordly.
          </p>
        </div>
      </Card>

      {SECTIONS.map((section) => (
        <Card key={section.title} className="p-4">
          <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-foreground-muted">{section.body}</p>
        </Card>
      ))}

      <p className="text-[10px] text-foreground-muted">
        Last updated: {new Date().getFullYear()}. This summary describes how the software itself behaves; it is not legal advice.
      </p>
    </div>
  );
}