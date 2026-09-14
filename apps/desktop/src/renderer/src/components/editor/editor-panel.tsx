/**
 * Built-in editor panel (trim + cut + audio) rendered inside the video player.
 * Non-destructive: every export creates a NEW file + library row — the
 * original recording is never modified.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Music, Play, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { formatDuration } from '@rekordly/shared/format';
import type { EditorSilenceSpanDto, EditorTimelineDto, RecordingDto } from '@rekordly/shared/contracts';
import { useToastStore } from '../../stores/toast-store';
import { clampSeconds, formatTimecode, parseTimecode } from './timecode';
import { EditorTimeline } from './editor-timeline';

interface CutRange {
  start: number;
  end: number;
}

const MAX_CUTS = 50;

/**
 * ponytail: the preload bridge bundles when the app starts — an app launched
 * before the editor update has no `window.desktop.editor`, which used to
 * surface as a raw `Cannot read properties of undefined (reading 'trim')`.
 */
function hasEditorBridge(): boolean {
  const bridge = (window.desktop as unknown as { editor?: object }).editor;
  return bridge !== undefined && bridge !== null;
}

export function EditorPanel({
  videoRef,
  recordingId,
  duration,
  currentTime,
  fps,
  onSeek,
  onEdited,
  onOpenResult,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  recordingId: string;
  duration: number;
  currentTime: number;
  /** Source fps — enables 1-frame stepping with ←/→ (0 → fallback 30fps). */
  fps?: number | null;
  onSeek: (seconds: number) => void;
  onEdited: (recording: RecordingDto) => void;
  onOpenResult: (recording: RecordingDto) => void;
}) {
  const pushToast = useToastStore((state) => state.push);
  const [tab, setTab] = useState<'trim' | 'cut' | 'audio'>('trim');
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [cuts, setCuts] = useState<CutRange[]>([]);
  const [accurate, setAccurate] = useState(false);
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'm4a'>('mp3');
  const [exporting, setExporting] = useState(false);
  const [exportPercent, setExportPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecordingDto | null>(null);
  const [timeline, setTimeline] = useState<EditorTimelineDto | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<EditorSilenceSpanDto[] | null>(null);

  /** Auto-pause point for selection preview; cut ranges to skip while previewing. */
  const previewUntilRef = useRef<number | null>(null);
  const skipRef = useRef<CutRange[]>([]);
  const inRef = useRef(inPoint);
  const outRef = useRef<number | null>(outPoint);
  inRef.current = inPoint;
  outRef.current = outPoint;

  /** Active export op — matches progress events and cancel calls. */
  const activeOpIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);

  const out = outPoint ?? duration;

  // ponytail: the panel drives preview directly on the <video> element —
  // selection preview auto-pauses at the out point, cut preview skips
  // removed ranges so you hear what the export will sound like.
  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    const onTime = (): void => {
      for (const s of skipRef.current) {
        if (video.currentTime >= s.start && video.currentTime < s.end) {
          video.currentTime = s.end;
          break;
        }
      }
      const until = previewUntilRef.current;
      if (until !== null && video.currentTime >= until) {
        previewUntilRef.current = null;
        skipRef.current = [];
        video.pause();
      }
    };
    const onPause = (): void => {
      previewUntilRef.current = null;
      skipRef.current = [];
    };
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('pause', onPause);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('pause', onPause);
    };
  }, [videoRef]);

  // Timeline assets (filmstrip + waveform) — generated once per file in the
  // main process and cached; failures degrade to the plain bar silently.
  useEffect(() => {
    if (!hasEditorBridge()) return;
    let alive = true;
    window.desktop.editor
      .timeline({ recordingId, thumbCount: 20 })
      .then((t) => {
        if (alive) setTimeline(t);
      })
      .catch(() => {
        if (alive) setTimeline(null);
      });
    return () => {
      alive = false;
    };
  }, [recordingId]);

  // Export progress events (matched by opId).
  useEffect(() => {
    if (!hasEditorBridge()) return;
    return window.desktop.editor.onExportProgress((e) => {
      if (e.opId === activeOpIdRef.current) setExportPercent((prev) => e.percent ?? prev);
    });
  }, []);

  // ponytail: I/O to mark in/out from the playhead (YouTube-style) plus
  // 1-frame stepping with ←/→ (Shift = 1s). Ignored while typing in an
  // input or while an export is running. The player's own arrow handler
  // stands down while editing, so these are the only seek arrows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (exporting) return;
      const v = videoRef.current;
      if (v === null) return;
      if (e.key === 'i' || e.key === 'I') {
        setInPoint(round1(v.currentTime));
        setResult(null);
      } else if (e.key === 'o' || e.key === 'O') {
        setOutPoint(round1(v.currentTime));
        setResult(null);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / (fps !== undefined && fps !== null && fps > 0 ? fps : 30);
        const next = Math.max(0, Math.min(v.duration || duration, v.currentTime + (e.key === 'ArrowRight' ? step : -step)));
        onSeek(round1(next));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration, exporting, fps, onSeek, videoRef]);

  const setInToNow = useCallback(() => {
    const v = videoRef.current;
    if (v !== null) {
      setInPoint(round1(v.currentTime));
      setResult(null);
    }
  }, [videoRef]);

  const setOutToNow = useCallback(() => {
    const v = videoRef.current;
    if (v !== null) {
      setOutPoint(round1(v.currentTime));
      setResult(null);
    }
  }, [videoRef]);

  const previewSelection = useCallback(() => {
    const v = videoRef.current;
    if (v === null) return;
    const end = outRef.current ?? v.duration ?? 0;
    if (end <= inRef.current) return;
    previewUntilRef.current = end;
    skipRef.current = [];
    v.currentTime = inRef.current;
    void v.play();
  }, [videoRef]);

  const previewCuts = useCallback(() => {
    const v = videoRef.current;
    if (v === null || cuts.length === 0) return;
    previewUntilRef.current = null;
    skipRef.current = cuts;
    v.currentTime = 0;
    void v.play();
  }, [cuts, videoRef]);

  const cutOverlaps = useCallback(
    (start: number, end: number): boolean => cuts.some((c) => start < c.end && end > c.start),
    [cuts],
  );

  /** Append a cut range with validation; returns false (with an error) when rejected. */
  const addCutRange = useCallback(
    (start: number, end: number): boolean => {
      if (end <= start) {
        setError('Cut range is empty — the start must come before the end.');
        return false;
      }
      if (cuts.length >= MAX_CUTS) {
        setError(`Too many cuts (max ${MAX_CUTS}) — export first, then start a new batch.`);
        return false;
      }
      if (cutOverlaps(start, end)) {
        setError('Cut overlaps an existing range — adjust or delete it first.');
        return false;
      }
      // ponytail: a fresh Cut tab starts with In=0/Out=end — adding that would
      // queue a remove-the-whole-video cut the backend rejects. Catch it here
      // with a message instead of a doomed export.
      if (start <= 0 && duration > 0 && end >= duration) {
        setError('This cut would remove the entire video — narrow the range first.');
        return false;
      }
      setError(null);
      setResult(null);
      setCuts((prev) => [...prev, { start, end }].sort((a, b) => a.start - b.start));
      return true;
    },
    [cutOverlaps, cuts.length, duration],
  );

  const addCut = useCallback(() => {
    if (out <= inPoint) {
      setError('Cut range is empty — set the in point before the out point.');
      return;
    }
    addCutRange(inPoint, out);
  }, [addCutRange, inPoint, out]);

  const updateCut = useCallback((index: number, start: number, end: number) => {
    setResult(null);
    setCuts((prev) => prev.map((c, i) => (i === index ? { start, end } : c)).sort((a, b) => a.start - b.start));
  }, []);

  const detectDeadAir = useCallback(async () => {
    if (!hasEditorBridge()) {
      setError('Editor service is unavailable — restart the app to load it (it was started before this update).');
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const spans = await window.desktop.editor.detectSilence({ recordingId, thresholdDb: -40, minSeconds: 2 });
      setSuggestions(spans);
      if (spans.length === 0) {
        pushToast({ level: 'info', title: 'No dead air found', message: 'Nothing quiet enough to suggest as cuts.' });
      }
    } catch (e) {
      setError(exportErrorOf(e));
    } finally {
      setAnalyzing(false);
    }
  }, [pushToast, recordingId]);

  const addAllSuggestions = useCallback(() => {
    if (suggestions === null) return;
    let added = 0;
    let skipped = 0;
    for (const s of suggestions) {
      if (cutOverlaps(s.startSeconds, s.endSeconds) || cuts.length + added >= MAX_CUTS) {
        skipped++;
        continue;
      }
      setError(null);
      setResult(null);
      setCuts((prev) => [...prev, { start: s.startSeconds, end: s.endSeconds }].sort((a, b) => a.start - b.start));
      added++;
    }
    setSuggestions(null);
    if (skipped > 0) {
      pushToast({ level: 'info', title: 'Dead air added', message: `Added ${added} cut${added === 1 ? '' : 's'}, skipped ${skipped} overlapping.` });
    }
  }, [cutOverlaps, cuts.length, pushToast, suggestions]);

  const exportErrorOf = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e);
    // ponytail: stale app without the editor bridge throws a bare TypeError —
    // translate it into an actionable message instead of leaking internals.
    if (/cannot read propert/i.test(msg) && /undefined/i.test(msg)) {
      return 'Editor service is unavailable — restart the app to load it (it was started before this update).';
    }
    // ponytail: surface the service's AppError message, not the IPC wrapper.
    const match = msg.match(/Error invoking remote method[^:]*:\s*Error:\s*(.*)/s);
    return (match?.[1] ?? msg).slice(0, 400);
  };

  /** Shared export runner: op bookkeeping + progress + cancel semantics. */
  const runExport = useCallback(
    async (task: (opId: string) => Promise<void>) => {
      if (!hasEditorBridge()) {
        setError('Editor service is unavailable — restart the app to load it (it was started before this update).');
        return;
      }
      const opId = crypto.randomUUID();
      cancelRequestedRef.current = false;
      activeOpIdRef.current = opId;
      setExportPercent(0);
      setExporting(true);
      setError(null);
      try {
        await task(opId);
      } catch (e) {
        // ponytail: a user-requested cancel surfaces as an ffmpeg failure —
        // swallow it (the user knows) instead of showing a scary error.
        if (!cancelRequestedRef.current) setError(exportErrorOf(e));
      } finally {
        activeOpIdRef.current = null;
        setExporting(false);
      }
    },
    [],
  );

  const doTrim = useCallback(
    async (opId: string) => {
      if (out <= inPoint) {
        setError('Selection is empty — set the in point before the out point.');
        return;
      }
      const rec = await window.desktop.editor.trim({ recordingId, startSeconds: inPoint, endSeconds: out, accurate, opId });
      setResult(rec);
      onEdited(rec);
      pushToast({ level: 'info', title: 'Trim saved', message: `"${rec.title}" added to your library. Original untouched.` });
    },
    [accurate, inPoint, onEdited, out, pushToast, recordingId],
  );

  const doCut = useCallback(
    async (opId: string) => {
      if (cuts.length === 0) {
        setError('Add at least one cut range first.');
        return;
      }
      const rec = await window.desktop.editor.cut({
        recordingId,
        cuts: cuts.map((c) => ({ startSeconds: c.start, endSeconds: c.end })),
        accurate,
        opId,
      });
      setResult(rec);
      onEdited(rec);
      pushToast({ level: 'info', title: 'Edit saved', message: `"${rec.title}" added to your library. Original untouched.` });
    },
    [accurate, cuts, onEdited, pushToast, recordingId],
  );

  const doExtractAudio = useCallback(
    async (opId: string) => {
      const rec = await window.desktop.editor.extractAudio({
        recordingId,
        format: audioFormat,
        startSeconds: inPoint,
        endSeconds: out,
        opId,
      });
      setResult(rec);
      onEdited(rec);
      pushToast({ level: 'info', title: 'Audio saved', message: `"${rec.title}" added to your library. Original untouched.` });
    },
    [audioFormat, inPoint, onEdited, out, pushToast, recordingId],
  );

  const cancelExport = useCallback(() => {
    const opId = activeOpIdRef.current;
    if (opId === null) return;
    cancelRequestedRef.current = true;
    void window.desktop.editor.cancelExport({ opId });
  }, []);

  const selectionInvalid = out <= inPoint;
  const keptSeconds = tab === 'cut'
    ? Math.max(0, duration - cuts.reduce((sum, c) => sum + Math.max(0, c.end - c.start), 0))
    : Math.max(0, out - inPoint);
  const exportDisabled =
    exporting || duration <= 0 || !hasEditorBridge() || (tab === 'cut' ? cuts.length === 0 : selectionInvalid);

  // ponytail: re-evaluated every render — HMR or a stale window can change it.
  const bridgeAvailable = hasEditorBridge();

  // ponytail: each tab owns its pending In/Out — carrying Trim's selection
  // into Cut painted a full-width blue "keep" highlight with no cuts marked,
  // and Add cut would queue a remove-everything range. Reset on switch; the
  // Cut list itself is kept.
  const switchTab = useCallback((next: 'trim' | 'cut' | 'audio') => {
    setTab(next);
    setInPoint(0);
    setOutPoint(null);
    setError(null);
    setResult(null);
    setSuggestions(null);
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 text-white">
      {!bridgeAvailable && (
        <div className="rounded-sm bg-warning/15 px-2 py-1.5 text-[11px] text-warning" role="alert">
          Editor service unavailable — restart the app to load it. The app was started before this update was installed.
        </div>
      )}
      {/* Separate tab buttons (no shared padded container): every visible
          pixel of each pill is the button itself, so there are no dead
          container gaps. Own stacking layer so no overlay can cover them. */}
      <div className="relative z-30 flex items-stretch gap-2">
        <button
          type="button"
          aria-pressed={tab === 'trim'}
          onClick={(e) => { e.currentTarget.blur(); switchTab('trim'); }}
          className={`min-h-9 flex-1 rounded-sm px-2 py-2 text-xs font-medium transition-colors ${tab === 'trim' ? 'bg-primary text-white shadow' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'}`}
        >
          Trim
        </button>
        <button
          type="button"
          aria-pressed={tab === 'cut'}
          onClick={(e) => { e.currentTarget.blur(); switchTab('cut'); }}
          className={`min-h-9 flex-1 rounded-sm px-2 py-2 text-xs font-medium transition-colors ${tab === 'cut' ? 'bg-primary text-white shadow' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'}`}
        >
          Cut ({cuts.length})
        </button>
        <button
          type="button"
          aria-pressed={tab === 'audio'}
          onClick={(e) => { e.currentTarget.blur(); switchTab('audio'); }}
          className={`flex min-h-9 flex-1 items-center justify-center gap-1 rounded-sm px-2 py-2 text-xs font-medium transition-colors ${tab === 'audio' ? 'bg-primary text-white shadow' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'}`}
        >
          <Music size={12} /> Audio
        </button>
      </div>

      <p className="text-[11px] leading-snug text-white/60">
        {tab === 'trim' && 'Keep one highlight. Exports a new file — the original stays untouched.'}
        {tab === 'cut' && 'Mark sections to remove. The rest is joined into a new file.'}
        {tab === 'audio' && 'Extract the selection as a standalone audio file (MP3 / M4A). The video stays untouched.'}
      </p>

      {/* Timeline: filmstrip + waveform + handles */}
      <EditorTimeline
        duration={duration}
        currentTime={currentTime}
        inPoint={inPoint}
        outPoint={out}
        cuts={cuts}
        mode={tab === 'cut' ? 'cut' : 'trim'}
        stripUrl={timeline?.stripUrl ?? null}
        waveformUrl={timeline?.waveformUrl ?? null}
        onSeek={onSeek}
        onSetIn={(s) => { setInPoint(s); setResult(null); }}
        onSetOut={(s) => { setOutPoint(s); setResult(null); }}
        onAddCut={addCutRange}
        onUpdateCut={updateCut}
      />
      <div className="-mt-1 flex justify-between text-[10px] tabular-nums text-white/50">
        <span>{formatDuration(Math.floor(inPoint))}</span>
        <span className="text-white/80">
          {tab === 'trim' ? 'keep ' : tab === 'cut' ? 'keep ≈ ' : 'audio ≈ '}{formatDuration(Math.floor(keptSeconds))}
        </span>
        <span>{formatDuration(Math.floor(out))}</span>
      </div>

      {/* In / out controls — timecode fields (MM:SS.t), not raw seconds. */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[11px] text-white/60">In (I)</label>
          <div className="flex gap-1">
            <TimecodeInput
              label="In point"
              value={inPoint}
              max={duration}
              onCommit={(s) => { setInPoint(s); setResult(null); }}
            />
            <button type="button" onClick={setInToNow} title="Set in point to playhead" className="shrink-0 rounded-sm bg-white/10 px-1.5 text-[11px] hover:bg-white/20">
              ▶
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-white/60">Out (O)</label>
          <div className="flex gap-1">
            <TimecodeInput
              label="Out point"
              value={round1(out)}
              max={duration}
              onCommit={(s) => { setOutPoint(s); setResult(null); }}
            />
            <button type="button" onClick={setOutToNow} title="Set out point to playhead" className="shrink-0 rounded-sm bg-white/10 px-1.5 text-[11px] hover:bg-white/20">
              ▶
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={previewSelection}
          disabled={duration <= 0 || selectionInvalid}
          className="flex flex-1 items-center justify-center gap-1 rounded-sm bg-white/10 px-2 py-1.5 text-xs hover:bg-white/20 disabled:opacity-40"
        >
          <Play size={12} /> Preview selection
        </button>
        {tab === 'cut' && (
          <button
            type="button"
            onClick={addCut}
            disabled={selectionInvalid}
            className="flex flex-1 items-center justify-center gap-1 rounded-sm bg-white/10 px-2 py-1.5 text-xs hover:bg-white/20 disabled:opacity-40"
          >
            <Plus size={12} /> Add cut
          </button>
        )}
      </div>

      {/* Dead-air detection (cut tab) */}
      {tab === 'cut' && (
        <button
          type="button"
          onClick={() => void detectDeadAir()}
          disabled={analyzing || exporting || duration <= 0 || !bridgeAvailable}
          className="flex items-center justify-center gap-1 rounded-sm bg-white/10 px-2 py-1.5 text-xs hover:bg-white/20 disabled:opacity-40"
        >
          <Sparkles size={12} /> {analyzing ? 'Analyzing audio…' : 'Detect dead air'}
        </button>
      )}
      {tab === 'cut' && suggestions !== null && (
        <div className="space-y-1">
          {suggestions.length === 0 ? (
            <p className="text-[11px] text-white/50">No quiet spans found at this threshold.</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <span>
                  {suggestions.length} quiet span{suggestions.length === 1 ? '' : 's'} ·{' '}
                  {formatDuration(Math.floor(suggestions.reduce((sum, s) => sum + (s.endSeconds - s.startSeconds), 0)))} total
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={addAllSuggestions}
                    className="rounded-sm bg-error/30 px-1.5 py-0.5 text-[11px] text-white hover:bg-error/50"
                  >
                    Add all
                  </button>
                  <button
                    type="button"
                    aria-label="Dismiss suggestions"
                    onClick={() => setSuggestions(null)}
                    className="p-0.5 text-white/50 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </span>
              </div>
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-sm bg-white/5 px-2 py-1 text-xs tabular-nums">
                  <span className="flex-1">
                    {formatDuration(Math.floor(s.startSeconds))} → {formatDuration(Math.floor(s.endSeconds))}
                    <span className="ml-1 text-white/50">({formatDuration(Math.floor(s.endSeconds - s.startSeconds))})</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Add this span as a cut"
                    disabled={cutOverlaps(s.startSeconds, s.endSeconds) || cuts.length >= MAX_CUTS}
                    onClick={() => {
                      if (addCutRange(s.startSeconds, s.endSeconds)) {
                        setSuggestions((prev) => (prev ?? []).filter((x) => x !== s));
                      }
                    }}
                    className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[11px] hover:bg-white/20 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Cut list */}
      {tab === 'cut' && (
        <div className="space-y-1">
          {cuts.length === 0 && <p className="text-[11px] text-white/50">No cuts yet — drag on the timeline above or mark a range and press “Add cut”.</p>}
          {cuts.map((c, i) => (
            <div key={i} className="flex items-center gap-2 rounded-sm bg-error/15 px-2 py-1 text-xs tabular-nums">
              <span className="flex-1">
                {formatDuration(Math.floor(c.start))} → {formatDuration(Math.floor(c.end))}
                <span className="ml-1 text-white/50">({formatDuration(Math.floor(c.end - c.start))})</span>
              </span>
              <button
                type="button"
                aria-label="Preview cut"
                onClick={() => { onSeek(c.start); previewUntilRef.current = c.end; skipRef.current = []; videoRef.current?.play().catch(() => undefined); }}
                className="p-0.5 text-white/70 hover:text-white"
              >
                <Play size={12} />
              </button>
              <button
                type="button"
                aria-label="Remove cut"
                onClick={() => { setCuts((prev) => prev.filter((_, j) => j !== i)); setResult(null); }}
                className="p-0.5 text-white/70 hover:text-error"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {cuts.length > 0 && (
            <button type="button" onClick={previewCuts} className="flex w-full items-center justify-center gap-1 rounded-sm bg-white/10 px-2 py-1.5 text-xs hover:bg-white/20">
              <Play size={12} /> Preview with cuts skipped
            </button>
          )}
        </div>
      )}

      {/* Audio format chips */}
      {tab === 'audio' && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/60">Format</span>
          {(['mp3', 'm4a'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={audioFormat === f}
              onClick={() => setAudioFormat(f)}
              className={`min-h-7 rounded-sm px-3 text-[11px] font-medium transition-colors ${audioFormat === f ? 'bg-primary text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Accurate mode — audio exports always re-encode, so the toggle only
          applies to trim/cut. */}
      {tab !== 'audio' && (
        <label className="flex cursor-pointer items-start gap-2 text-[11px] text-white/70">
          <input
            type="checkbox"
            checked={accurate}
            onChange={(e) => setAccurate(e.target.checked)}
            className="mt-0.5 accent-[var(--color-primary,#6366f1)]"
          />
          <span>
            Accurate boundaries (slower re-encode).
            {!accurate && ' Fast mode is instant but snaps cuts to keyframes (±2s).'}
          </span>
        </label>
      )}

      {error && (
        <div className="rounded-sm bg-error/15 px-2 py-1.5 text-[11px] text-error" role="alert">
          {error}
        </div>
      )}

      {exporting ? (
        <div className="flex gap-2">
          <div
            className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-primary/40 px-2 py-2 text-xs text-white"
            role="status"
          >
            Exporting… {Math.max(1, Math.min(99, Math.round(exportPercent)))}%
          </div>
          <button
            type="button"
            onClick={cancelExport}
            className="rounded-sm bg-white/10 px-3 py-2 text-xs text-white hover:bg-error/50"
          >
            Cancel
          </button>
        </div>
      ) : result ? (
        <div className="space-y-2 rounded-sm bg-success/15 px-2 py-2 text-[11px]">
          <p className="font-medium text-success">Saved to library</p>
          <p className="truncate text-white/80" title={result.title}>{result.title}</p>
          <button
            type="button"
            onClick={() => onOpenResult(result)}
            className="flex w-full items-center justify-center gap-1 rounded-sm bg-primary px-2 py-1.5 text-xs font-medium text-white hover:brightness-110"
          >
            <Play size={12} /> Play result
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void runExport(tab === 'trim' ? doTrim : tab === 'cut' ? doCut : doExtractAudio)}
          disabled={exportDisabled}
          title={!bridgeAvailable ? 'Restart the app to load the editor service' : undefined}
          className="flex w-full items-center justify-center gap-1 rounded-sm bg-primary px-2 py-2 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          {tab === 'trim' && 'Export trim as new video'}
          {tab === 'cut' && `Export with ${cuts.length} cut${cuts.length === 1 ? '' : 's'}`}
          {tab === 'audio' && `Export audio as ${audioFormat.toUpperCase()}`}
        </button>
      )}

      <button
        type="button"
        onClick={() => { setInPoint(0); setOutPoint(null); setCuts([]); setError(null); setResult(null); setSuggestions(null); }}
        className="flex items-center justify-center gap-1 text-[11px] text-white/50 hover:text-white"
      >
        <Trash2 size={11} /> Reset
      </button>
    </div>
  );
}

/**
 * Timecode text field (`MM:SS.t`). Commits on blur/Enter, clamps to
 * [0, max], and reverts on invalid input or Escape. While focused, external
 * changes (I/O keys, ▶ buttons) don't steal the typed text.
 */
function TimecodeInput({
  label,
  value,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  max: number;
  onCommit: (seconds: number) => void;
}) {
  const [text, setText] = useState(() => formatTimecode(value));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  // ponytail: set before blurring on Escape — blur always fires after, and
  // without this the blur handler would commit the just-discarded text.
  const skipCommitRef = useRef(false);

  useEffect(() => {
    if (!focused) {
      setText(formatTimecode(value));
      setInvalid(false);
    }
  }, [value, focused]);

  const commit = (current: string, fallback: number): void => {
    const parsed = parseTimecode(current);
    if (parsed === null) {
      setInvalid(true);
      setText(formatTimecode(fallback));
      return;
    }
    setInvalid(false);
    onCommit(round1(clampSeconds(parsed, max, fallback)));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid}
      title='Timecode — e.g. 01:30, 01:30.5, or plain seconds like 90. Invalid entries revert.'
      value={text}
      placeholder="MM:SS.t"
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => { setText(e.target.value); setInvalid(false); }}
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onBlur={() => { setFocused(false); if (skipCommitRef.current) { skipCommitRef.current = false; return; } commit(text, value); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') { skipCommitRef.current = true; setText(formatTimecode(value)); setInvalid(false); (e.currentTarget as HTMLInputElement).blur(); }
      }}
      className={`w-full min-w-0 rounded-sm bg-white/10 px-2 py-1 text-xs tabular-nums text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-primary ${invalid ? 'ring-1 ring-error' : ''}`}
    />
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
