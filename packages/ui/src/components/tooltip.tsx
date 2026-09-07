import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side="right"
            className="z-50 rounded-sm border border-border bg-elevated px-2 py-1 text-xs text-foreground-secondary shadow-menu"
          >
            {content}
            <RadixTooltip.Arrow className="fill-elevated" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
