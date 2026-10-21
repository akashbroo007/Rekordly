import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileUp,
  RotateCcw,
  Save,
  Settings,
  Monitor,
  Palette,
  Video,
  HardDrive,
  Puzzle,
  Bell,
  Gauge,
  Code,
  AlertTriangle,
  FolderOpen,
  RefreshCw,
  ShieldCheck,
  FileText,
  Globe,
  Cloud,
  Trash2,
  Bug,
  Send,
  Workflow,
  ExternalLink,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Dialog, DialogContent, EmptyState, Input, PageContainer, SectionHeader, Select, Skeleton, Switch } from '@rekordly/ui';
import { formatBytes } from '@rekordly/shared/format';
import type { AppSettings, LogLevel, RecordingSettingsDto } from '@rekordly/shared/contracts';
import { useToastStore } from '../stores/toast-store';
import { useThemeStore } from '../stores/theme-store';
import { FEATURE_URLS } from '../lib/site-links';
import { PrivacyPolicyContent } from '../components/settings/privacy-policy';
import { TermsOfServiceContent } from '../components/settings/terms-of-service';
import { SupportedSitesContent } from '../components/settings/supported-sites';
import { CloudStorageSettings } from '../components/settings/cloud-storage-settings';
import { BugReportSettings } from '../components/settings/bug-report';
import { AppUpdatesCard } from '../components/settings/app-updates-card';
import { PrivacyModesCard } from '../components/settings/privacy-modes-card';


const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];

interface VerificationResult {
  id: string;
  ok: boolean;
}

// ponytail: providers that hold user credentials are verified automatically
// when settings are saved — no separate "Test Connection" button.
const CREDENTIAL_PROVIDER_IDS = ['mixdrop', 'google-drive'] as const;
const CREDENTIAL_PROVIDER_NAMES: Record<string, string> = {
  mixdrop: 'MixDrop',
  'google-drive': 'Google Drive',
};

const providerCreds = (
  settings: AppSettings | undefined,
  id: string,
): Record<string, unknown> | undefined =>
  (settings?.uploadProviders as unknown as Record<string, Record<string, unknown> | undefined> | undefined)?.[id];

type SettingsTab =
  | 'general'
  | 'appearance'
  | 'recording'
  | 'downloads'
  | 'cloud-storage'
  | 'plugins'
  | 'notifications'
  | 'automation'
  | 'performance'
  | 'developer'
  | 'bug-report'
  | 'privacy'
  | 'terms'
  | 'sites';

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: 'general', label: 'General', icon: Monitor },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'recording', label: 'Recording', icon: Video },
  { id: 'downloads', label: 'Downloads', icon: HardDrive },
  { id: 'cloud-storage', label: 'Cloud Storage', icon: Cloud },
  { id: 'plugins', label: 'Plugins', icon: Puzzle },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'automation', label: 'Automation', icon: Workflow },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'developer', label: 'Developer', icon: Code },
  { id: 'bug-report', label: 'Bug Report', icon: Bug },
  { id: 'privacy', label: 'Privacy Policy', icon: ShieldCheck },
  { id: 'terms', label: 'Terms of Service', icon: FileText },
  { id: 'sites', label: 'Supported Sites', icon: Globe },
];

export function SettingsPage() {
  const { data: current, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
  });

  const { data: recSettings } = useQuery({
    queryKey: ['recording-settings'],
    queryFn: () => window.desktop.recording.getSettings(),
  });

  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [recDraft, setRecDraft] = useState<RecordingSettingsDto | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // ponytail: pages can deep-link straight into a section — the Uploads page's
  // "Set up" provider buttons land on /settings?tab=cloud-storage. Read-once
  // on mount/parm change; normal in-page tab clicks keep working after that.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab !== null && SETTINGS_TABS.some((t) => t.id === tab)) setActiveTab(tab as SettingsTab);
  }, [searchParams]);

  useEffect(() => {
    if (current !== undefined) {
      setDraft(current);
    }
  }, [current]);

  useEffect(() => {
    if (recSettings !== undefined) {
      setRecDraft(recSettings);
    }
  }, [recSettings]);

  const dirty = draft !== null && current !== undefined && JSON.stringify(draft) !== JSON.stringify(current);

  if (!isLoading && current === undefined) {
    return (
      <PageContainer>
        <SectionHeader title="Settings" description="Application preferences." />
        <EmptyState
          icon={Settings}
          title="Settings unavailable"
          description="The settings service did not respond. Check the logs."
        />
      </PageContainer>
    );
  }

  if (draft === null) {
    return (
      <PageContainer>
        <SectionHeader title="Settings" description="Application preferences." />
        <Skeleton className="h-24" />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="flex flex-col gap-6 pb-0 lg:flex-row">
      {/* Sidebar tabs */}
      <nav className="w-full shrink-0 lg:w-48" aria-label="Settings sections">
        <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible lg:border-r lg:border-border lg:pr-3">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 whitespace-nowrap rounded-sm px-3 py-2 text-sm transition-colors duration-150 ${
                  active
                    ? 'bg-primary/10 font-medium text-foreground'
                    : 'text-foreground-muted hover:bg-surface hover:text-foreground-secondary'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={14} className={active ? 'text-primary' : ''} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <div className="min-w-0 flex-1 lg:overflow-y-auto">
        <SettingsForm
          draft={draft}
          dirty={dirty}
          setDraft={setDraft}
          activeTab={activeTab}
          recDraft={recDraft}
          patchRec={(partial) => setRecDraft((prev) => (prev !== null ? { ...prev, ...partial } : prev))}
        />
      </div>
    </PageContainer>
  );
}

