import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional count badge (e.g. how many creators match this value). */
  count?: number;
  /** Optional 8px color dot shown before the label. */
  dot?: string;
  /** Optional trailing indicator (e.g. a live pulse). */
  live?: boolean;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  /** Shown inside the trigger button when nothing is selected. */
  icon?: React.ReactNode;
  searchable?: boolean;
  className?: string;
  disabled?: boolean;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  icon,
  searchable = true,
  className,
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
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

  const toggle = (optionValue: string): void => {
    onChange(value.includes(optionValue) ? value.filter((v) => v !== optionValue) : [...value, optionValue]);
  };

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selected = options.filter((o) => value.includes(o.value));
  const summary =
    selected.length === 0
      ? null
      : selected.length <= 2
        ? selected.map((o) => o.label).join(', ')
        : `${selected.length} selected`;

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 w-full items-center gap-1.5 rounded-sm border px-3 text-sm transition-colors duration-150 ${
          disabled
            ? 'cursor-not-allowed border-border bg-elevated opacity-50'
            : 'border-border bg-elevated hover:border-primary/50'
        } ${selected.length > 0 ? 'text-foreground' : 'text-foreground-muted'} ${open ? 'border-primary' : ''}`}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate text-left">{summary ?? placeholder}</span>
        {selected.length > 0 && (
          <span className="rounded-sm bg-primary/15 px-1.5 text-[11px] font-semibold tabular-nums text-primary">
            {selected.length}
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
            className="absolute left-0 top-full z-50 mt-1 min-w-[220px] w-full min-w-max max-w-xs rounded-md border border-border bg-surface p-1 shadow-md"
          >
            {searchable && (
              <div className="relative mb-1 px-1 pt-1">
                <Search size={12} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="h-7 w-full rounded-sm border border-border bg-elevated pl-7 pr-2 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            )}
            <ul id={listId} role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto">
              {filtered.map((option) => {
                const isSelected = value.includes(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggle(option.value)}
                      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors ${
                        isSelected
                          ? 'bg-primary/10 text-foreground'
                          : 'text-foreground-secondary hover:bg-hover hover:text-foreground'
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                          isSelected ? 'border-primary bg-primary text-white' : 'border-border'
                        }`}
                      >
                        {isSelected && <Check size={11} strokeWidth={3} />}
                      </span>
                      {option.dot && (
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: option.dot }} />
                      )}
                      <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
                      {option.live && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success" />}
                      {option.count !== undefined && (
                        <span className="shrink-0 text-[11px] tabular-nums text-foreground-muted">{option.count}</span>
                      )}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-2 py-2 text-xs text-foreground-muted">No matches.</li>
              )}
            </ul>
            {selected.length > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-foreground-muted transition-colors hover:bg-hover hover:text-error"
                >
                  <X size={12} /> Clear selection
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
