/**
 * RecordingRow — one recording presentation across three variants:
 *   active    → larger live card pinned at the top (REC badge, big live
 *               timer, size/speed/live-bitrate sparkline, labeled actions)
 *   completed → compact 16:9-thumb row (Open in library · Upload · …)
 *   failed    → compact row incl. cancelled (Retry / Resume · Play partial · …)
 *
 * Purely presentational — all recording/retry/delete/upload behavior stays
 * in the page. Status appears exactly ONCE per row via the shared
 * StatusBadge; the generated filename and stream URL live in the Details
 * section (stream URL is masked in the UI, Copy always copies the real one).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecordingJobDto } from '@rekordly/shared/contracts';
import { formatBytes, formatSpeed } from '@rekordly/shared/format';
import { Badge, Button, Tooltip } from '@rekordly/ui';
import { Check, ChevronDown, Copy, Library, Pause, Play, RefreshCw, Square, Trash2, X } from 'lucide-react';
import { PlatformBadge, StatusBadge } from '../../components/badges';
import { KebabMenu } from '../../components/kebab-menu';
import { PRIVACY_BLUR_CLASS } from '../../components/privacy-mode';
import { RecordingThumb } from './recording-thumbnail';
import {
  formatCompactDuration,
  formatFullStamp,
  formatRowStamp,
  formatTimer,
  jobElapsedSeconds,
  maskStreamUrl,
} from './recording-format';

export type RecordingVariant = 'active' | 'completed' | 'failed';

export interface RecordingRowProps {
  variant: RecordingVariant;
  job: RecordingJobDto;
  platformName: string;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  /** Dead rows support multi-select; active cards never do. */
  selectable: boolean;
  selected: boolean;
  onToggleSelect?: () => void;
  onStopAndSave?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onDiscard?: () => void;
  onRetry?: () => void;
  onPlayPartial?: () => void;
  /** Completed rows: jump to the Library, filtered to this exact recording. */
  onOpenInLibrary?: () => void;
  onUpload?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  /** "3 attempts" chip on grouped failed rows. */
  attemptsBadge?: string;
  /** Nudge a grouped child attempt row to the right (inside the group). */
  indent?: boolean;
  /** Tooltip text for the grouped "N attempts" chip. */
  attemptsTooltip?: string;
  /** Configured auto-record max segment length (minutes, 0 = off) — used for the "Max length" chip. */
  maxLengthMinutes?: number;
  /** Platform badge click → filter the page. */
  onFilterPlatform?: (pluginId: string) => void;
  /** Privacy mode: blur thumbnails + titles (for screen sharing). */
  privacy?: boolean;
}

/* --- formatting pieces ------------------------------------------------------- */

const ACTIVE_STATUSES = ['queued', 'recording', 'paused', 'preparing', 'verifying', 'processing', 'stopping'];

const SEGMENT_TOLERANCE_SECONDS = 3;

/** "5.2 Mb/s" — bitrate read-out in bits. */
function formatBitrate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 Mb/s';
  const megabits = (bytesPerSecond * 8) / 1_000_000;
  return `${megabits >= 10 ? Math.round(megabits) : megabits.toFixed(1)} Mb/s`;
}

/**
 * One-line failure reason under the title. Prefers the job's own error
 * text (first line, plumbing stripped); falls back to honest defaults.
 */
export function failureReasonFor(job: RecordingJobDto): string {
  const firstLine = (job.error ?? '')
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^AppError:\s*/i, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '');
  if (firstLine !== undefined) return firstLine;
  if (job.status === 'cancelled') return 'Cancelled by user';
  if (job.attempts > 1) return `Network error after ${job.attempts} attempts`;
  return 'Stream ended unexpectedly';
}

/* --- selection checkbox (hover-revealed, creators-style) ---------------------- */

