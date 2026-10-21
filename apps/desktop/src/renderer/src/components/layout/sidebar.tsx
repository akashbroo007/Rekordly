import {
  BarChart3,
  CloudUpload,
  Download,
  LayoutDashboard,
  Library,
  Puzzle,
  ScrollText,
  Settings,
  Shield,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RECORDING_ROW_ACTIVE_STATUSES } from '../../pages/recordings/recording-row';
import type { DownloadQueueItemDto, RecordingJobDto, UploadQueueItemDto } from '@rekordly/shared/contracts';

/* ------------------------------------------------------------------ */
/*  Sidebar — grouped navigation with static count badges              */
/*                                                                     */
/*  · groups separated by spacing, rows 36px tall, 2px gap, radius 8   */
/*  · inactive: secondary text/icons · hover: +4% white (120ms bg-only)*/
/*  · active: transparent background, 3px × 18px accent bar flush to   */
/*    the sidebar's left edge, primary text color, accent icon         */
/*  · badges: static, right-aligned, tabular numbers, hidden when 0    */
/*  · Settings pinned to the bottom, separated by a hairline           */
/* ------------------------------------------------------------------ */

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Stable selector used by the first-launch spotlight tour. */
  tourId?: string;
  /** Which live counter (if any) is right-aligned on the row. */
  badge?: 'live' | 'active-recordings' | 'failed-recordings' | 'active-downloads' | 'active-uploads';
  /** Badge color family. */
  tone?: 'success' | 'error' | 'primary';
}

const NAV_GROUPS: readonly NavItem[][] = [
  [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, tourId: 'nav-dashboard' }],
  [
    { to: '/creators', label: 'Creators', icon: Users, tourId: 'nav-creators', badge: 'live', tone: 'success' },
    {
      to: '/recordings',
      label: 'Recordings',
      icon: Video,
      tourId: 'nav-recordings',
      badge: 'active-recordings',
      tone: 'error',
    },
    { to: '/library', label: 'Library', icon: Library, tourId: 'nav-library' },
  ],
  [
    { to: '/downloads', label: 'Downloads', icon: Download, tourId: 'nav-downloads', badge: 'active-downloads', tone: 'primary' },
    { to: '/uploads', label: 'Uploads', icon: CloudUpload, badge: 'active-uploads', tone: 'primary' },
  ],
  [
    { to: '/plugins', label: 'Plugins', icon: Puzzle, tourId: 'nav-plugins' },
    { to: '/proxy', label: 'Secure Proxy', icon: Shield },
    { to: '/analytics', label: 'Analytics', icon: BarChart3, tourId: 'nav-analytics' },
    { to: '/logs', label: 'Logs', icon: ScrollText, tourId: 'nav-logs' },
  ],
];

/**
 * ponytail: the Secure Proxy entry only materializes once the user has
 * enabled the proxy for any creator (latched `secureProxyUsed` app setting).
 * No tourId on purpose — the first-launch spotlight tour must not target a
 * nav item most users never see.
 */
function useProxyNavVisible(): boolean {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => window.desktop.settings.getAll(),
    staleTime: Infinity,
  });
  return settings?.secureProxyUsed === true;
}

/** Badge payload resolved from cached/polled data the app already exposes. */
interface NavBadge {
  count: number;
  tone: 'success' | 'error' | 'primary';
}

