import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  FolderInput,
  HeartPulse,
  Info,
  Puzzle,
  RefreshCcw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogTrigger,
  EmptyState,
  Input,
  PageContainer,
  SectionHeader,
  Skeleton,
  Switch,
  type BadgeVariant,
} from '@rekordly/ui';
import type { PluginInfoDto, PluginStateDto, SettingDefDto } from '@rekordly/shared/contracts';
import { logger } from '../lib/logger';
import { useToastStore } from '../stores/toast-store';

const CAPABILITY_LABELS: Record<string, string> = {
  auth: 'Auth',
  'creator-search': 'Creator Search',
  'live-detection': 'Live Detection',
  'stream-extraction': 'Stream Extraction',
  settings: 'Settings',
  'health-check': 'Health Check',
  metadata: 'Metadata',
};

const PERMISSION_LABELS: Record<string, string> = {
  network: 'Network',
  storage: 'Storage',
  cookies: 'Cookies',
  notifications: 'Notifications',
  recording: 'Recording',
};

const STATE_VARIANTS: Record<PluginStateDto, BadgeVariant> = {
  ready: 'success',
  disabled: 'muted',
  error: 'error',
  loading: 'info',
  loaded: 'info',
  initializing: 'info',
  installed: 'default',
  uninstalled: 'muted',
};

