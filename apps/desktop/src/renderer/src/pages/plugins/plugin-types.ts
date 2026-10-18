/**
 * Shared prop/callback contracts for the extracted plugin components
 * (PluginRow / PluginCard / PluginDetailsDrawer). All behavior stays with
 * the page — these are pure navigation/handoff callbacks.
 */
import type { PluginViewModel } from './plugin-status';

export interface PluginStatusActionCallbacks {
  /** Needs-setup state → opens the plugin's setup/settings dialog. */
  onFinishSetup(): void;
  /** Update available state → runs the existing update-from-disk mutation. */
  onUpdate(): void;
  /** Default primary → opens the plugin settings dialog. */
  onOpenSettings(): void;
  /** Opens the right-side details drawer. */
  onOpenDetails(): void;
  /** Opens the existing diagnostics dialog. */
  onOpenDiagnostics(): void;
  /** Opens the page-level red remove-confirm dialog. */
  onRemove(): void;
}

export type { PluginViewModel };
