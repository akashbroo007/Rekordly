import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Inbox, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { Button, Dialog, DialogContent, DialogTrigger, EmptyState } from '@rekordly/ui';
import type { NotificationDto } from '@rekordly/shared/contracts';
import { logger } from '../lib/logger';

const LEVEL_CLASSES: Record<NotificationDto['level'], string> = {
  debug: 'bg-elevated',
  info: 'bg-primary/15',
  warn: 'bg-warning/15',
  error: 'bg-error/15',
  fatal: 'bg-error/15',
};

export function NotificationCenter() {
  const queryClient = useQueryClient();
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => window.desktop.notifications.list(),
    refetchInterval: 15000,
  });

  const { data: unread } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => window.desktop.notifications.unreadCount(),
    refetchInterval: 15000,
  });

  useEffect(() => {
    return window.desktop.notifications.onNotification((notification) => {
      logger.debug('notification received', { id: notification.id, title: notification.title });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    });
  }, [queryClient]);

  const markAllRead = useMutation({
    mutationFn: () => window.desktop.notifications.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell size={16} />
          {(unread ?? 0) > 0 && (
            <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-error px-1 text-[9px] font-semibold text-white">
              {unread}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Notifications"
        description={
          notifications !== undefined && notifications.length > 0
            ? `${notifications.filter((n) => !n.read).length} unread`
            : undefined
        }
      >
        {notifications === undefined || notifications.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No notifications"
            description="Recording events and plugin updates will appear here."
          />
        ) : (
          <>
            <div className="mb-2 flex justify-end">
              <Button variant="ghost" size="sm" loading={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
                <CheckCheck size={14} />
                Mark all read
              </Button>
            </div>
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {notifications.map((notification) => (
                <NotificationItem key={notification.id} notification={notification} />
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NotificationItem({ notification }: { notification: NotificationDto }) {
  const queryClient = useQueryClient();
  const markRead = useMutation({
    mutationFn: () => window.desktop.notifications.markRead(notification.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  // Pro tier gate records carry an upgrade URL — render a real CTA button.
  const data = notification.data as Record<string, unknown> | undefined;
  const upgradeUrl = typeof data?.upgradeUrl === 'string' ? data.upgradeUrl : undefined;
  const isGate = data?.gate === true;

  const openUpgrade = (): void => {
    if (upgradeUrl !== undefined) {
      void window.desktop.app.openUrl(upgradeUrl);
    }
  };

  return (
    <li
      onClick={() => {
        if (!notification.read) {
          markRead.mutate();
        }
      }}
      className={`flex cursor-pointer items-start gap-3 rounded-sm border px-3 py-2 ${
        notification.read ? 'border-border bg-surface opacity-70' : 'border-border bg-elevated'
      }`}
    >
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${LEVEL_CLASSES[notification.level]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{notification.title}</span>
          <time className="shrink-0 text-[10px] text-foreground-muted" title={new Date(notification.time).toLocaleString()}>
            {formatRelativeTime(notification.time)}
          </time>
        </p>
        {notification.message !== '' && (
          <p className="mt-0.5 text-xs text-foreground-secondary">{notification.message}</p>
        )}
        {isGate && upgradeUrl !== undefined && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={(event) => {
              event.stopPropagation();
              openUpgrade();
            }}
          >
            <Sparkles size={12} />
            Upgrade to Pro
          </Button>
        )}
      </div>
    </li>
  );
}

function formatRelativeTime(time: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
