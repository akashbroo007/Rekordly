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
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, EmptyState, Input, PageContainer, SectionHeader, Select, Skeleton, Switch } from '@rekordly/ui';
import type { AppSettings, LogLevel, RecordingSettingsDto } from '@rekordly/shared/contracts';
import { useToastStore } from '../stores/toast-store';
import { useThemeStore } from '../stores/theme-store';
import { PrivacyPolicyContent } from '../components/settings/privacy-policy';
import { TermsOfServiceContent } from '../components/settings/terms-of-service';
import { SupportedSitesContent } from '../components/settings/supported-sites';
import { CloudStorageSettings } from '../components/settings/cloud-storage-settings';


const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];

type SettingsTab =
  | 'general'
  | 'appearance'
  | 'recording'
  | 'downloads'
  | 'cloud-storage'
  | 'plugins'
  | 'notifications'
  | 'performance'
  | 'developer'
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
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'developer', label: 'Developer', icon: Code },
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
    <PageContainer className="flex flex-col gap-6 lg:flex-row">
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
      <div className="min-w-0 flex-1">
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
      await window.desktop.settings.set(next);
      // ponytail: recording settings live in the RecordingService, not the
      // app settings store — save them in the same click.
      if (recDraft !== null) {
        const saved = await window.desktop.recording.setSettings(recDraft);
        void queryClient.invalidateQueries({ queryKey: ['recording-settings'] });
        return { settings: next, recording: saved };
      }
      return { settings: next, recording: null };
    },
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Settings saved', message: 'Your preferences were updated.' });
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
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
            onChange={(event) => patch({ logLevel: event.target.value as LogLevel })}
          />

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
            onChange={(event) => {
              const theme = event.target.value as AppSettings['theme'];
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
            onChange={(event) => patchRec({ defaultQuality: event.target.value })}
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

          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-sm font-medium text-foreground">Cache Management</p>
            <p className="mt-1 text-xs text-foreground-muted">
              Temporary files are automatically cleaned up when the cache limit is reached.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'cloud-storage' && <CloudStorageSettings draft={draft} patch={patch} />}

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
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-error">Danger Zone</p>
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

      {/* Save bar */}
      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-canvas/95 py-4 backdrop-blur">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground-muted">
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