function SettingsForm({
  draft,
  dirty,
  setDraft,
  activeTab,
  recDraft,
  patchRec,
}: {
  draft: AppSettings;
  dirty: boolean;
  setDraft: (next: AppSettings) => void;
  activeTab: SettingsTab;
  recDraft: RecordingSettingsDto | null;
  patchRec: (partial: Partial<RecordingSettingsDto>) => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  // ponytail: the renderer applies themes via its own store — keep it in sync
  // with the settings draft so the Theme select actually changes the theme.
  const setThemeMode = useThemeStore((state) => state.setMode);
  const themeMode = useThemeStore((state) => state.mode);

  const save = useMutation({
    mutationFn: async (next: AppSettings) => {
      const previous = queryClient.getQueryData<AppSettings>(['settings']);
      await window.desktop.settings.set(next);
      // ponytail: recording settings live in the RecordingService, not the
      // app settings store — save them in the same click.
      if (recDraft !== null) {
        const saved = await window.desktop.recording.setSettings(recDraft);
        void queryClient.invalidateQueries({ queryKey: ['recording-settings'] });
        return { settings: next, recording: saved, verification: [] as VerificationResult[] };
      }
      // ponytail: credential providers are verified automatically on save —
      // registration happens in the main process during settings.set above,
      // so the check always reflects the just-saved values (the old explicit
      // "Test Connection" button tested stale, unsaved credentials).
      const changed = CREDENTIAL_PROVIDER_IDS.filter((id) => {
        const before = providerCreds(previous, id);
        const after = providerCreds(next, id);
        return JSON.stringify(before) !== JSON.stringify(after);
      });
      const verification: VerificationResult[] = [];
      for (const id of changed) {
        verification.push({ id, ok: await window.desktop.uploads.testProvider(id) });
      }
      void queryClient.invalidateQueries({ queryKey: ['upload-providers'] });
      return { settings: next, recording: null, verification };
    },
    onSuccess: ({ verification }) => {
      pushToast({ level: 'info', title: 'Settings saved', message: 'Your preferences were updated.' });
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      for (const { id, ok } of verification) {
        const name = CREDENTIAL_PROVIDER_NAMES[id] ?? id;
        pushToast(
          ok
            ? {
                level: 'info',
                title: `${name} connected`,
                message: 'Credentials verified — the provider is ready to use.',
              }
            : {
                level: 'error',
                title: `Could not verify ${name}`,
                message: 'Check your credentials and your internet connection, then try saving again.',
              },
        );
      }
    },
    onError: (error: unknown) => {
      pushToast({
        level: 'error',
        title: 'Failed to save settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const reset = useMutation({
    mutationFn: () => window.desktop.settings.reset(),
    onSuccess: (settings) => {
      setDraft(settings);
      pushToast({ level: 'info', title: 'Settings reset', message: 'Defaults were restored.' });
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const importSettings = useMutation({
    mutationFn: () => window.desktop.settings.importFromFile(),
    onSuccess: (settings) => {
      if (settings !== null) {
        setDraft(settings);
        pushToast({ level: 'info', title: 'Settings imported', message: 'Preferences were replaced.' });
      }
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const exportSettings = useMutation({
    mutationFn: () => window.desktop.settings.exportToFile(),
    onSuccess: (exported) => {
      if (exported) {
        pushToast({ level: 'info', title: 'Settings exported', message: 'Preferences were written to a file.' });
      }
    },
  });

  const patch = (partial: Partial<AppSettings>): void => {
    setDraft({ ...draft, ...partial });
  };

  // ponytail: keep the Appearance draft in sync when the theme is toggled
  // from the toolbar (or anywhere else) so the select shows the live theme.
  useEffect(() => {
    if (draft !== null && draft.theme !== themeMode) {
      setDraft({ ...draft, theme: themeMode });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeMode]);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={SETTINGS_TABS.find((t) => t.id === activeTab)?.label ?? 'Settings'}
        description="Configure application preferences."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => importSettings.mutate()} loading={importSettings.isPending}>
              <FileUp size={14} />
              Import
            </Button>
            <Button variant="secondary" size="sm" onClick={() => exportSettings.mutate()} loading={exportSettings.isPending}>
              <Download size={14} />
              Export
            </Button>
            <Button variant="secondary" size="sm" onClick={() => reset.mutate()} loading={reset.isPending}>
              <RotateCcw size={14} />
              Reset
            </Button>
          </div>
        }
      />

      {activeTab === 'general' && (
        <div className="flex flex-col gap-4">
          <Input
            label="Recording directory"
            hint="Where recordings are saved. Must be an absolute path."
            value={draft.recordingsDir}
            onChange={(event) => patch({ recordingsDir: event.target.value })}
          />

          <Input
            label="Monitoring interval (seconds)"
            hint="How often creators are checked for live status. Minimum 30."
            type="number"
            value={draft.checkIntervalSeconds}
            onChange={(event) => patch({ checkIntervalSeconds: Number(event.target.value) })}
          />

          <Select
            label="Log level"
            hint="Controls the verbosity of application logs."
            options={LOG_LEVELS.map((l) => ({ value: l, label: l.charAt(0).toUpperCase() + l.slice(1) }))}
            value={draft.logLevel}
            onChange={(value) => patch({ logLevel: value as LogLevel })}
          />

          <PrivacyModesCard />

          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-sm font-medium text-foreground">Welcome tour</p>
            <p className="mt-1 text-xs text-foreground-muted">
              Missed the first-launch guided tour? Replay it anytime.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                // ponytail: flipping the flag re-shows the welcome overlay on
                // the next render — no reload needed.
                void window.desktop.settings
                  .set({ onboardingCompleted: false })
                  .then(() => queryClient.invalidateQueries({ queryKey: ['settings'] }));
              }}
            >
              <RefreshCw size={14} />
              Replay Welcome Tour
            </Button>
          </div>

          <AppUpdatesCard />
        </div>
      )}

      {activeTab === 'appearance' && (
        <div className="flex flex-col gap-4">
          <Select
            label="Theme"
            hint="Choose between dark and light themes."
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
            value={draft.theme}
            onChange={(value) => {
              const theme = value as AppSettings['theme'];
              patch({ theme });
              // ponytail: apply immediately — the setting alone did nothing.
              setThemeMode(theme);
            }}
          />

          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-sm font-medium text-foreground">Theme Preview</p>
            <p className="mt-1 text-xs text-foreground-muted">
              {draft.theme === 'dark'
                ? 'Dark theme is currently active.'
                : 'Light theme is currently active — applied across the entire app, including native window chrome.'}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'recording' && (
        <div className="flex flex-col gap-4">
          {/* ponytail: master kill-switch — auto-record itself is armed per
              creator (zap icon on each creator card). This pauses everything. */}
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Pause all auto-recording</p>
              <p className="text-xs text-foreground-muted">
                Emergency stop — no creator will be recorded automatically while this is on (per-creator settings are kept).
              </p>
            </div>
            <Switch
              checked={draft.autoRecordPaused ?? false}
              onCheckedChange={(checked) => patch({ autoRecordPaused: checked })}
              aria-label="Pause all auto-recording"
            />
          </div>

          <Input
            label="Auto-record disk guardrail (GB free)"
            hint="Auto-record is skipped (with a notification) when the recordings drive has less free space than this. 0 disables the guardrail."
            type="number"
            value={String(draft.autoRecordMinFreeDiskGb ?? 10)}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              patch({ autoRecordMinFreeDiskGb: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) });
            }}
          />

          <Input
            label="Split auto-recordings every (minutes)"
            hint="Long streams are saved as timestamped parts of this length instead of one huge file (each part appears in the Library as it finishes). 0 = single file until the stream ends."
            type="number"
            value={String(draft.autoRecordSegmentMinutes ?? 30)}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              patch({ autoRecordSegmentMinutes: Number.isNaN(parsed) ? 0 : Math.min(600, Math.max(0, parsed)) });
            }}
          />

          <Input
            label="Output directory"
            hint="Override the default recording output path."
            value={recDraft?.outputDir ?? draft.recordingsDir}
            onChange={(event) => patchRec({ outputDir: event.target.value })}
          />

          <Select
            label="Default quality"
            hint="Default stream quality for new recordings."
            options={[
              { value: 'best', label: 'Best' },
              { value: '1080p', label: '1080p' },
              { value: '720p', label: '720p' },
              { value: '480p', label: '480p' },
              { value: '360p', label: '360p' },
            ]}
            value={recDraft?.defaultQuality ?? 'best'}
            onChange={(value) => patchRec({ defaultQuality: value })}
          />

          <Input
            label="Max concurrent recordings"
            hint="Maximum number of simultaneous recording sessions."
            type="number"
            value={recDraft?.maxConcurrent ?? 3}
            onChange={(event) => patchRec({ maxConcurrent: Number(event.target.value) })}
          />

          <Input
            label="Retry count"
            hint="Number of retries before marking a recording as failed."
            type="number"
            value={recDraft?.retryCount ?? 3}
            onChange={(event) => patchRec({ retryCount: Number(event.target.value) })}
          />

          <Input
            label="Retry delay (ms)"
            hint="Delay between retry attempts in milliseconds."
            type="number"
            value={recDraft?.retryDelay ?? 5000}
            onChange={(event) => patchRec({ retryDelay: Number(event.target.value) })}
          />

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Generate thumbnails</p>
              <p className="text-xs text-foreground-muted">Automatically generate thumbnails for recordings.</p>
            </div>
            <Switch
              checked={recDraft?.thumbnailEnabled ?? true}
              onCheckedChange={(checked) => patchRec({ thumbnailEnabled: checked })}
              aria-label="Generate thumbnails"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Extract metadata</p>
              <p className="text-xs text-foreground-muted">Extract video metadata after recording.</p>
            </div>
            <Switch
              checked={recDraft?.metadataEnabled ?? true}
              onCheckedChange={(checked) => patchRec({ metadataEnabled: checked })}
              aria-label="Extract metadata"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Verify recordings</p>
              <p className="text-xs text-foreground-muted">Verify recording integrity after completion.</p>
            </div>
            <Switch
              checked={recDraft?.verifyEnabled ?? true}
              onCheckedChange={(checked) => patchRec({ verifyEnabled: checked })}
              aria-label="Verify recordings"
            />
          </div>

          <Input
            label="Naming template"
            hint="Template for recording file names. Available: {creator}, {platform}, {date}, {title}"
            value={recDraft?.namingTemplate ?? '{creator}_{platform}_{date}_{title}'}
            onChange={(event) => patchRec({ namingTemplate: event.target.value })}
          />

          {/* ponytail: Advanced — storage/quality trade-off for the background
              transcode that produces "(480p)"-style files when a specific
              quality is selected. 'balanced' keeps the previous behavior. */}
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-sm font-medium text-foreground">Advanced</p>
            <p className="mt-1 text-xs text-foreground-muted">
              For users watching disk space. Applies when a recording is saved at a specific quality (e.g. 480p).
            </p>
            <div className="mt-3">
              <Select
                label="File size vs. quality"
                hint="How much the saved file is compressed. 'Smaller files' can cut storage use roughly in half with a small quality drop; 'Best quality' keeps the most detail at a larger size. Applies to the next recording."
                options={[
                  { value: 'quality', label: 'Best quality (larger files)' },
                  { value: 'balanced', label: 'Balanced (recommended)' },
                  { value: 'size', label: 'Smaller files (low storage)' },
                ]}
                value={draft.recordingCompression}
                onChange={(value) => patch({ recordingCompression: value as AppSettings['recordingCompression'] })}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'downloads' && (
        <div className="flex flex-col gap-4">
          <Input
            label="Download directory"
            hint="Root folder for downloads. Each website automatically gets its own subfolder inside it."
            value={draft.downloadsDir}
            onChange={(event) => patch({ downloadsDir: event.target.value })}
          />

          <Input
            label="Bandwidth limit (bytes/s)"
            hint="Maximum download speed in bytes per second. 0 = unlimited."
            type="number"
            value={draft.downloadBandwidthLimit}
            onChange={(event) => patch({ downloadBandwidthLimit: Number(event.target.value) })}
          />

          <Input
            label="Concurrent downloads"
            hint="Maximum simultaneous downloads (1–10)."
            type="number"
            value={draft.maxConcurrentDownloads}
            onChange={(event) => patch({ maxConcurrentDownloads: Number(event.target.value) })}
          />

          <Input
            label="Cache size (MB)"
            hint="Maximum cache size for temporary download files."
            type="number"
            value={500}
            onChange={() => {}}
          />

          <CacheCleanupSection />
        </div>
      )}

      {activeTab === 'cloud-storage' && <CloudStorageSettings draft={draft} patch={patch} />}

      {activeTab === 'automation' && <AutomationSettings draft={draft} patch={patch} />}

      {activeTab === 'plugins' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-sm font-medium text-foreground">Installed Plugins</p>
            <p className="mt-1 text-xs text-foreground-muted">
              Manage plugins from the dedicated Plugins page. Developer mode allows loading unpacked plugins.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Developer mode</p>
              <p className="text-xs text-foreground-muted">Allow loading unpacked plugins from local directories.</p>
            </div>
            <Switch checked={false} onCheckedChange={() => {}} aria-label="Developer mode" />
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">In-app notifications</p>
              <p className="text-xs text-foreground-muted">Show recording and plugin events in the notification center.</p>
            </div>
            <Switch
              checked={draft.notificationsEnabled}
              onCheckedChange={(checked) => patch({ notificationsEnabled: checked })}
              aria-label="In-app notifications"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Desktop notifications</p>
              <p className="text-xs text-foreground-muted">Also show native desktop notifications for important events.</p>
            </div>
            <Switch
              checked={draft.desktopNotificationsEnabled}
              onCheckedChange={(checked) => patch({ desktopNotificationsEnabled: checked })}
              aria-label="Desktop notifications"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Completion notifications</p>
              <p className="text-xs text-foreground-muted">Get notified when recordings finish successfully.</p>
            </div>
            <Switch
              checked={draft.notifyCompletion}
              onCheckedChange={(checked) => patch({ notifyCompletion: checked })}
              aria-label="Completion notifications"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Failure notifications</p>
              <p className="text-xs text-foreground-muted">Get notified when recordings fail.</p>
            </div>
            <Switch
              checked={draft.notifyFailures}
              onCheckedChange={(checked) => patch({ notifyFailures: checked })}
              aria-label="Failure notifications"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Warning notifications</p>
              <p className="text-xs text-foreground-muted">Get notified about warnings and non-critical issues.</p>
            </div>
            <Switch
              checked={draft.notifyWarnings}
              onCheckedChange={(checked) => patch({ notifyWarnings: checked })}
              aria-label="Warning notifications"
            />
          </div>

          <Input
            label="Toast duration (ms)"
            hint="How long toast notifications are displayed."
            type="number"
            value={draft.toastDurationMs}
            onChange={(event) => patch({ toastDurationMs: Number(event.target.value) })}
          />

          <PushNotificationsSection draft={draft} patch={patch} />
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="flex flex-col gap-4">
          <LowResourceSection draft={draft} patch={patch} />

          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-sm font-medium text-foreground">System Resources</p>
            <p className="mt-1 text-xs text-foreground-muted">
              Performance settings are managed automatically. Worker threads and browser pools are sized based on your system.
            </p>
          </div>

          <Input
            label="Worker limits"
            hint="Maximum number of worker threads for background tasks."
            type="number"
            value={4}
            onChange={() => {}}
          />

          <Input
            label="Browser pool size"
            hint="Maximum number of browser instances in the pool."
            type="number"
            value={2}
            onChange={() => {}}
          />

          <Input
            label="Scheduler interval (ms)"
            hint="How often the scheduler checks for due tasks."
            type="number"
            value={5000}
            onChange={() => {}}
          />

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Database optimization</p>
              <p className="text-xs text-foreground-muted">Periodically optimize the database for better performance.</p>
            </div>
            <Switch checked={true} onCheckedChange={() => {}} aria-label="Database optimization" />
          </div>
        </div>
      )}

      {activeTab === 'developer' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Debug logging</p>
              <p className="text-xs text-foreground-muted">Enable verbose debug logging for development.</p>
            </div>
            <Switch
              checked={draft.logLevel === 'debug'}
              onCheckedChange={(checked) => patch({ logLevel: checked ? 'debug' : 'info' })}
              aria-label="Debug logging"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Plugin development mode</p>
              <p className="text-xs text-foreground-muted">Enable hot-reloading for plugin development.</p>
            </div>
            <Switch checked={false} onCheckedChange={() => {}} aria-label="Plugin development mode" />
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const paths = await window.desktop.app.getPaths();
                const error = await window.desktop.app.openPath(paths.logsDir);
                if (error) pushToast({ level: 'error', title: 'Could not open folder', message: error });
              }}
            >
              <FolderOpen size={14} />
              Open Log Folder
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const paths = await window.desktop.app.getPaths();
                const error = await window.desktop.app.openPath(paths.userData);
                if (error) pushToast({ level: 'error', title: 'Could not open folder', message: error });
              }}
            >
              <FolderOpen size={14} />
              Open Config Folder
            </Button>
          </div>

          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-sm font-medium text-foreground">Database Inspector</p>
            <p className="mt-1 text-xs text-foreground-muted">
              View and manage the application database. Use with caution.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={async () => {
                const paths = await window.desktop.app.getPaths();
                // ponytail: reveal the db file in Explorer rather than trying
                // to "open" a .sqlite file with no default handler.
                window.desktop.library.revealInExplorer(paths.dbPath);
              }}
            >
              <AlertTriangle size={14} />
              Open Database File Location
            </Button>
          </div>

          <div className="rounded-sm border-l-2 border-error bg-elevated p-4">
            <p className="text-xs font-semibold text-error">Danger zone</p>
            <p className="mt-1.5 text-xs text-foreground-muted">
              Resetting the database will remove all recordings, creators, and settings. This action cannot be undone.
            </p>
            <Button variant="danger" size="sm" className="mt-3" onClick={() => reset.mutate()}>
              <RefreshCw size={14} />
              Reset Database
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'privacy' && <PrivacyPolicyContent />}

      {activeTab === 'terms' && <TermsOfServiceContent />}

      {activeTab === 'sites' && <SupportedSitesContent />}

      {activeTab === 'bug-report' && <BugReportSettings />}

      {/* Save bar */}
      <div className="sticky bottom-0 z-10 mt-2 flex shrink-0 items-center justify-between gap-2 border-t border-border bg-canvas py-3">
        <p className="text-xs text-foreground-muted">
          {dirty ? 'Unsaved changes' : 'All changes saved'}
          {dirty && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warning align-middle" aria-hidden="true" />}
        </p>
        <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(draft)}>
          <Save size={14} />
          Save changes
        </Button>
      </div>
    </div>
  );
}

