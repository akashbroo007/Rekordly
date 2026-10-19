/**
 * TransferRow — the shared row grammar for the app's three transfer lists
 * (Recordings, Uploads, Downloads). Every list renders the same skeleton:
 *
 *   ┌ checkbox · 16:9 thumb · [title + ONE status dot] [meta line] ┐
 *   │        …full-width slim progress band (active transfers)…    │
 *   └ labeled actions cluster (primary · secondary · "…" menu)     ┘
 *
 * This module owns the structure — shell (hover lift / hover-reveal
 * select checkbox / selected state / "Removing…" overlay), the throttled
 * live-values hook (≤ 4 UI updates per second per row), the slim progress
 * bar and the collapsible masked "Technical details" panel. The Downloads
 * page composes them into DownloadRow; the Recordings/Uploads rows already
 * match this grammar and can adopt these pieces pass-at-a-time.
 *
 * Purely presentational — every IPC call stays in the page.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@rekordly/ui';
import { Check, Copy } from 'lucide-react';
import { SelectionCheckbox } from '../recordings/recording-row';
import { maskHomeDir } from '../uploads/upload-errors';

/* --- throttled live values (≤ 4 updates/s per row) --------------------- */

export interface TransferLiveValues {
  percent: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number;
  eta: number;
}

/**
 * Caps how often a row's live progress numbers change per second. The page
 * already invalidates its list at most once per second, but many active
 * transfers × frequent progress events still collapse into laggy renders —
 * each row therefore redraws its moving numbers at most four times per
 * second (250 ms), and only when a number actually changed. Inactive rows
 * (paused/completed/failed) pass their static values straight through.
 */
export function useThrottledTransfer(
  values: TransferLiveValues,
  active: boolean,
  throttleMs = 250,
): TransferLiveValues {
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const snapshotRef = useRef<TransferLiveValues>(values);
  const dirtyRef = useRef(false);
  const [snapshot, setSnapshot] = useState<TransferLiveValues>(values);
  snapshotRef.current = snapshot;

  // Values changed → the next ≤250 ms tick may commit them (≤ 4/s).
  useEffect(() => {
    dirtyRef.current = true;
  }, [values]);

  useEffect(() => {
    if (!active) return;
    // Fresh transfer: show real numbers immediately instead of a stale 0%.
    snapshotRef.current = valuesRef.current;
    setSnapshot(valuesRef.current);
    const timer = window.setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      const next = valuesRef.current;
      const current = snapshotRef.current;
      if (
        next.percent !== current.percent ||
        next.bytesDownloaded !== current.bytesDownloaded ||
        next.totalBytes !== current.totalBytes ||
        next.speed !== current.speed ||
        next.eta !== current.eta
      ) {
        snapshotRef.current = next;
        setSnapshot(next);
      }
    }, throttleMs);
    return () => window.clearInterval(timer);
  }, [active, throttleMs]);

  return active ? snapshot : values;
}

/* --- the row shell ------------------------------------------------------ */

export interface TransferRowShellProps {
  ariaLabel: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** "Removing…" overlay while the remove call is in flight. */
  deleting?: boolean;
  /** Quiet, desaturated presentation (cancelled rows). */
  dimmed?: boolean;
  /** Thumb + body, laid out in one flex row with the action cluster. */
  children: ReactNode;
  actions: ReactNode;
  /** Full-width band right under the body — the slim progress-bar group. */
  footer?: ReactNode;
  /** Collapsible details panel rendered under the card (failed rows). */
  details?: ReactNode;
}

export function TransferRowShell({
  ariaLabel,
  selectable = false,
  selected = false,
  onToggleSelect,
  deleting = false,
  dimmed = false,
  children,
  actions,
  footer,
  details,
}: TransferRowShellProps) {
  return (
    <div
      className={`group relative rounded-md border transition-all duration-150 hover:-translate-y-px hover:border-primary/40 hover:bg-elevated/40 ${
        selected ? 'border-primary/60 bg-primary/5' : 'border-border bg-surface'
      } ${dimmed ? 'opacity-75 saturate-50' : ''}`}
      aria-label={ariaLabel}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        {selectable && onToggleSelect !== undefined && (
          <SelectionCheckbox selected={selected} onToggle={onToggleSelect} />
        )}
        {children}
        {actions}
      </div>

      {footer !== undefined && <div className="px-3 pb-2.5">{footer}</div>}

      {deleting === true && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-end rounded-md bg-surface/60 pr-3">
          <span className="text-sm text-foreground-muted">Removing…</span>
        </div>
      )}

      {details !== undefined && <div className="mx-3 mb-2">{details}</div>}
    </div>
  );
}

/* --- meta-line separator ------------------------------------------------- */

/** The "·" separating segments of a row's meta line (site · quality · folder). */
export function MetaSeparator() {
  return (
    <span aria-hidden="true" className="shrink-0 select-none text-foreground-disabled">
      ·
    </span>
  );
}

/* --- the slim progress bar ---------------------------------------------- */

/**
 * The ONE progress bar per row (the old page had five numbers floating
 * around a bar). `muted` renders the paused state (greyed-out fill).
 */
export function TransferProgressBar({ percent, tone = 'active' }: { percent: number; tone?: 'active' | 'muted' }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className="h-1 w-full overflow-hidden rounded-full bg-hover/60"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${
          tone === 'muted' ? 'bg-foreground-disabled/40' : 'bg-primary'
        }`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/* --- collapsible technical details (masked + Copy) ----------------------- */

/**
 * Raw failure internals for failed rows — the user-facing reason lives on
 * the row; this panel keeps plumbing stack lines one click away and never
 * leaks the home-directory account name (shared maskHomeDir helper).
 */
export function TransferTechnicalDetails({ rawError }: { rawError: string }) {
  const [copied, setCopied] = useState(false);
  const masked = maskHomeDir(rawError);
  return (
    <div className="rounded-sm border border-border bg-panel px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground-secondary">Technical details</p>
        <Button
          variant="ghost"
          size="sm"
          className="px-1.5"
          aria-label="Copy technical details"
          onClick={() => {
            void navigator.clipboard.writeText(masked).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
      <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-sm leading-relaxed text-foreground-secondary">
        {masked}
      </pre>
    </div>
  );
}
