/**
 * Plugin picker options — the shared model behind every dropdown that lists
 * plugins (Add Creator today, anything else tomorrow).
 *
 * Spec contract:
 *   • platform tile (shared PluginTile at the 20px option-row size),
 *   • name + a muted "Needs setup" note when required settings are missing
 *     (the row stays selectable — setup state never removes a plugin),
 *   • disabled (not-enabled) plugins are DISABLED rows with a "Set up"
 *     action navigating to the existing Plugins page setup surface,
 *   • developer/example plugins ("Mock Platform") hidden unless the
 *     "Show developer plugins" preference is on,
 *   • alphabetical by display name (label metadata only — selection
 *     behavior and validation are untouched).
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PluginInfoDto } from '@rekordly/shared';
import type { SelectOption } from '@rekordly/ui';
import { PluginTile } from '../plugins/plugin-tile';
import { isDeveloperPlugin, usePluginSetupChecks } from '../plugins/plugin-status';
import { useUiPreferencesStore } from '../../stores/ui-preferences-store';

export function usePluginPickerOptions(plugins: readonly PluginInfoDto[] | undefined): SelectOption[] {
  const navigate = useNavigate();
  const showDeveloper = useUiPreferencesStore((state) => state.showDeveloperPlugins);
  const setupChecks = usePluginSetupChecks(useMemo(() => plugins ?? [], [plugins]));

  return useMemo(() => {
    const byPlugin = (setupChecks ?? {}) as Record<string, { missing: string[] }>;
    return (plugins ?? [])
      .filter((plugin) => showDeveloper || !isDeveloperPlugin(plugin.id))
      .map((plugin) => {
        const missing = byPlugin[plugin.id]?.missing ?? [];
        const needsSetup = plugin.enabled && missing.length > 0;
        const tile = (
          <PluginTile
            pluginId={plugin.id}
            name={plugin.name}
            homepage={plugin.homepage}
            iconUrl={plugin.iconUrl}
            size={20}
          />
        );
        // Not enabled → genuinely unpickable: disabled row + "Set up".
        if (!plugin.enabled) {
          return {
            value: plugin.id,
            label: plugin.name,
            leading: tile,
            disabled: true,
            disabledReason: 'Disabled',
            onSetup: () => navigate('/plugins'),
            setupLabel: 'Set up',
          } satisfies SelectOption;
        }
        // Enabled but missing required settings stays SELECTABLE (as before
        // this picker existed) — the setup state is surfaced as a muted note
        // instead of gating the row, so no plugin ever "disappears".
        return {
          value: plugin.id,
          label: plugin.name,
          leading: tile,
          secondary: needsSetup ? `Needs setup — ${missing[0]}` : undefined,
        } satisfies SelectOption;
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [plugins, showDeveloper, setupChecks, navigate]);
}
