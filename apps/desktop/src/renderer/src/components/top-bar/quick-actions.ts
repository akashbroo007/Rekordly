/**
 * Shared quick actions — the exact "add" flows the "+ New" menu and the
 * command palette's Actions section both run. Every action reuses the
 * existing dialog / IPC of the owning page; nothing here is new logic.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '../../stores/toast-store';
import { friendlyErrorMessage } from '../../lib/errors';

/**
 * ponytail: the "Install plugin" flow — the same IPC + toast shape the
 * Plugins page uses (native folder picker in main; `null` = user cancelled,
 * which must stay silent).
 */
export function usePluginInstallAction(): () => void {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  return useCallback(() => {
    void window.desktop.plugins
      .installFromDirectory()
      .then((installed) => {
        void queryClient.invalidateQueries({ queryKey: ['plugins'] });
        if (installed !== null) {
          pushToast({
            level: 'info',
            title: 'Plugin installed',
            message: `${installed.name} is ready to use.`,
          });
        }
      })
      .catch((error: unknown) => {
        pushToast({
          level: 'warn',
          title: 'Could not install plugin',
          message: friendlyErrorMessage(error),
        });
      });
  }, [queryClient, pushToast]);
}
