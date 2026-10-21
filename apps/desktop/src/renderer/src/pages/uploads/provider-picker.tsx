/**
 * ProviderPicker — the Uploads page destination picker, rebuilt on the
 * shared dropdown core (packages/ui dropdown): portal + auto-flip + viewport
 * clamp, the shared raised panel (radius 10, shadow-menu, 120ms one-shot
 * fade/scale), Esc closes with focus returned to the trigger, and the shared
 * listbox keyboard model (↑/↓/Home/End/type-ahead).
 *
 * Every option shows the provider tile (from the shared config), the header
 * status dot and a one-line limit summary:
 *
 *   • Ready       → selectable (green dot)
 *   • Offline     → still selectable — the old page allowed uploads to
 *                   authenticated-but-unhealthy hosts (health may recover);
 *                   flagged with a red dot instead of a separate pill row.
 *   • Needs setup → amber, disabled in the list, with an inline "Set up"
 *                   button that opens the existing Settings → Cloud Storage
 *                   section for that provider.
 *
 * Purely presentational: the page owns selection and any provider metadata.
 */
import { Check, Settings2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  Button,
  DropdownChevron,
  DropdownContent,
  DropdownGroupLabel,
  DropdownScroll,
  Popover,
  useListboxNav,
} from '@rekordly/ui';
import { ProviderTile } from './provider-tile';
import { providerLimitSummary } from './uploads-format';

export type ProviderPickerState = 'ready' | 'offline' | 'needs-setup';

export interface ProviderPickerOption {
  id: string;
  name: string;
  state: ProviderPickerState;
  /** Raw provider metadata for the one-line limit summary. */
  meta?: {
    maxFileSize: number | null;
    requiresAccount: boolean;
    requiresApiKey: boolean;
  } | null;
}

const STATE_LABEL = {
  ready: 'Ready',
  offline: 'Offline',
  'needs-setup': 'Needs setup',
} as const;

/** 6px picker status dot (amber only for needs-setup) — solid, no pulse. */
export function ProviderStatusDot({ state }: { state: ProviderPickerState }) {
  const color = state === 'ready' ? 'bg-success' : state === 'needs-setup' ? 'bg-warning' : 'bg-error';
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

export interface ProviderPickerProps {
  options: ProviderPickerOption[];
  /** Selected provider id (one of the selectable options), or null while nothing is usable. */
  value: string | null;
  onChange: (id: string) => void;
  /** Opens the existing setup/settings surface for a needs-setup provider. */
  onSetup: (id: string) => void;
  disabled?: boolean;
}

export function ProviderPicker({ options, value, onChange, onSetup, disabled = false }: ProviderPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const selected = options.find((o) => o.id === value && o.state !== 'needs-setup');
  const usableCount = options.filter((o) => o.state !== 'needs-setup').length;

  // Shared listbox keyboard model over the scroll viewport (rows carry DOM
  // focus; disabled needs-setup rows are skipped via aria-disabled).
  const { handleKeyDown, focusInitial } = useListboxNav({ containerRef: viewportRef, active: open });

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => focusInitial(selected?.id ?? undefined));
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const summaryFor = (option: ProviderPickerOption): string =>
    option.state === 'offline' ? 'Host unreachable right now' : providerLimitSummary(option.meta);

  return (
    <div className={`relative ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      <Popover.Root
        modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
        }}
      >
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            className={`flex h-14 w-full min-w-[240px] items-center gap-2.5 rounded-md border bg-surface px-3 text-left transition-colors duration-150 hover:bg-elevated data-[state=open]:border-foreground/25 ${
              open ? 'border-foreground/25' : 'border-border'
            }`}
          >
            {selected !== undefined ? (
              <>
                <ProviderTile providerId={selected.id} name={selected.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{selected.name}</span>
                    <ProviderStatusDot state={selected.state} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-foreground-muted">{summaryFor(selected)}</span>
                </span>
              </>
            ) : (
              <span className="flex-1 text-sm text-foreground-muted">
                {usableCount === 0 ? 'No upload host is set up yet' : 'Choose upload host…'}
              </span>
            )}
            <DropdownChevron small={false} open={open} />
          </button>
        </Popover.Trigger>
        <DropdownContent anchorRef={triggerRef} matchTriggerWidth={false} className="!min-w-[340px]" ariaLabel="Upload destinations">
          <div onKeyDown={handleKeyDown}>
            <DropdownGroupLabel>Upload destinations</DropdownGroupLabel>
            <DropdownScroll scrollRef={viewportRef}>
              <ul id={listId} role="listbox" aria-label="Upload destinations">
                {options.map((option) => {
                  if (option.state === 'needs-setup') {
                    return (
                      <li key={option.id}>
                        <div
                          role="option"
                          aria-selected="false"
                          aria-disabled="true"
                          className="flex w-full select-none items-center gap-2.5 rounded-sm px-2 py-2 text-left text-sm text-foreground-muted"
                        >
                          <ProviderTile providerId={option.id} name={option.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-foreground-secondary">{option.name}</span>
                              <ProviderStatusDot state={option.state} />
                              <span className="text-xs font-medium text-warning">{STATE_LABEL[option.state]}</span>
                            </div>
                            <span className="mt-0.5 block truncate text-xs text-foreground-muted">
                              Set up in Settings → Cloud Storage to use this host
                            </span>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setOpen(false);
                              onSetup(option.id);
                            }}
                          >
                            <Settings2 size={12} /> Set up
                          </Button>
                        </div>
                      </li>
                    );
                  }
                  const isSelected = option.id === value;
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        data-value={option.id}
                        onClick={() => {
                          setOpen(false);
                          onChange(option.id);
                        }}
                        className="flex w-full cursor-pointer select-none items-center gap-2.5 rounded-sm px-2 py-2 text-left text-sm outline-none transition-colors duration-100 hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none"
                      >
                        <ProviderTile providerId={option.id} name={option.name} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">{option.name}</span>
                            <ProviderStatusDot state={option.state} />
                            <span
                              className={`text-xs font-medium ${
                                option.state === 'ready' ? 'text-success' : 'text-error'
                              }`}
                            >
                              {STATE_LABEL[option.state]}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-foreground-muted">{summaryFor(option)}</span>
                        </span>
                        {isSelected && (
                          <Check size={16} strokeWidth={2.5} className="shrink-0 text-foreground" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </DropdownScroll>
          </div>
        </DropdownContent>
      </Popover.Root>
    </div>
  );
}
