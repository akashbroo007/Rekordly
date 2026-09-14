import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bug, ClipboardCopy, ExternalLink, Lightbulb } from 'lucide-react';
import { Button, Select, Textarea } from '@rekordly/ui';
import type { AppInfo } from '@rekordly/shared/contracts';
import { useToastStore } from '../../stores/toast-store';

const ISSUES_URL = 'https://github.com/akashbroo007/Rekordly/issues/new?template=bug_report.md';
const FEATURE_URL = 'https://github.com/akashbroo007/Rekordly/issues/new?template=feature_request.md';
const DISCUSSIONS_URL = 'https://github.com/akashbroo007/Rekordly/discussions';

type ReportKind = 'bug' | 'feature';

const KIND_OPTIONS = [
  { value: 'bug', label: 'Bug — something is broken' },
  { value: 'feature', label: 'Feature request — an idea' },
] as const;

function buildIssueBody(kind: ReportKind, description: string, info: AppInfo): string {
  if (kind === 'feature') {
    return [
      '### Idea',
      '',
      description.trim() || '(describe your idea here)',
      '',
      '### Why',
      '',
      '(what would this improve?)',
      '',
      '---',
      '',
      '### Environment',
      `- Rekordly: ${info.version}`,
      `- Platform: ${info.platform} (${info.arch})`,
      `- Electron: ${info.electron}`,
    ].join('\n');
  }

  return [
    '### What happened',
    '',
    description.trim() || '(describe the problem here)',
    '',
    '### Steps to reproduce',
    '',
    '1. ',
    '2. ',
    '3. ',
    '',
    '### What I expected',
    '',
    '(what should have happened instead?)',
    '',
    '---',
    '',
    '### Environment',
    `- Rekordly: ${info.version}`,
    `- Platform: ${info.platform} (${info.arch})`,
    `- Electron: ${info.electron}`,
    `- Node: ${info.node}`,
    `- Chrome: ${info.chrome}`,
  ].join('\n');
}

/** Settings → Bug Report: turns a short description into a ready-to-file GitHub issue. */
export function BugReportSettings() {
  const pushToast = useToastStore((state) => state.push);
  const [kind, setKind] = useState<ReportKind>('bug');
  const [description, setDescription] = useState('');

  const { data: info } = useQuery({
    queryKey: ['app-info'],
    queryFn: () => window.desktop.app.getInfo(),
    staleTime: Infinity,
  });

  const { data: logs } = useQuery({
    queryKey: ['bug-report-logs'],
    queryFn: () => window.desktop.logs.list(30),
    staleTime: Infinity,
  });

  const copyReport = useMutation({
    mutationFn: async () => {
      if (info === undefined) {
        throw new Error('App info is still loading — try again in a moment.');
      }
      const recentErrors = (logs ?? [])
        .filter((entry) => entry.level === 'error' || entry.level === 'fatal')
        .slice(-5);
      const logBlock =
        recentErrors.length > 0
          ? ['', '### Recent log errors', '```', ...recentErrors.map((e) => `[${e.scope}] ${e.message}`), '```'].join('\n')
          : '';

      const title =
        kind === 'bug'
          ? '[Bug] ' + (description.trim().split('\n')[0]?.slice(0, 60) || 'Short summary')
          : '[Feature] ' + (description.trim().split('\n')[0]?.slice(0, 60) || 'Short summary');

      const body = buildIssueBody(kind, description, info) + logBlock;
      const text = `**Title:** ${title}\n\n${body}`;
      await navigator.clipboard.writeText(text);
      return { hasLogs: recentErrors.length > 0 };
    },
    onSuccess: ({ hasLogs }) => {
      pushToast({
        level: 'info',
        title: 'Report copied',
        message: hasLogs
          ? 'Pasted into a new GitHub issue — recent errors from your log were included.'
          : 'Pasted into a new GitHub issue — describe the steps to reproduce.',
      });
    },
    onError: (error: unknown) => {
      pushToast({
        level: 'error',
        title: 'Could not copy report',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-sm border border-border bg-surface p-4">
        <p className="text-sm font-medium text-foreground">Report a problem or an idea</p>
        <p className="mt-1 text-xs text-foreground-muted">
          Fill in what happened, copy the prepared report, and paste it into a new GitHub issue. Your app
          version and environment are filled in automatically; nothing is sent anywhere by itself.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <Select
            label="What is this about?"
            options={KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={kind}
            onChange={(event) => setKind(event.target.value as ReportKind)}
          />

          <Textarea
            label="Description"
            hint="What happened, what you expected, and how to reproduce it — the more detail, the faster it gets fixed."
            placeholder={kind === 'bug' ? 'Recording stopped after 2 minutes with error …' : 'It would be great if …'}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          {info !== undefined && (
            <div className="rounded-sm border border-border bg-canvas px-3 py-2 text-xs text-foreground-muted">
              <p>
                <span className="font-medium text-foreground-secondary">Rekordly {info.version}</span> ·{' '}
                {info.platform} ({info.arch}) · Electron {info.electron}
              </p>
              <p className="mt-0.5">Attached automatically — no personal data is included.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={copyReport.isPending}
              disabled={description.trim().length === 0}
              onClick={() => copyReport.mutate()}
            >
              <ClipboardCopy size={14} />
              Copy report
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => void window.desktop.app.openUrl(kind === 'bug' ? ISSUES_URL : FEATURE_URL)}
            >
              <Bug size={14} />
              New GitHub issue
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => void window.desktop.app.openUrl(DISCUSSIONS_URL)}
            >
              <Lightbulb size={14} />
              Feature discussions
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-sm border border-border bg-surface p-4">
        <p className="text-sm font-medium text-foreground">Before reporting</p>
        <ul className="mt-1.5 list-inside list-disc text-xs leading-5 text-foreground-muted">
          <li>Check existing issues — your bug may already be tracked.</li>
          <li>Include the exact error text; the Log page has copyable entries.</li>
          <li>
            Plugin-specific problems? Run the plugin&apos;s health check from the{' '}
            <span className="text-foreground-secondary">Plugins</span> page first.
          </li>
        </ul>
        <a
          href="#"
          onClick={(event) => {
            event.preventDefault();
            void window.desktop.app.openUrl(ISSUES_URL);
          }}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <ExternalLink size={12} aria-hidden="true" />
          View all open issues
        </a>
      </div>
    </div>
  );
}
