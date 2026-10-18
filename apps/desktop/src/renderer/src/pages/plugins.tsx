/**
 * PluginsPage — redesigned plugins surface:
 *   • PluginsSummaryStrip ("N enabled · N need setup · N updates available ·
 *     N errors") — every count is a clickable page filter
 *   • PluginsToolbar (search · All/Enabled/Disabled/Needs setup/
 *     Updates chips · sort · list⇄card toggle · Show developer plugins)
 *   • compact 64px list rows by default (PluginRow) with the card-grid
 *     alternative (PluginCard); equal heights via the shared view model
 *   • Details as a right-side drawer (PluginDetailsDrawer) holding the
 *     author/license, description and the full grouped capability checklist
 *   • one derived status per plugin (plugin-status.ts): Active / Needs
 *     setup / Disabled / Error / Update available — Needs setup replaces
 *     the old inline "setupHint" banners and the green "ready" pill for
 *     plugins with unconfigured required credentials
 *   • primary action depends on state (Finish setup / Update to vX.Y /
 *     Settings); Remove lives in the "…" menu behind a red confirm dialog
 *     naming the plugin and how many creators use it
 *
 * Data/behavior contract unchanged: same ['plugins'] query + event
 * listener, the same enable/disable/update/install/remove/diagnostics IPC
 * mutations, toasts and settings dialogs — plus read-only ['creators'] and
 * ['monitoring-jobs'] cache reuse for "creators monitored"/"Last checked".
 * No plugin, monitoring or settings logic changed; no models changed.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderInput, Puzzle, RefreshCcw, Search } from 'lucide-react';
import { Button, EmptyState, PageContainer, SectionHeader, Skeleton } from '@rekordly/ui';
import type { PluginInfoDto } from '@rekordly/shared/contracts';
import { logger } from '../lib/logger';
import { useToastStore } from '../stores/toast-store';
import { PluginRow } from './plugins/plugin-row';
import { PluginCard } from './plugins/plugin-card';
import { PluginDetailsDrawer } from './plugins/plugin-details-drawer';
import {
  PluginDiagnosticsDialog,
  PluginRemoveDialog,
  PluginSettingsDialog,
} from './plugins/plugin-dialogs';
import { PluginsSummaryStrip, type PluginsSummaryCounts } from './plugins/plugins-summary';
import {
  PluginsToolbar,
  type PluginsFilterTab,
  type PluginsSort,
  type PluginsToolbarState,
} from './plugins/plugins-toolbar';
import {
  attentionRank,
  buildPluginViewModel,
  setupCheckKey,
  type PluginSetupCheck,
  type PluginViewModel,
} from './plugins/plugin-status';

const DEFAULT_TOOLBAR: PluginsToolbarState = {
  search: '',
  tab: 'all',
  sort: 'status', // attention needs to the top (Errors → Needs setup → Updates)
  view: 'list',
  showDeveloper: false,
};

/** Plugins page filter — kept byte-identical from the previous page. */
function matchesFilter(plugin: PluginInfoDto, query: string): boolean {
  const haystack = [plugin.name, plugin.id, plugin.author, plugin.description ?? '', ...plugin.capabilities]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function PluginsPage() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

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

  // Read-only cache reuse (same keys other pages consume):
  const { data: creators } = useQuery({ queryKey: ['creators'], queryFn: () => window.desktop.creators.list() });
  const { data: monitorJobs } = useQuery({
    queryKey: ['monitoring-jobs'],
    queryFn: () => window.desktop.monitoring.getJobs(),
    refetchInterval: 15_000,
  });

  const install = useMutation({
    mutationFn: () => window.desktop.plugins.installFromDirectory(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['plugins'] }),
  });

  const loading = isLoading || plugins === undefined;
  const pluginList = useMemo(() => plugins ?? [], [plugins]);

  // --- derived "Needs setup" state: required settings still unconfigured ----
  // ponytail: single read-only aggregate over the existing per-plugin IPC
  // (settings schema + stored values). Plugins that are disabled or already
  // erroring are skipped — their status doesn't depend on setup.
  const [setupByPlugin, setSetupByPlugin] = useState<Record<string, PluginSetupCheck>>({});
  const idsKey = useMemo(() => setupCheckKey(pluginList), [pluginList]);
  useEffect(() => {
    if (loading || pluginList.length === 0) return;
    let cancelled = false;
    void (async () => {
      const relevant = pluginList.filter(
        (plugin) => plugin.enabled && plugin.state !== 'error' && plugin.lastError === undefined,
      );
      const entries = await Promise.all(
        relevant.map(async (plugin): Promise<[string, PluginSetupCheck]> => {
          try {
            const [schema, values] = await Promise.all([
              window.desktop.plugins.getSettingsSchema(plugin.id).catch(() => []),
              window.desktop.plugins.getSettings(plugin.id).catch(() => ({})),
            ]);
            const missing = (schema as { key: string; required?: boolean; type?: string }[])
              .filter(
                (def) =>
                  def.required === true &&
                  !hasSettingValue((values as Record<string, unknown>)[def.key]),
              )
              .map((def) => prettySettingKey(def.key));
            return [plugin.id, { missing } satisfies PluginSetupCheck];
          } catch (error) {
            // ponytail: a broken schema fetch must never break the page.
            logger.debug('plugin setup probe failed', { pluginId: plugin.id, error });
            return [plugin.id, { missing: [] } satisfies PluginSetupCheck] as [string, PluginSetupCheck];
          }
        }),
      );
      if (!cancelled) setSetupByPlugin(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, pluginList, idsKey]);

  // --- per-plugin view models (THE single status derivation path) ------------
  const viewModels = useMemo<PluginViewModel[]>(() => {
    const monitoredByPlugin = new Map<string, number>();
    for (const creator of creators ?? []) {
      monitoredByPlugin.set(creator.pluginId, (monitoredByPlugin.get(creator.pluginId) ?? 0) + 1);
    }
    const lastCheckedByPlugin = new Map<string, number | null>();
    for (const job of monitorJobs ?? []) {
      const current = lastCheckedByPlugin.get(job.pluginId);
      if (typeof job.lastCheckAt === 'number' && (current === undefined || current === null || job.lastCheckAt > current)) {
        lastCheckedByPlugin.set(job.pluginId, job.lastCheckAt);
      } else if (current === undefined) {
        lastCheckedByPlugin.set(job.pluginId, null);
      }
    }
    return pluginList.map((plugin) =>
      buildPluginViewModel(plugin, {
        monitoredCount: monitoredByPlugin.get(plugin.id) ?? 0,
        lastCheckedAt: lastCheckedByPlugin.get(plugin.id) ?? null,
        missingRequired: setupByPlugin[plugin.id]?.missing,
      }),
    );
  }, [pluginList, creators, monitorJobs, setupByPlugin]);

  // --- toolbar state ---------------------------------------------------------
  const [state, setState] = useState<PluginsToolbarState>(DEFAULT_TOOLBAR);
  const patchToolbar = (patch: Partial<PluginsToolbarState>): void =>
    setState((prev) => ({ ...prev, ...patch }));
  const resetToolbar = (): void =>
    setState((prev) => ({ ...DEFAULT_TOOLBAR, view: prev.view, showDeveloper: prev.showDeveloper }));

  // Visible pool: developer/example plugins hide until enabled.
  const pool = useMemo(
    () => viewModels.filter((vm) => state.showDeveloper || !vm.isDeveloper),
    [viewModels, state.showDeveloper],
  );

  // Summary counts (over the visible pool — reflect what the page really has).
  const counts = useMemo<Record<PluginsFilterTab, number>>(() => {
    const byTab: Record<PluginsFilterTab, number> = {
      all: pool.length,
      enabled: 0,
      disabled: 0,
      'needs-setup': 0,
      updates: 0,
      errors: 0,
    };
    for (const vm of pool) {
      if (vm.status.attention === 'needs-setup') byTab['needs-setup'] += 1;
      else if (vm.status.attention === 'update-available') byTab.updates += 1;
      else if (vm.status.attention === 'error') byTab.errors += 1;
      else if (vm.status.attention === 'disabled') byTab.disabled += 1;
      byTab.enabled += vm.plugin.enabled ? 1 : 0;
    }
    return byTab;
  }, [pool]);

  const summaryCounts: PluginsSummaryCounts = useMemo(
    () => ({
      enabled: counts.enabled,
      needsSetup: counts['needs-setup'],
      updatesAvailable: counts.updates,
      errors: counts.errors,
    }),
    [counts],
  );

  // --- filtering + sorting ----------------------------------------------------
  const normalizedSearch = state.search.trim().toLowerCase();
  const lastCheckedMs = (vm: PluginViewModel): number => vm.lastCheckedAt ?? -1;
  const visible = useMemo(() => {
    const matches =
      normalizedSearch === ''
        ? pool
        : pool.filter((vm) => matchesFilter(vm.plugin, normalizedSearch));
    const filtered = matches.filter((vm) => {
      switch (state.tab) {
        case 'all':
          return true;
        case 'enabled':
          return vm.plugin.enabled;
        case 'disabled':
          return !vm.plugin.enabled;
        case 'needs-setup':
          return vm.status.attention === 'needs-setup';
        case 'updates':
          return vm.status.attention === 'update-available';
        case 'errors':
          return vm.status.attention === 'error';
      }
    });
    const sorters: Record<PluginsSort, (a: PluginViewModel, b: PluginViewModel) => number> = {
      status: (a, b) =>
        attentionRank(a.status.attention) - attentionRank(b.status.attention) ||
        a.plugin.name.localeCompare(b.plugin.name),
      name: (a, b) => a.plugin.name.localeCompare(b.plugin.name),
      'most-used': (a, b) => b.monitoredCount - a.monitoredCount || a.plugin.name.localeCompare(b.plugin.name),
      'last-checked': (a, b) =>
        lastCheckedMs(b) - lastCheckedMs(a) || a.plugin.name.localeCompare(b.plugin.name),
    };
    return [...filtered].sort(sorters[state.sort]);
  }, [pool, normalizedSearch, state.tab, state.sort]);

  // --- page-level dialogs (single instances, one open at a time) ---------------
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [diagnosticsId, setDiagnosticsId] = useState<string | null>(null);
  const [removeCandidateId, setRemoveCandidateId] = useState<string | null>(null);

  const viewModelById = (id: string | null): PluginViewModel | null =>
    id === null ? null : viewModels.find((vm) => vm.plugin.id === id) ?? null;

  const callbacksFor = (vm: PluginViewModel) => ({
    onFinishSetup: () => setSettingsId(vm.plugin.id),
    onUpdate: () => undefined, // rows own their update mutation (same IPC)
    onOpenSettings: () => setSettingsId(vm.plugin.id),
    onOpenDetails: () => setDetailsId(vm.plugin.id),
    onOpenDiagnostics: () => setDiagnosticsId(vm.plugin.id),
    onRemove: () => setRemoveCandidateId(vm.plugin.id),
  });

  // --- check for updates (header action) --------------------------------------
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const checkUpdates = useMutation({
    mutationFn: async (): Promise<number> => {
      // ponytail: read-only re-read of the installed plugin state (the same
      // refresh the event listener triggers). No update/reload IPC is run —
      // version divergence surfaces only when a real source provides it.
      await queryClient.invalidateQueries({ queryKey: ['plugins'] });
      return (plugins ?? []).length;
    },
    onSuccess: (checked) => {
      setLastCheckedAt(Date.now());
      pushToast({
        level: 'info',
        title: 'Plugins checked',
        message: `${checked} plugin${checked === 1 ? '' : 's'} re-read — no pending updates are known.`,
      });
    },
    onError: (error: unknown) => {
      pushToast({
        level: 'error',
        title: 'Could not check plugins',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // --- remove (page-level mutation, behind the red confirm) ---------------------
  const removeCandidate = viewModelById(removeCandidateId);
  const remove = useMutation({
    mutationFn: (target: { id: string; name: string }) => window.desktop.plugins.remove(target.id),
    onSuccess: (_data, target) => {
      pushToast({
        level: 'info',
        title: 'Plugin removed',
        message: `${target.name} was removed.`,
      });
      setRemoveCandidateId(null);
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
    onError: (error: unknown) => {
      pushToast({
        level: 'error',
        title: 'Failed to remove plugin',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const installButton = (
    <Button loading={install.isPending} onClick={() => install.mutate()}>
      <FolderInput size={14} />
      Install from folder
    </Button>
  );
  const checkUpdatesButton = (
    <Button variant="secondary" loading={checkUpdates.isPending} onClick={() => checkUpdates.mutate()}>
      <RefreshCcw size={14} />
      Check for updates
    </Button>
  );

  const nothingInstalled = pool.length === 0 && (plugins?.length ?? 0) === 0;

  return (
    <PageContainer>
      <SectionHeader
        title="Plugins"
        description="Install platform support, finish setup and manage updates."
        actions={
          <div className="flex items-center gap-2">
            {checkUpdatesButton}
            {installButton}
          </div>
        }
      />

      {isError && <p className="text-sm text-error">Failed to load plugins. Check the logs for details.</p>}

      {/* Loading skeleton — summary strip + toolbar + six equal rows */}
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-[3rem] w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-md" />
            ))}
          </div>
        </div>
      )}

      {!isError && !loading && (
        <>
          <PluginsSummaryStrip
            counts={summaryCounts}
            poolTotal={pool.length}
            tab={state.tab}
            onFilterTab={(tab) => patchToolbar({ tab })}
          />

          {/* Toolbar (scrolls with the page; full-bleed via -mx-6) */}
          <PluginsToolbar
            state={state}
            onChange={patchToolbar}
            onReset={resetToolbar}
            counts={counts}
            visibleCount={visible.length}
            poolCount={pool.length}
            lastCheckedAt={lastCheckedAt}
            checking={checkUpdates.isPending}
          />

          {nothingInstalled && (
            <EmptyState
              icon={Puzzle}
              title="No plugins installed"
              description="Plugins power platform support. Install one to start monitoring creators."
              action={installButton}
            />
          )}

          {!nothingInstalled && visible.length === 0 && (
            <EmptyState
              icon={Search}
              title="No plugins match"
              description={`Nothing matches the current filters${
                state.search.trim() !== '' ? ` (“${state.search.trim()}”)` : ''
              }. Try a name, author or capability.`}
              action={
                <Button variant="secondary" onClick={resetToolbar}>
                  Clear filters
                </Button>
              }
            />
          )}

          {visible.length > 0 &&
            (state.view === 'grid' ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2" role="list" aria-label="Installed plugins">
                {visible.map((vm) => (
                  <PluginCard key={vm.plugin.id} vm={vm} callbacks={callbacksFor(vm)} />
                ))}
              </div>
            ) : (
              <div className="space-y-2" role="list" aria-label="Installed plugins">
                {visible.map((vm) => (
                  <PluginRow key={vm.plugin.id} vm={vm} callbacks={callbacksFor(vm)} />
                ))}
              </div>
            ))}
        </>
      )}

      {/* Single details drawer + the existing dialogs (same logic, page-owned) */}
      <PluginDetailsDrawer
        vm={viewModelById(detailsId)}
        open={detailsId !== null}
        onClose={() => setDetailsId(null)}
        onOpenSettings={(plugin) => setSettingsId(plugin.id)}
      />
      <PluginSettingsDialog
        plugin={viewModelById(settingsId)?.plugin ?? null}
        open={settingsId !== null}
        onOpenChange={(open) => {
          if (!open) setSettingsId(null);
        }}
      />
      <PluginDiagnosticsDialog
        plugin={viewModelById(diagnosticsId)?.plugin ?? null}
        open={diagnosticsId !== null}
        onOpenChange={(open) => {
          if (!open) setDiagnosticsId(null);
        }}
      />
      <PluginRemoveDialog
        plugin={removeCandidate?.plugin ?? null}
        creatorsUsing={removeCandidate?.monitoredCount ?? 0}
        open={removeCandidateId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveCandidateId(null);
        }}
        pending={remove.isPending}
        onConfirm={() => {
          const target = removeCandidate;
          setRemoveCandidateId(null);
          if (target !== null) {
            void remove.mutateAsync({ id: target.plugin.id, name: target.plugin.name });
          }
        }}
      />
    </PageContainer>
  );
}

/** A required setting counts as configured when any stored value exists. */
function hasSettingValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  // Booleans/select values are explicit choices — they count as configured.
  return true;
}

/** "clientSecret" → "Client Secret" for the Needs-setup surface. */
function prettySettingKey(key: string): string {
  return key
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
}
