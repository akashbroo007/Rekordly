/**
 * Shared presentational pieces for PluginRow and PluginCard so the list
 * and grid views stay pixel-identical. No mutations here — toggling,
 * updating and removal stay orchestrated by the caller (same IPC calls as
 * before, none of the logic moved).
 */
import type { PluginInfoDto } from '@rekordly/shared/contracts';
import { Button, Switch, Tooltip } from '@rekordly/ui';
import { Info, HeartPulse } from 'lucide-react';

/** Compact, single-style capability-gap chips (exceptions only). */
export function CapabilityExceptions({ exceptions }: { exceptions: readonly string[] }) {
  if (exceptions.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {exceptions.map((exception) => (
        <span
          key={exception}
          className="shrink-0 rounded-sm border border-border bg-panel px-1.5 py-0.5 text-xs font-medium leading-none text-foreground-secondary"
        >
          {exception}
        </span>
      ))}
    </div>
  );
}

/** Labeled enable/disable switch — the one "Enabled"/"Disabled" control. */
export function EnabledSwitch({
  plugin,
  pending,
  onToggle,
}: {
  plugin: PluginInfoDto;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 text-xs leading-none ${
        plugin.enabled ? 'text-foreground-secondary' : 'text-foreground-muted'
      }`}
    >
      <Switch
        checked={plugin.enabled}
        onCheckedChange={onToggle}
        disabled={pending}
        aria-label={plugin.enabled ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}
      />
      {plugin.enabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}

/** Quiet icon buttons (Details / Diagnostics) with tooltips. */
export function QuietActionButtons({
  onDetails,
  onDiagnostics,
}: {
  onDetails: () => void;
  onDiagnostics: () => void;
}) {
  return (
    <>
      <Tooltip content="Show details">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-foreground-muted hover:text-foreground"
          onClick={onDetails}
          aria-label="Show details"
        >
          <Info size={14} />
        </Button>
      </Tooltip>
      <Tooltip content="Diagnostics — run a health check">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-foreground-muted hover:text-foreground"
          onClick={onDiagnostics}
          aria-label="Open diagnostics"
        >
          <HeartPulse size={14} />
        </Button>
      </Tooltip>
    </>
  );
}
