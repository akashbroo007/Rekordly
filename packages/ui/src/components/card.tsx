import type { HTMLAttributes } from 'react';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-md border border-border bg-surface p-4 ${className ?? ''}`} {...props}>
      {children}
    </div>
  );
}
