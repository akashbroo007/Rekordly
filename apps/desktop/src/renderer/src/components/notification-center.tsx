import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  Download,
  HardDrive,
  Inbox,
  Puzzle,
  Upload,
  UserRound,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NotificationDto } from '@rekordly/shared/contracts';
import { Button, Dialog, DialogContent, DialogTrigger, EmptyState } from '@rekordly/ui';
import { logger } from '../lib/logger';

const LEVEL_CLASSES: Record<NotificationDto['level'], string> = {
  debug: 'bg-elevated text-foreground-muted',
  info: 'bg-primary/15 text-primary',
  warn: 'bg-warning/15 text-warning',
  error: 'bg-error/15 text-error',
  fatal: 'bg-error/15 text-error',
};

/**
 * ponytail: notifications have no kind column — they're log entries with a
 * title/message and a free-form data bag. The shape of that bag (jobId,
 * downloadId, uploadId, pluginId, creatorId, freeBytes) plus the wording of
 * the title is enough to pick a distinct icon per event family without a
 * schema migration. Order matters: mixed bags (e.g. a monitoring failure
 * carries creatorId + pluginId) resolve to the first family that fits.
 */
type NotificationKind = 'recording' | 'download' | 'upload' | 'plugin' | 'storage' | 'creator' | 'system';

const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  recording: Video,
  download: Download,
  upload: Upload,
  plugin: Puzzle,
  storage: HardDrive,
  creator: UserRound,
  system: Bell,
};

function classify(notification: NotificationDto): NotificationKind {
  const text = `${notification.title} ${notification.message}`;
  const data = notification.data ?? {};
  if (data.downloadId !== undefined || /download/i.test(text)) return 'download';
  if (data.uploadId !== undefined || /upload/i.test(text)) return 'upload';
  if (data.jobId !== undefined || data.recordingId !== undefined || /recording|auto-record|is live|went live/i.test(text)) {
    return 'recording';
  }
  if (data.freeBytes !== undefined || /disk|storage|free space/i.test(text)) return 'storage';
  if (/plugin/i.test(text) || (data.pluginId !== undefined && !/monitor/i.test(text))) return 'plugin';
  if (data.creatorId !== undefined || /monitor/i.test(text)) return 'creator';
  return 'system';
}

export function NotificationCenter() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'all' | 'unread'>('all');

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

  const unreadCount = unread ?? 0;
  const visible =
    tab === 'unread' ? (notifications ?? []).filter((notification) => !notification.read) : notifications;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell size={16} />
          {/* ponytail: a loud red count digit competed with the toolbar's
              active-recording pill — an unread state now reads as one tiny
              soft dot, with the exact count kept for screen readers. */}
          {unreadCount > 0 && (
            <>
              {/* ponytail: small, static, low-saturation — the exact count
                  stays in the sr-only text and the hover title. */}
              <span
                title={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-error/60"
              />
              <span className="sr-only">
                {typeof unread === 'number' ? unreadCount : ''} unread notification{unreadCount === 1 ? '' : 's'}
              </span>
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        headerActions={
          unreadCount > 0 ? (
            <Button variant="ghost" size="sm" loading={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
              <CheckCheck size={14} />
              Mark all read
            </Button>
          ) : undefined
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
            <div className="mb-3">
              {/* Same segmented pattern as the pages' toolbars, sized down for
                  the dialog: quiet track, primary-filled active segment. */}
              <div role="tablist" aria-label="Filter notifications" className="inline-flex rounded-md border border-border bg-surface p-0.5">
                {(['all', 'unread'] as const).map((value) => {
                  const selected = tab === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setTab(value)}
                      className={`cursor-pointer rounded-sm px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                        selected ? 'bg-primary text-white' : 'text-foreground-secondary hover:bg-hover hover:text-foreground'
                      }`}
                    >
                      {value === 'all' ? 'All' : 'Unread'}
                    </button>
                  );
                })}
              </div>
            </div>
            {visible === undefined || visible.length === 0 ? (
              <EmptyState icon={CheckCheck} title="All caught up" description="No unread notifications." />
            ) : (
              <NotificationList key={tab} notifications={visible} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NotificationList({ notifications }: { notifications: NotificationDto[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [fades, setFades] = useState({ top: false, bottom: false });

  const updateFades = useCallback((): void => {
    const element = listRef.current;
    if (element === null || element.scrollHeight <= element.clientHeight) {
      setFades({ top: false, bottom: false });
      return;
    }
    setFades({
      top: element.scrollTop > 2,
      bottom: element.scrollTop + element.clientHeight < element.scrollHeight - 2,
    });
  }, []);

  useLayoutEffect(() => {
    updateFades();
  }, [updateFades, notifications.length]);

  return (
    <div className="relative">
      <ul ref={listRef} onScroll={updateFades} className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}
      </ul>
      {/* ponytail: the fade sits on the non-scrolling wrapper so it stays
          pinned to the viewport edge while the list scrolls beneath it. */}
      {fades.top && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-elevated to-transparent" />
      )}
      {fades.bottom && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-elevated to-transparent" />
      )}
    </div>
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
  const dismiss = useMutation({
    mutationFn: () => window.desktop.notifications.dismiss(notification.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const KindIcon = KIND_ICONS[classify(notification)];

  return (
    <li
      onClick={() => {
        if (!notification.read) {
          markRead.mutate();
        }
      }}
      className={`group/item flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors hover:bg-hover ${
        notification.read ? 'border-border bg-surface' : 'border-border bg-elevated'
      }`}
    >
      {/* Unread state marker — a filled accent dot for unread, a hollow gray
          one for read, so the leading edge never shifts between rows. */}
      <span
        aria-hidden="true"
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          notification.read ? 'border border-foreground-disabled bg-transparent' : 'bg-primary'
        }`}
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${LEVEL_CLASSES[notification.level]}`}
      >
        <KindIcon size={14} />
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{notification.title}</span>
          <time
            dateTime={new Date(notification.time).toISOString()}
            className="shrink-0 text-xs text-foreground-muted transition-opacity group-focus-within/item:opacity-0 group-hover/item:opacity-0"
            title={formatFullStamp(notification.time)}
          >
            {formatRelativeTime(notification.time)}
          </time>
        </p>
        {notification.message !== '' && (
          <p className="mt-0.5 text-xs text-foreground-secondary">{notification.message}</p>
        )}
        {/* Dismiss replaces the timestamp while hovering — same corner, no
            reflow (the time keeps occupying its column). */}
        <button
          type="button"
          aria-label="Dismiss notification"
          title="Dismiss"
          disabled={dismiss.isPending}
          onClick={(event) => {
            event.stopPropagation();
            dismiss.mutate();
          }}
          className="absolute -top-0.5 right-0 flex h-5 w-5 items-center justify-center rounded-sm text-foreground-muted opacity-0 transition duration-100 hover:bg-hover hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
        >
          <X size={14} />
        </button>
      </div>
    </li>
  );
}

/** Locale-aware full stamp for tooltips. */
function formatFullStamp(time: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(time);
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
