/**
 * Shared " … " (kebab) menu used by CreatorCards, PluginRows/Cards,
 * RecordingRows and the Upload/Recording toolbars — dependency-free popover
 * with outside-click + Escape handling, matching the creators page
 * redesign's menu look.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

export interface KebabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  dangerous?: boolean;
  onSelect: () => void;
}

const MENU_MIN_WIDTH = 190;
const EDGE_MARGIN = 8;

export function KebabMenu({ items, label = 'More actions' }: { items: KebabItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // ponytail: outside-click + Escape close — keeps the popover dependency-free.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (target === null) return;
      if (rootRef.current?.contains(target) === true) return;
      // ponytail: the menu itself is portaled to document.body — outside
      // the button wrapper, so it must count as "inside", otherwise a
      // mousedown closed the popover before its item's click ever fired.
      if (menuRef.current?.contains(target) === true) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // keep keyboard focus on the trigger — Escape closes, not tab-traps.
      const trigger = rootRef.current?.querySelector('button');
      trigger?.focus();
    };
    // ponytail: fixed coordinates go stale as soon as ANY container scrolls
    // (the page body, the row list, ...). Closing on scroll/resize is the
    // standard popover answer and a lot cheaper than re-anchoring.
    const close = (): void => setOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // ponytail: position BEFORE paint (no flicker). The menu must be a portal
  // with position:fixed — `absolute` inside the row got blanked by the
  // hover-lift rows (translate creates a stacking context, so later sibling
  // ROWS painted over the dropdown) and clipped by the page's overflow
  // containers. Anchored to the trigger's viewport rect: right-aligned,
  // flipped upward when the viewport has no room below, and clamped to the
  // window edges on both axes.
  useLayoutEffect(() => {
    if (!open || rootRef.current === null || menuRef.current === null || anchor === null) return;
    const button = rootRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    let top = button.bottom + 4;
    const roomBelow = menu.height + EDGE_MARGIN <= window.innerHeight - top;
    const roomAbove = button.top - menu.height - 4 >= EDGE_MARGIN;
    if (!roomBelow && roomAbove) top = button.top - menu.height - 4;
    else top = Math.min(top, Math.max(EDGE_MARGIN, window.innerHeight - menu.height - EDGE_MARGIN));
    const left = Math.min(
      Math.max(button.right - menu.width, EDGE_MARGIN),
      window.innerWidth - menu.width - EDGE_MARGIN,
    );
    setAnchor({ top, left });
  }, [open, items.length, anchor === null]); // eslint-disable-line react-hooks/exhaustive-deps

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
          if (open) {
            setOpen(false);
            return;
          }
          const rect = rootRef.current?.getBoundingClientRect();
          if (rect === undefined) return;
          // first guess: under the button, right-aligned; the layout effect
          // refines it with the measured menu box in the same paint frame.
          setAnchor({ top: rect.bottom + 4, left: Math.max(EDGE_MARGIN, rect.right - MENU_MIN_WIDTH) });
          setOpen(true);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-sm text-foreground-muted transition-colors hover:bg-hover hover:text-foreground"
      >
        <MoreVertical size={14} />
      </button>
      {open && anchor !== null
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              className="fixed z-50 min-w-[190px] rounded-md border border-border bg-surface p-1 shadow-menu"
              style={{ top: anchor.top, left: anchor.left }}
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
