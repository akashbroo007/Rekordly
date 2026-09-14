/**
 * Editor timeline: filmstrip + waveform with direct manipulation.
 *
 * - Trim/Audio mode: drag the in/out handles, click to seek.
 * - Cut mode: drag on empty space to paint a cut range, drag blocks to
 *   move them, drag a block edge to resize it.
 *
 * ponytail: the filmstrip is ONE wide tiled image with even, time-ordered
 * cells, so time → x is a plain linear ratio — no per-cell bookkeeping.
 * All pointer drags capture on the ROOT element (handles/blocks only start
 * the drag), so a single move/up pair drives every gesture.
 */
import { useRef, useState } from 'react';
import { formatDuration } from '@rekordly/shared/format';

export interface TimelineCut {
  start: number;
  end: number;
}

type DragKind = 'cut-new' | 'cut-move' | 'cut-l' | 'cut-r' | 'in' | 'out';

interface DragState {
  kind: DragKind;
  index: number | null;
  startX: number;
  startTime: number;
  origStart: number;
  origEnd: number;
  moved: boolean;
}

export function EditorTimeline({
  duration,
  currentTime,
  inPoint,
  outPoint,
  cuts,
  mode,
  stripUrl,
  waveformUrl,
  onSeek,
  onSetIn,
  onSetOut,
  onAddCut,
  onUpdateCut,
}: {
  duration: number;
  currentTime: number;
  inPoint: number;
  /** Effective out point (duration when unset). */
  outPoint: number;
  cuts: TimelineCut[];
  mode: 'trim' | 'cut';
  stripUrl: string | null;
  waveformUrl: string | null;
  onSeek: (seconds: number) => void;
  onSetIn: (seconds: number) => void;
  onSetOut: (seconds: number) => void;
  onAddCut: (start: number, end: number) => void;
  onUpdateCut: (index: number, start: number, end: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [ghost, setGhost] = useState<TimelineCut | null>(null);

  const timeAt = (clientX: number): number => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width <= 0 || duration <= 0) return 0;
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
  };

  const round1 = (value: number): number => Math.round(value * 10) / 10;

  /** Neighbor bounds for moving/resizing cut i without creating overlaps. */
  const cutBounds = (index: number): { lower: number; upper: number } => {
    const sorted = cuts.map((c, i) => ({ ...c, i })).sort((a, b) => a.start - b.start);
    const pos = sorted.findIndex((c) => c.i === index);
    const lower = pos > 0 ? sorted[pos - 1]!.end : 0;
    const upper = pos >= 0 && pos < sorted.length - 1 ? sorted[pos + 1]!.start : duration;
    return { lower, upper };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (duration <= 0) return;
    if (mode === 'trim') {
      onSeek(timeAt(e.clientX));
      return;
    }
    // Cut mode: empty-space press starts a paint-a-cut drag; a clean click
    // (no movement) falls back to seek on pointer-up.
    const t = timeAt(e.clientX);
    dragRef.current = { kind: 'cut-new', index: null, startX: e.clientX, startTime: t, origStart: t, origEnd: t, moved: false };
    setGhost({ start: round1(t), end: round1(t) });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (drag === null) return;
    const t = timeAt(e.clientX);
    if (Math.abs(e.clientX - drag.startX) > 3) drag.moved = true;
    switch (drag.kind) {
      case 'cut-new': {
        setGhost({ start: round1(Math.min(drag.startTime, t)), end: round1(Math.max(drag.startTime, t)) });
        break;
      }
      case 'cut-move': {
        if (drag.index === null) break;
        const len = drag.origEnd - drag.origStart;
        const { lower, upper } = cutBounds(drag.index);
        const target = Math.max(lower, Math.min(upper - len, drag.origStart + (t - drag.startTime)));
        onUpdateCut(drag.index, round1(target), round1(target + len));
        break;
      }
      case 'cut-l': {
        if (drag.index === null) break;
        const { lower } = cutBounds(drag.index);
        const target = Math.max(lower, Math.min(drag.origEnd - 0.2, t));
        onUpdateCut(drag.index, round1(target), drag.origEnd);
        break;
      }
      case 'cut-r': {
        if (drag.index === null) break;
        const { upper } = cutBounds(drag.index);
        const target = Math.min(upper, Math.max(drag.origStart + 0.2, t));
        onUpdateCut(drag.index, drag.origStart, round1(target));
        break;
      }
      case 'in': {
        onSetIn(round1(Math.max(0, Math.min(outPoint - 0.2, t))));
        break;
      }
      case 'out': {
        onSetOut(round1(Math.max(inPoint + 0.2, Math.min(duration, t))));
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag === null) return;
    if (drag.kind === 'cut-new') {
      const t = timeAt(e.clientX);
      const start = round1(Math.min(drag.startTime, t));
      const end = round1(Math.max(drag.startTime, t));
      setGhost(null);
      if (drag.moved && end - start >= 0.2) onAddCut(start, end);
      else if (!drag.moved) onSeek(drag.startTime);
    }
  };

  /** Shared drag-starter for handles and cut blocks (capture on the root). */
  const beginDrag = (
    e: React.PointerEvent,
    kind: DragKind,
    index: number | null,
    origStart: number,
    origEnd: number,
  ): void => {
    if (duration <= 0) return;
    e.stopPropagation();
    dragRef.current = {
      kind,
      index,
      startX: e.clientX,
      startTime: timeAt(e.clientX),
      origStart,
      origEnd,
      moved: false,
    };
    rootRef.current?.setPointerCapture(e.pointerId);
  };

  const keepSelected = mode === 'trim' && duration > 0 && outPoint > inPoint && (inPoint > 0.05 || outPoint < duration - 0.05);

  return (
    <div
      ref={rootRef}
      className="relative h-[74px] touch-none select-none overflow-hidden rounded-sm ring-1 ring-white/10"
      style={{ cursor: mode === 'cut' ? 'crosshair' : 'pointer' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Filmstrip */}
      <div className="absolute inset-x-0 top-0 h-[44px] overflow-hidden bg-black/60">
        {stripUrl !== null ? (
          <img
            src={stripUrl}
            alt="Timeline filmstrip"
            draggable={false}
            className="h-full w-full"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-[10px] text-white/40"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 12px, rgba(255,255,255,0.02) 12px 24px)',
            }}
          >
            Building timeline…
          </div>
        )}
      </div>

      {/* Waveform */}
      <div className="absolute inset-x-0 top-[48px] h-[24px] overflow-hidden rounded-sm bg-black/60">
        {waveformUrl !== null ? (
          <img
            src={waveformUrl}
            alt="Audio waveform"
            draggable={false}
            className="h-full w-full opacity-70"
          />
        ) : null}
      </div>

      {/* Cut blocks (cut mode) */}
      {mode === 'cut' &&
        cuts.map((c, i) => (
          <div
            key={i}
            className="absolute inset-y-0 cursor-grab border-x-2 border-error/80 bg-error/35 active:cursor-grabbing"
            style={{ left: `${(c.start / duration) * 100}%`, width: `${((c.end - c.start) / duration) * 100}%` }}
            title={`${formatDuration(Math.floor(c.start))} → ${formatDuration(Math.floor(c.end))} — drag to move, edges to resize`}
            onPointerDown={(e) => beginDrag(e, 'cut-move', i, c.start, c.end)}
          >
            <div
              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-error/70"
              onPointerDown={(e) => beginDrag(e, 'cut-l', i, c.start, c.end)}
            />
            <div
              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-error/70"
              onPointerDown={(e) => beginDrag(e, 'cut-r', i, c.start, c.end)}
            />
          </div>
        ))}

      {/* Ghost range while painting a new cut */}
      {ghost !== null && ghost.end > ghost.start && (
        <div
          className="pointer-events-none absolute inset-y-0 border-x-2 border-white/70 bg-white/25"
          style={{
            left: `${(ghost.start / duration) * 100}%`,
            width: `${((ghost.end - ghost.start) / duration) * 100}%`,
          }}
        />
      )}

      {/* Keep-region hint (trim/audio) */}
      {keepSelected && (
        <div
          className="pointer-events-none absolute inset-y-0 border-x-2 border-primary bg-primary/15"
          style={{ left: `${(inPoint / duration) * 100}%`, width: `${((outPoint - inPoint) / duration) * 100}%` }}
        />
      )}

      {/* Playhead */}
      {duration > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 w-[2px] bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
      )}

      {/* In / out handles (trim/audio) */}
      {mode === 'trim' && duration > 0 && (
        <>
          <div
            className="absolute inset-y-0 w-[10px] -translate-x-1/2 cursor-ew-resize rounded-sm bg-primary shadow"
            style={{ left: `${(inPoint / duration) * 100}%` }}
            title={`In ${formatDuration(Math.floor(inPoint))} — drag to adjust`}
            onPointerDown={(e) => beginDrag(e, 'in', null, inPoint, outPoint)}
          />
          <div
            className="absolute inset-y-0 w-[10px] -translate-x-1/2 cursor-ew-resize rounded-sm bg-primary shadow"
            style={{ left: `${(outPoint / duration) * 100}%` }}
            title={`Out ${formatDuration(Math.floor(outPoint))} — drag to adjust`}
            onPointerDown={(e) => beginDrag(e, 'out', null, inPoint, outPoint)}
          />
        </>
      )}
    </div>
  );
}
