/**
 * Menu — action / "…" overflow menus (kebab, ellipsis, context-ish triggers).
 *
 * Built on the Radix DropdownMenu primitive that backs the package's other
 * popups: portal + flip + viewport clamp, role=menu semantics, type-ahead,
 * Home/End, disabled items skipped, Esc closes with focus returned to the
 * trigger. Styling follows the shared panel: raised token, radius 10, p-1,
 * shadow-menu, one-time 120ms fade/scale.
 *
 * Item anatomy: optional icon (inherits row color) · label (500) · optional
 * muted right-aligned shortcut (tabular, e.g. "⌘D") · optional red
 * destructive item separated from the rest by a thin divider. Hover AND
 * keyboard highlight use the shared white 6% overlay — never saturated.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreVertical } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

export interface MenuItemDef {
  key: string;
  label: string;
  /** Small leading icon; inherits the row color. */
  icon?: ReactNode;
  onSelect: () => void;
  /** Red destructive item (auto-separated by a thin divider group). */
  dangerous?: boolean;
  /** Muted right-aligned shortcut hint (only where an accelerator exists). */
  shortcut?: string;
  disabled?: boolean;
  /** Optional reason surfaced as the row title. */
  disabledReason?: string;
}

export interface MenuProps {
  items: MenuItemDef[];
  /** Accessible name for trigger + menu. */
  label: string;
  /** Custom trigger; default is the shared 28px kebab icon button. */
  trigger?: ReactNode;
  /** Rendered only when defined (long pools) — otherwise always visible. */
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/** Row classes shared by normal and destructive items. */
function itemClass(item: MenuItemDef): string {
  return [
    'flex h-9 w-full select-none items-center gap-2.5 rounded-[6px] px-2.5 text-left text-sm font-medium outline-none transition-colors duration-100',
    'data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-foreground',
    'focus-visible:bg-white/[0.06] focus-visible:outline-none',
    item.disabled ? 'text-foreground-disabled data-[disabled]:pointer-events-none data-[disabled]:opacity-50' : 'cursor-pointer',
    item.dangerous === true ? 'text-error hover:bg-error/10 data-[highlighted]:bg-error/10 data-[highlighted]:text-error' : 'text-foreground-secondary',
  ].join(' ');
}

export function Menu({ items, label, trigger, align = 'end', sideOffset = 4, className, ref }: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label={label}
            title={label}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-foreground-muted transition-colors hover:bg-hover hover:text-foreground"
          >
            <MoreVertical size={14} />
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          ref={ref}
          role="menu"
          aria-label={label}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          loop
          className="dropdown-panel z-50 min-w-[200px] max-w-[min(80vw,360px)] rounded-[10px] border border-border bg-elevated p-1 shadow-menu"
        >
          {items.map((item, index) => {
            const previous = items[index - 1];
            const needsDangerDivider = item.dangerous === true && previous?.dangerous !== true;
            return (
              <DropdownMenu.Group key={item.key} className="contents">
                {needsDangerDivider && <MenuSeparator />}
                <DropdownMenu.Item
                  disabled={item.disabled}
                  onSelect={item.disabled === true ? undefined : item.onSelect}
                  className={itemClass(item)}
                  title={item.disabled === true ? (item.disabledReason ?? item.label) : undefined}
                >
                  {item.icon !== undefined && (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.shortcut !== undefined && (
                    <span className="ml-auto shrink-0 pl-4 text-xs tabular-nums text-foreground-muted" aria-hidden="true">
                      {item.shortcut}
                    </span>
                  )}
                </DropdownMenu.Item>
              </DropdownMenu.Group>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 mx-1 h-px bg-border" />;
}
