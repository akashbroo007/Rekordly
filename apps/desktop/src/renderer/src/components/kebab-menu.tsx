/**
 * Shared " … " (kebab) menu used by CreatorCards and RecordingRows —
 * dependency-free popover with outside-click + Escape handling, matching
 * the creators page redesign's menu look.
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

export interface KebabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  dangerous?: boolean;
  onSelect: () => void;
}

export function KebabMenu({ items, label = 'More actions' }: { items: KebabItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // ponytail: outside-click + Escape close — keeps the popover dependency-free.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-sm text-foreground-muted transition-colors hover:bg-hover hover:text-foreground"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-8 z-30 min-w-[190px] rounded-md border border-border bg-surface p-1 shadow-menu"
        >
          {items.map((item, index) => (
            <Fragment key={item.key}>
              {index > 0 && item.dangerous && items[index - 1]?.dangerous !== true && (
                <div className="my-1 h-px bg-border" />
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors ${
                  item.dangerous
                    ? 'text-error hover:bg-error/10'
                    : 'text-foreground-secondary hover:bg-hover hover:text-foreground'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
