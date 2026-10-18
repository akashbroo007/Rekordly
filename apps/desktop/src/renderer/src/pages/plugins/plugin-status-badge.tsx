/**
 * PluginStatusBadge — the single status indicator for a plugin row/card.
 *
 * Attention states (Needs setup / Error / Update available / Starting /
 * Disabled) render the shared StatusBadge from components/badges (the same
 * dot+label grammar the Recordings rows use, registered tones included);
 * healthy plugins show a small green dot ONLY — nothing needs attention.
 */
import { StatusBadge } from '../../components/badges';
import type { PluginAttention } from './plugin-status';

export function PluginStatusBadge({
  attention,
  title,
}: {
  attention: PluginAttention;
  /** Tooltip text (e.g. the setup hint or last error message). */
  title?: string;
}) {
  if (attention === 'active') {
    return (
      <span
        title={title ?? 'Active'}
        className="inline-flex items-center gap-1.5 text-xs leading-none text-foreground-muted"
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
        <span className="sr-only">Active</span>
      </span>
    );
  }
  return <StatusBadge status={attention} title={title} />;
}
