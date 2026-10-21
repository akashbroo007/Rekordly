/**
 * StatusChip — Chrome status pill reused across the top bar.
 *
 * Static 28px-high chip tinted with the app's status colors (red = recording,
 * amber = needs attention, primary-soft = accent). No pulse, no glow — the
 * only "live" element is the resulting text, rendered in tabular numbers.
 */
import type { ReactNode } from 'react';

export type StatusChipTone = 'recording' | 'warning' | 'accent';

const TONE_CLASSES: Record<StatusChipTone, { resting: string; hover: string; dot: string }> = {
  recording: {
    resting: 'border-error/30 bg-error/10 text-error',
    hover: 'hover:bg-error/15',
    dot: 'bg-error',
  },
  warning: {
    resting: 'border-warning/30 bg-warning/10 text-warning',
    hover: 'hover:bg-warning/15',
    dot: 'bg-warning',
  },
  accent: {
    resting: 'border-transparent bg-primary-soft text-primary',
    hover: 'hover:bg-primary/20',
    dot: 'bg-primary',
  },
};

export interface StatusChipModel {
  /** Stable key for React. */
  readonly id: string;
  tone: StatusChipTone;
  /** Sentence-case chip text (kept short — it sits in chrome, not in content). */
  label: string;
  /** Colored leading dot (a legend marker — static, never pulsing). */
  leadingDot?: boolean;
  /** Full state description for title/aria (often longer than the label). */
  title: string;
  onClick: () => void;
  /** Small trailing hint, e.g. a "Resume" action baked into the chip. */
  trailing?: ReactNode;
}

export function StatusChip({ chip }: { chip: StatusChipModel }) {
  const tone = TONE_CLASSES[chip.tone];
  return (
    <button
      type="button"
      onClick={chip.onClick}
      title={chip.title}
      aria-label={chip.title}
      className={`flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 text-xs font-medium tabular-nums transition-colors duration-150 outline-none ${tone.resting} ${tone.hover}`}
    >
      {chip.leadingDot === true && (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
      )}
      <span className="whitespace-nowrap">{chip.label}</span>
      {chip.trailing !== undefined && <span className="whitespace-nowrap">{chip.trailing}</span>}
    </button>
  );
}
