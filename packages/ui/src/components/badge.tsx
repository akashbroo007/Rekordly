import type { HTMLAttributes } from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'muted';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'border-border bg-elevated text-foreground-secondary',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  error: 'border-error/30 bg-error/10 text-error',
  info: 'border-info/30 bg-info/10 text-info',
  muted: 'border-border bg-panel text-foreground-muted',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-none ${VARIANT_CLASSES[variant]} ${className ?? ''}`}
      {...props}
    >
      {children}
    </span>
  );
}