/** ponytail: actionable cache cleanup for the Downloads tab — surfaces the
 * live cache+temp size and a confirm-guarded "Remove Cache" action backed by
 * window.desktop.storage.cleanup, which previously had no UI at all. */
function CacheCleanupSection() {
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: storageStats } = useQuery({
    queryKey: ['storage-stats'],
    queryFn: () => window.desktop.storage.getStats(),
    refetchInterval: 30000,
  });

  const cacheBytes = (storageStats?.cacheSizeBytes ?? 0) + (storageStats?.tempSizeBytes ?? 0);

  const clearCache = useMutation({
    mutationFn: () => window.desktop.storage.cleanup({ cache: true, temp: true }),
    onSuccess: () => {
      pushToast({
        level: 'info',
        title: 'Cache removed',
        message: `Freed ${formatBytes(cacheBytes)} of temporary files.`,
      });
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
    },
    onError: (err: unknown) => {
      pushToast({
        level: 'error',
        title: 'Could not remove cache',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Cache Management</p>
          <p className="mt-1 text-xs text-foreground-muted">
            Temporary download and thumbnail files are cleaned up automatically when the cache limit is
            reached. Recordings are never affected.
          </p>
          <p className="mt-2 text-xs tabular-nums text-foreground-secondary">
            Current cache: <span className="font-medium text-foreground">{formatBytes(cacheBytes)}</span>
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          disabled={cacheBytes === 0}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 size={14} />
          Remove Cache
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title="Remove Cache"
          description={`Delete ${formatBytes(cacheBytes)} of cached and temporary files?`}
        >
          <p className="text-sm text-foreground-muted">
            This removes temporary download parts, thumbnails and preview images. Your recordings and
            downloads are not touched. The app will re-download these files as needed.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={clearCache.isPending} onClick={() => clearCache.mutate()}>
              Remove Cache
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LowResourceSection({
  draft,
  patch,
}: {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
}) {
  const { data: profile } = useQuery({
    queryKey: ['hardware-profile'],
    queryFn: () => window.desktop.app.getHardwareProfile(),
    staleTime: Infinity,
  });

  const formatGb = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">Low-Resource Mode</p>
          <p className="text-xs text-foreground-muted">
            Limits recordings and downloads to one at a time, skips thumbnail generation, and
            disables UI animations. Recommended on weaker PCs or HDD storage.
          </p>
        </div>
        <Switch
          checked={draft.lowResourceMode}
          onCheckedChange={(checked) => patch({ lowResourceMode: checked })}
          aria-label="Low-Resource Mode"
        />
      </div>

      {profile !== undefined && (
        <div className="rounded-sm border border-border bg-surface p-4 text-xs text-foreground-muted">
          <p className="text-sm font-medium text-foreground">Detected hardware</p>
          <p className="mt-1">
            {profile.cpuModel} · {profile.cpuCores} cores · {formatGb(profile.totalMemoryBytes)} RAM ·{' '}
            {profile.diskType === 'unknown' ? 'disk type unknown' : `${profile.diskType.toUpperCase()} storage`} ·{' '}
            tier: <span className="font-medium capitalize text-foreground">{profile.tier}</span>
          </p>
        </div>
      )}
    </>
  );
}

/** ponytail: push notifications (Discord webhook + Telegram bot) — get
 * "X is live, recording started" on your phone. Lives inside the
 * Notifications tab; includes a live test button for both channels. */
function PushNotificationsSection({
  draft,
  patch,
}: {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
}) {
  const pushToast = useToastStore((state) => state.push);
  const prefs = draft.pushNotifications;
  const [testing, setTesting] = useState(false);

  const patchPush = (partial: Partial<AppSettings['pushNotifications']>): void => {
    patch({ pushNotifications: { ...prefs, ...partial } });
  };

  const configured =
    prefs.discordWebhookUrl.trim() !== '' || (prefs.telegramBotToken.trim() !== '' && prefs.telegramChatId.trim() !== '');

  /** Asks the bot for its recent messages and fills in the numeric chat id. */
  const detectChat = useMutation({
    mutationFn: () => window.desktop.push.detectTelegramChatId(prefs.telegramBotToken.trim()),
    onSuccess: (ids) => {
      if (ids.length === 0) {
        pushToast({
          level: 'warn',
          title: 'No chat found yet',
          message: 'Open your bot in Telegram, press Start / send it any message, then try again.',
        });
        return;
      }
      const id = ids[0]!;
      if (prefs.telegramChatId.trim() !== id) patchPush({ telegramChatId: id });
      pushToast({
        level: 'info',
        title: 'Chat ID detected',
        message:
          ids.length === 1
            ? `Filled in ${id} from your recent message to the bot.`
            : `Filled in the most recent chat (${id}). Other candidates: ${ids.slice(1).join(', ')}.`,
      });
    },
    onError: (error: unknown) => {
      pushToast({
        level: 'error',
        title: 'Detection failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const sendTest = useMutation({
    mutationFn: () => window.desktop.push.test(),
    onSuccess: (result) => {
      const lines: string[] = [];
      if (result.discord.ok) lines.push('✅ Discord delivered.');
      else if (result.discord.error !== 'not configured') lines.push(`❌ Discord: ${result.discord.error}`);
      if (result.telegram.ok) lines.push('✅ Telegram delivered.');
      else if (result.telegram.error !== 'not configured') lines.push(`❌ Telegram: ${result.telegram.error}`);
      if (lines.length === 0) {
        pushToast({
          level: 'warn',
          title: 'Nothing to test',
          message: 'Enter a Discord webhook URL or a Telegram bot token + chat ID first.',
        });
      } else if (lines.every((line) => line.startsWith('✅'))) {
        pushToast({ level: 'info', title: 'Test sent', message: lines.join(' ') });
      } else {
        pushToast({ level: 'error', title: 'Test failed', message: lines.join(' ') });
      }
    },
    onError: (error: unknown) => {
      pushToast({
        level: 'error',
        title: 'Test failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Send size={14} className="text-primary" />
            Push to phone (Discord / Telegram)
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Get notified on your phone when a creator goes live or a recording starts, finishes, or fails.
          </p>
        </div>
        <Switch
          checked={prefs.enabled}
          onCheckedChange={(checked) => patchPush({ enabled: checked })}
          aria-label="Push notifications"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">Creator went live</p>
            <p className="text-xs text-foreground-muted">Push when a tracked creator starts streaming.</p>
          </div>
          <Switch
            checked={prefs.notifyOnLive}
            onCheckedChange={(checked) => patchPush({ notifyOnLive: checked })}
            aria-label="Notify on live"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">Recording started</p>
            <p className="text-xs text-foreground-muted">Push when a recording begins.</p>
          </div>
          <Switch
            checked={prefs.notifyOnRecordingStarted}
            onCheckedChange={(checked) => patchPush({ notifyOnRecordingStarted: checked })}
            aria-label="Notify on recording started"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">Recording saved</p>
            <p className="text-xs text-foreground-muted">Push when a recording finishes successfully.</p>
          </div>
          <Switch
            checked={prefs.notifyOnCompleted}
            onCheckedChange={(checked) => patchPush({ notifyOnCompleted: checked })}
            aria-label="Notify on completed"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">Recording failed</p>
            <p className="text-xs text-foreground-muted">Push when a recording fails.</p>
          </div>
          <Switch
            checked={prefs.notifyOnFailed}
            onCheckedChange={(checked) => patchPush({ notifyOnFailed: checked })}
            aria-label="Notify on failed"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border px-3 py-2.5 sm:col-span-2">
          <div>
            <p className="text-sm font-medium text-foreground">Upload finished</p>
            <p className="text-xs text-foreground-muted">Push when a cloud upload completes.</p>
          </div>
          <Switch
            checked={prefs.notifyOnUploadCompleted}
            onCheckedChange={(checked) => patchPush({ notifyOnUploadCompleted: checked })}
            aria-label="Notify on upload completed"
          />
        </div>
      </div>

      <Input
        label="Discord webhook URL"
        hint="Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. Leave empty to disable."
        placeholder="https://discord.com/api/webhooks/…"
        value={prefs.discordWebhookUrl}
        onChange={(event) => patchPush({ discordWebhookUrl: event.target.value })}
      />

      <div className="rounded-sm border border-border bg-canvas px-3 py-2.5 text-xs text-foreground-muted">
        <p className="font-medium text-foreground">Setting up Telegram (3 steps)</p>
        <ol className="mt-1 list-inside list-decimal space-y-0.5">
          <li>
            Create a bot with <span className="text-foreground">@BotFather</span> and paste its token in the first field
            below.
          </li>
          <li>
            Open your new bot in Telegram (search its username) and press <span className="text-foreground">Start</span>{' '}
            or send it any message — it cannot write to you until you do this once.
          </li>
          <li>
            Click <span className="text-foreground">“Detect chat ID automatically”</span> under the second field — or
            message <span className="text-foreground">@userinfobot</span> and paste the numeric ID it replies with.
            Your chat ID is a number like 123456789; a bot @username never works here.
          </li>
        </ol>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Telegram bot token"
          hint="Create a bot with @BotFather and paste its token here."
          placeholder="123456789:AA…"
          value={prefs.telegramBotToken}
          onChange={(event) => patchPush({ telegramBotToken: event.target.value })}
        />
        <div>
          <Input
            label="Telegram chat ID"
            hint="Your numeric user ID (from @userinfobot) — NOT your @username and not the bot's name."
            placeholder="e.g. 123456789"
            value={prefs.telegramChatId}
            onChange={(event) => patchPush({ telegramChatId: event.target.value })}
          />
          <button
            type="button"
            className="mt-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50"
            disabled={prefs.telegramBotToken.trim() === '' || detectChat.isPending}
            onClick={() => detectChat.mutate()}
          >
            {detectChat.isPending ? 'Detecting…' : 'Detect chat ID automatically'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!configured}
          loading={testing || sendTest.isPending}
          onClick={() => {
            setTesting(true);
            // Save first so the main process tests the just-entered values.
            // Works with the master switch off: a test should always be runnable.
            window.desktop.settings
              .set({ pushNotifications: { ...prefs } })
              .then(() => sendTest.mutate())
              .catch((error: unknown) =>
                pushToast({
                  level: 'error',
                  title: 'Save failed',
                  message: error instanceof Error ? error.message : 'Could not save settings',
                }),
              )
              .finally(() => setTesting(false));
          }}
        >
          <Send size={14} />
          Send test notification
        </Button>
        <p className="text-xs text-foreground-muted">
          Saves the current values, then sends a test message to each configured channel.
        </p>
      </div>
    </div>
  );
}

/** ponytail: post-recording automation — the ordered pipeline applied to
 * every finished recording: tag → compress → move → upload → delete. */
function AutomationSettings({
  draft,
  patch,
}: {
  draft: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
}) {
  const auto = draft.autoActions;

  const patchAuto = (partial: Partial<AppSettings['autoActions']>): void => {
    patch({ autoActions: { ...auto, ...partial } });
  };

  const patchCompress = (partial: Partial<AppSettings['autoActions']['compress']>): void => {
    patchAuto({ compress: { ...auto.compress, ...partial } });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
            Enable post-recording automation
            {/* Opens in the system's default browser — fails silently when offline. */}
            <button
              type="button"
              onClick={() => void window.desktop.app.openUrl(FEATURE_URLS.automation)}
              className="inline-flex w-fit items-center gap-1 text-xs font-normal text-foreground-muted transition-colors hover:text-foreground-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              Learn how it works
              <ExternalLink size={12} aria-hidden="true" />
            </button>
          </p>
          <p className="text-xs text-foreground-muted">
            Runs on every finished recording, in order: tag → compress → move → upload → delete after upload.
          </p>
        </div>
        <Switch
          checked={auto.enabled}
          onCheckedChange={(checked) => patchAuto({ enabled: checked })}
          aria-label="Enable automation"
        />
      </div>

      <Input
        label="Tag new recordings"
        hint="Automatically adds this tag in the Library (created if needed). Leave empty to skip."
        placeholder="e.g. auto-recorded"
        value={auto.tagNewRecordings}
        onChange={(event) => patchAuto({ tagNewRecordings: event.target.value })}
      />

      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Compress finished recordings</p>
            <p className="mt-1 text-xs text-foreground-muted">
              Re-encodes to 720p to save space. Only runs when it actually makes the file smaller; the original is kept if it fails.
            </p>
          </div>
          <Switch
            checked={auto.compress.enabled}
            onCheckedChange={(checked) => patchCompress({ enabled: checked })}
            aria-label="Compress recordings"
          />
        </div>
        {auto.compress.enabled && (
          <div className="mt-3">
            <Input
              label="Only compress files larger than (MB)"
              hint="Smaller files are left untouched."
              type="number"
              value={String(auto.compress.minSizeMb)}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                patchCompress({ minSizeMb: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) });
              }}
            />
          </div>
        )}
      </div>

      <Input
        label="Move finished recordings to"
        hint="Folder the file is moved into after recording (created if needed). Leave empty to skip."
        placeholder="D:/Rekordly/Organized"
        value={auto.moveToFolder}
        onChange={(event) => patchAuto({ moveToFolder: event.target.value })}
      />

      <Select
        label="Upload finished recordings to"
        hint="Queues a cloud upload for every finished recording. Requires the provider's credentials in Cloud Storage. Leave empty to skip."
        options={[
          { value: '', label: 'Do not upload automatically' },
          { value: 'gofile', label: 'Gofile' },
          { value: 'catbox', label: 'Catbox' },
          { value: 'mixdrop', label: 'MixDrop' },
          { value: 'google-drive', label: 'Google Drive' },
        ]}
        value={auto.uploadProviderId}
        onChange={(value) => patchAuto({ uploadProviderId: value })}
      />

      <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">Delete local file after upload</p>
          <p className="text-xs text-foreground-muted">
            Removes the local copy once its upload completes. The Library entry is kept. Requires an upload provider above.
          </p>
        </div>
        <Switch
          checked={auto.deleteAfterUpload}
          onCheckedChange={(checked) => patchAuto({ deleteAfterUpload: checked })}
          aria-label="Delete after upload"
        />
      </div>
    </div>
  );
}

