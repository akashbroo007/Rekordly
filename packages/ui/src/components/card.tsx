import type { HTMLAttributes } from 'react';

/**
 * Card — the app's base surface. Uses the card token with NO border by
 * default (per the token refit: prefer surface contrast over outlines);
 * callers opt into borders on hover/selected via className when the card is
 * interactive. A transparent border is always reserved so hover borders
 * never shift layout.
 */
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-lg border border-transparent bg-surface p-4 ${className ?? ''}`} {...props}>
      {children}
    </div>
  );
}
