import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Info, Loader2, Radio, Shield, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CreatorDto, CreatorLookupDto, RecordAllLiveProgressDto } from '@rekordly/shared';
import { Button, Combobox, Dialog, DialogContent, Input, Select, Switch, Textarea } from '@rekordly/ui';
import { useToastStore } from '../../stores/toast-store';
import { usePluginPickerOptions } from './plugin-picker-options';
import { friendlyErrorMessage } from '../../lib/errors';
export interface CreatorFieldHints {
  idLabel: string;
  idPlaceholder: string;
  usernameLabel: string;
  usernamePlaceholder: string;
  displayNameLabel: string;
  displayNamePlaceholder: string;
  guide: string[];
}

// ponytail: per-platform entry hints for the manual Add Creator form; the
// fallback keeps unknown plugins working with generic wording.
export const PLUGIN_CREATOR_HINTS: Record<string, CreatorFieldHints> = {
  youtube: {
    idLabel: 'Channel ID, @handle or channel URL',
    idPlaceholder: 'e.g. UCXuqSBlHAE6Xw-yeJA0Tunw or @mkbhd',
    usernameLabel: 'Handle (without @)',
    usernamePlaceholder: 'e.g. mkbhd',
    displayNameLabel: 'Channel Name',
    displayNamePlaceholder: 'e.g. Marques Brownlee',
    guide: [
      'Channel ID: open the channel on YouTube and copy the "UC..." ID from the URL (youtube.com/channel/UC....). This is the most reliable option.',
      'Handle: you can also enter the @handle (e.g. @mkbhd) or just paste the channel URL - both are cleaned up automatically.',
      'Handle and Channel Name are only labels shown in the app; Rekordly monitors the ID/handle entered above.',
      'Make sure a YouTube API key is configured under Plugins > YouTube > Settings, otherwise live status cannot be checked.',
    ],
  },
  twitch: {
    idLabel: 'Channel name or channel URL',
    idPlaceholder: 'e.g. shroud or https://twitch.tv/shroud',
    usernameLabel: 'Username (login name)',
    usernamePlaceholder: 'e.g. shroud',
    displayNameLabel: 'Display Name',
    displayNamePlaceholder: 'e.g. Shroud',
    guide: [
      'Enter the channel login name exactly as it appears in the channel URL: twitch.tv/<name> (e.g. "shroud").',
      'You can also paste the full channel URL - it is cleaned to the login name automatically.',
      'Username should be the lowercase login name; Display Name can use capitals (e.g. "Shroud").',
      'Make sure a Twitch Client-ID and Secret are configured under Plugins > Twitch > Settings, otherwise live status cannot be checked.',
    ],
  },
};

const GENERIC_CREATOR_HINTS: CreatorFieldHints = {
  idLabel: 'Creator URL or Username',
  idPlaceholder: 'e.g. username or profile URL',
  usernameLabel: 'Username',
  usernamePlaceholder: 'e.g. john_doe',
  displayNameLabel: 'Display Name',
  displayNamePlaceholder: 'e.g. John Doe',
  guide: [
    'Enter the creator username exactly as it appears in their profile URL on the platform.',
    'You can usually paste the full profile URL instead - it will be cleaned automatically where possible.',
  ],
};

export function normalizeExternalId(pluginId: string, raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (pluginId === 'youtube') {
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        if (url.pathname.startsWith('/channel/')) {
          const id = url.pathname.split('/').filter(Boolean)[1];
          if (id) return id;
        }
        const handle = url.pathname.split('/').filter(Boolean)[0];
        if (handle) return handle.startsWith('@') ? handle : `@${handle}`;
      } catch {
        /* fall through to raw value */
      }
    }
    return value;
  }
  if (pluginId === 'twitch') {
    if (/^https?:\/\//i.test(value)) {
      try {
        const name = new URL(value).pathname.split('/').filter(Boolean)[0];
        if (name) return name.toLowerCase();
      } catch {
        /* fall through to raw value */
      }
    }
    return value.toLowerCase().replace(/^@/, '');
  }
  return value;
}

