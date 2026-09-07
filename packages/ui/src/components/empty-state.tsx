import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-panel/50 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-foreground-muted">
        <Icon size={20} />
      </div>
      <h3 className="mt-2 text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="max-w-sm text-sm text-foreground-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
