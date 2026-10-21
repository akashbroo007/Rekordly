/**
 * Dropdown system — the shared option row.
 *
 * Token spec: 36px height · radius 6 · 10px padding · 10px gap. Layout:
 * optional leading icon/tile (20px) · label (primary text, 500) · optional
 * muted secondary text on the right · check icon in the PRIMARY TEXT color
 * (never the accent) on the selected row. Hover / keyboard highlight is
 * rgba(255,255,255,0.06) only — never a saturated or accent fill. Disabled
 * rows show a muted reason as the secondary text plus an optional "Set up"
 * action wired to the app's existing setup flow.
 */
import { Check } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

export interface DropdownOptionBase {
  value: string;
  label: string;
  /** Muted text on the right of the label (status note, metadata...). */
  secondary?: string;
  disabled?: boolean;
  /** Why the row is disabled — rendered as the muted secondary text. */
  disabledReason?: string;
  /** Inline action for disabled rows (default "Set up"), closing the panel. */
  onSetup?: () => void;
  setupLabel?: string;
  /** Optional leading 20px slot — an icon or a platform/provider tile. */
  leading?: ReactNode;
  /** Optional group label; rows sharing a name render under one label. */
  group?: string;
}

export interface OptionRowProps extends Omit<DropdownOptionBase, 'value'> {
  selected: boolean;
  /** MultiSelect rows render a neutral checkbox instead of a trailing check. */
  checkbox?: boolean;
  /** Trailing green live dot (e.g. a currently-live creator option). */
  live?: boolean;
  /** Trailing muted tabular count (e.g. how many recordings match). */
  count?: number;
  /** 8px brand dot before the label (platform/provider color). */
  dot?: string;
  /** Row chosen (disabled rows never fire this). */
  onSelect: (value: string) => void;
  /** Closes the panel — also used by the inline "Set up" action. */
  onClose: () => void;
  /** id for aria wiring. */
  id?: string;
  /** Raw option value for data-value (initial-focus matching); defaults to id. */
  dataValue?: string;
  ref?: Ref<HTMLButtonElement>;
}

const ROW_BASE =
  'flex h-9 w-full select-none items-center gap-2.5 rounded-sm px-2.5 text-left text-sm outline-none transition-colors duration-100 text-foreground-muted cursor-not-allowed';

/** Hover- and keyboard-highlight shared by every selectable row. */
const HIGHLIGHT = 'hover:bg-white/[0.06] focus-visible:bg-white/[0.06]';

export function OptionRow({
  label,
  selected,
  disabled = false,
  disabledReason,
  secondary,
  onSetup,
  setupLabel = 'Set up',
  leading,
  checkbox = false,
  live = false,
  count,
  dot,
  onSelect,
  onClose,
  id,
  dataValue,
  ref,
}: OptionRowProps) {
  /* Disabled + setup flow → native div so the "Set up" action stays clickable
     without nesting a button inside the row button. The row itself is inert
     and announces its reason via aria-description. */
  if (disabled) {
    return (
      <div id={id} role="option" aria-selected="false" aria-disabled="true" className={ROW_BASE}>
        {leading !== undefined && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">{leading}</span>
        )}
        <span className="min-w-0 flex-1 truncate font-normal">{label}</span>
        {(disabledReason ?? secondary) !== undefined && (
          <span className="shrink-0 truncate text-xs text-foreground-muted">
            {disabledReason ?? secondary}
          </span>
        )}
        {onSetup !== undefined && (
          <span className="sr-only">{`${disabledReason ?? 'Not available'} — you can set it up.`}</span>
        )}
        {onSetup !== undefined && (
          <button
            type="button"
            aria-label={`${setupLabel}: ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
              onSetup();
            }}
            className="shrink-0 cursor-pointer rounded-sm px-1 py-0.5 text-xs font-medium text-info underline decoration-info/40 underline-offset-2 transition-colors hover:decoration-info"
          >
            {setupLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      ref={ref}
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      data-value={dataValue ?? id}
      onClick={() => {
        onClose();
        onSelect(dataValue ?? id ?? '');
      }}
      onKeyDown={(event) => {
        // Space must choose, not scroll the panel viewport.
        if (event.key === ' ') event.preventDefault();
      }}
      className={`flex h-9 w-full cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 text-left text-sm font-medium text-foreground outline-none transition-colors duration-100 ${HIGHLIGHT}`}
    >
      {leading !== undefined && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">{leading}</span>
      )}
      {checkbox && (
        <span
          aria-hidden="true"
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
            selected ? 'border-foreground/70 bg-foreground/15' : 'border-border'
          }`}
        >
          {selected && <Check size={11} strokeWidth={3} className="text-foreground" />}
        </span>
      )}
      {dot !== undefined && (
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {live && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />}
      {count !== undefined && <span className="shrink-0 text-xs tabular-nums text-foreground-muted">{count}</span>}
      {secondary !== undefined && (
        <span className="shrink-0 truncate text-xs text-foreground-muted">{secondary}</span>
      )}
      {!checkbox && selected && (
        <Check size={16} strokeWidth={2.5} className="shrink-0 text-foreground" aria-hidden="true" />
      )}
    </button>
  );
}
