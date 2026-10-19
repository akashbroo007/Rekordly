/**
 * PluginRow — the compact ~64px list row (default view):
 *   tile · name+version (+Developer chip, capability exceptions) · status ·
 *   monitored · last checked · labeled switch · actions
 *
 * Every row is exactly the same height regardless of status. The primary
 * action depends on the derived state: "Finish setup" (needs setup),
 * "Update to vX.Y" (update available), otherwise "Settings". Remove moved
 * into the "…" overflow menu and always routes through the page's
 * red confirm dialog. Toggle/Update mutations are identical to the old
 * card — the same IPC calls, toasts and cache invalidation.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { RefreshCcw, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@rekordly/ui';
import { KebabMenu } from '../../components/kebab-menu';
import { useToastStore } from '../../stores/toast-store';
import { PluginStatusBadge } from './plugin-status-badge';
import { PluginTile } from './plugin-tile';
import { useTicker } from './plugin-status';
import type { PluginStatusActionCallbacks, PluginViewModel } from './plugin-types';
import { CapabilityExceptions, EnabledSwitch, QuietActionButtons } from './plugin-pieces';

/** Tooltip for the status badge (setup hint / last error / update target). */
export function pluginStatusTitle(vm: PluginViewModel): string | undefined {
  if (vm.status.attention === 'needs-setup') {
    if (vm.plugin.setupHint !== undefined && vm.plugin.setupHint !== '') return vm.plugin.setupHint;
    if (vm.status.missingRequired.length > 0) {
      return `Missing required settings: ${vm.status.missingRequired.join(', ')}`;
    }
  }
  if (vm.status.attention === 'error' && vm.plugin.lastError !== undefined) {
    return vm.plugin.lastError.message;
  }
  if (vm.status.attention === 'update-available' && vm.status.latestVersion !== undefined) {
    return `Update to v${vm.status.latestVersion} is available`;
  }
  return undefined;
}

export function PluginRow({ vm, callbacks }: { vm: PluginViewModel; callbacks: PluginStatusActionCallbacks }) {
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
      role="listitem"
      data-status={status.attention}
      className={`group relative flex h-16 items-center gap-3 rounded-md border border-border px-3 transition-all duration-150 focus-within:border-primary/40 ${
        disabled ? 'bg-panel opacity-70' : 'bg-surface hover:-translate-y-px hover:border-primary/40 hover:bg-elevated/40'
      }`}
    >
      <button
        type="button"
        onClick={callbacks.onOpenDetails}
        aria-label={`Details for ${plugin.name}`}
        className="shrink-0 cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
      >
        <PluginTile pluginId={plugin.id} name={plugin.name} homepage={plugin.homepage} iconUrl={plugin.iconUrl} dimmed={disabled} />
      </button>

      {/* Name + version + Developer chip + capability exceptions (one style) */}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3
            className="min-w-0 shrink truncate text-sm font-semibold tracking-tight text-foreground"
            title={plugin.name}
          >
            {plugin.name}
          </h3>
          {vm.isDeveloper && (
            <span className="shrink-0 rounded-sm border border-border bg-panel px-1.5 py-0.5 text-xs font-medium leading-none text-foreground-muted">
              Developer
            </span>
          )}
          <span className="shrink-0 text-xs leading-none text-foreground-muted" title={`Version ${plugin.version}`}>
            v{plugin.version}
          </span>
          <span className="min-w-0 overflow-hidden">
            <CapabilityExceptions exceptions={vm.exceptions} />
          </span>
        </div>
      </div>

      {/* Status — the ONE indicator: attention badge or green dot only */}
      <div className="hidden w-32 shrink-0 md:flex">
        <PluginStatusBadge attention={status.attention} title={pluginStatusTitle(vm)} />
      </div>

      {/* Live info: creators monitored · last check */}
      <div className="hidden w-20 shrink-0 flex-col items-start lg:flex">
        <span
          className={`text-xs font-semibold leading-none tabular-nums ${
            vm.monitoredCount === 0 ? 'text-foreground-muted' : 'text-foreground'
          }`}
        >
          {vm.monitoredCount}
        </span>
        <span className="mt-0.5 text-xs leading-none text-foreground-muted">monitored</span>
      </div>
      <div className="hidden w-28 shrink-0 flex-col items-start lg:flex">
        <span
          className="truncate text-xs font-medium leading-none text-foreground-secondary"
          title={
            vm.lastCheckedAt !== null
              ? `Last check ${new Date(vm.lastCheckedAt).toLocaleString()}`
              : 'No monitoring checks yet'
          }
        >
          {formatRowLastChecked(vm.lastCheckedAt, now)}
        </span>
        <span className="mt-0.5 text-xs leading-none text-foreground-muted">last checked</span>
      </div>

      {/* One labeled enable/disable switch */}
      <div className="shrink-0 px-1">
        <EnabledSwitch plugin={plugin} pending={toggle.isPending} onToggle={() => toggle.mutate()} />
      </div>

      {/* Context primary + quiet Details/Diagnostics + "…" overflow */}
      <div className="flex shrink-0 items-center gap-0.5">
        {primaryButton(status.primaryAction, status.latestVersion, update.isPending, {
          onPrimary: callbacks.onOpenSettings,
          onUpdate: () => update.mutate(),
        })}
        <QuietActionButtons onDetails={callbacks.onOpenDetails} onDiagnostics={callbacks.onOpenDiagnostics} />
        <KebabMenu
          label={`${plugin.name} plugin actions`}
          items={[
            { key: 'update', label: 'Update', icon: <RefreshCcw size={13} />, onSelect: () => update.mutate() },
            {
              key: 'remove',
              label: 'Remove',
              icon: <Trash2 size={13} />,
              dangerous: true,
              onSelect: callbacks.onRemove,
            },
          ]}
        />
      </div>
    </div>
  );
}

/** Primary action depends on the derived state (never a bare "Update"). */
function primaryButton(
  action: PluginViewModel['status']['primaryAction'],
  latestVersion: string | undefined,
  updating: boolean,
  callbacks: { onPrimary: () => void; onUpdate: () => void },
): ReactNode {
  if (action === 'finish-setup') {
    return (
      <Button size="sm" onClick={callbacks.onPrimary}>
        Finish setup
      </Button>
    );
  }
  if (action === 'update' && latestVersion !== undefined) {
    return (
      <Button size="sm" loading={updating} onClick={callbacks.onUpdate}>
        <RefreshCcw size={12} /> Update to v{latestVersion}
      </Button>
    );
  }
  return (
    <Button variant="secondary" size="sm" onClick={callbacks.onPrimary}>
      <Settings2 size={13} /> Settings
    </Button>
  );
}

/** "2m ago" / "3h ago" / "No checks yet" for the row's last-checked column. */
function formatRowLastChecked(lastCheckedAt: number | null, now: number): string {
  if (lastCheckedAt === null) return 'No checks yet';
  const seconds = Math.max(0, Math.floor((now - lastCheckedAt) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
