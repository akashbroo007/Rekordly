import type { HTMLAttributes } from 'react';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`animate-pulse rounded-sm bg-elevated ${className ?? ''}`} {...props} />;
}
