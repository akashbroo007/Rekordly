import * as RadixContextMenu from '@radix-ui/react-context-menu';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export const ContextMenu = RadixContextMenu.Root;
export const ContextMenuTrigger = RadixContextMenu.Trigger;

export interface ContextMenuContentProps {
  children: ReactNode;
  className?: string;
}

export function ContextMenuContent({ children, className }: ContextMenuContentProps) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.Content asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.1 }}
          className={`min-w-[180px] rounded-md border border-border bg-surface p-1 shadow-md ${className ?? ''}`}
        >
          {children}
        </motion.div>
      </RadixContextMenu.Content>
    </RadixContextMenu.Portal>
  );
}

export interface ContextMenuItemProps {
  children: ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function ContextMenuItem({ children, onClick, destructive, disabled }: ContextMenuItemProps) {
  return (
    <RadixContextMenu.Item
      onClick={onClick}
      disabled={disabled}
      className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors ${
        destructive
          ? 'text-error hover:bg-error/10'
          : 'text-foreground-secondary hover:bg-hover hover:text-foreground'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </RadixContextMenu.Item>
  );
}

export function ContextMenuSeparator() {
  return <RadixContextMenu.Separator className="my-1 h-px bg-border" />;
}

export const ContextMenuSub = RadixContextMenu.Sub;

export interface ContextMenuSubTriggerProps {
  children: ReactNode;
  disabled?: boolean;
}

export function ContextMenuSubTrigger({ children, disabled }: ContextMenuSubTriggerProps) {
  return (
    <RadixContextMenu.SubTrigger
      disabled={disabled}
      className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors text-foreground-secondary data-[state=open]:bg-hover data-[state=open]:text-foreground hover:bg-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </RadixContextMenu.SubTrigger>
  );
}

export interface ContextMenuSubContentProps {
  children: ReactNode;
  className?: string;
}

export function ContextMenuSubContent({ children, className }: ContextMenuSubContentProps) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.SubContent
        className={`min-w-[160px] max-h-64 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-md ${className ?? ''}`}
      >
        {children}
      </RadixContextMenu.SubContent>
    </RadixContextMenu.Portal>
  );
}
