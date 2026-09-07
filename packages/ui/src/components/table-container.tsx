import type { ReactNode } from 'react';

export function TableContainer({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`overflow-x-auto rounded-md border border-border bg-surface ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
