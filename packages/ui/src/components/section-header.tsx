import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 space-y-2">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm leading-relaxed text-foreground-muted">{description}</p>}
      </div>
      {/* ponytail: actions wrap onto their own row on narrow widths instead
          of overflowing or squashing the title. */}
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
      )}
    </div>
  );
}