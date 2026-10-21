/**
 * DownloadRow — one download presentation across six variants:
 *   queued      → "Position 3 in queue" + priority chip + Cancel
 *   downloading → slim full-width progress bar + ONE compact stats line
 *                 ("32% · 28.0 MB of 87.3 MB · 8.7 MB/s · 6s left") + Pause
 *   paused      → "Paused at 32%" with the bar greyed out + Resume
 *   completed   → size · completed time (relative) · Open in library
 *   failed      → human one-line reason (mapDownloadError) · collapsible
 *                 masked Technical details · Retry only when it can help
 *   cancelled   → neutral, "Cancelled by user." · Retry
 *
 * Purely presentational — every IPC call stays in the page. Status appears
 * exactly ONCE per row (one dot — the duplicate status pill is gone); the
 * file name lives in the title tooltip (the meaningless "download" line is
 * gone) and Privacy mode blurs thumbnails + titles for screen sharing.
 */
import { useState } from 'react';
import type { DownloadQueueItemDto } from '@rekordly/shared/contracts';
import { formatBytes, formatEta, formatSpeed } from '@rekordly/shared/format';
import { Button, Tooltip } from '@rekordly/ui';
import { ArrowDown, ArrowUp, Copy, Equal, FolderOpen, Library, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { PlatformBadge } from '../../components/badges';
import { KebabMenu, type KebabItem } from '../../components/kebab-menu';
import { RecordingThumb } from '../recordings/recording-thumbnail';
import { formatRelativeTime } from '../uploads/uploads-format';
import { mapDownloadError, type MappedDownloadError } from './download-errors';
import {
  formatLabelFor,
  priorityLabel,
  titleTooltipFor,
} from './download-format';
import {
  TransferProgressBar,
  TransferRowShell,
  TransferTechnicalDetails,
  MetaSeparator,
  useThrottledTransfer,
} from './transfer-row';
import { PRIVACY_BLUR_CLASS } from '../../components/privacy-mode';

export type DownloadRowVariant =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export function downloadVariantFor(status: string): DownloadRowVariant {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'downloading':
      return 'downloading';
    case 'paused':
      return 'paused';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'queued';
  }
}

/* --- the single status indicator (one dot per row) ----------------------- */

interface StatusDotSpec {
  dot: string;
  label: string;
}

const STATUS_DOT: Record<string, StatusDotSpec> = {
  queued: { dot: 'bg-info/70', label: 'Queued' },
  downloading: { dot: 'bg-info', label: 'Downloading' },
  paused: { dot: 'bg-warning', label: 'Paused' },
  completed: { dot: 'bg-success', label: 'Completed' },
  failed: { dot: 'bg-error', label: 'Failed' },
  cancelled: { dot: 'bg-foreground-disabled', label: 'Cancelled' },
};

const FALLBACK_DOT: StatusDotSpec = { dot: 'bg-foreground-disabled', label: 'Download' };

function statusDotFor(status: string): StatusDotSpec {
  return STATUS_DOT[status] ?? FALLBACK_DOT;
}

/** The single status indicator on the row (dot only; the label is its a11y name). */
function StatusDot({ status }: { status: string }) {
  const spec = statusDotFor(status);
  return (
    <span
      role="img"
      aria-label={spec.label}
      title={spec.label}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${spec.dot}`}
    />
  );
}

/* --- priority chip (queued rows) ------------------------------------------ */

function PriorityChip({ priority }: { priority: number }) {
  const tone =
    priority < 0
      ? 'border-info/30 bg-info/10 text-info'
      : 'border-border bg-elevated text-foreground-secondary';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 text-[12px] font-medium leading-none ${tone}`}
    >
      {priorityLabel(priority)} priority
    </span>
  );
}

/* --- the row --------------------------------------------------------------- */

