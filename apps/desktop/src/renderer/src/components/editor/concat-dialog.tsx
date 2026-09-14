/**
 * Combine dialog: join multiple library recordings (in order) into one new
 * file. Non-destructive — sources are never modified.
 */
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Play, X } from 'lucide-react';
import { Button, Dialog, DialogContent, Input } from '@rekordly/ui';
import type { RecordingDto } from '@rekordly/shared/contracts';
import { formatDuration } from '@rekordly/shared/format';
import { useToastStore } from '../../stores/toast-store';

export function ConcatDialog({
  recordings,
  open,
  onOpenChange,
  onDone,
}: {
  recordings: RecordingDto[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: (recording: RecordingDto) => void;
}) {
  const pushToast = useToastStore((state) => state.push);
  const [order, setOrder] = useState<string[]>(() => recordings.map((r) => r.id));
  const [title, setTitle] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ponytail: the dialog stays mounted while the library selection changes —
  // reconcile instead of deriving during render. Render-time derivation made
  // `move(i)` indices (into `ordered`) diverge from `order` indices, so
  // up/down moved the wrong rows after the selection changed.
  const idsKey = recordings.map((r) => r.id).join(',');
  useEffect(() => {
    setOrder((prev) => {
      const live = new Set(recordings.map((r) => r.id));
      const kept = prev.filter((id) => live.has(id));
      for (const r of recordings) {
        if (!kept.includes(r.id)) kept.push(r.id);
      }
      return kept;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const byId = new Map(recordings.map((r) => [r.id, r]));
  const ordered = order.map((id) => byId.get(id)).filter((r) => r !== undefined);

  const bridgeAvailable = (window.desktop as unknown as { editor?: object }).editor !== undefined
    && (window.desktop as unknown as { editor?: object }).editor !== null;

  const move = (index: number, delta: -1 | 1): void => {
    setOrder((prev) => {
      const next = [...prev];
      const j = index + delta;
      if (index < 0 || index >= next.length || j < 0 || j >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next;
    });
  };

  const totalSeconds = ordered.reduce((sum, r) => sum + (r.durationSeconds ?? 0), 0);

  const doConcat = async (): Promise<void> => {
    const ids = ordered.map((r) => r.id);
    if (!bridgeAvailable) {
      setError('Editor service is unavailable — restart the app to load it (it was started before this update).');
      return;
    }
    if (ids.length < 2) {
      setError('Select at least two recordings to combine.');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const rec = await window.desktop.editor.concat({
        recordingIds: ids,
        title: title.trim() || undefined,
      });
      pushToast({ level: 'info', title: 'Combined video saved', message: `"${rec.title}" added to your library.` });
      onDone(rec);
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cannot read propert/i.test(msg)) {
        setError('Editor service is unavailable — restart the app to load it (it was started before this update).');
      } else {
        const match = msg.match(/Error invoking remote method[^:]*:\s*Error:\s*(.*)/s);
        setError((match?.[1] ?? msg).slice(0, 400));
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Combine clips" description="Join recordings into one new video, in order." className="max-w-lg">
        <div className="space-y-3">
          {!bridgeAvailable && (
            <div className="rounded-sm bg-warning/10 px-2 py-1.5 text-xs text-warning" role="alert">
              Editor service unavailable — restart the app to load it. The app was started before this update was installed.
            </div>
          )}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {ordered.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2 rounded-sm bg-elevated px-2 py-1.5 text-sm">
                <span className="w-5 shrink-0 text-xs tabular-nums text-foreground-muted">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate" title={r.title}>{r.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-foreground-muted">
                  {r.durationSeconds ? formatDuration(r.durationSeconds) : '-'}
                </span>
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-0.5 text-foreground-muted hover:text-foreground disabled:opacity-30">
                  <ArrowUp size={12} />
                </button>
                <button type="button" aria-label="Move down" disabled={i === ordered.length - 1} onClick={() => move(i, 1)} className="p-0.5 text-foreground-muted hover:text-foreground disabled:opacity-30">
                  <ArrowDown size={12} />
                </button>
                <button
                  type="button"
                  aria-label="Remove from combine list"
                  onClick={() => setOrder((prev) => prev.filter((id) => id !== r.id))}
                  className="p-0.5 text-foreground-muted hover:text-error"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          <p className="text-xs tabular-nums text-foreground-muted">
            {ordered.length} clips · total ≈ {formatDuration(totalSeconds)}
          </p>

          <Input
            label="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Combined clip (${ordered.length} videos)`}
          />

          <p className="text-[11px] text-foreground-muted">
            Clips should share the same resolution/codec — mismatched files fail with a clear error. Originals are never modified.
          </p>

          {error && (
            <div className="rounded-sm bg-error/10 px-2 py-1.5 text-xs text-error" role="alert">
              {error}
            </div>
          )}

          <Button
            loading={exporting}
            disabled={ordered.length < 2 || !bridgeAvailable}
            onClick={() => void doConcat()}
            className="w-full"
          >
            <Play size={14} /> Combine into new video
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
