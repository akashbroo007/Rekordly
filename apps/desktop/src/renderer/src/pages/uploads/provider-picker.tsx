/**
 * ProviderPicker — the Uploads page destination picker. A custom dropdown
 * replacing the native <select>: every option shows the provider tile (from
 * the shared config), the header status dot and a one-line limit summary.
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
 * alias provider metadata.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Settings2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@rekordly/ui';
import { providerColor } from '../../components/platform-config';
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

/** 6px picker status dot (amber only for needs-setup). */
export function ProviderStatusDot({ state, pulse }: { state: ProviderPickerState; pulse?: boolean }) {
  const color = state === 'ready' ? 'bg-success' : state === 'needs-setup' ? 'bg-warning' : 'bg-error';
  if (!pulse) {
    return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
  }
  return (
    <span aria-hidden="true" className="relative flex h-2 w-2 shrink-0">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${color}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selected = options.find((o) => o.id === value && o.state !== 'needs-setup');
  const usableCount = options.filter((o) => o.state !== 'needs-setup').length;

  return (
    <div ref={containerRef} className={`relative ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-14 w-full min-w-[240px] items-center gap-2.5 rounded-md border bg-elevated px-3 text-left transition-colors duration-150 ${
          open ? 'border-primary' : 'border-border hover:border-primary/50'
        }`}
      >
        {selected !== undefined ? (
          <>
            <ProviderTile providerId={selected.id} name={selected.name} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{selected.name}</span>
                <ProviderStatusDot state={selected.state} pulse={selected.state !== 'ready'} />
              </span>
              <span className="mt-0.5 block truncate text-xs text-foreground-muted">
                {selected.state === 'offline' ? 'Host unreachable right now' : providerLimitSummary(selected.meta)}
              </span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-foreground-muted">
            {usableCount === 0 ? 'No upload host is set up yet' : 'Choose upload host…'}
          </span>
        )}
        <ChevronDown size={14} className={`shrink-0 text-foreground-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            role="listbox"
            aria-label="Upload destinations"
            className="absolute left-0 top-full z-50 mt-1 w-full min-w-[340px] max-w-md rounded-md border border-border bg-surface p-1.5 shadow-md"
          >
            <p className="px-2 pb-1 pt-1 text-xs text-foreground-muted">Upload destinations</p>
            <ul id={listId}>
              {options.map((option) => {
                if (option.state === 'needs-setup') {
                  return (
                    <li key={option.id}>
                      <div
                        aria-disabled="true"
                        className="flex w-full items-center gap-2.5 rounded-sm border border-warning/30 bg-warning/5 px-2 py-2 opacity-90"
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
                      onClick={() => {
                        setOpen(false);
                        onChange(option.id);
                      }}
                      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2 py-2 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-hover'
                      }`}
                    >
                      <ProviderTile providerId={option.id} name={option.name} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{option.name}</span>
                          <ProviderStatusDot state={option.state} pulse={option.state === 'offline'} />
                          <span
                            className={`text-xs font-medium ${
                              option.state === 'ready' ? 'text-success' : 'text-error'
                            }`}
                          >
                            {STATE_LABEL[option.state]}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-foreground-muted">
                          {option.state === 'offline' ? 'Host unreachable right now' : providerLimitSummary(option.meta)}
                        </span>
                      </span>
                      {isSelected && (
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: providerColor(option.id) }}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
