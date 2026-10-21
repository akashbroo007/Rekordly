import type { ReactNode } from 'react';

export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`flex h-full flex-col gap-6 overflow-y-auto p-6 ${className ?? ''}`}>
      {children}
    </div>
  );
}