export interface DownloadRowProps {
  item: DownloadQueueItemDto;
  /** Bold title: probed/added title, else the file name (tooltip = full). */
  title: string;
  /** "youtube.com" — the badge text (lowercase, never all-caps URLs). */
  siteName: string;
  /** Badge/filter identity ("youtube") driving the tint. */
  siteId: string;
  variant: DownloadRowVariant;
  /** Scheduler rank among queued rows ("Position 3 in queue"), or null. */
  queuePosition: number | null;
  /** Shortened destination folder (home masked as ~), or null. */
  folderLabel: string | null;
  folderTooltip: string | null;
  /** Privacy mode: blur thumbnails + titles (for screen sharing). */
  privacy: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Clicking the site badge can filter the page to that source. */
  onSiteFilter?: (siteId: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  /** Omitted for dead ends (expired link, sign-in wall) — Retry can't help. */
  onRetry?: () => void;
  /** Plays the finished file in the Library's Downloads tab (built-in player). */
  onOpenInLibrary?: () => void;
  onShowInFolder?: () => void;
  onRemove?: () => void;
  onSetPriority?: (priority: number) => void;
  deleting?: boolean;
}

export function DownloadRow({
  item,
  title,
  siteName,
  siteId,
  variant,
  queuePosition,
  folderLabel,
  folderTooltip,
  privacy,
  selectable = false,
  selected = false,
  onToggleSelect,
  onSiteFilter,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onOpenInLibrary,
  onShowInFolder,
  onRemove,
  onSetPriority,
  deleting = false,
}: DownloadRowProps) {
  const status = item.status;
  const failed = variant === 'failed';
  const cancelled = variant === 'cancelled';
  const [showDetails, setShowDetails] = useState(false);

  // Live values re-render at most 4×/s while actually downloading.
  const live = useThrottledTransfer(
    {
      percent: item.percent,
      bytesDownloaded: item.bytesDownloaded,
      totalBytes: item.totalBytes,
      speed: item.speed,
      eta: item.eta,
    },
    variant === 'downloading',
  );

  const mapped: MappedDownloadError =
    failed || cancelled ? mapDownloadError(item.error ?? null, status) : { reason: '', retryable: false };
  // Cancelled rows read "Cancelled by user." even when a transport error
  // was recorded alongside the cancellation.
  const reason = cancelled ? 'Cancelled by user.' : mapped.reason;

  const qualityText = formatLabelFor(item);
  const privacyTitleClass = privacy ? PRIVACY_BLUR_CLASS : '';

  // Completed: file size + finished time (relative; full stamp in tooltip).
  const sizeLabel =
    item.bytesDownloaded > 0 || item.totalBytes > 0
      ? formatBytes(Math.max(item.bytesDownloaded, item.totalBytes))
      : null;
  const completedAgo = variant === 'completed' ? formatRelativeTime(item.finishedAt ?? item.createdAt) : null;

  const metaLine = (
    <p
      className={`mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-none text-foreground-secondary ${privacyTitleClass}`}
    >
      <PlatformBadge pluginId={siteId} platformName={siteName} onFilterPlatform={onSiteFilter} />
      {qualityText !== null && (
        <>
          <MetaSeparator />
          <span className="tabular-nums" title="Quality / format">
            {qualityText}
          </span>
        </>
      )}
      {folderLabel !== null && (
        <>
          <MetaSeparator />
          <span className="max-w-[24ch] truncate" title={folderTooltip ?? folderLabel}>
            {folderLabel}
          </span>
        </>
      )}
      {variant === 'queued' && queuePosition !== null && (
        <>
          <MetaSeparator />
          <span className="tabular-nums" title="Where this sits in the download queue">
            Position {queuePosition} in queue
          </span>
        </>
      )}
      {variant === 'paused' && (
        <>
          <MetaSeparator />
          <span className="tabular-nums">
            Paused at {Math.min(100, Math.max(0, Math.round(item.percent)))}%
          </span>
        </>
      )}
      {completedAgo !== null && completedAgo !== '' && (
        <>
          {sizeLabel !== null && <MetaSeparator />}
          {sizeLabel !== null && (
            <span className="tabular-nums" title="File size">
              {sizeLabel}
            </span>
          )}
          <MetaSeparator />
          <span title={item.finishedAt ?? undefined}>{`${completedAgo} completed`}</span>
        </>
      )}
      {(failed || cancelled) && (
        <>
          <MetaSeparator />
          <span title={item.createdAt}>{formatRelativeTime(item.createdAt) ?? ''}</span>
        </>
      )}
      {variant === 'queued' && (
        <>
          <MetaSeparator />
          <PriorityChip priority={item.priority} />
        </>
      )}
    </p>
  );

  /* Footer: the ONE slim bar spanning the row + ONE compact stats line.
     Paused rows keep the greyed bar only ("Paused at 32%" lives in the meta
     line above, exactly as specified). */
  const transferring = variant === 'downloading';
  const pausedBar = variant === 'paused';
  const footer =
    transferring || pausedBar ? (
      <div className="min-w-0">
        <TransferProgressBar percent={transferring ? live.percent : item.percent} tone={transferring ? 'active' : 'muted'} />
        {transferring && (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm leading-none tabular-nums text-foreground-secondary">
            <span>{Math.min(100, Math.max(0, Math.round(live.percent)))}%</span>
            <MetaSeparator />
            <span>
              {formatBytes(live.bytesDownloaded)}
              {live.totalBytes > 0 ? ` of ${formatBytes(live.totalBytes)}` : ''}
            </span>
            <MetaSeparator />
            <span>{formatSpeed(live.speed)}</span>
            <MetaSeparator />
            <span>{live.eta > 0 ? `${formatEta(live.eta)} left` : 'starting…'}</span>
          </p>
        )}
      </div>
    ) : undefined;

  /* Actions — the primary button depends on state; Cancel is secondary
     (active rows only); Remove lives ONLY in the "…" menu so it never sits
     next to Cancel. Completed rows open in the app: the Library's Downloads
     tab plays them in its built-in player (no external player hand-off). */
  const kebabItems: KebabItem[] = [];
  kebabItems.push({
    key: 'copy-link',
    label: 'Copy link',
    icon: <Copy size={13} />,
    onSelect: () => void navigator.clipboard.writeText(item.url),
  });
  if (failed && item.error !== null && item.error !== undefined && item.error.trim() !== '') {
    kebabItems.push({
      key: 'details',
      label: showDetails ? 'Hide technical details' : 'Technical details',
      onSelect: () => setShowDetails((v) => !v),
    });
  }
  if (variant === 'queued' && onSetPriority !== undefined) {
    // Scheduler order = lowest number first, so High = -1 · Normal = 0 · Low = 1.
    // The current priority's chip is on the row already — offer the others.
    if (item.priority !== 0) {
      kebabItems.push({ key: 'prio-normal', label: 'Priority: Normal', icon: <Equal size={13} />, onSelect: () => onSetPriority(0) });
    }
    if (item.priority >= 0) {
      kebabItems.push({ key: 'prio-high', label: 'Priority: High', icon: <ArrowUp size={13} />, onSelect: () => onSetPriority(-1) });
    }
    if (item.priority <= 0) {
      kebabItems.push({ key: 'prio-low', label: 'Priority: Low', icon: <ArrowDown size={13} />, onSelect: () => onSetPriority(1) });
    }
  }
  if (onRemove !== undefined) {
    kebabItems.push({
      key: 'remove',
      label: 'Remove from list',
      icon: <Trash2 size={13} />,
      dangerous: true,
      onSelect: onRemove,
    });
  }

  const actions = (
    <div className="flex min-w-max shrink-0 items-center justify-end gap-1.5">
      {transferring && onPause !== undefined && (
        <Tooltip content="Pause this download — it resumes where it left off">
          <Button variant="primary" size="sm" onClick={onPause}>
            <Pause size={12} /> Pause
          </Button>
        </Tooltip>
      )}
      {pausedBar && onResume !== undefined && (
        <Tooltip content="Continue this download">
          <Button variant="primary" size="sm" onClick={onResume}>
            <Play size={12} /> Resume
          </Button>
        </Tooltip>
      )}
      {variant === 'queued' && onCancel !== undefined && (
        <Tooltip content="Cancel before it starts">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </Tooltip>
      )}
      {transferring && onCancel !== undefined && (
        <Tooltip content="Cancel this download — partial files stay on disk">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </Tooltip>
      )}
      {pausedBar && onCancel !== undefined && (
        <Tooltip content="Cancel the paused download">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </Tooltip>
      )}
      {variant === 'completed' && onOpenInLibrary !== undefined && (
        <Tooltip content="Play this download in the Library's Downloads tab">
          <Button variant="primary" size="sm" onClick={onOpenInLibrary}>
            <Library size={12} /> Open in library
          </Button>
        </Tooltip>
      )}
      {variant === 'completed' && onShowInFolder !== undefined && (
        <Tooltip content="Show the file in its folder">
          <Button variant="secondary" size="sm" onClick={onShowInFolder}>
            <FolderOpen size={12} /> Show in folder
          </Button>
        </Tooltip>
      )}
      {(failed || cancelled) && onRetry !== undefined && (
        <Tooltip content={cancelled ? 'Download this link again' : 'Retry — it picks up where it stopped'}>
          <Button variant="primary" size="sm" onClick={onRetry}>
            <RefreshCw size={12} /> Retry
          </Button>
        </Tooltip>
      )}

      <KebabMenu label="Download actions" items={kebabItems} />
    </div>
  );

  // Partial `.part` files are not frame-generatable — generation (and its
  // cached ffmpeg pipeline) only kicks in for finished files.
  const thumbSource = variant === 'completed' ? item.filePath ?? null : null;

  return (
    <TransferRowShell
      ariaLabel={`${title} download — ${statusDotFor(status).label}`}
      selectable={selectable}
      selected={selected}
      onToggleSelect={onToggleSelect}
      deleting={deleting}
      dimmed={cancelled}
      footer={footer}
      details={
        failed && showDetails && item.error !== null && item.error !== undefined && item.error.trim() !== '' ? (
          <TransferTechnicalDetails rawError={item.error} />
        ) : undefined
      }
      actions={actions}
    >
      {/* 16:9 thumbnail — shared generation cache; site-tinted initials
          fallback (the source site's initial); Privacy mode blurs it. */}
      <RecordingThumb
        job={{ thumbnailPath: item.thumbnailPath ?? null, thumbnail: null, filePath: thumbSource, pluginId: siteId }}
        creatorName={siteName}
        avatarUrl={null}
        dimmed={failed || cancelled}
        blurred={privacy}
      />

      <div className="min-w-0 flex-1">
        {/* Title — bold, max 2 lines, full title in the tooltip */}
        <div className="flex min-w-0 items-start gap-2">
          <h3
            className={`min-w-0 line-clamp-2 text-sm font-bold leading-snug tracking-tight text-foreground ${privacyTitleClass}`}
            title={titleTooltipFor(item)}
          >
            {title}
          </h3>
          {/* ONE status indicator per row (the duplicate pill is gone) */}
          <StatusDot status={status} />
        </div>

        {/* source site · quality/format · destination folder (+ state bits) */}
        {metaLine}

        {/* dead rows: the one-line HUMAN reason (not a stack trace) */}
        {(failed || cancelled) && reason !== '' && (
          <p
            className={`mt-1.5 truncate text-sm font-medium ${cancelled ? 'text-foreground-secondary' : 'text-error'} ${privacyTitleClass}`}
            title={reason}
          >
            {reason}
          </p>
        )}
      </div>
    </TransferRowShell>
  );
}
