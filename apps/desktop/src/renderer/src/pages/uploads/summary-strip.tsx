/**
 * UploadsSummaryStrip — compact strip above the toolbar:
 * Uploading N · Completed N · Failed N · Total uploaded size (+ total rows).
 * The count chips are clickable and drive the same tab filter the toolbar
 * uses. Visuals reuse the Recordings page's summary Chip exports so the
 * two pages share one look.
 */
import { CheckCircle2, HardDrive } from 'lucide-react';
import { formatBytes } from '@rekordly/shared/format';
import { Chip } from '../recordings/summary-strip';
import type { UploadFilterTab } from './uploads-toolbar';

export interface UploadsSummaryStripProps {
  /** In-flight rows (queued + uploading + paused). */
  uploading: number;
  completed: number;
  failed: number;
  /**
   * Sum of bytesUploaded across completed rows — "Total uploaded size".
   * Unknown sizes (0 B) simply do not contribute.
   */
  uploadedBytes: number;
  filterTab: UploadFilterTab;
  onFilterTab: (tab: UploadFilterTab) => void;
}

export function UploadsSummaryStrip({
  uploading,
  completed,
  failed,
  uploadedBytes,
  filterTab,
  onFilterTab,
}: UploadsSummaryStripProps) {
  return (
    <section aria-label="Upload summary" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-1.5">
      <Chip kind="uploading" count={uploading} selected={filterTab === 'uploading'} onFilter={() => onFilterTab('uploading')}>
        Uploading
      </Chip>
      <Chip kind="completed" count={completed} selected={filterTab === 'completed'} onFilter={() => onFilterTab('completed')}>
        Completed
      </Chip>
      <Chip kind="failed" count={failed} selected={filterTab === 'failed'} onFilter={() => onFilterTab('failed')}>
        Failed
      </Chip>

      <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />

      <span
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 text-xs text-foreground-secondary"
        title="Data already pushed to hosts from completed uploads"
      >
        <HardDrive size={13} className="text-foreground-muted" aria-hidden="true" />
        <span className="tabular-nums">{formatBytes(uploadedBytes)}</span> uploaded
      </span>
      <span
        className="hidden h-9 items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 text-xs text-foreground-secondary lg:inline-flex"
        title="Rows currently held in the upload history"
      >
        <CheckCircle2 size={13} className="text-foreground-muted" aria-hidden="true" />
        <span className="tabular-nums">{uploading + completed + failed}</span> entries
      </span>
    </section>
  );
}
