import { useEffect, useState } from 'react';
import {
  Check,
  Eye,
  Heart,
  Pause,
  Pencil,
  Play,
  Radio,
  Trash2,
  Zap,
} from 'lucide-react';
import type { CreatorDto, CreatorTagDto, MonitoringJobDto } from '@rekordly/shared';
import { Badge, Button, Switch, Tooltip } from '@rekordly/ui';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@rekordly/ui';
import { PlatformBadge } from '../../components/badges';
import { KebabMenu } from '../../components/kebab-menu';

/** Resolved card state the parent page computes from monitoring/recording data. */
export type CreatorCardStatus = 'live' | 'offline' | 'recording';

export interface CreatorCardCallbacks {
  onToggleFavorite: (creator: CreatorDto) => void;
  onToggleAutoRecord: (creator: CreatorDto) => void;
  onDetails: (creator: CreatorDto) => void;
  onRecord: (creator: CreatorDto) => void;
  onEdit: (creator: CreatorDto) => void;
  onDelete: (creator: CreatorDto) => void;
  /** Pause/resume the monitoring job for this creator (via monitor id). */
  onPauseMonitoring: (creator: CreatorDto) => void;
  /** Clicking a platform badge filters the page to that site. */
  onFilterPlatform: (pluginId: string) => void;
  onAssignTag: (creator: CreatorDto, tagId: string) => void;
  onRemoveTag: (creator: CreatorDto, tagId: string) => void;
  onToggleSelect: (creatorId: string) => void;
}

export interface CreatorCardProps extends CreatorCardCallbacks {
  /** Resolved card state — recording outranks live. */
  status: CreatorCardStatus;
  /** Plugin id — drives the brand-tinted platform badge. */
  platformId: string;
  platformName: string;
  avatarUrl?: string | null;
  /** Live viewer count; omitted when not observable. */
  viewers?: number;
  /** Epoch ms the creator was last seen/recorded live; null = never. */
  lastLiveAt?: number | null;
  isFavorite: boolean;
  /** startedAt of the active recording job, for the REC elapsed badge. */
  recordingStartedAt?: string | null;
  /** Full dto — owned by the page, used for actions/context menu (not visuals). */
  creator: CreatorDto;
  job?: MonitoringJobDto;
  tags: CreatorTagDto[];
  allTags: CreatorTagDto[];
  selected: boolean;
  view: 'grid' | 'list';
}

// --- formatting helpers ------------------------------------------------------

function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${count / 1_000_000 >= 10 ? Math.round(count / 1_000_000) : Number((count / 1_000_000).toFixed(1))}M`;
  if (count >= 1_000) return `${count / 1_000 >= 10 ? Math.round(count / 1_000) : Number((count / 1_000).toFixed(1))}K`;
  return `${count}`;
}

/** "Last live 3h ago" (or "Never seen live" when there is no data). */
function formatLastLive(lastLiveAt?: number | null, now = Date.now()): string {
  if (!lastLiveAt) return 'Never seen live';
  const seconds = Math.max(0, Math.floor((now - lastLiveAt) / 1000));
  if (seconds < 45) return 'Last live just now';
  if (seconds < 3600) return `Last live ${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86_400) return `Last live ${Math.floor(seconds / 3600)}h ago`;
  return `Last live ${Math.floor(seconds / 86_400)}d ago`;
}

