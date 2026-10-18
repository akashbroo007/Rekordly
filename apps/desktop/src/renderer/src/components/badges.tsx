/**
 * Shared status/brand badges used by the Creators, Recordings AND Plugins
 * pages so all surfaces read identically. Extracted from the Creators
 * redesign — recording rows must reuse the exact same
 * PlatformBadge/StatusBadge, and the Plugins page reuses the same
 * dot+label grammar for its derived plugin states.
 */
import type { HTMLAttributes } from 'react';
import { platformColor } from './platform-config';

/** ponytail: brand-tinted platform pill — small colored dot + platform name. */
export function PlatformBadge({
  pluginId,
  platformName,
  onFilterPlatform,
  className,
}: {
  pluginId: string;
  platformName: string;
  /** Clicking the badge can filter the page to that platform. */
  onFilterPlatform?: (pluginId: string) => void;
  className?: string;
}) {
  const className_ = `inline-flex shrink-0 items-center gap-1 rounded-sm border border-border bg-transparent px-1.5 py-0.5 text-xs font-medium leading-none text-foreground-secondary transition-colors hover:border-primary/50 hover:text-foreground ${className ?? ''}`;
  if (onFilterPlatform === undefined) {
    return (
      <span className={className_}>
        <PlatformDot pluginId={pluginId} />
        {platformName}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        // ponytail: rows often nest the badge inside a clickable card —
        // never let the platform filter click also toggle/select the row.
        event.stopPropagation();
        onFilterPlatform(pluginId);
      }}
      title={`Filter by ${platformName}`}
      className={`${className_} cursor-pointer`}
    >
      <PlatformDot pluginId={pluginId} />
      {platformName}
    </button>
  );
}

function PlatformDot({ pluginId }: { pluginId: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-1.5 w-1.5 rounded-full"
      style={{ backgroundColor: platformColor(pluginId) }}
    />
  );
}

// --- StatusBadge ---------------------------------------------------------------

export type BadgeTone = 'error' | 'warning' | 'success' | 'info' | 'neutral';

/** Recording-job state → one dot + label. Status appears ONCE per row. */
const STATUS_TONES: Record<string, { tone: BadgeTone; label: string }> = {
  queued: { tone: 'info', label: 'Queued' },
  preparing: { tone: 'info', label: 'Preparing' },
  recording: { tone: 'error', label: 'Recording' },
  paused: { tone: 'warning', label: 'Paused' },
  stopping: { tone: 'warning', label: 'Stopping' },
  processing: { tone: 'info', label: 'Processing' },
  verifying: { tone: 'info', label: 'Verifying' },
  completed: { tone: 'success', label: 'Completed' },
  failed: { tone: 'error', label: 'Failed' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
  // --- Plugins page (derived plugin states share the same tone system) ---
  'needs-setup': { tone: 'warning', label: 'Needs setup' },
  'update-available': { tone: 'info', label: 'Update available' },
  error: { tone: 'error', label: 'Error' },
  disabled: { tone: 'neutral', label: 'Disabled' },
  starting: { tone: 'info', label: 'Starting' },
};

// Token-driven tone classes — theme-safe on both dark and light.
const TONE_CLASSES: Record<BadgeTone, { text: string; border: string; bg: string; dot: string }> = {
  error: { text: 'text-error', border: 'border-error/30', bg: 'bg-error/10', dot: 'bg-error' },
  warning: { text: 'text-warning', border: 'border-warning/30', bg: 'bg-warning/10', dot: 'bg-warning' },
  success: { text: 'text-success', border: 'border-success/30', bg: 'bg-success/10', dot: 'bg-success' },
  info: { text: 'text-info', border: 'border-info/30', bg: 'bg-info/10', dot: 'bg-info' },
  neutral: {
    text: 'text-foreground-secondary',
    border: 'border-border',
    bg: 'bg-elevated',
    dot: 'bg-foreground-disabled',
  },
};

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: string;
  /** Falls back to the raw status text when unmapped. */
  label?: string;
  /** Gently pulsing dot for in-progress (recording) states. */
  pulse?: boolean;
}

/** One colored dot + one label — the single status indicator on a row. */
export function StatusBadge({ status, label, pulse = false, className, ...props }: StatusBadgeProps) {
  const mapped = STATUS_TONES[status];
  const tone = mapped?.tone ?? 'neutral';
  const text = label ?? mapped?.label ?? status;
  const classes = TONE_CLASSES[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-xs font-medium leading-none ${classes.border} ${classes.bg} ${classes.text} ${className ?? ''}`}
      {...props}
    >
      <StatusDot tone={tone} pulse={pulse} />
      {text}
    </span>
  );
}

function StatusDot({ tone, pulse }: { tone: BadgeTone; pulse: boolean }) {
  const dotClass = TONE_CLASSES[tone].dot;
  if (!pulse) {
    return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />;
  }
  return (
    <span aria-hidden="true" className="relative flex h-1.5 w-1.5 shrink-0">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dotClass}`} />
      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotClass}`} />
    </span>
  );
}
