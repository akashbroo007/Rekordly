import { Check, Clock, Eye, Heart, Pencil, Radio, Trash2, Users, Zap } from 'lucide-react';
import type { CreatorDto, CreatorTagDto, MonitoringJobDto } from '@rekordly/shared';
import { Badge, Button, Card } from '@rekordly/ui';
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

export interface CreatorCardCallbacks {
  onToggleFavorite: (creator: CreatorDto) => void;
  onToggleAutoRecord: (creator: CreatorDto) => void;
  onDetails: (creator: CreatorDto) => void;
  onRecord: (creator: CreatorDto) => void;
  onEdit: (creator: CreatorDto) => void;
  onDelete: (creator: CreatorDto) => void;
  /** Clicking a platform badge filters the page to that site. */
  onFilterPlatform: (pluginId: string) => void;
  onAssignTag: (creator: CreatorDto, tagId: string) => void;
  onRemoveTag: (creator: CreatorDto, tagId: string) => void;
  onToggleSelect: (creatorId: string) => void;
}

export interface CreatorCardProps extends CreatorCardCallbacks {
  creator: CreatorDto;
  job?: MonitoringJobDto;
  tags: CreatorTagDto[];
  allTags: CreatorTagDto[];
  platformName: string;
  selected: boolean;
  view: 'grid' | 'list';
}

function statusAccentClass(jobState?: string): string {
  if (jobState === 'live') return 'bg-success';
  if (jobState === 'failed') return 'bg-error';
  if (jobState === 'paused' || jobState === 'retrying') return 'bg-warning';
  return 'bg-border';
}

function statusText(job?: MonitoringJobDto): string {
  if (job?.state === 'live') return 'Live now';
  if (job?.state === 'failed') return 'Checks failing — will retry';
  if (job?.state === 'paused') return 'Monitoring paused';
  if (job?.state === 'retrying') return 'Retrying…';
  return 'Monitored — waiting for live';
}

