/**
 * UploadDropzone — compact drag-and-drop zone above the upload list.
 * Full-width hero when the list is empty; one quiet row once recordings are
 * queued below. Handlers are owned by the page (same addUpload path the
 * "Upload File" button and the recordings picker use).
 */
import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { CloudUpload, Library, Upload } from 'lucide-react';
import { Button } from '@rekordly/ui';
import { filePathsFromDrop } from './uploads-format';

export interface UploadDropzoneProps {
  /** Compact single-line layout (set when the list below is not empty). */
  compact?: boolean;
  /** No usable provider or an add is in flight — zone is inert. */
  disabled?: boolean;
  onBrowse?: () => void;
  onChooseFromRecordings?: () => void;
  onSetup?: () => void;
  onFiles?: (paths: string[]) => void;
}

export function UploadDropzone({
  compact = false,
  disabled = false,
  onBrowse,
  onChooseFromRecordings,
  onSetup,
  onFiles,
}: UploadDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (disabled) return;
    event.preventDefault();
    dragDepth.current += 1;
    if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) setDragOver(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (disabled) return;
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (disabled || onFiles === undefined) return;
    const paths = filePathsFromDrop(event.dataTransfer);
    if (paths.length > 0) onFiles(paths);
  };

  const borderTone = dragOver ? 'border-primary bg-primary/10' : 'border-border bg-panel/50 hover:border-primary/40';

  if (compact) {
    return (
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center gap-3 rounded-md border border-dashed px-3 py-1.5 text-xs text-foreground-muted transition-colors ${borderTone} ${dragOver ? 'bg-primary/10' : ''}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <CloudUpload size={14} className="shrink-0 text-foreground-muted" aria-hidden="true" />
          <span className="truncate">Drop recordings here or browse for a file to add more.</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {onBrowse !== undefined && (
            <Button variant="secondary" size="sm" disabled={disabled} onClick={onBrowse}>
              <Upload size={12} /> Upload File
            </Button>
          )}
          {onChooseFromRecordings !== undefined && (
            <Button variant="ghost" size="sm" disabled={disabled} onClick={onChooseFromRecordings}>
              <Library size={12} /> From Recordings
            </Button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label="Add files for upload"
      className={`flex flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 py-10 text-center transition-colors duration-150 ${borderTone} ${
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
      }`}
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full bg-elevated transition-colors ${
          dragOver ? 'text-primary' : 'text-foreground-muted'
        }`}
      >
        <CloudUpload size={22} />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">
          {disabled ? 'Set up an upload host to add files' : 'Drop recordings here or Browse'}
        </p>
        <p className="mt-1 text-xs text-foreground-muted">
          {disabled
            ? 'Cloud storage providers are configured in Settings → Cloud Storage.'
            : 'Drag one or more media files from your files app, or queue a finished recording from your library.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {disabled && onSetup !== undefined ? (
          <Button variant="secondary" size="sm" onClick={onSetup}>
            Set up
          </Button>
        ) : (
          <>
            {onBrowse !== undefined && (
              <Button variant="secondary" size="sm" disabled={disabled} onClick={onBrowse}>
                <Upload size={12} /> Upload File
              </Button>
            )}
            {onChooseFromRecordings !== undefined && (
              <Button variant="ghost" size="sm" disabled={disabled} onClick={onChooseFromRecordings}>
                <Library size={12} /> Choose from Recordings
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