export function AddCreatorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const { data: plugins } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
  });
  // Shared plugin picker model: platform tiles, disabled needs-setup rows
  // with a "Set up" action, developer plugins behind the preference toggle,
  // alphabetical. Purely presentational — validation logic below is intact.
  const pluginOptions = usePluginPickerOptions(plugins);

  const [pluginId, setPluginId] = useState('');
  const [externalId, setExternalId] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [notes, setNotes] = useState('');
  // ponytail: explicit per-creator opt-in at add time (default OFF).
  const [autoRecord, setAutoRecord] = useState(false);
  const [autoRecordQuality, setAutoRecordQuality] = useState('best');
  // ponytail: per-creator secure-proxy opt-in — for creators whose site is
  // unreachable from this network (ISP blocks). Default OFF: direct access.
  const [useProxy, setUseProxy] = useState(false);

  // ponytail: profile auto-lookup — the plugin resolves the real profile so
  // creators are added with their actual avatar photo (not initials).
  const [profileLookup, setProfileLookup] = useState<CreatorLookupDto | null>(null);
  const [lookupState, setLookupState] = useState<'idle' | 'searching' | 'found' | 'not-found'>('idle');

  // ponytail: segment length comes from the global setting — shown so the
  // user knows how files will be split before committing.
  const { data: appSettingsForAdd } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
  });
  const segmentMin = appSettingsForAdd?.autoRecordSegmentMinutes ?? 30;
  const autoRecordSegmentLabel = segmentMin > 0 ? `${segmentMin} min parts` : 'a single file';

  const hints = PLUGIN_CREATOR_HINTS[pluginId] ?? GENERIC_CREATOR_HINTS;

  // ponytail: debounced profile lookup. Once a plugin + id are available,
  // ask the plugin for the upstream profile (real displayName/username +
  // avatar). Only empties are autofilled — the user's own inputs win.
  useEffect(() => {
    if (pluginId === '' || externalId.trim() === '') {
      setProfileLookup(null);
      setLookupState('idle');
      return;
    }
    let cancelled = false;
    // ponytail: one bounded retry when the lookup comes up empty. The plugin
    // runs the same smart route the monitor uses — the first attempt often
    // lands while the network route/secure proxy is still booting, and a
    // null conflates a transport failure with "model does not exist". The
    // live path already re-asks on every monitoring check (which is why the
    // avatar reliably shows up there), so give the Add dialog one second
    // attempt before reporting "No profile found".
    let attempts = 0;
    let retryTimer: number | undefined;
    const run = () => {
      if (cancelled) return;
      attempts += 1;
      setLookupState('searching');
      window.desktop.creators
        .lookup(pluginId, normalizeExternalId(pluginId, externalId))
        .then((info) => {
          if (cancelled) return;
          if (info !== null) {
            setProfileLookup(info);
            setLookupState('found');
            setUsername((prev) => (prev.trim() === '' ? info.username.toLowerCase() : prev));
            setDisplayName((prev) => (prev.trim() === '' ? info.displayName : prev));
            return;
          }
          if (attempts < 2) {
            retryTimer = window.setTimeout(run, 1500);
            return;
          }
          setProfileLookup(null);
          setLookupState('not-found');
        })
        .catch(() => {
          if (cancelled) return;
          if (attempts < 2) {
            retryTimer = window.setTimeout(run, 1500);
            return;
          }
          setProfileLookup(null);
          setLookupState('not-found');
        });
    };
    const timer = window.setTimeout(run, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [pluginId, externalId]);

  const create = useMutation({
    mutationFn: (values: { externalId: string; username: string }) =>
      window.desktop.creators.create({
        pluginId,
        externalId: values.externalId,
        username: values.username,
        displayName,
        // ponytail: real profile photo + url from the plugin lookup (null
        // when the plugin couldn't resolve a profile).
        avatarUrl: profileLookup?.avatarUrl ?? null,
        profileUrl: profileLookup?.profileUrl ?? null,
        autoRecord,
        autoRecordQuality,
        useProxy,
        notes: notes || null,
      }),
    onSuccess: () => {
      pushToast({
        level: 'info',
        title: 'Creator added',
        message: autoRecord
          ? `${displayName} has been added — recording starts automatically when they go live.`
          : `${displayName} has been added.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
      // ponytail: the host latches `secureProxyUsed` when a proxy-flagged
      // creator is added — refresh the settings cache so the conditional
      // "Secure Proxy" nav item appears without a restart.
      if (useProxy) void queryClient.invalidateQueries({ queryKey: ['settings'] });
      onOpenChange(false);
      setPluginId(''); setExternalId(''); setUsername(''); setDisplayName(''); setNotes(''); setAutoRecord(false); setAutoRecordQuality('best'); setUseProxy(false);
      setProfileLookup(null); setLookupState('idle');
    },
    onError: (err: unknown) => {
      pushToast({ level: 'error', title: 'Failed to add creator', message: err instanceof Error ? err.message : 'Unknown error' });
    },
  });

  const enabledPlugins = (plugins ?? []).filter((p) => p.enabled);
  const isValid = pluginId && externalId && username && displayName;

  const submit = () => {
    const cleanedId = normalizeExternalId(pluginId, externalId);
    setExternalId(cleanedId);
    const derivedUsername = username.trim() || cleanedId.replace(/^@/, '').toLowerCase();
    setUsername(derivedUsername);
    create.mutate({ externalId: cleanedId, username: derivedUsername });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add Creator" description="Add a new creator to monitor.">
        <div className="space-y-4">
          <Combobox
            label="Plugin"
            placeholder="Select a plugin..."
            value={pluginId}
            onChange={setPluginId}
            options={pluginOptions}
          />
          {pluginId !== '' && (
            <div className="rounded-sm border border-border bg-elevated px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground-muted">
                <Info size={12} className="text-info" />
                What to enter
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-foreground-secondary">
                {hints.guide.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <Input
            label={hints.idLabel}
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            placeholder={hints.idPlaceholder}
          />
          {/* ponytail: live profile-lookup feedback — shows the resolved
              avatar so the user can confirm the right creator is matched. */}
          {pluginId !== '' && externalId.trim() !== '' && (
            <div aria-live="polite" className="flex items-center gap-2 text-xs text-foreground-muted">
              {lookupState === 'searching' ? (
                <>
                  <Loader2 size={12} className="animate-spin text-info" aria-hidden="true" />
                  Looking up profile from {enabledPlugins.find((p) => p.id === pluginId)?.name ?? pluginId}…
                </>
              ) : lookupState === 'found' && profileLookup !== null ? (
                <>
                  {profileLookup.avatarUrl ? (
                    <img
                      src={profileLookup.avatarUrl}
                      alt="Creator avatar preview"
                      className="h-5 w-5 shrink-0 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <Check size={12} className="shrink-0 text-success" aria-hidden="true" />
                  )}
                  <span className="text-success">Profile matched</span>
                  <span>{profileLookup.avatarUrl ? '— avatar will be saved' : '— details autofilled'}</span>
                </>
              ) : lookupState === 'not-found' ? (
                <>
                  <Info size={12} className="shrink-0 text-foreground-disabled" aria-hidden="true" />
                  No profile found — details are saved as entered. The avatar is fetched on the next live check.
                </>
              ) : null}
            </div>
          )}
          <Input
            label={`${hints.usernameLabel} (optional - auto-filled if empty)`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={hints.usernamePlaceholder}
          />
          <Input
            label={hints.displayNameLabel}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={hints.displayNamePlaceholder}
          />
          <Textarea
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
          />
          {/* ponytail: per-creator auto-record opt-in at add time */}
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Zap size={13} className="text-primary" /> Auto-record when live
              </p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                Recording starts automatically every time this creator goes live (uses disk — see Settings → Recording).
              </p>
            </div>
            <Switch
              checked={autoRecord}
              onCheckedChange={setAutoRecord}
              aria-label="Auto-record when live"
            />
          </div>
          {/* ponytail: per-creator secure-proxy opt-in at add time */}
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Shield size={13} className="text-info" /> Use secure proxy for this creator
              </p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                If this site is blocked on your network (ISP/DNS blocks), route this creator through an embedded secure proxy. First use downloads a small runtime automatically.
              </p>
            </div>
            <Switch
              checked={useProxy}
              onCheckedChange={setUseProxy}
              aria-label="Use secure proxy for this creator"
            />
          </div>
          {autoRecord && (
            <>
              <Select
                label="Auto-record quality"
                hint="Set once — used for every future auto-recording of this creator. Lower quality = far less disk."
                value={autoRecordQuality}
                onChange={setAutoRecordQuality}
                options={[
                  { value: 'best', label: 'Best (source quality)' },
                  { value: '1080p', label: '1080p' },
                  { value: '720p', label: '720p' },
                  { value: '480p', label: '480p' },
                ]}
              />
              <p className="text-[11px] text-foreground-muted">
                Estimated disk: ≈2–3 GB/hr at Best · ≈1 GB/hr at 720p · ≈0.5 GB/hr at 480p. Recordings are split every{' '}
                {autoRecordSegmentLabel} (Settings → Recording).
              </p>
            </>
          )}
          <Button loading={create.isPending} disabled={!isValid} onClick={submit} className="w-full">
            Add Creator
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditCreatorDialog({
  creator,
  open,
  onOpenChange,
}: {
  creator: CreatorDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const [displayName, setDisplayName] = useState(creator.displayName);
  const [username, setUsername] = useState(creator.username);
  const [notes, setNotes] = useState(creator.notes ?? '');
  // ponytail: per-creator auto-record settings editable here too — quality
  // is set ONCE here and applies to all future auto-recordings.
  const [autoRecord, setAutoRecord] = useState(creator.autoRecord);
  const [autoRecordQuality, setAutoRecordQuality] = useState(creator.autoRecordQuality ?? 'best');
  const [useProxy, setUseProxy] = useState(creator.useProxy);

  const update = useMutation({
    mutationFn: () =>
      window.desktop.creators.update(creator.id, {
        displayName,
        username,
        autoRecord,
        autoRecordQuality,
        useProxy,
        notes: notes || null,
      }),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Creator updated', message: `${displayName} has been updated.` });
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
      if (useProxy) void queryClient.invalidateQueries({ queryKey: ['settings'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit Creator" description={`Editing ${creator.displayName}`}>
        <div className="space-y-4">
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Textarea
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {/* ponytail: per-creator auto-record settings — set once here */}
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Zap size={13} className="text-primary" /> Auto-record when live
              </p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                Recording starts automatically every time this creator goes live.
              </p>
            </div>
            <Switch
              checked={autoRecord}
              onCheckedChange={setAutoRecord}
              aria-label="Auto-record when live"
            />
          </div>
          {/* ponytail: per-creator secure-proxy toggle — editable here too */}
          <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface px-3 py-2.5">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Shield size={13} className="text-info" /> Use secure proxy for this creator
              </p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                Enable if this site is blocked on your network.
              </p>
            </div>
            <Switch
              checked={useProxy}
              onCheckedChange={setUseProxy}
              aria-label="Use secure proxy for this creator"
            />
          </div>
          {autoRecord && (
            <Select
              label="Auto-record quality"
              hint="Used for all future auto-recordings of this creator."
              value={autoRecordQuality}
              onChange={setAutoRecordQuality}
              options={[
                { value: 'best', label: 'Best (source quality)' },
                { value: '1080p', label: '1080p' },
                { value: '720p', label: '720p' },
                { value: '480p', label: '480p' },
              ]}
            />
          )}
          <Button loading={update.isPending} onClick={() => update.mutate()} className="w-full">
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCreatorDialog({
  creator,
  open,
  onOpenChange,
}: {
  creator: CreatorDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const remove = useMutation({
    mutationFn: () => window.desktop.creators.remove(creator.id),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Creator deleted', message: `${creator.displayName} has been removed.` });
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Delete Creator" description={`Are you sure you want to remove ${creator.displayName}?`}>
        <p className="text-sm text-foreground-muted">
          This action cannot be undone. All associated data will be removed.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [text, setText] = useState('');

  const importData = useMutation({
    mutationFn: (data: string) =>
      format === 'json' ? window.desktop.creators.importJson(data) : window.desktop.creators.importCsv(data),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
      if (result.errors.length > 0) {
        pushToast({ level: 'warn', title: 'Import completed with errors', message: result.errors.join('; ') });
      } else {
        pushToast({ level: 'info', title: 'Import successful', message: `Imported ${result.imported} creators.` });
      }
      onOpenChange(false);
      setText('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Import Creators" description="Import creators from JSON or CSV.">
        <div className="space-y-4">
          <Select
            label="Format"
            value={format}
            onChange={(value) => setFormat(value as 'json' | 'csv')}
            options={[
              { value: 'json', label: 'JSON' },
              { value: 'csv', label: 'CSV' },
            ]}
          />
          <Textarea
            label="Paste data"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={format === 'json' ? '[{"pluginId":"...", "externalId":"...", "username":"...", "displayName":"..."}]' : 'pluginId,externalId,username,displayName\n...'}
          />
          <Button
            loading={importData.isPending}
            disabled={!text.trim()}
            onClick={() => importData.mutate(text)}
            className="w-full"
          >
            Import
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RecordDialog({
  creator,
  open,
  onOpenChange,
}: {
  creator: CreatorDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pushToast = useToastStore((state) => state.push);

  // ponytail: '' means "until stream ends"; otherwise minutes.
  const [duration, setDuration] = useState('');
  const [quality, setQuality] = useState('best');
  // ponytail: '' means single file; otherwise split into parts every N min.
  const [segment, setSegment] = useState('');

  // ponytail: stream variant pick (VR-capable plugins). The dropdown only
  // renders when the plugin's manifest declares multiple streamTypes; 'auto'
  // defers to the plugin's own default.
  const { data: plugins } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
  });
  const pluginStreamTypes = plugins?.find((p) => p.id === creator.pluginId)?.streamTypes ?? [];
  const [streamType, setStreamType] = useState('auto');

  const startRecording = useMutation({
    mutationFn: () =>
      window.desktop.recording.startForCreator(creator.id, {
        // ponytail: Duration is the stop-after budget for the WHOLE recording,
        // even with splitting on — 30-min recording split every 15 min =
        // exactly 2 parts (the second is the last one). Split = each part's
        // length. Passing both used to drop the duration entirely, so split
        // chains ran until the stream ended.
        durationMinutes: duration === '' ? undefined : Number(duration),
        quality,
        segmentMinutes: segment === '' ? undefined : Number(segment),
        streamType: streamType === 'auto' ? undefined : streamType,
      }),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Recording started', message: `Recording ${creator.displayName}.` });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      pushToast({ level: 'error', title: 'Recording failed', message: friendlyErrorMessage(err) });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Record ${creator.displayName}`} description="Configure and start recording.">
        <div className="space-y-4">
          {pluginStreamTypes.length > 1 && (
            <Select
              label="Stream type"
              hint="VR (3D) records the stereoscopic feed and plays back with VR controls in the player."
              value={streamType}
              onChange={setStreamType}
              options={[
                { value: 'auto', label: 'Auto (site default)' },
                ...pluginStreamTypes.map((t) => ({
                  value: t,
                  label: t === 'vr' ? 'VR (3D)' : t === '2d' ? '2D (flat HD)' : t,
                })),
              ]}
            />
          )}
          <Select
            label="Quality"
            value={quality}
            onChange={setQuality}
            options={[
              { value: 'best', label: 'Best (auto)' },
              { value: '1080p', label: '1080p' },
              { value: '720p', label: '720p' },
              { value: '480p', label: '480p' },
            ]}
          />
          <Select
            label="Duration"
            hint="Total length of the recording. With a split selected, this covers all parts together."
            value={duration}
            onChange={setDuration}
            options={[
              { value: '', label: 'Until stream ends' },
              { value: '2', label: '2 minutes' },
              { value: '5', label: '5 minutes' },
              { value: '15', label: '15 minutes' },
              { value: '30', label: '30 minutes' },
              { value: '60', label: '1 hour' },
              { value: '120', label: '2 hours' },
            ]}
          />
          {/* ponytail: long streams → timestamped parts instead of one huge file */}
          <Select
            label="Split into parts (optional)"
            hint="Each part is saved to the Library as it finishes — recommended for long streams."
            value={segment}
            onChange={setSegment}
            options={[
              { value: '', label: 'No split (single file)' },
              { value: '5', label: 'Every 5 minutes' },
              { value: '15', label: 'Every 15 minutes' },
              { value: '30', label: 'Every 30 minutes' },
              { value: '60', label: 'Every hour' },
            ]}
          />
          <Button loading={startRecording.isPending} onClick={() => startRecording.mutate()} className="w-full">
            <Radio size={14} /> Start Recording
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * RecordAllLiveDialog — the master "Record All Live" batch start. Reuses the
 * per-creator RecordDialog's option model exactly (stream type / quality /
 * duration / split) and adds a checklist of the creators that are live right
 * now, pre-checked; creators already recording render locked. One batch call
 * fans out sequentially in the main process (main/record-start.ts), and
 * `record-all-progress` heartbeats stream the per-creator outcome count back
 * while it runs.
 */
export function RecordAllLiveDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();

  // Same conventions as RecordDialog: '' = "until stream ends" / single file.
  const [duration, setDuration] = useState('');
  const [quality, setQuality] = useState('best');
  const [segment, setSegment] = useState('');
  const [streamType, setStreamType] = useState('auto');

  const { data: creators } = useQuery({
    queryKey: ['creators'],
    queryFn: () => window.desktop.creators.list(),
  });
  const { data: monitoringJobs } = useQuery({
    queryKey: ['monitoring-jobs'],
    queryFn: () => window.desktop.monitoring.getJobs(),
  });
  const { data: recordingJobs } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
  });
  const { data: plugins } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
  });

  // Live right now = the monitoring cache says live AND a tracked creator
  // matches the monitor id; already-recording rows render locked. The batch
  // re-verifies live state at click time — this list is just the roster.
  const rows = useMemo(() => {
    const activeStatuses = ['queued', 'preparing', 'recording', 'paused', 'stopping'];
    const creatorByMonitorId = new Map<string, CreatorDto>(
      (creators ?? []).map((c) => [`${c.pluginId}:${c.externalId}`, c] as const),
    );
    const recordingCreatorIds = new Set(
      (recordingJobs ?? [])
        .filter((j) => activeStatuses.includes(j.status) && j.creatorId !== null)
        .map((j) => j.creatorId as string),
    );
    return (monitoringJobs ?? [])
      .filter((j) => j.lastResult?.isLive === true)
      .flatMap((j) => {
        const creator = creatorByMonitorId.get(j.creatorId);
        if (creator === undefined) return [];
        return [
          {
            creator,
            pluginStreamTypes: plugins?.find((p) => p.id === creator.pluginId)?.streamTypes ?? [],
            recording: recordingCreatorIds.has(creator.id),
          },
        ];
      })
      .sort((a, b) => a.creator.displayName.localeCompare(b.creator.displayName));
  }, [creators, monitoringJobs, recordingJobs, plugins]);

  const eligibleIds = useMemo(() => rows.filter((r) => !r.recording).map((r) => r.creator.id), [rows]);

  // Seed the checklist with everything eligible on first fill, then only
  // prune ids that became ineligible — user unchecks must survive refetches.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!open) {
      setSeeded(false);
      return;
    }
    if (!seeded) {
      if (eligibleIds.length > 0) {
        setSelectedIds(new Set(eligibleIds));
        setSeeded(true);
      }
      return;
    }
    setSelectedIds((prev) => {
      const eligible = new Set(eligibleIds);
      const next = new Set([...prev].filter((id) => eligible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [open, seeded, eligibleIds]);

  // Batch heartbeat — "Processed 3/12 …" while the fan-out is in flight.
  const [progress, setProgress] = useState<RecordAllLiveProgressDto | null>(null);
  useEffect(() => {
    if (!open) {
      setProgress(null);
      return;
    }
    return window.desktop.recording.onEvent((event) => {
      if (event.type === 'record-all-progress' && event.data !== undefined) {
        setProgress(event.data as unknown as RecordAllLiveProgressDto);
      }
    });
  }, [open]);

  // Stream-variant pick only when an eligible creator's plugin declares
  // variants (VR-capable sites); the batch validates the pick per plugin, so
  // sites without it record their own default.
  const streamTypeOptions = useMemo(() => {
    const union = [
      ...new Set(
        rows
          .filter((r) => !r.recording && r.pluginStreamTypes.length > 1)
          .flatMap((r) => r.pluginStreamTypes),
      ),
    ];
    return [
      { value: 'auto', label: 'Auto (site default)' },
      ...union.map((t) => ({
        value: t,
        label: t === 'vr' ? 'VR (3D)' : t === '2d' ? '2D (flat HD)' : t,
      })),
    ];
  }, [rows]);

  const startAll = useMutation({
    mutationFn: () =>
      window.desktop.recording.startAllLive({
        durationMinutes: duration === '' ? undefined : Number(duration),
        quality,
        segmentMinutes: segment === '' ? undefined : Number(segment),
        streamType: streamType === 'auto' ? undefined : streamType,
        creatorIds: [...selectedIds],
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['recording-jobs'] });
      const parts: string[] = [];
      if (result.started.length > 0) {
        parts.push(`Started ${result.started.length} recording${result.started.length === 1 ? '' : 's'}.`);
      }
      if (result.skipped.length > 0) {
        parts.push(
          `Skipped ${result.skipped.length}: ${result.skipped.map((s) => s.displayName).join(', ')}.`,
        );
      }
      if (result.failed.length > 0) {
        parts.push(
          `Failed: ${result.failed.map((f) => `${f.displayName} — ${f.reason ?? 'unknown error'}`).join('; ')}.`,
        );
      }
      pushToast(
        parts.length === 0
          ? { level: 'info', title: 'Record All Live', message: 'No creators are live right now.' }
          : {
              level: result.failed.length > 0 ? 'error' : 'info',
              title: 'Record All Live',
              message: parts.join(' '),
            },
      );
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      pushToast({ level: 'error', title: 'Record All Live failed', message: friendlyErrorMessage(err) });
    },
  });

  const alreadyRecordingCount = rows.length - eligibleIds.length;
  const selectedCount = selectedIds.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Record All Live"
        description="The Record dialog's options, applied to every live creator at once."
      >
        <div className="space-y-4">
          {rows.length === 0 ? (
            <p className="text-sm text-foreground-muted">No creators are live right now.</p>
          ) : (
            <div>
              <p className="mb-1 flex items-baseline justify-between text-xs font-medium text-foreground-secondary">
                <span>Live right now ({eligibleIds.length})</span>
                {alreadyRecordingCount > 0 && (
                  <span className="tabular-nums text-foreground-muted">
                    {alreadyRecordingCount} already recording
                  </span>
                )}
              </p>
              <div
                className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1"
                role="group"
                aria-label="Live creators"
              >
                {rows.map((row) => {
                  const platformName =
                    plugins?.find((p) => p.id === row.creator.pluginId)?.name ?? row.creator.pluginId;
                  return (
                    <label
                      key={row.creator.id}
                      className={
                        row.recording
                          ? 'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-muted'
                          : 'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-hover'
                      }
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.creator.id)}
                        disabled={row.recording}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(row.creator.id);
                            else next.delete(row.creator.id);
                            return next;
                          });
                        }}
                        className="h-[15px] w-[15px] cursor-pointer"
                        aria-label={`Record ${row.creator.displayName}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-foreground" title={row.creator.displayName}>
                        {row.creator.displayName}
                      </span>
                      <span className="truncate text-xs text-foreground-muted">{platformName}</span>
                      {row.recording && <span className="text-xs text-foreground-muted">Recording</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {streamTypeOptions.length > 1 && (
            <Select
              label="Stream type"
              hint="Applies to the sites that support it — the others record their site default."
              value={streamType}
              onChange={setStreamType}
              options={streamTypeOptions}
            />
          )}
          <Select
            label="Quality"
            value={quality}
            onChange={setQuality}
            options={[
              { value: 'best', label: 'Best (auto)' },
              { value: '1080p', label: '1080p' },
              { value: '720p', label: '720p' },
              { value: '480p', label: '480p' },
            ]}
          />
          <Select
            label="Duration"
            hint="Total length of each recording. With a split selected, this covers all parts together."
            value={duration}
            onChange={setDuration}
            options={[
              { value: '', label: 'Until stream ends' },
              { value: '2', label: '2 minutes' },
              { value: '5', label: '5 minutes' },
              { value: '15', label: '15 minutes' },
              { value: '30', label: '30 minutes' },
              { value: '60', label: '1 hour' },
              { value: '120', label: '2 hours' },
            ]}
          />
          {/* Same convention as RecordDialog: long streams get timestamped
              parts instead of one huge file. */}
          <Select
            label="Split into parts (optional)"
            hint="Each part is saved to the Library as it finishes — recommended for long streams."
            value={segment}
            onChange={setSegment}
            options={[
              { value: '', label: 'No split (single file)' },
              { value: '5', label: 'Every 5 minutes' },
              { value: '15', label: 'Every 15 minutes' },
              { value: '30', label: 'Every 30 minutes' },
              { value: '60', label: 'Every hour' },
            ]}
          />
          <Button
            loading={startAll.isPending}
            disabled={rows.length === 0 || selectedCount === 0}
            onClick={() => startAll.mutate()}
            className="w-full"
          >
            <Radio size={14} />
            {selectedCount > 0
              ? `Record ${selectedCount} ${selectedCount === 1 ? 'creator' : 'creators'}`
              : 'Record All Live'}
          </Button>
          {startAll.isPending && progress !== null && (
            <p className="text-center text-xs tabular-nums text-foreground-muted">
              Processed {progress.done}/{progress.total} — started {progress.started}, skipped{' '}
              {progress.skipped}, failed {progress.failed}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="text-xs font-medium text-foreground-muted">{label}</dt>
      <dd className="max-w-[60%] truncate text-right tabular-nums text-foreground-secondary" title={value}>{value}</dd>
    </div>
  );
}