export function CreatorCard({
  creator,
  job,
  tags,
  allTags,
  platformName,
  selected,
  view,
  onToggleFavorite,
  onToggleAutoRecord,
  onDetails,
  onRecord,
  onEdit,
  onDelete,
  onFilterPlatform,
  onAssignTag,
  onRemoveTag,
  onToggleSelect,
}: CreatorCardProps) {
  const isLive = job?.state === 'live';
  const isIssue = job?.state === 'failed' || job?.state === 'paused' || job?.state === 'retrying';
  const liveTitle = job?.lastResult?.title;
  const viewerCount = job?.lastResult?.viewerCount;

  const menuContent = (
    <ContextMenuContent>
      <ContextMenuItem onClick={() => onDetails(creator)}>View details</ContextMenuItem>
      <ContextMenuItem onClick={() => onEdit(creator)}>
        <Pencil size={13} /> Edit
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onToggleFavorite(creator)}>
        <Heart size={13} className={creator.isFavorite ? 'fill-warning text-warning' : ''} />
        {creator.isFavorite ? 'Remove favorite' : 'Add to favorites'}
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

  const listRow = (
    <div
      className={`group relative flex items-center gap-3 rounded-sm border bg-surface px-3 py-2 transition-all duration-150 hover:border-primary/30 hover:bg-elevated/50 ${
        selected ? 'border-primary/60 bg-primary/5' : 'border-border'
      }`}
    >
      <span className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-full ${statusAccentClass(job?.state)}`} />
      <span className="ml-1">{selectionCheckbox}</span>
      <button type="button" onClick={() => onDetails(creator)} aria-label={`Details for ${creator.displayName}`}>
        {creator.avatarUrl ? (
          <img src={creator.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-elevated text-foreground-muted">
            <Users size={15} />
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="cursor-pointer truncate text-sm font-semibold tracking-tight text-foreground hover:text-primary"
            onClick={() => onDetails(creator)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onDetails(creator); }}
          >
            {creator.displayName}
          </span>
          {isLive && <Badge variant="success">Live</Badge>}
          {creator.autoRecord && !isLive && <Badge variant="info">Auto</Badge>}
        </div>
        <p className="truncate text-[11px] uppercase tracking-wide text-foreground-muted">@{creator.username}</p>
      </div>
      <div className="hidden w-28 shrink-0 md:block">
        <button
          type="button"
          onClick={() => onFilterPlatform(creator.pluginId)}
          title={`Filter by ${platformName}`}
          className="cursor-pointer"
        >
          <Badge variant="info">{platformName}</Badge>
        </button>
      </div>
      <div className="hidden w-36 shrink-0 lg:block">
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((t) => (
              <Badge key={t.id} variant="muted">{t.name}</Badge>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-foreground-disabled">—</span>
        )}
      </div>
      <div className="w-32 shrink-0 text-right">
        {isLive ? (
          <span className="flex items-center justify-end gap-1.5 text-xs font-medium text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            {typeof viewerCount === 'number' ? `${viewerCount} watching` : 'Live'}
          </span>
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground-disabled">
            {statusText(job)}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className={creator.isFavorite ? 'text-warning' : 'text-foreground-muted hover:text-warning'}
          onClick={() => onToggleFavorite(creator)}
          aria-label={creator.isFavorite ? 'Unfavorite' : 'Favorite'}
        >
          <Heart size={14} className={creator.isFavorite ? 'fill-warning' : ''} />
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
        {isLive ? (
          <Button size="sm" className="bg-error text-white hover:bg-error/90" onClick={() => onRecord(creator)}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
            Record
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled title={`${creator.displayName} is offline.`}>
            <Radio size={13} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-foreground-muted hover:bg-error/10 hover:text-error"
          onClick={() => onDelete(creator)}
          aria-label={`Delete ${creator.displayName}`}
        >
          <Trash2 size={13} />
        </Button>
      </div>
    </div>
  );

  const gridCard = (
    <Card
      className={`group relative flex flex-col gap-3 overflow-hidden transition-all duration-150 hover:border-primary/30 hover:bg-elevated/50 ${
        selected ? 'border-primary/60 bg-primary/5' : ''
      }`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${statusAccentClass(job?.state)}`} />
      <div className="absolute right-2.5 top-2.5 z-10">{selectionCheckbox}</div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={`relative shrink-0 rounded-full ${isLive ? 'ring-2 ring-success/60 ring-offset-2 ring-offset-surface' : ''}`}
          onClick={() => onDetails(creator)}
          aria-label={`Details for ${creator.displayName}`}
        >
          {creator.avatarUrl ? (
            <img src={creator.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-elevated text-foreground-muted">
              <Users size={18} />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className="cursor-pointer truncate text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
              onClick={() => onDetails(creator)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onDetails(creator); }}
            >
              {creator.displayName}
            </h3>
            {isLive && <Badge variant="success">Live</Badge>}
            {creator.autoRecord && !isLive && <Badge variant="info">Auto</Badge>}
            <button
              type="button"
              onClick={() => onToggleFavorite(creator)}
              className="shrink-0"
              aria-label={creator.isFavorite ? 'Unfavorite' : 'Favorite'}
            >
              <Heart
                size={14}
                className={creator.isFavorite ? 'fill-warning text-warning' : 'text-foreground-muted'}
              />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-foreground-muted">@{creator.username}</p>
            <button
              type="button"
              onClick={() => onFilterPlatform(creator.pluginId)}
              title={`Filter by ${platformName}`}
            >
              <Badge variant="info" className="cursor-pointer hover:border-info/50">{platformName}</Badge>
            </button>
            {isLive && typeof viewerCount === 'number' && (
              <Badge variant="muted" className="gap-1">
                <Eye size={10} /> {viewerCount}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {isLive && liveTitle && (
        <p className="line-clamp-1 rounded-sm bg-success/10 px-2 py-1 text-xs text-success" title={liveTitle}>
          {liveTitle}
        </p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 4).map((t) => (
            <Badge
              key={t.id}
              variant="muted"
              className="cursor-pointer hover:text-error"
              onClick={() => onRemoveTag(creator, t.id)}
              title="Click to remove this tag"
            >
              {t.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />}
              {t.name}
            </Badge>
          ))}
        </div>
      )}

      {creator.notes && (
        <p className="line-clamp-2 border-l-2 border-border pl-2 text-xs leading-relaxed text-foreground-muted">{creator.notes}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <p className="flex min-w-0 items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-foreground-disabled">
          {isLive ? (
            <>
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success" />
              Live now
            </>
          ) : isIssue ? (
            <>
              <Clock size={10} className="shrink-0" />
              <span className="truncate">{statusText(job)}</span>
            </>
          ) : (
            <span className="truncate">{statusText(job)}</span>
          )}
        </p>
        {isLive ? (
          <Button size="sm" className="bg-error text-white hover:bg-error/90" onClick={() => onRecord(creator)}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
            Record Now
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled
            title={`${creator.displayName} is offline — recording is available when they go live.`}
          >
            <Radio size={14} />
            Record
          </Button>
        )}
      </div>
    </Card>
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