/** Plugins page filter: matches name, id, author, description and capabilities. */
function matchesFilter(plugin: PluginInfoDto, query: string): boolean {
  const haystack = [
    plugin.name,
    plugin.id,
    plugin.author,
    plugin.description ?? '',
    ...plugin.capabilities,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function PluginsPage() {
  const queryClient = useQueryClient();
  const {
    data: plugins,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
  });

  useEffect(() => {
    return window.desktop.plugins.onEvent((event) => {
      logger.debug('plugin event', { type: event.type, pluginId: event.pluginId });
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    });
  }, [queryClient]);

  const install = useMutation({
    mutationFn: () => window.desktop.plugins.installFromDirectory(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['plugins'] }),
  });

  const loading = isLoading || plugins === undefined;

  const [filter, setFilter] = useState('');
  const normalizedFilter = filter.trim().toLowerCase();
  const visiblePlugins = (plugins ?? []).filter(
    (plugin) => normalizedFilter === '' || matchesFilter(plugin, normalizedFilter),
  );

  return (
    <PageContainer>
      <SectionHeader
        title="Plugins"
        description="Install and manage platform support plugins."
        actions={
          <Button loading={install.isPending} onClick={() => install.mutate()}>
            <FolderInput size={14} />
            Install from folder
          </Button>
        }
      />

      {isError && (
        <p className="text-sm text-error">Failed to load plugins. Check the logs for details.</p>
      )}

      {!isError && loading && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      )}

      {!isError && !loading && (plugins?.length ?? 0) === 0 && (
        <EmptyState
          icon={Puzzle}
          title="No plugins installed"
          description="Plugins power platform support. Install one to start monitoring creators."
          action={
            <Button loading={install.isPending} onClick={() => install.mutate()}>
              <FolderInput size={14} />
              Install from folder
            </Button>
          }
        />
      )}

      {!isError && !loading && (plugins?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-4">
          {/* Filter row: local search across name/id/author/description/capabilities */}
          <div className="flex items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
              />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter plugins..."
                aria-label="Filter plugins"
                className="pl-8"
              />
            </div>
            {filter.trim() !== '' && (
              <span className="text-xs text-foreground-muted">
                <span className="font-semibold tabular-nums text-foreground">
                  {visiblePlugins.length}
                </span>
                {visiblePlugins.length !== (plugins?.length ?? 0) && (
                  <span>
                    {' '}
                    of <span className="tabular-nums">{plugins?.length ?? 0}</span>
                  </span>
                )}{' '}
                plugins
              </span>
            )}
            {filter !== '' && (
              <Button variant="ghost" size="sm" onClick={() => setFilter('')}>
                <X size={12} />
                Clear
              </Button>
            )}
          </div>

          {visiblePlugins.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No plugins match"
              description={`No plugin matches "${filter.trim()}". Try a name, author or capability.`}
              action={
                <Button variant="ghost" onClick={() => setFilter('')}>
                  <X size={14} />
                  Clear filter
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {visiblePlugins.map((plugin) => (
                <PluginCard key={plugin.id} plugin={plugin} />
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}

function PluginCard({ plugin }: { plugin: PluginInfoDto }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggle = useMutation({
    mutationFn: () =>
      plugin.enabled
        ? window.desktop.plugins.disable(plugin.id)
        : window.desktop.plugins.enable(plugin.id),
    onSuccess: () => {
      pushToast({
        level: 'info',
        title: `${plugin.enabled ? 'Disabled' : 'Enabled'} ${plugin.name}`,
        message: plugin.enabled
          ? 'The plugin will not run until re-enabled.'
          : 'The plugin is now running.',
      });
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
    onError: (error: unknown) => {
      pushToast({
        level: 'error',
        title: `Failed to ${plugin.enabled ? 'disable' : 'enable'} ${plugin.name}`,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const remove = useMutation({
    mutationFn: () => window.desktop.plugins.remove(plugin.id),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Plugin removed', message: `${plugin.name} was removed.` });
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  const update = useMutation({
    mutationFn: () => window.desktop.plugins.update(plugin.id),
    onSuccess: () => {
      pushToast({
        level: 'info',
        title: 'Plugin updated',
        message: `${plugin.name} was reloaded.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  return (
    <Card className="group flex flex-col gap-4 transition-all duration-150 hover:border-primary/25 hover:bg-elevated/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-border bg-elevated text-foreground-muted transition-colors group-hover:border-primary/40">
            <Puzzle size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                {plugin.name}
              </h3>
              <Badge variant="default">v{plugin.version}</Badge>
            </div>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-foreground-muted">
              by {plugin.author}
              {plugin.license !== undefined ? ` · ${plugin.license}` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={STATE_VARIANTS[plugin.state] ?? 'default'}>{plugin.state}</Badge>
          <Switch
            checked={plugin.enabled}
            onCheckedChange={() => toggle.mutate()}
            disabled={toggle.isPending}
            aria-label={`Toggle ${plugin.name}`}
          />
        </div>
      </div>

      {plugin.description !== undefined && (
        <p className="text-sm text-foreground-secondary">{plugin.description}</p>
      )}

      {plugin.setupHint !== undefined && (
        <div className="flex items-start justify-between gap-3 rounded-sm border-l-2 border-info/60 bg-elevated px-2.5 py-2">
          <p className="flex items-start gap-1.5 text-xs text-foreground-secondary">
            <Info size={12} className="mt-0.5 shrink-0 text-info" />
            {plugin.setupHint}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto shrink-0 px-1.5 py-0.5"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={12} />
            Setup
          </Button>
        </div>
      )}

      {plugin.lastError !== undefined && (
        <p className="flex items-center gap-1.5 rounded-sm border-l-2 border-error/60 bg-elevated px-2 py-1.5 text-xs text-error">
          <AlertCircle size={12} className="shrink-0" />
          {plugin.lastError.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {plugin.capabilities.map((capability) => (
          <Badge key={capability} variant="info">
            {CAPABILITY_LABELS[capability] ?? capability}
          </Badge>
        ))}
        {plugin.permissionsGranted.map((permission) => (
          <Badge key={permission} variant="muted">
            {PERMISSION_LABELS[permission] ?? permission}
          </Badge>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Info size={14} />
              Details
            </Button>
          </DialogTrigger>
          <PluginDetails plugin={plugin} />
        </Dialog>
        <PluginSettingsDialog plugin={plugin} open={settingsOpen} onOpenChange={setSettingsOpen} />
        <Button
          variant="ghost"
          size="sm"
          loading={update.isPending}
          onClick={() => update.mutate()}
        >
          <RefreshCcw size={14} />
          Update
        </Button>
        <PluginDiagnosticsDialog plugin={plugin} />
        <Button
          variant="ghost"
          size="sm"
          loading={remove.isPending}
          onClick={() => remove.mutate()}
          className="ml-auto text-error hover:bg-error/10 hover:text-error"
        >
          <Trash2 size={14} />
          Remove
        </Button>
      </div>
    </Card>
  );
}

function PluginDetails({ plugin }: { plugin: PluginInfoDto }) {
  const { data: diagnostics } = useQuery({
    queryKey: ['plugin-diagnostics', plugin.id],
    queryFn: () => window.desktop.plugins.getDiagnostics(plugin.id),
  });

  return (
    <DialogContent title={plugin.name} description={`v${plugin.version} by ${plugin.author}`}>
      <dl className="divide-y divide-border text-sm">
        <DetailRow label="Status" value={plugin.state} />
        <DetailRow label="App compatibility" value={`requires ${plugin.minAppVersion}`} />
        <DetailRow label="Entry" value={diagnostics?.entry ?? plugin.id} />
        <DetailRow label="Install path" value={diagnostics?.installPath ?? '\u2014'} />
        <DetailRow label="Data directory" value={diagnostics?.dataDir ?? '\u2014'} />
        {plugin.health !== undefined && (
          <DetailRow
            label="Health"
            value={`${plugin.health.healthy ? 'Healthy' : 'Unhealthy'}${plugin.health.latencyMs !== undefined ? ` (${plugin.health.latencyMs}ms)` : ''}`}
          />
        )}
        {plugin.homepage !== undefined && <DetailRow label="Homepage" value={plugin.homepage} />}
      </dl>
      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          Permissions
        </h4>
        <p className="mt-1 text-sm text-foreground-secondary">
          {plugin.permissionsRequested
            .map((permission) => PERMISSION_LABELS[permission] ?? permission)
            .join(', ') || 'None requested'}
        </p>
      </div>
    </DialogContent>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
        {label}
      </dt>
      <dd
        className="max-w-[60%] truncate text-right tabular-nums text-foreground-secondary"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function PluginDiagnosticsDialog({ plugin }: { plugin: PluginInfoDto }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [open, setOpen] = useState(false);

  const health = useMutation({
    mutationFn: () => window.desktop.plugins.getHealth(plugin.id),
    onSuccess: (result) => {
      pushToast({
        level: result.healthy ? 'info' : 'warn',
        title: `${plugin.name} health: ${result.healthy ? 'healthy' : 'unhealthy'}`,
        message:
          result.message ?? (result.healthy ? 'All systems nominal.' : 'Health check failed.'),
      });
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <HeartPulse size={14} />
          Diagnostics
        </Button>
      </DialogTrigger>
      <DialogContent title={`Diagnostics · ${plugin.name}`} description={`v${plugin.version}`}>
        <div className="divide-y divide-border text-sm">
          <DetailRow label="State" value={plugin.state} />
          <DetailRow label="Last health check" value={plugin.health?.checkedAt ?? '\u2014'} />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" loading={health.isPending} onClick={() => health.mutate()}>
            <Activity size={14} />
            Run health check
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PluginSettingsDialog({
  plugin,
  open,
  onOpenChange,
}: {
  plugin: PluginInfoDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();

  const { data: schema } = useQuery({
    queryKey: ['plugin-settings-schema', plugin.id],
    queryFn: () => window.desktop.plugins.getSettingsSchema(plugin.id),
    enabled: open,
  });

  const { data: values } = useQuery({
    queryKey: ['plugin-settings', plugin.id],
    queryFn: () => window.desktop.plugins.getSettings(plugin.id),
    enabled: open,
  });

  const [draft, setDraft] = useState<Record<string, string | number | boolean>>({});

  useEffect(() => {
    if (values !== undefined) {
      // ponytail: values are validated primitives; direct cast is fine here
      setDraft(values as Record<string, string | number | boolean>);
    }
  }, [values]);

  const save = useMutation({
    mutationFn: (next: Record<string, unknown>) =>
      window.desktop.plugins.setSettings(plugin.id, next),
    onSuccess: () => {
      pushToast({
        level: 'info',
        title: 'Settings saved',
        message: `${plugin.name} settings updated.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      pushToast({
        level: 'error',
        title: 'Failed to save settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const hasSettings = (schema?.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Settings2 size={14} />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`${plugin.name} settings`}
        description="Platform-specific configuration."
      >
        {!hasSettings ? (
          <p className="text-sm text-foreground-muted">This plugin does not expose settings.</p>
        ) : (
          <div className="space-y-4">
            {(schema ?? []).map((def) => (
              <SettingField
                key={def.key}
                def={def}
                value={draft[def.key]}
                onChange={(value) => setDraft((prev) => ({ ...prev, [def.key]: value }))}
              />
            ))}
            <Button loading={save.isPending} onClick={() => save.mutate(draft)} className="w-full">
              Save settings
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettingField({
  def,
  value,
  onChange,
}: {
  def: SettingDefDto;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  if (def.type === 'guide') {
    return (
      <div className="rounded-sm border border-border bg-elevated px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          <Info size={12} className="text-info" />
          {def.label}
        </p>
        {def.description !== undefined && (
          <p className="mt-1 text-xs text-foreground-secondary">{def.description}</p>
        )}
        {(def.steps?.length ?? 0) > 0 && (
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-foreground-secondary">
            {def.steps?.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  if (def.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">{def.label}</p>
          {def.description !== undefined && (
            <p className="text-xs text-foreground-muted">{def.description}</p>
          )}
        </div>
        <Switch checked={value === true} onCheckedChange={onChange} aria-label={def.label} />
      </div>
    );
  }

  if (def.type === 'select' && def.options !== undefined) {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">{def.label}</span>
        <select
          value={String(value ?? def.defaultValue ?? '')}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 rounded-sm border border-border bg-elevated px-3 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          {def.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <Input
      label={def.label}
      hint={def.description}
      type={def.type === 'number' ? 'number' : def.type === 'password' ? 'password' : 'text'}
      value={
        value === undefined
          ? ((def.defaultValue as string | number | undefined) ?? '')
          : String(value)
      }
      onChange={(event) => {
        const raw = event.target.value;
        onChange(def.type === 'number' ? Number(raw) : raw);
      }}
    />
  );
}
