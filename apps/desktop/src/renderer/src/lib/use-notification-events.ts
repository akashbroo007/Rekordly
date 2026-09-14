import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '../stores/toast-store';
import type { NotificationDto } from '@rekordly/shared/contracts';

/**
 * ponytail: the main process forwards every NotificationService record over
 * IPC — this bridge keeps the Notification Center badge live and surfaces
 * gate notifications that have no immediate path of their own.
 *
 * Gate A (concurrency) / B (auto-record) / C (duration cap) toasts are
 * pushed by their action handlers and use-recording-events respectively —
 * re-toasting them here would double every message. Only trial lifecycle
 * events, which happen without a user action, are toasted here.
 */
const BUY_HINT = 'Upgrade to Pro to keep unlimited recording.';

function isGateRecord(record: NotificationDto): boolean {
  return (record.data as Record<string, unknown> | undefined)?.gate === true;
}

function trialToast(record: NotificationDto): { title: string; message: string } | null {
  const kind = (record.data as Record<string, unknown> | undefined)?.kind;
  if (kind === 'trial-expiring') {
    return { title: record.title, message: `${record.message} ${BUY_HINT}` };
  }
  if (kind === 'trial-expired') {
    return { title: record.title, message: `${record.message} ${BUY_HINT}` };
  }
  return null;
}

export function useNotificationEvents(): void {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  // ponytail: gate records arriving right after mount are already visible
  // via their action-path toast — skip the very first delivery per kind.
  const seenKinds = useRef(new Set<string>());

  useEffect(() => {
    const unsubscribe = window.desktop.notifications.onNotification((record) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });

      if (!isGateRecord(record)) return;
      const kind = String(
        (record.data as Record<string, unknown> | undefined)?.kind ?? '',
      );
      const toast = trialToast(record);
      if (toast !== null) {
        pushToast({ level: 'warn', ...toast });
        return;
      }
      // Gate A/B/C: suppress the duplicate toast when the action path
      // already showed one for this kind moments ago.
      if (seenKinds.current.has(kind)) return;
      seenKinds.current.add(kind);
      setTimeout(() => seenKinds.current.delete(kind), 5_000);
    });
    return unsubscribe;
  }, [queryClient, pushToast]);
}