export function SelectionCheckbox({
  selected,
  onToggle,
  always = false,
}: {
  selected: boolean;
  onToggle: () => void;
  /**
   * Hover-reveal by default (creators/recordings rows). Inside dialogs and
   * other no-hover-list contexts the unchecked box must stay visible —
   * otherwise the control is invisible and rows look unselectable.
   */
  always?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={selected ? 'Deselect recording' : 'Select recording'}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border transition-all duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
        selected
          ? 'border-primary bg-primary text-white opacity-100'
          : `border-border bg-elevated ${
              always ? 'opacity-100 hover:border-primary/60' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
            }`
      }`}
    >
      {selected && <Check size={11} strokeWidth={3} />}
    </button>
  );
}

/* --- details section (collapsible, masked stream URL + Copy) ------------------ */

function CopyField({ label, value, masked }: { label: string; value: string; masked?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-foreground-muted">{label}</span>
      <code
        className="min-w-0 flex-1 truncate rounded-sm bg-elevated px-2 py-1 text-xs text-foreground-secondary"
        title={masked ?? value}
      >
        {masked ?? value}
      </code>
      <Tooltip content={copied ? 'Copied' : `Copy ${label.toLowerCase()}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="shrink-0 px-1.5"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
        </Button>
      </Tooltip>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-20 shrink-0 text-xs text-foreground-muted">{label}</span>
      <span className="min-w-0 flex-1 break-all text-xs leading-relaxed text-foreground-secondary">{value}</span>
    </div>
  );
}

/** Full-width collapsible details — keeps filename/URL noise off the row. */
function RowDetails({ job, showAutoRetryNote }: { job: RecordingJobDto; showAutoRetryNote?: boolean }) {
  const fileName =
    job.filePath !== null && job.filePath !== undefined && job.filePath !== ''
      ? job.filePath.split(/[\\/]/).pop() ?? job.filePath
      : job.title;
  return (
    <div className="space-y-1.5 rounded-sm border border-border bg-panel px-3 py-2.5">
      <CopyField label="Stream URL" value={job.streamUrl} masked={maskStreamUrl(job.streamUrl)} />
      <DetailRow label="File" value={fileName} />
      {job.filePath !== null && job.filePath !== undefined && job.filePath !== '' && (
        <DetailRow label="Location" value={job.filePath} />
      )}
      {job.quality !== null && job.quality !== undefined && job.quality !== '' && <DetailRow label="Quality" value={job.quality} />}
      <DetailRow
        label="Attempts"
        value={`${job.attempts} of ${job.maxAttempts}${showAutoRetryNote === true ? ' (failing connects are auto-retried)' : ''}`}
      />
      <DetailRow label="Job ID" value={job.id} />
      {job.startedAt !== null && job.startedAt !== undefined && <DetailRow label="Started" value={formatFullStamp(job.startedAt)} />}
      {job.finishedAt !== null && job.finishedAt !== undefined && <DetailRow label="Finished" value={formatFullStamp(job.finishedAt)} />}
      {job.error !== null && job.error !== undefined && job.error.trim() !== '' && (
        <div className="max-h-40 overflow-y-auto rounded-sm border-l-2 border-error/60 bg-elevated p-2">
          <pre className="whitespace-pre-wrap break-all text-xs leading-relaxed text-error">{job.error}</pre>
        </div>
      )}
    </div>
  );
}

/* --- sparkline ---------------------------------------------------------------- */

/** Rolling sampled speed history (bytes/s) for the live-bitrate sparkline. */
function useSpeedHistory(speed: number, sampling: boolean, points = 40): number[] {
  const latest = useRef(speed);
  latest.current = speed;
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    if (!sampling) {
      setHistory([]);
      return;
    }
    const sample = (): void =>
      setHistory((prev) => {
        const next = [...prev, latest.current];
        return next.length > points ? next.slice(next.length - points) : next;
      });
    sample();
    const timer = window.setInterval(sample, 800);
    return () => window.clearInterval(timer);
  }, [sampling, points]);
  return history;
}

