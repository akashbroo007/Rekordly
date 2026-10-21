/**
 * UploadRow — one upload presentation across four variants:
 *   queued     → "Waiting…" + Cancel (paused rides along with a Resume)
 *   uploading  → slim progress bar, percent, speed, ETA + labeled Cancel
 *   completed  → share link + Copy link / Open link / "…"
 *   failed     → human reason (mapUploadError), collapsible technical
 *                details, Retry only when it can help; Remove becomes the
 *                primary action when the source file is gone
 *
 * Presentational only — every IPC call stays in the page. Reuses the
 * recordings page's SelectionCheckbox, RecordingThumb (with its generation
 * cache), StatusDot visual language, KebabMenu and hover/selected patterns.
 */
import { useState } from 'react';
import type { UploadQueueItemDto, UploadProviderMetaDto } from '@rekordly/shared/contracts';
import { formatBytes, formatEta, formatSpeed } from '@rekordly/shared/format';
import { Button, Tooltip } from '@rekordly/ui';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FolderOpen,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { KebabMenu, type KebabItem } from '../../components/kebab-menu';
import { RecordingThumb } from '../recordings/recording-thumbnail';
import { providerColor } from '../../components/platform-config';
import { SelectionCheckbox } from '../recordings/recording-row';
import {
  formatCompactDuration,
  formatFullStamp,
  formatRowStamp,
} from '../recordings/recording-format';
import { ProviderTile } from './provider-tile';
import { maskHomeDir, mapUploadError, type MappedUploadError } from './upload-errors';
import { formatRelativeTime } from './uploads-format';
import { PRIVACY_BLUR_CLASS } from '../../components/privacy-mode';

export type UploadRowVariant = 'queued' | 'uploading' | 'completed' | 'failed';

export type UploadRowStatus = UploadQueueItemDto['status'];

export function uploadVariantFor(status: UploadRowStatus): UploadRowVariant {
  if (status === 'completed') return 'completed';
  if (status === 'uploading') return 'uploading';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return 'queued';
}

/* --- the single status indicator (one dot per row) --------------------- */

interface StatusDotSpec {
  dot: string;
  label: string;
}

const STATUS_DOT: Record<string, StatusDotSpec> = {
  queued: { dot: 'bg-info/70', label: 'Waiting' },
  uploading: { dot: 'bg-info', label: 'Uploading' },
  paused: { dot: 'bg-warning', label: 'Paused' },
  completed: { dot: 'bg-success', label: 'Completed' },
  failed: { dot: 'bg-error', label: 'Failed' },
  cancelled: { dot: 'bg-foreground-disabled', label: 'Cancelled' },
};

const FALLBACK_DOT: StatusDotSpec = { dot: 'bg-foreground-disabled', label: 'Upload' };

function statusDotFor(status: string): StatusDotSpec {
  return STATUS_DOT[status] ?? FALLBACK_DOT;
}