/** h:mm:ss / mm:ss elapsed-since string for the REC badge. */
function formatElapsed(startedAt?: string | null, now = Date.now()): string | null {
  if (!startedAt) return null;
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return null;
  const total = Math.max(0, Math.floor((now - startMs) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = `${m}`.padStart(2, '0');
  const ss = `${s}`.padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function statusText(job?: MonitoringJobDto): string {
  if (job?.state === 'failed') return 'Checks failing — will retry';
  if (job?.state === 'paused') return 'Monitoring paused';
  if (job?.state === 'retrying') return 'Retrying…';
  return 'Monitored — waiting for live';
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

// --- small building blocks ----------------------------------------------------

/** Re-renders its owner every second — used only for elapsed-time badges. */
function useHeartbeat(intervalMs = 1000): void {
  const [, tickState] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tickState((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

function PingDot({ tone = 'success' }: { tone?: 'success' | 'error' }) {
  const color = tone === 'error' ? 'bg-error' : 'bg-success';
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />;
}

// ponytail: PlatformBadge and the kebab menu now live in components/
// (shared with the Recordings page) — both pages stay visually identical.

/** Initials fallback — colored gradient block, not a generic user icon. */
const FALLBACK_AVATAR_PALETTE: readonly [string, string] = ['#334155', '#475569'];

const AVATAR_PALETTES: Array<readonly [string, string]> = [
  ['#312e81', '#4338ca'],
  ['#064e3b', '#0f766e'],
  ['#3b0764', '#6d28d9'],
  ['#7f1d1d', '#b91c1c'],
  ['#78350f', '#b45309'],
  ['#0e7490', '#0891b2'],
  ['#334155', '#475569'],
];

function initialsFor(displayName: string): string {
  const words = displayName.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const first = words[0];
  if (first === undefined) return '?';
  const second = words[1];
  if (second === undefined) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

/** Green ring when live, desaturated when offline, initials-only fallback. */
function CreatorAvatar({
  avatarUrl,
  displayName,
  size,
  status,
}: {
  avatarUrl?: string | null;
  displayName: string;
  size: 'md' | 'sm';
  status: CreatorCardStatus;
}) {
  const [broken, setBroken] = useState(false);
  const boxClass = size === 'md' ? 'h-12 w-12 text-sm' : 'h-8 w-8 text-xs';
  const ringClass =
    status === 'live'
      ? ' ring-2 ring-success/70 ring-offset-2 ring-offset-surface'
      : status === 'recording'
        ? ' ring-2 ring-error/70 ring-offset-2 ring-offset-surface'
        : '';
  const tintClass = status === 'offline' ? 'saturate-50 opacity-75' : '';
  const palette =
    AVATAR_PALETTES[hashString(displayName.toLowerCase()) % AVATAR_PALETTES.length] ??
    FALLBACK_AVATAR_PALETTE;

  return (
    <div className={`relative shrink-0 rounded-full${ringClass}`}>
      {avatarUrl && !broken ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className={`${boxClass} rounded-full object-cover ${tintClass}`}
        />
      ) : (
        <span
          className={`${boxClass} flex items-center justify-center rounded-full font-semibold text-white ${tintClass}`}
          style={{ backgroundImage: `linear-gradient(135deg, ${palette[0]}, ${palette[1]})` }}
          aria-hidden="true"
        >
          {initialsFor(displayName)}
        </span>
      )}
      {status === 'recording' && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-error"
        />
      )}
    </div>
  );
}

/** Red REC pill with a ticking elapsed time (queued/preparing runs too). */
function RecordElapsedBadge({ startedAt }: { startedAt?: string | null }) {
  useHeartbeat(1000);
  const elapsed = formatElapsed(startedAt);
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-error/50 bg-error/15 px-1.5 py-0.5 text-xs font-semibold leading-none text-error">
      <PingDot tone="error" />
      REC{elapsed !== null && <span className="tabular-nums">{elapsed}</span>}
    </span>
  );
}

// --- the card ------------------------------------------------------------------

export function CreatorCard({
  status,
  platformId,
  platformName,
  avatarUrl,
  viewers,
  lastLiveAt,
  isFavorite,
  recordingStartedAt,
  creator,
  job,
  tags,
  allTags,
  selected,
  view,
  onToggleFavorite,
  onToggleAutoRecord,
  onDetails,
  onRecord,
  onEdit,
  onDelete,
  onPauseMonitoring,
  onFilterPlatform,
  onAssignTag,
  onRemoveTag,
  onToggleSelect,
}: CreatorCardProps) {
  const isRecording = status === 'recording';
  const isLive = status === 'live';
  const isOffline = status === 'offline';
  const isMonitoringPaused = job?.state === 'paused';
  const isMonitoringIssue = job?.state === 'failed' || isMonitoringPaused || job?.state === 'retrying';
  // ponytail: handle is redundant when it already matches the display name.
  const sameHandle = creator.username.toLowerCase() === creator.displayName.toLowerCase();
  const viewerText = typeof viewers === 'number' ? formatViewerCount(viewers) : undefined;

  const menuContent = (
    <ContextMenuContent>
      <ContextMenuItem onClick={() => onDetails(creator)}>View details</ContextMenuItem>
      <ContextMenuItem onClick={() => onEdit(creator)}>
        <Pencil size={13} /> Edit
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onPauseMonitoring(creator)}>
        {isMonitoringPaused ? <Play size={13} /> : <Pause size={13} />}
        {isMonitoringPaused ? 'Resume monitoring' : 'Pause monitoring'}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onToggleFavorite(creator)}>
        <Heart size={13} className={isFavorite ? 'fill-warning text-warning' : ''} />
        {isFavorite ? 'Remove favorite' : 'Add to favorites'}
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>Tags…</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {allTags.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-foreground-muted">No tags yet — create some via the Tags button.</p>
          )}
          {allTags.map((tag) => {
            const assigned = tags.some((t) => t.id === tag.id);
            return (
              <ContextMenuItem
                key={tag.id}
                onClick={() => (assigned ? onRemoveTag(creator, tag.id) : onAssignTag(creator, tag.id))}
              >
                <span className="flex w-4 justify-center">
                  {assigned && <Check size={12} className="text-primary" />}
                </span>
                {tag.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />}
                {tag.name}
              </ContextMenuItem>
            );
          })}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onToggleAutoRecord(creator)}>
        <Zap size={13} className={creator.autoRecord ? 'fill-primary text-primary' : ''} />
        {creator.autoRecord ? 'Disable auto-record' : 'Enable auto-record'}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onRecord(creator)} disabled={!isLive}>
        <Radio size={13} /> Record now
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem destructive onClick={() => onDelete(creator)}>
        <Trash2 size={13} /> Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );

  const selectionCheckbox = (
    <button
      type="button"
      aria-label={selected ? 'Deselect creator' : 'Select creator'}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelect(creator.id);
      }}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border transition-all ${
        selected
          ? 'border-primary bg-primary text-white opacity-100'
          : 'border-border bg-elevated opacity-0 group-hover:opacity-100'
      }`}
    >
      {selected && <Check size={11} strokeWidth={3} />}
    </button>
  );

  const nameButton = (
    <button
      type="button"
      onClick={() => onDetails(creator)}
      className="min-w-0 cursor-pointer truncate text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
      aria-label={`Details for ${creator.displayName}`}
    >
      {creator.displayName}
    </button>
  );

  const topRightActions = (
    <div className="flex shrink-0 items-center gap-0.5">
      <Tooltip
        content={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <button
          type="button"
          onClick={() => onToggleFavorite(creator)}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={isFavorite}
          className="flex h-7 w-7 items-center justify-center rounded-sm transition-colors hover:bg-hover"
        >
          <Heart
            size={15}
            className={isFavorite ? 'fill-warning text-warning' : 'text-foreground-muted hover:text-warning'}
          />
        </button>
      </Tooltip>
      <KebabMenu
        items={[
          { key: 'details', label: 'View details', icon: <Eye size={13} />, onSelect: () => onDetails(creator) },
          { key: 'edit', label: 'Edit', icon: <Pencil size={13} />, onSelect: () => onEdit(creator) },
          {
            key: 'monitoring',
            label: isMonitoringPaused ? 'Resume monitoring' : 'Pause monitoring',
            icon: isMonitoringPaused ? <Play size={13} /> : <Pause size={13} />,
            onSelect: () => onPauseMonitoring(creator),
          },
          { key: 'remove', label: 'Remove', icon: <Trash2 size={13} />, dangerous: true, onSelect: () => onDelete(creator) },
        ]}
      />
    </div>
  );

  const tagBadges = tags.slice(0, isOffline ? 2 : 4).map((t) => (
    <Badge
      key={t.id}
      variant="muted"
      className="cursor-pointer text-xs hover:text-error"
      onClick={() => onRemoveTag(creator, t.id)}
      title="Click to remove this tag"
    >
      {t.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />}
      {t.name}
    </Badge>
  ));

  const metaRow = (
    <div className="flex flex-wrap items-center gap-1.5">
      <PlatformBadge pluginId={platformId} platformName={platformName} onFilterPlatform={onFilterPlatform} />
      {viewerText !== undefined && (
        <span
          title={`${viewers} watching`}
          className="inline-flex items-center gap-1 rounded-sm border border-border bg-panel px-1.5 py-0.5 text-xs text-foreground-secondary"
        >
          <Eye size={11} className="text-foreground-muted" aria-hidden="true" />
          <span className="font-medium tabular-nums leading-none">{viewerText}</span>
        </span>
      )}
      {tagBadges}
    </div>
  );

  // --- grid card ---------------------------------------------------------------

  const shellClasses =
    isOffline
      ? // Quiet: low-contrast surface, tight spacing — clearly secondary.
        `gap-2.5 rounded-md border border-border bg-surface p-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 ${selected ? 'bg-primary/5 ring-1 ring-primary/50 ring-offset-1 ring-offset-surface' : ''}`
      : isRecording
        ? `gap-3 rounded-md border-2 border-error/60 bg-elevated p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-error/80 ${selected ? 'ring-2 ring-primary/70' : ''}`
        : // Live: brighter surface + plain 1px green border (no glow — per user preference).
          `gap-3 rounded-md border border-success/60 bg-elevated p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-success/80 ${selected ? 'ring-2 ring-primary/70' : ''}`;

  const gridCard = (
    <div data-status={status} className={`group relative flex flex-col overflow-visible ${shellClasses}`}>
      <span className="absolute left-2 top-2 z-10">{selectionCheckbox}</span>

      {/* Identity row */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onDetails(creator)}
          aria-label={`Details for ${creator.displayName}`}
          className="cursor-pointer"
        >
          <CreatorAvatar
            avatarUrl={avatarUrl}
            displayName={creator.displayName}
            size="md"
            status={isOffline ? 'offline' : status}
          />
        </button>
        <div className="min-w-0 flex-1 space-y-1 pt-0.5">
          <div className="flex items-center gap-2">
            {nameButton}
            {isRecording ? (
              <RecordElapsedBadge startedAt={recordingStartedAt} />
            ) : isLive ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 text-xs font-semibold leading-none text-success">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" /> Live
              </span>
            ) : null}
          </div>
          {!sameHandle && (
            <p className="truncate text-xs leading-none text-foreground-muted">@{creator.username}</p>
          )}
        </div>
        {topRightActions}
      </div>

      {metaRow}

      {creator.notes && (
        <p className="line-clamp-2 border-l-2 border-border pl-2 text-xs leading-relaxed text-foreground-muted">
          {creator.notes}
        </p>
      )}

      {/* Action row — no divider, no extra footer padding */}
      {isOffline ? (
        <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
          <p className="flex min-w-0 items-center gap-1.5 text-xs leading-none text-foreground-muted">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${isMonitoringIssue ? 'bg-warning' : 'bg-foreground-disabled'}`}
            />
            <span className="truncate text-foreground-secondary">
              {isMonitoringIssue ? statusText(job) : 'Offline'}
            </span>
            <span aria-hidden="true" className="text-foreground-disabled">·</span>
            <span className="truncate" title={lastLiveAt ? new Date(lastLiveAt).toLocaleString() : undefined}>
              {formatLastLive(lastLiveAt)}
            </span>
          </p>
          {/* Record button → "Auto-record when live" switch (the app ships per-creator auto-record). */}
          <span
            title={
              creator.autoRecord
                ? 'Auto-record ON — recording starts automatically whenever this creator goes live. Click the switch to disable.'
                : 'Auto-record OFF — click the switch to record automatically whenever this creator goes live.'
            }
            className="flex shrink-0 items-center gap-1.5 text-xs text-foreground-secondary"
          >
            <Switch
              checked={creator.autoRecord}
              onCheckedChange={() => onToggleAutoRecord(creator)}
              aria-label={`Auto-record when ${creator.displayName} goes live`}
            />
            <Zap
              size={12}
              className={creator.autoRecord ? 'fill-primary text-primary' : 'text-foreground-disabled'}
            />
            Auto-record
          </span>
        </div>
      ) : (
        <div className="mt-auto">
          <Button
            className="h-9 w-full"
            disabled={isRecording}
            title={isRecording ? 'Already recording this creator.' : undefined}
            onClick={() => onRecord(creator)}
          >
            <span className="h-2 w-2 rounded-full bg-white" aria-hidden="true" />
            {isRecording ? 'Recording…' : 'Record Now'}
          </Button>
        </div>
      )}
    </div>
  );

  // --- list row ----------------------------------------------------------------

  const listRow = (
    <div
      className={`group relative flex items-center gap-3 rounded-sm border bg-surface px-3 py-2 transition-all duration-150 hover:border-primary/40 hover:bg-elevated/60 ${
        selected ? 'border-primary/60 bg-primary/5' : 'border-border'
      }`}
    >
      <span
        className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-full ${
          isRecording ? 'bg-error' : isLive ? 'bg-success' : isMonitoringIssue ? 'bg-warning' : 'bg-border'
        }`}
      />
      <span className="ml-1">{selectionCheckbox}</span>
      <button
        type="button"
        className="cursor-pointer"
        onClick={() => onDetails(creator)}
        aria-label={`Details for ${creator.displayName}`}
      >
        <CreatorAvatar
          avatarUrl={avatarUrl}
          displayName={creator.displayName}
          size="sm"
          status={isOffline ? 'offline' : status}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {nameButton}
          {isRecording ? (
            <RecordElapsedBadge startedAt={recordingStartedAt} />
          ) : isLive ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 text-xs font-semibold leading-none text-success">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" /> Live
            </span>
          ) : null}
          {creator.autoRecord && !isLive && !isRecording && (
            <Badge variant="info" className="text-xs">
              Auto
            </Badge>
          )}
        </div>
        <p className="truncate text-xs leading-none text-foreground-muted">
          {!sameHandle ? `@${creator.username}` : '\u00A0'}
        </p>
      </div>
      <div className="hidden w-28 shrink-0 md:block">
        <PlatformBadge pluginId={platformId} platformName={platformName} onFilterPlatform={onFilterPlatform} />
      </div>
      <div className="hidden w-36 shrink-0 lg:block">
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((t) => (
              <Badge key={t.id} variant="muted" className="text-xs">
                {t.name}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-foreground-muted">—</span>
        )}
      </div>
      <div className="w-36 shrink-0 text-right">
        {isRecording ? (
          <span className="flex items-center justify-end gap-1.5 text-xs font-medium text-error">
            <span className="h-1.5 w-1.5 rounded-full bg-error" aria-hidden="true" />
            <span className="truncate tabular-nums">
              REC {formatElapsed(recordingStartedAt) ?? '0:00'}
            </span>
          </span>
        ) : isLive ? (
          <span className="flex items-center justify-end gap-1.5 text-xs font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            {viewerText !== undefined ? `${viewerText} watching` : 'Live'}
          </span>
        ) : (
          <span className="flex items-center justify-end gap-1.5 text-xs leading-none text-foreground-muted">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${isMonitoringIssue ? 'bg-warning' : 'bg-foreground-disabled'}`}
            />
            <span className="truncate">
              {isMonitoringIssue ? statusText(job) : 'Offline'} · <span title={lastLiveAt ? new Date(lastLiveAt).toLocaleString() : undefined}>{formatLastLive(lastLiveAt)}</span>
            </span>
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className={isFavorite ? 'text-warning' : 'text-foreground-muted hover:text-warning'}
          onClick={() => onToggleFavorite(creator)}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart size={14} className={isFavorite ? 'fill-warning' : ''} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={
            creator.autoRecord
              ? 'bg-primary/15 text-primary hover:bg-primary/25'
              : 'text-foreground-muted hover:bg-primary/10 hover:text-primary'
          }
          onClick={() => onToggleAutoRecord(creator)}
          aria-label={creator.autoRecord ? 'Disable auto-record' : 'Enable auto-record'}
          title={
            creator.autoRecord
              ? 'Auto-record ON — records automatically whenever this creator goes live. Click to disable.'
              : 'Auto-record OFF — click to record this creator automatically whenever they go live.'
          }
        >
          <Zap size={14} className={creator.autoRecord ? 'fill-primary' : ''} />
        </Button>
        {isRecording ? (
          <Button
            size="sm"
            variant="secondary"
            disabled
            title="Already recording this creator."
          >
            <span className="h-2 w-2 rounded-full bg-error" aria-hidden="true" />
            REC
          </Button>
        ) : isLive ? (
          <Button size="sm" onClick={() => onRecord(creator)}>
            <span className="h-2 w-2 rounded-full bg-white" aria-hidden="true" />
            Record
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled title={`${creator.displayName} is offline — auto-record can still capture them.`}>
            <Radio size={13} />
          </Button>
        )}
        <KebabMenu
          items={[
            { key: 'details', label: 'View details', icon: <Eye size={13} />, onSelect: () => onDetails(creator) },
            { key: 'edit', label: 'Edit', icon: <Pencil size={13} />, onSelect: () => onEdit(creator) },
            {
              key: 'monitoring',
              label: isMonitoringPaused ? 'Resume monitoring' : 'Pause monitoring',
              icon: isMonitoringPaused ? <Play size={13} /> : <Pause size={13} />,
              onSelect: () => onPauseMonitoring(creator),
            },
            { key: 'remove', label: 'Remove', icon: <Trash2 size={13} />, dangerous: true, onSelect: () => onDelete(creator) },
          ]}
        />
      </div>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {view === 'list' ? listRow : gridCard}
      </ContextMenuTrigger>
      {menuContent}
    </ContextMenu>
  );
}