function BitrateSparkline({ history, className }: { history: number[]; className?: string }) {
  const width = 72;
  const height = 20;
  const path = useMemo(() => {
    if (history.length === 0) return '';
    const max = Math.max(...history, 100_000); // floor the baseline at 100 KB/s
    const step = width / Math.max(history.length - 1, 1);
    return history
      .map((v, i) => {
        const x = i * step;
        const y = height - (v / max) * (height - 2) - 1;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [history]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label="Live bitrate sparkline">
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} className="stroke-border" />
      {path !== '' && (
        <path d={path} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} className="stroke-success" />
      )}
    </svg>
  );
}

/* --- active card (pinned, larger) --------------------------------------------- */

function useHeartbeat(running: boolean): void {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
}

function ActiveRecordingCard({
  job,
  platformName,
  creatorName,
  creatorAvatarUrl,
  privacy,
  onStopAndSave,
  onPause,
  onDiscard,
  onResume,
  onFilterPlatform,
}: {
  job: RecordingJobDto;
  platformName: string;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  /** Privacy mode: blur thumbnails + titles (for screen sharing). */
  privacy?: boolean;
  onStopAndSave?: () => void;
  onPause?: () => void;
  onDiscard?: () => void;
  onResume?: () => void;
  onFilterPlatform?: (pluginId: string) => void;
}) {
  const isPaused = job.status === 'paused';
  const running = job.status === 'recording';
  const ticking = ACTIVE_STATUSES.includes(job.status) && !isPaused;
  useHeartbeat(ticking);
  const elapsed = jobElapsedSeconds(job.startedAt, job.finishedAt) ?? 0;
  const history = useSpeedHistory(job.speed, running);
  const retries = Math.max(0, job.attempts - 1);
  const retryQuota = Math.max(0, job.maxAttempts - 1);
  const [showDetails, setShowDetails] = useState(false);
  const privacyTitleClass = privacy === true ? PRIVACY_BLUR_CLASS : '';

  return (
    <div
      className={`rounded-md border-2 border-error/60 bg-elevated p-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-error/80 ${isPaused ? 'opacity-95 saturate-75' : ''}`}
    >
      <div className="flex items-start gap-3.5">
        <RecordingThumb job={job} creatorName={creatorName} avatarUrl={creatorAvatarUrl} large dimmed={isPaused} blurred={privacy === true} />

        <div className="min-w-0 flex-1">
          {/* Title + the ONE status indicator for the live card */}
          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-error/50 bg-error/15 px-1.5 py-0.5 text-xs font-bold leading-none text-error">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-error" />
                REC
              </span>
            ) : (
              <StatusBadge status={job.status} />
            )}
            <h3
              className={`min-w-0 truncate text-sm font-bold tracking-tight text-foreground ${privacyTitleClass}`}
              title={creatorName}
            >
              {creatorName}
            </h3>
            {retries > 0 && (
              <Badge
                variant="warning"
                title={`Auto-retried ${retries} time${retries === 1 ? '' : 's'} (up to ${retryQuota})`}
              >
                Retry {retries}/{retryQuota}
              </Badge>
            )}
          </div>

          <p className="mt-1.5 text-2xl font-bold leading-none tabular-nums text-foreground" title="Live recorded duration">
            {formatTimer(elapsed)}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-foreground-secondary">
            <span className="tabular-nums" title="Recorded size">{formatBytes(job.bytesDownloaded)}</span>
            <span aria-hidden="true" className="text-foreground-disabled">·</span>
            <span className="tabular-nums" title="Download speed">{formatSpeed(job.speed)}</span>
            <span aria-hidden="true" className="text-foreground-disabled">·</span>
            <span className="inline-flex items-center gap-1.5 tabular-nums" title="Live bitrate (last ~30s)">
              {formatBitrate(job.speed)}
              <BitrateSparkline history={history} className="h-5 w-[72px]" />
            </span>
          </div>
        </div>

        {/* Labeled actions with tooltips */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {running && onStopAndSave !== undefined && (
            <Tooltip content="Stop recording now and save the file">
              <Button variant="danger" size="sm" onClick={onStopAndSave}>
                <Square size={12} className="fill-white" /> Stop &amp; save
              </Button>
            </Tooltip>
          )}
          {running && onPause !== undefined && (
            <Tooltip content="Pause the recording">
              <Button variant="secondary" size="sm" onClick={onPause}>
                <Pause size={13} /> Pause
              </Button>
            </Tooltip>
          )}
          {isPaused && onResume !== undefined && (
            <Tooltip content="Continue the paused recording">
              <Button variant="secondary" size="sm" onClick={onResume}>
                <Play size={13} /> Resume
              </Button>
            </Tooltip>
          )}
          {onDiscard !== undefined && (
            <Tooltip content="Cancel this recording">
              <Button
                variant="ghost"
                size="sm"
                className="text-error hover:bg-error/10 hover:text-error"
                onClick={onDiscard}
              >
                <X size={13} /> Discard
              </Button>
            </Tooltip>
          )}
          <Tooltip content={showDetails ? 'Hide details' : 'Show details'}>
            <Button
              variant="ghost"
              size="sm"
              className="px-1.5"
              aria-expanded={showDetails}
              aria-label="Toggle details"
              onClick={() => setShowDetails((v) => !v)}
            >
              <ChevronDown size={13} className={`transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {showDetails && (
        <div className="mt-3">
          <RowDetails job={job} showAutoRetryNote />
        </div>
      )}
      {/* Platform chip on its own quiet line at the bottom of the live card */}
      <div className="mt-2.5 flex items-center">
        <PlatformBadge pluginId={job.pluginId} platformName={platformName} onFilterPlatform={onFilterPlatform} />
      </div>
    </div>
  );
}

/* --- compact rows ------------------------------------------------------------ */

interface ProbeMeta {
  durationSeconds: number | null;
  resolution?: string;
}

function MetaLine({
  job,
  platformName,
  onFilterPlatform,
  durationSeconds,
  resolution,
  failureReason,
  privacy,
}: {
  job: RecordingJobDto;
  platformName: string;
  onFilterPlatform?: (pluginId: string) => void;
  durationSeconds: number | null;
  resolution?: string;
  failureReason?: string;
  /** Blurs the failure reason text when Privacy mode is on. */
  privacy?: boolean;
}) {
  const duration = formatCompactDuration(durationSeconds);
  const dead = job.status === 'failed' || job.status === 'cancelled';
  const stampSource = dead ? job.createdAt : (job.startedAt ?? job.createdAt);
  const privacyReasonClass = privacy === true ? PRIVACY_BLUR_CLASS : '';
  return (
    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-none text-foreground-secondary">
      <PlatformBadge pluginId={job.pluginId} platformName={platformName} onFilterPlatform={onFilterPlatform} />
      {failureReason !== undefined && failureReason !== '' && (
        <>
          <span
            className={`max-w-[36ch] truncate font-medium ${job.status === 'cancelled' ? 'text-foreground-secondary' : 'text-error'} ${privacyReasonClass}`}
            title={failureReason}
          >
            {failureReason}
          </span>
          <span aria-hidden="true" className="text-foreground-disabled">·</span>
        </>
      )}
      <span className="truncate" title={stampSource}>
        {formatRowStamp(stampSource)}
      </span>
      {duration !== null && (
        <>
          <span aria-hidden="true" className="text-foreground-disabled">·</span>
          <span className="truncate tabular-nums" title="Duration">
            {duration}
          </span>
        </>
      )}
      {job.bytesDownloaded > 0 && (
        <>
          <span aria-hidden="true" className="text-foreground-disabled">·</span>
          <span className="truncate tabular-nums" title="File size">
            {formatBytes(job.bytesDownloaded)}
          </span>
        </>
      )}
      {resolution !== undefined && resolution !== '' && (
        <>
          <span aria-hidden="true" className="text-foreground-disabled">·</span>
          <span className="truncate tabular-nums" title="Resolution">
            {resolution}
          </span>
        </>
      )}
    </p>
  );
}

function CompactRecordingRow({
  variant,
  job,
  platformName,
  creatorName,
  creatorAvatarUrl,
  privacy,
  selected,
  selectable,
  onToggleSelect,
  onRetry,
  onPlayPartial,
  onResume,
  onOpenInLibrary,
  onUpload,
  onDelete,
  deleting,
  attemptsBadge,
  attemptsTooltip,
  indent,
  maxLengthMinutes,
  onFilterPlatform,
}: {
  variant: 'completed' | 'failed';
  job: RecordingJobDto;
  platformName: string;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  /** Privacy mode: blur thumbnails + titles (for screen sharing). */
  privacy?: boolean;
  selected: boolean;
  selectable: boolean;
  onToggleSelect?: () => void;
  onRetry?: () => void;
  onPlayPartial?: () => void;
  onResume?: () => void;
  onOpenInLibrary?: () => void;
  onUpload?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  attemptsBadge?: string;
  attemptsTooltip?: string;
  indent?: boolean;
  maxLengthMinutes?: number;
  onFilterPlatform?: (pluginId: string) => void;
}) {
  const dead = variant === 'failed';
  const cancelled = job.status === 'cancelled';
  const hasPartialFile = job.filePath !== null && job.filePath !== undefined && job.filePath !== '';
  const [showDetails, setShowDetails] = useState(false);
  const [probe, setProbe] = useState<ProbeMeta>({ durationSeconds: null });
  const privacyTitleClass = privacy === true ? PRIVACY_BLUR_CLASS : '';

  const elapsed = jobElapsedSeconds(job.startedAt, job.finishedAt);
  const durationSeconds = probe.durationSeconds ?? elapsed;
  const isMaxLength =
    variant === 'completed' &&
    maxLengthMinutes !== undefined &&
    maxLengthMinutes > 0 &&
    durationSeconds !== null &&
    Math.abs(durationSeconds - maxLengthMinutes * 60) <= SEGMENT_TOLERANCE_SECONDS;

  return (
    <div
      className={`group relative rounded-md border transition-all duration-150 hover:-translate-y-px hover:border-primary/40 hover:bg-elevated/40 ${
        selected ? 'border-primary/60 bg-primary/5' : 'border-border bg-surface'
      }`}
    >
      <div className={`flex items-center gap-2.5 py-2 ${indent === true ? 'pl-9 pr-3' : 'px-3'}`}>
        {selectable && onToggleSelect !== undefined && (
          <span className={indent === true ? 'absolute left-3.5 top-1/2 -translate-y-1/2' : ''}>
            <SelectionCheckbox selected={selected} onToggle={onToggleSelect} />
          </span>
        )}

        <RecordingThumb
          job={job}
          creatorName={creatorName}
          avatarUrl={creatorAvatarUrl}
          dimmed={dead}
          blurred={privacy === true}
          onMeta={(m) => setProbe({ durationSeconds: m.durationSeconds ?? null, resolution: m.resolution })}
        />

        <div className="min-w-0 flex-1">
          {/* Title line — the one status indicator lives here */}
          <div className="flex min-w-0 items-center gap-2">
            <h3
              className={`min-w-0 truncate text-sm font-semibold tracking-tight text-foreground ${privacyTitleClass}`}
              title={creatorName}
            >
              {creatorName}
            </h3>
            <StatusBadge status={job.status} />
            {attemptsBadge !== undefined && (
              <Badge variant="muted" className="shrink-0" title={attemptsTooltip}>
                {attemptsBadge}
              </Badge>
            )}
            {isMaxLength && (
              <Badge
                variant="muted"
                className="shrink-0"
                title={
                  `Duration matches the configured max auto-record segment length ` +
                  `(${maxLengthMinutes} min) — long streams are split into parts like this one.`
                }
              >
                Max length
              </Badge>
            )}
          </div>

          <MetaLine
            job={job}
            platformName={platformName}
            onFilterPlatform={onFilterPlatform}
            durationSeconds={dead && durationSeconds !== null && durationSeconds < 1 ? null : durationSeconds}
            resolution={probe.resolution}
            failureReason={dead ? failureReasonFor(job) : undefined}
            privacy={privacy}
          />
        </div>

        {/* Actions — labeled; ambiguous icon-only buttons are gone. */}
        <div className="flex min-w-max shrink-0 items-center gap-1">
          {/* ponytail: Play + Show in folder folded into one "Open in
              library" jump — the Library owns playback, files and metadata;
              this lands there pre-filtered to this exact recording. */}
          {variant === 'completed' && onOpenInLibrary !== undefined && (
            <Tooltip content="Open this recording in the Library">
              <Button variant="primary" size="sm" onClick={onOpenInLibrary}>
                <Library size={12} /> Open in library
              </Button>
            </Tooltip>
          )}
          {dead && onRetry !== undefined && (
            <Tooltip content={cancelled ? 'Record this creator again' : 'Retry this recording'}>
              <Button variant="primary" size="sm" onClick={onRetry}>
                <RefreshCw size={12} /> Retry
              </Button>
            </Tooltip>
          )}
          {/* ponytail: cancelled recordings stay resumable while the broadcast
              is live (previously an ambiguous Play icon — now labeled). */}
          {dead && onResume !== undefined && (
            <Tooltip content="Resume recording — if the stream is still live">
              <Button variant="secondary" size="sm" onClick={onResume}>
                <Play size={12} /> Resume
              </Button>
            </Tooltip>
          )}
          {dead && hasPartialFile && onPlayPartial !== undefined && (
            <Tooltip content="Play the partial file left on disk">
              <Button variant="secondary" size="sm" onClick={onPlayPartial}>
                <Play size={12} /> Play partial
              </Button>
            </Tooltip>
          )}
          {onUpload !== undefined && (
            <Tooltip content="Queue this file for cloud upload">
              <Button variant="secondary" size="sm" onClick={onUpload}>
                Upload
              </Button>
            </Tooltip>
          )}

          <Tooltip content={showDetails ? 'Hide details' : 'Show details'}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-expanded={showDetails}
              aria-label="Toggle details"
              onClick={() => setShowDetails((v) => !v)}
            >
              <ChevronDown size={14} className={`transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            </Button>
          </Tooltip>

          {onDelete !== undefined && (
            <KebabMenu
              label="Recording actions"
              items={[
                {
                  key: 'delete',
                  label: 'Delete',
                  icon: <Trash2 size={13} />,
                  dangerous: true,
                  onSelect: onDelete,
                },
              ]}
            />
          )}
        </div>
      </div>

      {deleting === true && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-end rounded-md bg-surface/60 pr-3">
          <span className="text-xs text-foreground-muted">Removing…</span>
        </div>
      )}

      {showDetails && (
        <div className="mx-3 mb-2">
          <RowDetails job={job} />
        </div>
      )}
    </div>
  );
}

