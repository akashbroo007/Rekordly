/**
 * PluginDetailsDrawer — Details surface (NOT a dialog, NOT a page): a
 * right-side sliding drawer that keeps the list visible. Holds everything
 * taken off the card face: original description, author/license (normal
 * case, minimum 12px), the FULL capability checklist grouped by purpose
 * with a tooltip per item, permissions, live usage numbers and technical
 * facts via the existing diagnostics query.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { PluginInfoDto } from '@rekordly/shared/contracts';
import { Tooltip } from '@rekordly/ui';
import { PlatformBadge } from '../../components/badges';
import { PluginStatusBadge } from './plugin-status-badge';
import { PluginTile } from './plugin-tile';
import {
  CAPABILITY_INFO,
  PERMISSION_INFO,
  capabilityDescription,
  capabilityLabel,
  formatRelativeAgo,
  permissionLabel,
  useTicker,
} from './plugin-status';
import { pluginStatusTitle } from './plugin-row';
import type { PluginViewModel } from './plugin-types';

export function PluginDetailsDrawer({
  vm,
  open,
  onClose,
  onOpenSettings,
}: {
  vm: PluginViewModel | null;
  open: boolean;
  onClose: () => void;
  /** Needs-setup shortcut inside the drawer. */
  onOpenSettings?: (plugin: PluginInfoDto) => void;
}) {
  // ponytail: the page keeps a single drawer mount; `open` gates rendering.
  const payload = vm;
  if (!open || payload === null) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`${payload.plugin.name} details`}>
      <DrawerBackdrop onClose={onClose} />
      <motion.aside
        initial={{ opacity: 0, x: 56 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-[94vw] flex-col border-l border-border bg-surface shadow-dialog"
      >
        <DrawerHeader
          vm={payload}
          onClose={onClose}
          onOpenSettings={onOpenSettings === undefined ? undefined : () => onOpenSettings(payload.plugin)}
        />
        <DrawerBody vm={payload} />
      </motion.aside>
    </div>
  );
}

