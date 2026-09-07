import * as RadixDialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function DialogContent({ title, description, children, className }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay asChild>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        />
      </RadixDialog.Overlay>
      <RadixDialog.Content asChild>
        <motion.div
          initial={{ opacity: 0, x: '-50%', y: '-50%', scale: 0.97 }}
          animate={{ opacity: 1, x: '-50%', y: '-50%', scale: 1 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className={`fixed left-1/2 top-1/2 z-50 w-full max-w-md max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-dialog ${className ?? ''}`}
        >
          <RadixDialog.Title className="text-base font-semibold text-foreground">
            {title}
          </RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="mt-1 text-sm text-foreground-muted">
              {description}
            </RadixDialog.Description>
          )}
          <div className="mt-4">{children}</div>
          <RadixDialog.Close asChild>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-sm p-1 text-foreground-muted transition-colors hover:bg-hover hover:text-foreground"
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>
          </RadixDialog.Close>
        </motion.div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
