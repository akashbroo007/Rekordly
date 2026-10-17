import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * ponytail: the main process forwards every NotificationService record over
 * IPC — this bridge keeps the Notification Center badge live.
 */
export function useNotificationEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = window.desktop.notifications.onNotification(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    });
    return unsubscribe;
  }, [queryClient]);
}
