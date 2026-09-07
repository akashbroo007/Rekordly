import type { ReactNode } from 'react';

export function Scrollable({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={`overflow-auto ${className ?? ''}`}>{children}</div>;
}
