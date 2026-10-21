import type { HTMLAttributes } from 'react';

/**
 * Skeleton — a STATIC placeholder block in the surface color. No shimmer
 * sweep, no pulsing: temporary loading noise is decorative motion and the
 * token system forbids it.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-md bg-elevated ${className ?? ''}`} {...props} />;
}
