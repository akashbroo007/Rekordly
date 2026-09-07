import {
  BarChart3,
  CloudUpload,
  Download,
  LayoutDashboard,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  ScrollText,
  Settings,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Button, Tooltip } from '@rekordly/ui';
import { useSidebarStore } from '../../stores/sidebar-store';
import { useMediaQuery } from '../../lib/use-media-query';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Stable selector used by the first-launch spotlight tour. */
  tourId?: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, tourId: 'nav-dashboard' },
  { to: '/creators', label: 'Creators', icon: Users, tourId: 'nav-creators' },
  { to: '/recordings', label: 'Recordings', icon: Video, tourId: 'nav-recordings' },
  { to: '/library', label: 'Library', icon: Library, tourId: 'nav-library' },
  { to: '/downloads', label: 'Downloads', icon: Download, tourId: 'nav-downloads' },
  { to: '/uploads', label: 'Uploads', icon: CloudUpload },
  { to: '/plugins', label: 'Plugins', icon: Puzzle, tourId: 'nav-plugins' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, tourId: 'nav-analytics' },
  { to: '/logs', label: 'Logs', icon: ScrollText, tourId: 'nav-logs' },
  { to: '/settings', label: 'Settings', icon: Settings, tourId: 'nav-settings' },
];

export function Sidebar() {
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggle = useSidebarStore((state) => state.toggle);

  // ponytail: auto-collapse to the icon rail on narrow windows so content
  // always gets room; the manual toggle still works on wider sizes.
  const narrow = useMediaQuery('(max-width: 900px)');
  const isCollapsed = collapsed || narrow;

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-border bg-panel transition-[width] duration-150 ${
        isCollapsed ? 'w-[72px]' : 'w-[260px]'
      }`}
    >
      <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-tour-id={item.tourId}
                className={({ isActive }) =>
                  `flex h-9 items-center gap-3 rounded-sm px-3 text-sm transition-colors duration-150 ${
                    isCollapsed ? 'w-fit mx-auto justify-center px-0' : ''
                  } ${
                    isActive
                    ? 'bg-primary/10 font-medium text-foreground'
                    : 'text-foreground-secondary hover:bg-hover/60 hover:text-foreground'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`relative flex shrink-0 items-center justify-center ${
                      isCollapsed ? 'size-9' : ''
                    }`}
                  >
                    {isCollapsed && isActive && (
                      <span aria-hidden="true" className="absolute inset-0 rounded-sm bg-primary/10" />
                    )}
                    <item.icon
                      size={16}
                      className={`relative z-10 shrink-0 ${isActive ? 'text-primary' : ''}`}
                    />
                  </span>
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </>
              )}
            </NavLink>
          );
          return isCollapsed ? (
            <Tooltip key={item.to} content={item.label}>
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-2">
        <Button
          variant="ghost"
          size={isCollapsed ? 'icon' : 'md'}
          className={isCollapsed ? '' : 'w-full'}
          onClick={toggle}
          disabled={narrow}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!isCollapsed && 'Collapse'}
        </Button>
      </div>
    </aside>
  );
}
