/**
 * ChooseFromRecordingsDialog — picker of completed recordings for the
 * Uploads page's "Choose from Recordings" add path. Lists exactly the files
 * the Recordings page marks completed (a finished capture with its local
 * file on disk), reusing RecordingThumb and the shared selection checkbox.
 * Presentational only: the page feeds the job list and receives onQueue().
 */
import { useEffect, useMemo, useState } from 'react';
import type { RecordingJobDto } from '@rekordly/shared/contracts';
import { formatBytes } from '@rekordly/shared/format';
import { Button, Dialog, DialogContent, EmptyState } from '@rekordly/ui';
import { Library } from 'lucide-react';
import { humanizeJobTitle, formatRowStamp, jobElapsedSeconds, formatCompactDuration } from '../recordings/recording-format';
import { RecordingThumb } from '../recordings/recording-thumbnail';
import { SelectionCheckbox } from '../recordings/recording-row';

export interface ChooseFromRecordingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Completed recording jobs, still holding a local file on disk. */
  jobs: RecordingJobDto[];
  providerName: string;
  /** Queue the selection for upload (the page calls the existing uploads.add per file). */
  onQueue: (jobs: RecordingJobDto[]) => void;
  queuePending?: boolean;
}

export function ChooseFromRecordingsDialog({
  open,
  onOpenChange,
  jobs,
  providerName,
  onQueue,
  queuePending = false,
}: ChooseFromRecordingsDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fresh open → empty selection; stale ids from a previous visit would
  // otherwise queue jobs the user can no longer see.
  useEffect(() => {
    if (open) setSelectedIds(new Set());
  }, [open]);

  const items = useMemo(
    () =>
      [...jobs].sort((a, b) =>
        (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt),
      ),
    [jobs],
  );

  const chosen = items.filter((j) => selectedIds.has(j.id));

  const toggleJob = (jobId: string): void =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });

  const allSelected = items.length > 0 && chosen.length === items.length;

  const titleFor = humanizeJobTitle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Choose from Recordings"
        description={`Completed recordings with a file on disk. Queue the selection to ${providerName}.`}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={Library}
            title="No completed recordings"
            description="Finished recordings with a local file will be listed here."
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 pb-2 text-xs">
              <span className="text-foreground-muted">
                <span className="font-semibold text-foreground">{chosen.length}</span> of{' '}
                {items.length} selected
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-2"
                  onClick={() =>
                    setSelectedIds(allSelected ? new Set() : new Set(items.map((j) => j.id)))
                  }
                >
                  {allSelected ? 'Clear selection' : 'Select all'}
                </Button>
              </div>
            </div>
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {items.map((job) => {
                const checked = selectedIds.has(job.id);
                const duration = jobElapsedSeconds(job.startedAt, job.finishedAt);
                return (
                  <li
                    key={job.id}
                    onClick={() => toggleJob(job.id)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-sm border px-2.5 py-2 transition-colors ${
                      checked ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-hover'
                    }`}
                  >
                    <SelectionCheckbox
                      always
                      selected={checked}
                      onToggle={() => toggleJob(job.id)}
                    />
                    <RecordingThumb job={job} creatorName={titleFor(job.title)} avatarUrl={null} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground" title={job.title}>
                        {titleFor(job.title)}
                      </p>
                      <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-foreground-muted">
                        <span className="truncate">{formatRowStamp(job.finishedAt ?? job.createdAt)}</span>
                        {job.bytesDownloaded > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{formatBytes(job.bytesDownloaded)}</span>
                          </>
                        )}
                        {duration !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{formatCompactDuration(duration)}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={chosen.length === 0}
                loading={queuePending}
                onClick={() => {
                  onQueue(chosen);
                  onOpenChange(false);
                }}
              >
                Upload {chosen.length > 0 ? chosen.length : ''} to {providerName}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
