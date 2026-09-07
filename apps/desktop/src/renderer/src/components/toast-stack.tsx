import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToastStore } from '../stores/toast-store';

const DEFAULT_TOAST_TTL_MS = 6000;

const ICONS = {
  debug: Info,
  info: Info,
  warn: AlertTriangle,
  error: XCircle,
  fatal: XCircle,
} as const;

const COLORS = {
  debug: 'text-info',
  info: 'text-info',
  warn: 'text-warning',
  error: 'text-error',
  fatal: 'text-error',
} as const;

export function ToastStack() {
  const toasts = useToastStore((state) => state.toasts);
  const remove = useToastStore((state) => state.remove);

  // ponytail: honor the "Toast duration" setting from the Settings page.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
    staleTime: Infinity,
  });
  const ttlMs = settings?.toastDurationMs ?? DEFAULT_TOAST_TTL_MS;

  return (
    <div className="pointer-events-none fixed bottom-8 right-4 z-50 flex w-80 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} id={toast.id} ttlMs={ttlMs} onRemove={remove} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ id, ttlMs, onRemove }: { id: number; ttlMs: number; onRemove: (id: number) => void }) {
  const toast = useToastStore((state) => state.toasts.find((t) => t.id === id));
  const dismiss = (): void => onRemove(id);

  useEffect(() => {
    const timer = setTimeout(() => onRemove(id), ttlMs);
    return () => clearTimeout(timer);
  }, [id, ttlMs, onRemove]);

  if (toast === undefined) {
    return null;
  }
  const Icon = ICONS[toast.level];

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.15 }}
      className="pointer-events-auto flex items-start gap-2 rounded-md border border-border bg-surface p-3 shadow-menu"
      role="status"
    >
      <Icon size={16} className={`mt-0.5 shrink-0 ${COLORS[toast.level]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{toast.title}</p>
        <p className="mt-0.5 text-xs text-foreground-muted">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-sm p-0.5 text-foreground-muted transition-colors hover:bg-hover hover:text-foreground"
        aria-label="Dismiss toast"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
