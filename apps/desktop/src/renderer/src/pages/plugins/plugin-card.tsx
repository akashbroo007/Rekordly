/**
 * PluginCard — the grid alternative to PluginRow (toolbar view toggle).
 * Same information, same primary-action logic, same status grammar; the
 * card always fills its grid cell (`h-full` + mt-auto footer) so every
 * card has equal height regardless of status. Disabled cards dim with a
 * clear grey state.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCcw, Settings2, Trash2 } from 'lucide-react';
import { Button, Switch } from '@rekordly/ui';
import { KebabMenu } from '../../components/kebab-menu';
import { useToastStore } from '../../stores/toast-store';
import { PluginStatusBadge } from './plugin-status-badge';
import { PluginTile } from './plugin-tile';
import { formatRelativeAgo, useTicker } from './plugin-status';
import type { PluginStatusActionCallbacks, PluginViewModel } from './plugin-types';
import { pluginStatusTitle } from './plugin-row';
import { CapabilityExceptions, QuietActionButtons } from './plugin-pieces';

export function PluginCard({ vm, callbacks }: { vm: PluginViewModel; callbacks: PluginStatusActionCallbacks }) {
  const { plugin, status } = vm;
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const now = useTicker(30_000);

  const toggle = useMutation({
    mutationFn: () =>
      plugin.enabled ? window.desktop.plugins.disable(plugin.id) : window.desktop.plugins.enable(plugin.id),
    onSuccess: () => {
      pushToast({
        level: 'info',
        title: `${plugin.enabled ? 'Disabled' : 'Enabled'} ${plugin.name}`,
        message: plugin.enabled ? 'The plugin will not run until re-enabled.' : 'The plugin is now running.',
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

  const disabled = !plugin.enabled;

  return (
    <div
      data-status={status.attention}
      className={`group relative flex h-full flex-col gap-3 rounded-md border p-4 transition-all duration-150 focus-within:border-primary/40 ${
        disabled
          ? 'border-border bg-panel opacity-70'
          : `border-border bg-surface hover:-translate-y-0.5 hover:border-primary/40 hover:bg-elevated/50 ${
              status.attention === 'needs-setup'
                ? 'border-warning/40'
                : status.attention === 'error'
                  ? 'border-error/40'
                  : ''
            }`
      }`}
    >
      {/* Identity row: tile, name + muted version, Developer chip, one switch */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={callbacks.onOpenDetails}
          aria-label={`Details for ${plugin.name}`}
          className="shrink-0 cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
        >
          <PluginTile pluginId={plugin.id} name={plugin.name} homepage={plugin.homepage} iconUrl={plugin.iconUrl} dimmed={disabled} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground" title={plugin.name}>
              {plugin.name}
            </h3>
            {vm.isDeveloper && (
              <span className="shrink-0 rounded-sm border border-border bg-panel px-1.5 py-0.5 text-xs font-medium leading-none text-foreground-muted">
                Developer
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-none text-foreground-muted">v{plugin.version}</p>
        </div>
        <span
          className={`flex shrink-0 pt-0.5 items-center gap-1.5 text-xs leading-none ${
            plugin.enabled ? 'text-foreground-secondary' : 'text-foreground-muted'
          }`}
        >
          <Switch
            checked={plugin.enabled}
            onCheckedChange={() => toggle.mutate()}
            disabled={toggle.isPending}
            aria-label={plugin.enabled ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}
          />
          {plugin.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {/* The ONE status indicator + capability exceptions (single style) */}
      <div className="flex min-w-0 items-center gap-2">
        <PluginStatusBadge attention={status.attention} title={pluginStatusTitle(vm)} />
        <span className="min-w-0 flex-1 overflow-hidden">
          <CapabilityExceptions exceptions={vm.exceptions} />
        </span>
      </div>

      {/* Live info: N monitored · Last checked Xm ago */}
      <p className="-mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs leading-none text-foreground-secondary">
        <span>
          <span
            className={`font-medium tabular-nums ${vm.monitoredCount === 0 ? 'text-foreground-muted' : 'text-foreground'}`}
          >
            {vm.monitoredCount}
          </span>{' '}
          <span className="text-foreground-muted">monitored</span>
        </span>
        <span aria-hidden="true" className="text-foreground-disabled">
          ·
        </span>
        <span
          className="truncate"
          title={
            vm.lastCheckedAt !== null
              ? `Last check ${new Date(vm.lastCheckedAt).toLocaleString()}`
              : 'No monitoring checks yet'
          }
        >
          {vm.lastCheckedAt !== null ? `Last checked ${formatRelativeAgo(vm.lastCheckedAt, now)}` : 'No checks yet'}
        </span>
      </p>

      {/* Footer: context primary + "Up to date" hint + quiet buttons + "…" */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex min-w-0 items-center gap-2">
          {status.primaryAction === 'finish-setup' ? (
            <Button size="sm" onClick={callbacks.onFinishSetup}>
              Finish setup
            </Button>
          ) : status.primaryAction === 'update' && status.latestVersion !== undefined ? (
            <Button size="sm" loading={update.isPending} onClick={() => update.mutate()}>
              <RefreshCcw size={12} /> Update to v{status.latestVersion}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={callbacks.onOpenSettings}>
              <Settings2 size={13} /> Settings
            </Button>
          )}
          {status.primaryAction !== 'update' && !disabled && (
            <span
              className="hidden truncate text-xs leading-none text-foreground-muted xl:inline"
              title="No update is known for this plugin"
            >
              Up to date
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <QuietActionButtons onDetails={callbacks.onOpenDetails} onDiagnostics={callbacks.onOpenDiagnostics} />
          <KebabMenu
            label={`${plugin.name} plugin actions`}
            items={[
              { key: 'update', label: 'Update', icon: <RefreshCcw size={13} />, onSelect: () => update.mutate() },
              { key: 'remove', label: 'Remove', icon: <Trash2 size={13} />, dangerous: true, onSelect: callbacks.onRemove },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