function DrawerBackdrop({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />;
}

function DrawerHeader({
  vm,
  onClose,
  onOpenSettings,
}: {
  vm: PluginViewModel;
  onClose: () => void;
  onOpenSettings?: () => void;
}) {
  const { plugin } = vm;
  return (
    <header className="flex items-start gap-3 border-b border-border px-4 py-4">
      <PluginTile
        pluginId={plugin.id}
        name={plugin.name}
        homepage={plugin.homepage}
        iconUrl={plugin.iconUrl}
        size={48}
        dimmed={!plugin.enabled}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 truncate text-base font-semibold tracking-tight text-foreground" title={plugin.name}>
            {plugin.name}
          </h2>
          <PluginStatusBadge attention={vm.status.attention} title={pluginStatusTitle(vm)} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-none text-foreground-secondary">
          <span>
            v{plugin.version} · {plugin.author}
            {plugin.license !== undefined ? ` · ${plugin.license}` : ''}
          </span>
          <PlatformBadge pluginId={plugin.id} platformName={plugin.name} className="ml-auto" />
        </p>
        {vm.isDeveloper && (
          <span className="mt-1.5 inline-flex rounded-sm border border-border bg-panel px-1.5 py-0.5 text-xs font-medium leading-none text-foreground-muted">
            Developer plugin
          </span>
        )}
        {onOpenSettings !== undefined && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="mt-2 block cursor-pointer text-xs font-medium leading-none text-primary transition-colors hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-primary"
          >
            {vm.status.primaryAction === 'finish-setup' ? 'Finish setup →' : 'Open settings →'}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className="shrink-0 rounded-sm p-1 text-foreground-muted transition-colors hover:bg-hover hover:text-foreground"
      >
        <X size={16} />
      </button>
    </header>
  );
}

function DrawerBody({ vm }: { vm: PluginViewModel }) {
  const { plugin } = vm;
  const now = useTicker(30_000);

  // Existing read: keeps the same diagnostics query key/contract as before.
  const { data: diagnostics } = useQuery({
    queryKey: ['plugin-diagnostics', plugin.id],
    queryFn: () => window.desktop.plugins.getDiagnostics(plugin.id),
  });

  const monitoredCount = vm.monitoredCount;

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
      {/* Status / attention message (folded former inline banners) */}
      {vm.status.attention === 'needs-setup' && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5">
          <p className="text-xs font-semibold leading-relaxed text-warning">Needs setup</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-secondary">
            {plugin.setupHint ??
              (vm.status.missingRequired.length > 0
                ? `Required settings are not configured yet: ${vm.status.missingRequired.join(', ')}.`
                : 'This plugin requires credentials before it can monitor creators.')}
          </p>
        </div>
      )}
      {vm.status.attention === 'error' && plugin.lastError !== undefined && (
        <div className="rounded-md border border-error/40 bg-error/10 px-3 py-2.5">
          <p className="text-xs font-semibold leading-relaxed text-error">Error</p>
          <p className="mt-1 break-words text-xs leading-relaxed text-foreground-secondary">
            {plugin.lastError.message}
          </p>
        </div>
      )}

      {/* Author / license — shown ONLY here, normal case (never all-caps). */}
      <section className="space-y-1.5">
        <p className="text-xs leading-relaxed text-foreground-secondary">
          <span className="text-foreground-muted">By </span>
          {plugin.author}
          {plugin.license !== undefined && (
            <>
              <span className="text-foreground-muted"> · </span>
              {plugin.license}
            </>
          )}
        </p>
        {plugin.description !== undefined && (
          <p className="text-xs leading-relaxed text-foreground-secondary">{plugin.description}</p>
        )}
        {plugin.homepage !== undefined && (
          <p className="truncate text-xs text-foreground-secondary">
            <span className="text-foreground-muted">Homepage: </span>
            {plugin.homepage}
          </p>
        )}
      </section>

      {/* Live usage */}
      <section className="grid grid-cols-2 gap-2">
        <StatTile label="Creators monitored" value={`${monitoredCount}`} />
        <StatTile
          label="Last checked"
          value={vm.lastCheckedAt === null ? 'No checks yet' : formatRelativeAgo(vm.lastCheckedAt, now)}
          title={vm.lastCheckedAt !== null ? new Date(vm.lastCheckedAt).toLocaleString() : undefined}
        />
        {plugin.health !== undefined && (
          <StatTile
            label="Health"
            value={`${plugin.health.healthy ? 'Healthy' : 'Unhealthy'}${
              plugin.health.latencyMs !== undefined ? ` · ${plugin.health.latencyMs}ms` : ''
            }`}
            title={plugin.health.message}
          />
        )}
      </section>

      {/* Full capability checklist — grouped, tooltip per item */}
      <CapabilityChecklist plugin={plugin} />

      {/* Permissions — requested vs granted */}
      <section>
        <h3 className="text-xs font-semibold tracking-tight text-foreground">Permissions</h3>
        <ul className="mt-2 space-y-1.5">
          {PERMISSION_INFO.map(({ permission }) => {
            const requested = plugin.permissionsRequested.includes(permission);
            const granted = plugin.permissionsGranted.includes(permission);
            if (!requested) return null;
            return (
              <li key={permission} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${granted ? 'bg-success' : 'bg-warning'}`}
                />
                <span className="text-xs leading-none text-foreground-secondary">{permissionLabel(permission)}</span>
                <span className="text-xs leading-none text-foreground-muted">
                  {granted ? 'granted' : 'not granted'}
                </span>
              </li>
            );
          })}
          {plugin.permissionsRequested.length === 0 && (
            <li className="text-xs leading-none text-foreground-muted">None requested</li>
          )}
        </ul>
      </section>

      {/* Technical facts — diagnostics read-only, same data as before */}
      <section>
        <h3 className="text-xs font-semibold tracking-tight text-foreground">Technical</h3>
        <dl className="mt-2 space-y-2">
          <DetailRow label="App compatibility" value={`Requires app v${plugin.minAppVersion} or newer`} />
          {diagnostics !== undefined && (
            <>
              <DetailRow label="Entry" value={diagnostics.entry} mono />
              <DetailRow label="Install path" value={diagnostics.installPath} breakAll />
              <DetailRow label="Data directory" value={diagnostics.dataDir} breakAll />
            </>
          )}
          {diagnostics?.lastError !== undefined && (
            <DetailRow label="Last error" value={`${diagnostics.lastError.code}: ${diagnostics.lastError.message}`} />
          )}
          <DetailRow label="Installed" value={new Date(plugin.installedAt).toLocaleString()} />
          <DetailRow label="Updated" value={new Date(plugin.updatedAt).toLocaleString()} />
        </dl>
      </section>
    </div>
  );
}

function StatTile({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-elevated px-2.5 py-2">
      <p className="truncate text-xs leading-none text-foreground-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold leading-none tabular-nums text-foreground" title={title}>
        {value}
      </p>
    </div>
  );
}

function DetailRow({ label, value, breakAll, mono }: { label: string; value: string; breakAll?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-xs text-foreground-muted">{label}</dt>
      <dd
        className={`text-right text-xs text-foreground-secondary ${breakAll === true ? 'break-all' : 'min-w-0 truncate'} ${
          mono === true ? 'font-mono' : ''
        } tabular-nums`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

/** Grouped checklist with a per-item tooltip (shared Tooltip component). */
function CapabilityChecklist({ plugin }: { plugin: PluginInfoDto }) {
  const groups: { title: string; items: typeof CAPABILITY_INFO[number]['capability'][] }[] = [
    { title: 'Access', items: ['auth'] },
    { title: 'Discovery', items: ['creator-search', 'metadata'] },
    { title: 'Recording', items: ['live-detection', 'stream-extraction'] },
    { title: 'Platform integration', items: ['settings', 'health-check'] },
  ];
  const known = new Set(CAPABILITY_INFO.map((info) => info.capability));
  const extra = plugin.capabilities.filter((capability) => !known.has(capability));

  return (
    <section>
      <h3 className="text-xs font-semibold tracking-tight text-foreground">Capabilities</h3>
      <div className="mt-2 space-y-3">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="text-xs leading-none text-foreground-muted">{group.title}</p>
            <ul className="mt-1.5 space-y-1">
              {group.items.map((capability) => {
                const provided = plugin.capabilities.includes(capability);
                return (
                  <li key={capability}>
                    <Tooltip
                      content={
                        capabilityDescription(capability) + (provided ? '' : ' — not provided by this plugin.')
                      }
                    >
                      <span
                        className={`inline-flex cursor-default items-center gap-1.5 text-xs leading-none ${
                          provided ? 'text-foreground-secondary' : 'text-foreground-disabled'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${provided ? 'bg-success' : 'bg-border'}`}
                        />
                        {capabilityLabel(capability)}
                        {!provided && <span className="text-foreground-disabled">— not provided</span>}
                      </span>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {extra.length > 0 && (
          <div>
            <p className="text-xs leading-none text-foreground-muted">Other</p>
            <ul className="mt-1.5 space-y-1">
              {extra.map((capability) => (
                <li key={capability} className="text-xs leading-none text-foreground-secondary">
                  {capability}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