/* --- the single export -------------------------------------------------------- */

export function RecordingRow(props: RecordingRowProps) {
  if (props.variant === 'active') {
    // ponytail: structured destructure so the card receives only live-card props.
    const {
      job,
      platformName,
      creatorName,
      creatorAvatarUrl,
      privacy,
      onStopAndSave,
      onPause,
      onDiscard,
      onResume,
      onFilterPlatform,
    } = props;
    return (
      <ActiveRecordingCard
        job={job}
        platformName={platformName}
        creatorName={creatorName}
        creatorAvatarUrl={creatorAvatarUrl}
        privacy={privacy}
        onStopAndSave={onStopAndSave}
        onPause={onPause}
        onDiscard={onDiscard}
        onResume={onResume}
        onFilterPlatform={onFilterPlatform}
      />
    );
  }
  const {
    job,
    platformName,
    creatorName,
    creatorAvatarUrl,
    privacy,
    selected,
    selectable,
    onToggleSelect,
    onRetry,
    onPlayPartial,
    onResume,
    onOpenInLibrary,
    onUpload,
    onDelete,
    deleting,
    attemptsBadge,
    attemptsTooltip,
    indent,
    maxLengthMinutes,
    onFilterPlatform,
    variant,
  } = props;
  return (
    <CompactRecordingRow
      variant={variant as 'completed' | 'failed'}
      job={job}
      platformName={platformName}
      creatorName={creatorName}
      creatorAvatarUrl={creatorAvatarUrl}
      privacy={privacy}
      selected={selected}
      selectable={selectable}
      onToggleSelect={onToggleSelect}
      onRetry={onRetry}
      onPlayPartial={onPlayPartial}
      onResume={onResume}
      onOpenInLibrary={onOpenInLibrary}
      onUpload={onUpload}
      onDelete={onDelete}
      deleting={deleting}
      attemptsBadge={attemptsBadge}
      attemptsTooltip={attemptsTooltip}
      indent={indent}
      maxLengthMinutes={maxLengthMinutes}
      onFilterPlatform={onFilterPlatform}
    />
  );
}

/** "2 attempts" label used for grouped rows. */
export function attemptsBadgeLabel(count: number): string {
  return `${count} attempts`;
}

export const RECORDING_ROW_ACTIVE_STATUSES = ACTIVE_STATUSES;