/** Static dot — progress on the row itself shows the activity. */
function UploadStatusDot({ status }: { status: UploadRowStatus }) {
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

/** "Expires after 10 days inactive" — only when the provider says so. */
function retentionHint(meta: UploadProviderMetaDto | null | undefined): string | null {
  const text = (meta?.fileExpiry ?? '').trim();
  if (text === '') return null;
  if (/never|permanent/i.test(text)) return null; // no expiry → no hint
  return `Expires after ${text.replace(/\s+of\s+inactivity/i, ' inactive')}`;
}

/** File size display without "0.0 B". */
export function uploadSizeBytes(item: UploadQueueItemDto): number | null {
  if (item.totalBytes > 0) return item.totalBytes;
  if (item.bytesUploaded > 0) return item.bytesUploaded;
  return null;
}

/* --- technical details (collapsible, home dir masked, copyable) --------- */

function TechnicalDetails({ rawError }: { rawError: string }) {
  const [copied, setCopied] = useState(false);
  const masked = maskHomeDir(rawError);
  return (
    <div className="rounded-sm border border-border bg-panel px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground-secondary">Technical details</p>
        <Button
          variant="ghost"
          size="sm"
          className="px-1.5"
          aria-label="Copy technical details"
          onClick={() => {
            void navigator.clipboard.writeText(masked).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          <span className="text-xs">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
      <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-xs leading-relaxed text-foreground-secondary">
        {masked}
      </pre>
    </div>
  );
}

/* --- the row ------------------------------------------------------------ */

export interface UploadRowProps {
  variant: UploadRowVariant;
  item: UploadQueueItemDto;
  /** Display name for the destination host. */
  providerName: string;
  /** Provider metadata for the retention hint (omitted when unknown). */
  providerMeta?: UploadProviderMetaDto | null;
  /** Bold title: creator name parsed from the file name / matched creator. */
  title: string;
  /** Raw file name (never used as the title — tooltip only). */
  fileName: string;
  /** Stamp shown in the secondary line + its tooltip. */
  stamp?: string | null;
  stampFull?: string | null;
  /** Duration when the source recording is known ("15m 20s", null → hidden). */
  durationSeconds: number | null;
  /** Creator avatar → thumb fallback chain. */
  creatorAvatarUrl?: string | null;
  /** Disk thumbnail (thumbnailPath) from a matched recording/job. */
  thumbPath?: string | null;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onFilterProvider?: (providerId: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  /** Undefined = disabled retry; string = disabled WITH reason tooltip. */
  onRetry?: (() => void) | null;
  retryTooltip?: string;
  onRemove?: () => void;
  onCopyLink?: (link: string) => void;
  onOpenLink?: (link: string) => void;
  onShowInFolder?: () => void;
  /** Privacy mode: blur thumbnails + titles + share link (screen sharing). */
  privacy?: boolean;
}

/** Quiet share-link text (protocol dropped; the full URL stays in tooltip + copy). */
function shortLinkText(link: string): string {
  const cleaned = link.replace(/^https?:\/\//i, '');
  return cleaned.length > 48 ? `${cleaned.slice(0, 45)}…` : cleaned;
}

export function UploadRow({
  variant,
  item,
  providerName,
  providerMeta,
  title,
  fileName,
  stamp,
  stampFull,
  durationSeconds,
  creatorAvatarUrl,
  thumbPath,
  selectable = false,
  selected = false,
  onToggleSelect,
  onFilterProvider,
  onPause,
  onResume,
  onCancel,
  onRetry,
  retryTooltip,
  onRemove,
  onCopyLink,
  onOpenLink,
  onShowInFolder,
  privacy,
}: UploadRowProps) {
  const status = item.status as UploadRowStatus;
  const failed = variant === 'failed';
  const completed = variant === 'completed';
  const paused = status === 'paused';
  const [showDetails, setShowDetails] = useState(false);
  const hasPrivacy = privacy === true;
  const privacyTitleClass = hasPrivacy ? PRIVACY_BLUR_CLASS : '';

  const mapped: MappedUploadError = failed
    ? mapUploadError(item.error ?? null, status)
    : { reason: '', retryable: false, missingFile: false };

  const sizeBytes = uploadSizeBytes(item);
  const sizeLabel = sizeBytes !== null ? formatBytes(sizeBytes) : null;
  const uploadedWhen = completed && (item.finishedAt ?? '') !== '' ? item.finishedAt : item.createdAt;
  const uploadedAgo = formatRelativeTime(uploadedWhen);
  const retention = retentionHint(providerMeta);
  const shareLink = item.destinationPath ?? '';
  const durationLabel = formatCompactDuration(durationSeconds);

  const providerTile = (
    <ProviderTile providerId={item.providerId} name={providerName} size="sm" className="shrink-0" />
  );

  const kebabItems: KebabItem[] = [];
  if ((variant === 'queued' || variant === 'uploading') && onPause !== undefined && !paused) {
    kebabItems.push({ key: 'pause', label: 'Pause', icon: <Pause size={13} />, onSelect: onPause });
  }
  // (Paused rows keep their primary Resume button — no kebab duplicate.)
  if (variant === 'failed' && item.error !== null && item.error !== undefined && item.error.trim() !== '') {
    kebabItems.push({
      key: 'details',
      label: showDetails ? 'Hide technical details' : 'Technical details',
      icon: <ChevronDown size={13} className={showDetails ? 'rotate-180' : ''} />,
      onSelect: () => setShowDetails((v) => !v),
    });
  }
  if (completed && shareLink !== '' && onShowInFolder !== undefined) {
    kebabItems.push({ key: 'show-in-folder', label: 'Show in folder', icon: <FolderOpen size={13} />, onSelect: onShowInFolder });
  }
  // The primary labeled Remove only renders for missing-file errors —
  // otherwise the quiet kebab entry is the single remove control.
  const primaryRemove = failed && mapped.missingFile && onRemove !== undefined;
  if (onRemove !== undefined && !primaryRemove) {
    kebabItems.push({
      key: 'remove',
      label: 'Remove from list',
      icon: <Trash2 size={13} />,
      dangerous: true,
      onSelect: onRemove,
    });
  }

  return (
    <div
      className={`group relative rounded-md border transition-all duration-150 hover:-translate-y-px hover:border-primary/40 hover:bg-elevated/40 ${
        selected ? 'border-primary/60 bg-primary/5' : 'border-border bg-surface'
      }`}
      aria-label={`${title} upload — ${statusDotFor(status).label}`}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        {selectable && onToggleSelect !== undefined && (
          <SelectionCheckbox selected={selected} onToggle={onToggleSelect} />
        )}

        {/* 16:9 thumbnail — reuses the Recordings thumbnail cache; provider-tinted fallback */}
        <RecordingThumb
          job={{
            thumbnailPath: thumbPath ?? null,
            thumbnail: null,
            filePath: item.sourcePath,
            pluginId: '',
          }}
          tint={providerColor(item.providerId)}
          creatorName={title}
          avatarUrl={creatorAvatarUrl ?? null}
          dimmed={failed}
          blurred={hasPrivacy}
        />

        <div className="min-w-0 flex-1">
          {/* Title = creator name (raw file name lives in the tooltip) */}
          <div className="flex min-w-0 items-center gap-2">
            <h3
              className={`min-w-0 truncate text-sm font-bold tracking-tight text-foreground ${privacyTitleClass}`}
              title={fileName}
            >
              {title}
            </h3>
            <UploadStatusDot status={status} />
            {variant === 'queued' && (
              <span className="shrink-0 text-xs text-foreground-muted">{paused ? 'Paused' : 'Waiting…'}</span>
            )}
            {variant === 'uploading' && item.percent !== undefined && (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-info">
                {Math.min(100, Math.round(item.percent))}%
              </span>
            )}
          </div>

          {/* Secondary line: locale stamp relative/compact + duration */}
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-none text-foreground-secondary">
            <span className="truncate" title={stampFull ?? stamp ?? undefined}>
              {stamp ?? formatRowStamp(uploadedWhen)}
            </span>
            {durationLabel !== null && (
              <>
                <span aria-hidden="true" className="text-foreground-disabled">·</span>
                <span className="truncate tabular-nums" title="Recording duration">
                  {durationLabel}
                </span>
              </>
            )}
          </p>

          {/* Metadata line: provider · size · uploaded · retention hint */}
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-none text-foreground-secondary">
            {onFilterProvider !== undefined ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onFilterProvider(item.providerId);
                }}
                title={`Filter by ${providerName}`}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-primary hover:opacity-90"
              >
                {providerTile}
                <span className="font-medium text-foreground hover:underline">{providerName}</span>
              </button>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5">
                {providerTile}
                <span className="font-medium text-foreground">{providerName}</span>
              </span>
            )}
            {sizeLabel !== null && (
              <>
                <span aria-hidden="true" className="text-foreground-disabled">·</span>
                <span className="truncate tabular-nums" title="File size">
                  {sizeLabel}
                </span>
              </>
            )}
            {uploadedAgo !== null && (
              <>
                <span aria-hidden="true" className="text-foreground-disabled">·</span>
                <span className="truncate" title={`Uploaded ${formatFullStamp(uploadedWhen)}`}>
                  {uploadedAgo}
                </span>
              </>
            )}
            {retention !== null && (
              <>
                <span aria-hidden="true" className="text-foreground-disabled">·</span>
                <span className="inline-flex items-center gap-1 text-xs text-warning">
                  {retention}
                </span>
              </>
            )}
          </p>

          {/* Completed: short muted share link with one-click copy */}
          {completed && shareLink !== '' && (
            <p className="mt-1.5 flex min-w-0 items-center gap-1">
              <span
                className={`min-w-0 max-w-[48ch] truncate text-xs text-foreground-muted ${privacyTitleClass}`}
                title={shareLink}
              >
                {shortLinkText(shareLink)}
              </span>
              {onCopyLink !== undefined && (
                <Tooltip content="Copy link">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label="Copy link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCopyLink(shareLink);
                    }}
                  >
                    <Copy size={12} />
                  </Button>
                </Tooltip>
              )}
            </p>
          )}

          {/* Failed: one-line human reason (+ collapsed technical details) */}
          {failed && mapped.reason !== '' && (
            <p
              className={`mt-1.5 truncate text-xs font-medium ${status === 'cancelled' ? 'text-foreground-secondary' : 'text-error'} ${privacyTitleClass}`}
              title={mapped.reason}
            >
              {mapped.reason}
            </p>
          )}

          {/* Uploading: slim live progress bar */}
          {variant === 'uploading' && (
            <div className="mt-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-hover/60">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${paused ? 'bg-warning' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }}
                />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs tabular-nums text-foreground-secondary">
                <span>{formatSpeed(item.speed)}</span>
                <span aria-hidden="true" className="text-foreground-disabled">·</span>
                <span>{item.eta > 0 ? `${formatEta(item.eta)} left` : 'finishing…'}</span>
              </p>
            </div>
          )}
        </div>

        {/* Actions — labeled per variant; "…" menu carries the quiet ones */}
        <div className="flex min-w-max shrink-0 items-center justify-end gap-1.5">
          {completed && shareLink !== '' && onCopyLink !== undefined && (
            <Tooltip content="Copy the share link">
              <Button size="sm" onClick={() => onCopyLink(shareLink)}>
                <Copy size={12} /> Copy link
              </Button>
            </Tooltip>
          )}
          {completed && shareLink !== '' && onOpenLink !== undefined && (
            <Tooltip content="Open the download page in your browser">
              <Button variant="secondary" size="sm" onClick={() => onOpenLink(shareLink)}>
                <ExternalLink size={12} /> Open link
              </Button>
            </Tooltip>
          )}

          {variant === 'uploading' && onCancel !== undefined && (
            <Tooltip content="Cancel this upload and keep the local file">
              <Button variant="secondary" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            </Tooltip>
          )}
          {variant === 'queued' && !paused && onCancel !== undefined && (
            <Tooltip content="Cancel before it starts">
              <Button variant="secondary" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            </Tooltip>
          )}
          {variant === 'queued' && paused && onResume !== undefined && (
            <Tooltip content="Continue the paused upload">
              <Button size="sm" onClick={onResume}>
                <Play size={12} /> Resume
              </Button>
            </Tooltip>
          )}
          {variant === 'queued' && paused && onCancel !== undefined && (
            <Tooltip content="Cancel the paused upload">
              <Button variant="ghost" size="sm" className="text-foreground-secondary hover:text-foreground" onClick={onCancel}>
                Cancel
              </Button>
            </Tooltip>
          )}

          {failed && onRetry !== undefined && onRetry !== null && (
            <Tooltip content="Queue this upload again">
              <Button size="sm" onClick={() => onRetry()}>
                <RefreshCw size={12} /> Retry
              </Button>
            </Tooltip>
          )}
          {failed && onRetry === undefined && (
            /* Disabled retry (file is gone / host rejected). The tooltip
               explains why; Remove below becomes the primary way out. */
            <Tooltip content={retryTooltip ?? 'Retry is not available for this error.'}>
              <Button size="sm" disabled aria-label="Retry unavailable">
                <RefreshCw size={12} /> Retry
              </Button>
            </Tooltip>
          )}
          {/* File-not-found (or any non-retryable failure): Remove is primary */}
          {failed && mapped.missingFile && onRemove !== undefined && (
            <Button variant="secondary" size="sm" className="border-error/40 text-error hover:bg-error/10 hover:text-error" onClick={onRemove}>
              <Trash2 size={12} /> Remove
            </Button>
          )}

          {kebabItems.length > 0 && <KebabMenu label="Upload actions" items={kebabItems} />}
        </div>
      </div>

      {/* Expanded technical details (failed rows, home folder masked) */}
      {failed && showDetails && (item.error ?? '').trim() !== '' && (
        <div className="mx-3 mb-2">
          <TechnicalDetails rawError={item.error ?? ''} />
        </div>
      )}
    </div>
  );
}