function useNavBadges(): Record<string, NavBadge | undefined> {
  // Live creators (green) — same cache as the dashboard's monitoring card.
  const { data: monitorDashboard } = useQuery({
    queryKey: ['monitoring-dashboard'],
    queryFn: () => window.desktop.monitoring.getDashboard(),
    refetchInterval: 10000,
  });

  // Recording jobs — shared with the Recordings page / toolbar pill.
  const { data: recordingJobs } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
    refetchInterval: 5000,
  });

  // Download / upload queues — active (in-flight) counts.
  const { data: downloads } = useQuery({
    queryKey: ['downloads', 'all'],
    queryFn: () => window.desktop.downloads.list(),
    refetchInterval: 10000,
    staleTime: 5000,
  });
  const { data: uploads } = useQuery({
    queryKey: ['uploads', 'all'],
    queryFn: () => window.desktop.uploads.list(),
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const jobs = recordingJobs ?? [];
  const activeRecordings = jobs.filter((j: RecordingJobDto) => RECORDING_ROW_ACTIVE_STATUSES.includes(j.status)).length;
  const failedRecordings = jobs.filter((j: RecordingJobDto) => j.status === 'failed').length;
  const activeDownloads = (downloads ?? []).filter((d: DownloadQueueItemDto) =>
    ['downloading', 'queued', 'paused'].includes(d.status),
  ).length;
  const activeUploads = (uploads ?? []).filter((u: UploadQueueItemDto) =>
    ['uploading', 'queued', 'paused'].includes(u.status),
  ).length;

  const liveBadge: NavBadge | undefined =
    (monitorDashboard?.liveCreators ?? 0) > 0 ? { count: monitorDashboard!.liveCreators, tone: 'success' } : undefined;
  // Recordings shows the active pipeline; when idle it surfaces failed count
  // (the app already tracks both — no extra data source invented).
  const recordingsBadge: NavBadge | undefined =
    activeRecordings > 0
      ? { count: activeRecordings, tone: 'error' }
      : failedRecordings > 0
        ? { count: failedRecordings, tone: 'error' }
        : undefined;

  return {
    '/creators': liveBadge,
    '/recordings': recordingsBadge,
    '/downloads': activeDownloads > 0 ? { count: activeDownloads, tone: 'primary' } : undefined,
    '/uploads': activeUploads > 0 ? { count: activeUploads, tone: 'primary' } : undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Row chrome                                                         */
/* ------------------------------------------------------------------ */

const BADGE_TONE_CLASSES: Record<NavBadge['tone'], string> = {
  success: 'bg-success/15 text-success',
  error: 'bg-error/15 text-error',
  primary: 'bg-primary-soft text-primary',
};

function NavBadgeChip({ badge }: { badge: NavBadge }) {
  return (
    <span
      className={`flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-sm px-1 text-xs font-medium leading-none tabular-nums ${
        BADGE_TONE_CLASSES[badge.tone]
      }`}
    >
      {badge.count}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

export function Sidebar() {
  const proxyNavVisible = useProxyNavVisible();
  const badges = useNavBadges();

  const badgeFor = (item: NavItem): NavBadge | undefined => (item.badge ? badges[item.to] : undefined);

  // ponytail: active rows carry no background fill — the selection signal is
  // a 3px × 18px accent bar on a ::before, placed at the row's left edge so it
  // sits 8px in from the sidebar edge (aligned with the hover pill edge, a
  // step in toward the icons). The pseudo-element keeps geometry identical
  // between active/inactive rows.
  const rowClass = (active: boolean): string =>
    `relative flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-[background-color] duration-[120ms] ease-out ${
      active
        ? 'text-foreground before:absolute before:top-1/2 before:left-0 before:h-4.5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-[3px] before:bg-primary before:content-[""]'
        : 'text-foreground-secondary hover:bg-white/[0.04]'
    }`;

  const renderRow = (item: NavItem): ReactNode => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      data-tour-id={item.tourId}
      className={({ isActive }) => rowClass(isActive)}
    >
      {({ isActive }) => {
        const badge = badgeFor(item);
        return (
          <>
            <item.icon
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
              className={`shrink-0 transition-colors duration-150 ${isActive ? 'text-primary' : 'text-foreground-secondary'}`}
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {badge !== undefined && <NavBadgeChip badge={badge} />}
          </>
        );
      }}
    </NavLink>
  );

  const visibleGroups = NAV_GROUPS.map((group) =>
    group.filter((item) => item.to !== '/proxy' || proxyNavVisible),
  );

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-panel">
      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
        {visibleGroups.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-0.5">
            {group.map((item) => renderRow(item))}
          </div>
        ))}
      </nav>

      {/* Bottom cluster: Settings pinned to the bottom, matching row chrome */}
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-border px-2 py-2">
        {renderRow({ to: '/settings', label: 'Settings', icon: Settings, tourId: 'nav-settings' })}
      </div>
    </aside>
  );
}
