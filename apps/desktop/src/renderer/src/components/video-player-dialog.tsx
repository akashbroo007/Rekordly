/**
 * Full-fledged in-app video player for local recordings.
 * Renders as an edge-to-edge fullscreen overlay (like a native player):
 * the video fills the whole window (object-contain), controls float over
 * the bottom, close button top-right. Streams through sf-media:// with
 * Range requests → instant seeking on multi-GB files.
 *
 * Features: play/pause, seek bar with buffered indicator, volume + mute
 * (hover slider), playback speed, picture-in-picture, exit-fullscreen,
 * keyboard shortcuts (space/K, ←/→ 5s, J/L 10s, ↑/↓ volume, M mute,
 * F fullscreen, P PiP, Esc close), double-click fullscreen toggle.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, type CSSProperties } from 'react';
import {
  Bookmark,
  Camera,
  Captions,
  Expand,
  FastForward,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Scissors,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { formatDuration } from '@rekordly/shared/format';
import type { EditorTimelineDto, RecordingDto } from '@rekordly/shared/contracts';
import { EditorPanel } from './editor/editor-panel';
import { useToastStore } from '../stores/toast-store';

/** Convert an absolute local file path into a sf-media:// URL. */
export function toMediaUrl(filePath: string): string {
  return `sf-media:///${filePath.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ponytail: adjustable editor sidebar — default/minimum widths and where the
// chosen width persists across sessions. The 45% ceiling mirrors the player
// bars' `min(<width>px, 45%)` inset so the video area never collapses.
const EDITOR_DEFAULT_WIDTH = 360;
const EDITOR_MIN_WIDTH = 280;
const EDITOR_WIDTH_STORAGE_KEY = 'rekordly:editorWidth';

function loadEditorWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(EDITOR_WIDTH_STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= EDITOR_MIN_WIDTH) {
      return Math.min(stored, Math.max(EDITOR_MIN_WIDTH, Math.floor(window.innerWidth * 0.45)));
    }
  } catch {
    /* storage unavailable — fall back to the default */
  }
  return EDITOR_DEFAULT_WIDTH;
}

/** Filename-safe timestamp for screenshots: 1:23:45 → "1-23-45". */
function formatTimecodeStamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join('-');
}

// --- #9 watch position (resume playback) -------------------------------------

export interface WatchPosition {
  t: number;
  d: number;
  at: number;
}

function watchPositionKey(recordingId: string | null | undefined, filePath: string): string {
  return recordingId !== undefined && recordingId !== null && recordingId !== ''
    ? `rekordly:watch:${recordingId}`
    : `rekordly:watch:file:${filePath}`;
}

function loadWatchPosition(key: string): WatchPosition | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<WatchPosition>;
    if (typeof parsed.t === 'number' && typeof parsed.d === 'number') return { t: parsed.t, d: parsed.d, at: parsed.at ?? 0 };
  } catch {
    /* corrupt entry — ignore */
  }
  return null;
}

function persistWatchPosition(key: string, pos: WatchPosition): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(pos));
  } catch {
    /* storage unavailable — resume just won't persist */
  }
}

/** 0..1 progress for library cards; 0 when nothing worth showing. */
export function watchProgressFor(recordingId: string | null | undefined, filePath: string): number {
  const pos = loadWatchPosition(watchPositionKey(recordingId, filePath));
  if (pos === null || pos.d <= 0 || pos.t < 5) return 0;
  const ratio = pos.t / pos.d;
  // Finished (or nearly) → no progress bar, it's just "watched".
  return ratio >= 0.95 ? 0 : Math.max(0.01, Math.min(0.99, ratio));
}

// --- #13 markers (bookmarks while watching) ----------------------------------

function markersKey(recordingId: string | null | undefined, filePath: string): string {
  return recordingId !== undefined && recordingId !== null && recordingId !== ''
    ? `rekordly:markers:${recordingId}`
    : `rekordly:markers:file:${filePath}`;
}

function loadMarkers(key: string): number[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function persistMarkers(key: string, markers: number[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(markers));
  } catch {
    /* storage unavailable — markers just won't persist */
  }
}

// ponytail: the custom TitleBar (still mounted under this overlay) is a
// native `-webkit-app-region: drag` strip, and Electron keeps that region
// active even when it's visually covered — only `no-drag` subtracts from it.
// Without this, the top 40px of the window swallowed clicks before they
// reached the DOM, so the Trim/Cut tabs and the close X were half-dead.
const NO_DRAG_REGION = { WebkitAppRegion: 'no-drag' } as CSSProperties;

export function VideoPlayerDialog({
  title,
  filePath,
  posterPath,
  open,
  onOpenChange,
  recordingId,
  fps,
  initialEditing,
  previousRecording,
  nextRecording,
  onPlayRecording,
  onEdited,
  onOpenResult,
}: {
  title: string;
  filePath: string;
  posterPath?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Library id — enables the built-in trim/cut editor. Omit for downloads. */
  recordingId?: string | null;
  /** Source fps — enables 1-frame stepping in the editor (unknown → 30fps fallback). */
  fps?: number | null;
  /** Open directly in edit mode (e.g. from Library → Trim/Edit). */
  initialEditing?: boolean;
  /** #10 playlist: neighbours in the current library view. */
  previousRecording?: RecordingDto | null;
  nextRecording?: RecordingDto | null;
  /** Fired to swap the player to another recording (prev/next/auto-advance). */
  onPlayRecording?: (recording: RecordingDto) => void;
  /** Fired after an edit is exported (parent refreshes library queries). */
  onEdited?: (recording: RecordingDto) => void;
  /** Fired when the user plays an export result (parent swaps the file). */
  onOpenResult?: (recording: RecordingDto) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editing, setEditing] = useState(initialEditing ?? false);
  const canEdit = recordingId !== undefined && recordingId !== null;
  const pushToast = useToastStore((state) => state.push);
  const [grabbingFrame, setGrabbingFrame] = useState(false);
  // #4 loop: R cycles whole-video loop; [ ] mark A/B points (both set = active).
  const [loopAll, setLoopAll] = useState(false);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const abLoopRef = useRef<{ a: number; b: number } | null>(null);
  abLoopRef.current = loopA !== null && loopB !== null && loopB > loopA ? { a: loopA, b: loopB } : null;
  // #5 remaining-time toggle on the duration label.
  const [showRemaining, setShowRemaining] = useState(false);
  // #7 rotation (deg) + object-fit mode, cycled with V / Z or the control
  // bar buttons. Rotated video is counter-scaled to its measured container
  // so it never overflows.
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<'contain' | 'fill' | 'cover'>('contain');
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const measure = (): void => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  const rotated = rotation === 90 || rotation === 270;
  const fitClass = fitMode === 'contain' ? 'object-contain' : fitMode === 'cover' ? 'object-cover' : 'object-fill';
  const rotateScale = rotated && containerSize.w > 0 && containerSize.h > 0
    ? Math.min(containerSize.w / containerSize.h, containerSize.h / containerSize.w)
    : 1;
  // #8 stats-for-nerds overlay.
  const [showStats, setShowStats] = useState(false);
  const [mediaInfo, setMediaInfo] = useState<{ resolution: string; videoCodec: string; audioCodec: string; bitrate: number; fps: number } | null>(null);

  useEffect(() => {
    if (!open || filePath === '') return;
    let alive = true;
    setMediaInfo(null);
    window.desktop.app
      .getMediaInfo({ filePath })
      .then((info) => {
        if (alive) setMediaInfo(info);
      })
      .catch(() => {
        if (alive) setMediaInfo(null);
      });
    return () => {
      alive = false;
    };
  }, [open, filePath]);

  // #11 subtitles — auto-load a sidecar .srt/.vtt when present, CC on by default.
  const trackRef = useRef<HTMLTrackElement>(null);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  useEffect(() => {
    if (!open || filePath === '') return;
    let alive = true;
    setSubtitleUrl(null);
    setCaptionsOn(true);
    window.desktop.app
      .findSubtitle({ filePath })
      .then((result) => {
        if (alive) setSubtitleUrl(result?.dataUrl ?? null);
      })
      .catch(() => {
        if (alive) setSubtitleUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [open, filePath]);
  useEffect(() => {
    const trackElement = trackRef.current;
    if (trackElement !== null) trackElement.track.mode = captionsOn ? 'showing' : 'hidden';
  }, [captionsOn, subtitleUrl]);
  const [editorWidth, setEditorWidth] = useState<number>(loadEditorWidth);
  const [resizing, setResizing] = useState(false);
  const resizingRef = useRef(false);
  // ponytail: mirrors editorWidth so pointerup/double-click handlers persist
  // the latest width without depending on render-timing closures.
  const editorWidthRef = useRef(editorWidth);

  const persistEditorWidth = useCallback((width: number): void => {
    editorWidthRef.current = width;
    try {
      window.localStorage.setItem(EDITOR_WIDTH_STORAGE_KEY, String(width));
    } catch {
      /* storage unavailable — width just won't persist */
    }
  }, []);

  // ponytail: window shrank (or was maximized) — re-clamp the stored panel
  // width to the 45% ceiling so the video area stays usable.
  useEffect(() => {
    const onWindowResize = (): void => {
      setEditorWidth((w) => Math.max(EDITOR_MIN_WIDTH, Math.min(Math.floor(window.innerWidth * 0.45), w)));
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  // ponytail: pointer capture keeps the drag alive even when the cursor
  // wanders off the thin grab strip; moves guard on the ref so hovering
  // the strip never resizes by accident.
  const beginEditorResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizingRef.current = true;
    setResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const moveEditorResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizingRef.current) return;
    const max = Math.max(EDITOR_MIN_WIDTH, Math.floor(window.innerWidth * 0.45));
    const next = Math.max(EDITOR_MIN_WIDTH, Math.min(max, Math.round(window.innerWidth - e.clientX)));
    persistEditorWidth(next);
    setEditorWidth(next);
  }, [persistEditorWidth]);

  const endEditorResize = useCallback(() => {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    setResizing(false);
  }, []);

  // ponytail: track the app window's maximized state for the maximize button
  useEffect(() => {
    if (!open) return;
    void window.desktop.windowControls.isMaximized().then(setMaximized);
    return window.desktop.windowControls.onMaximizedChanged(setMaximized);
  }, [open]);

  // ponytail: maximize/restore the actual app window
  const toggleWindowMaximize = useCallback(() => {
    void window.desktop.windowControls.toggleMaximize();
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (v === null) return;
    if (v.paused) void v.play(); else v.pause();
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (v === null) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + seconds));
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (v === null) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, seconds));
  }, []);

  const togglePiP = useCallback(async () => {
    const v = videoRef.current;
    if (v === null) return;
    try {
      if (document.pictureInPictureElement !== null) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch {
      /* PiP unsupported */
    }
  }, []);

  // ponytail: transient OSD pill (2× boost, volume, rotate…) — auto-fades.
  const [osd, setOsd] = useState<string | null>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showOsd = useCallback((text: string): void => {
    setOsd(text);
    if (osdTimer.current !== null) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsd(null), 800);
  }, []);
  useEffect(() => () => {
    if (osdTimer.current !== null) clearTimeout(osdTimer.current);
  }, []);

  // #3 hold-to-fast-forward: hold → to boost to 2× after a beat, release to
  // restore. A quick tap still seeks ±5s; holding repeats are suppressed so
  // the hold never double-seeks.
  const holdBoost = useRef<{ timer: ReturnType<typeof setTimeout> | null; boosted: boolean; rate: number }>({
    timer: null,
    boosted: false,
    rate: 1,
  });

  const startHoldBoost = useCallback(() => {
    const hold = holdBoost.current;
    if (hold.timer !== null) return;
    hold.timer = setTimeout(() => {
      hold.timer = null;
      const v = videoRef.current;
      if (v === null) return;
      hold.boosted = true;
      hold.rate = v.playbackRate;
      v.playbackRate = 2;
      showOsd('▶▶ 2×');
    }, 300);
  }, [showOsd]);

  const endHoldBoost = useCallback(() => {
    const hold = holdBoost.current;
    if (hold.timer !== null) {
      clearTimeout(hold.timer);
      hold.timer = null;
    }
    if (!hold.boosted) return;
    hold.boosted = false;
    const v = videoRef.current;
    if (v !== null) {
      v.playbackRate = hold.rate;
      setSpeed(hold.rate);
    }
  }, []);

  // #12 skip quiet parts — silence spans fetched lazily on first toggle,
  // then playback jumps over them (same mechanism as the editor's preview).
  const [skipQuiet, setSkipQuiet] = useState(false);
  const [quietSpans, setQuietSpans] = useState<Array<{ start: number; end: number }> | null>(null);
  const [quietLoading, setQuietLoading] = useState(false);
  const skipSpansRef = useRef<Array<{ start: number; end: number }> | null>(null);
  skipSpansRef.current = skipQuiet ? quietSpans : null;
  useEffect(() => {
    if (!open || !skipQuiet || quietSpans !== null || quietLoading) return;
    setQuietLoading(true);
    showOsd('Analyzing audio…');
    window.desktop.editor
      .detectSilence({
        ...(recordingId !== undefined && recordingId !== null ? { recordingId } : { filePath }),
        thresholdDb: -40,
        minSeconds: 2,
      })
      .then((spans) => {
        setQuietSpans(spans.map((s) => ({ start: s.startSeconds, end: s.endSeconds })));
        showOsd(spans.length > 0 ? `${spans.length} quiet spans skipped` : 'No quiet spans found');
      })
      .catch(() => {
        setQuietSpans(null);
        showOsd('Silence detection failed');
      })
      .finally(() => setQuietLoading(false));
  }, [open, skipQuiet, quietSpans, quietLoading, recordingId, filePath, showOsd]);

  // #13 markers — M drops a bookmark at the playhead, Shift+M removes the
  // nearest one; ticks render on the seek bar and jump on click.
  const markerKey = markersKey(recordingId, filePath);
  const [markers, setMarkers] = useState<number[]>([]);
  useEffect(() => {
    if (!open) return;
    setMarkers(loadMarkers(markerKey));
  }, [open, markerKey]);

  const addMarker = useCallback((): void => {
    const v = videoRef.current;
    if (v === null) return;
    setMarkers((prev) => {
      if (prev.some((t) => Math.abs(t - v.currentTime) < 0.5)) return prev;
      const next = [...prev, v.currentTime].sort((a, b) => a - b);
      persistMarkers(markerKey, next);
      showOsd(`Marker added · ${formatDuration(Math.floor(v.currentTime))}`);
      return next;
    });
  }, [markerKey, showOsd]);

  const removeNearestMarker = useCallback((): void => {
    const v = videoRef.current;
    if (v === null) return;
    setMarkers((prev) => {
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < prev.length; i++) {
        const dist = Math.abs(prev[i]! - v.currentTime);
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      if (best < 0 || bestDist > 3) {
        showOsd('No marker near the playhead');
        return prev;
      }
      const next = prev.filter((_, i) => i !== best);
      persistMarkers(markerKey, next);
      showOsd('Marker removed');
      return next;
    });
  }, [markerKey, showOsd]);

  // #14 double-tap skip with a YouTube-style ripple — also used by the J/L
  // keys and the ±10s buttons so every 10s hop gets the same feedback.
  const [ripple, setRipple] = useState<{ side: 'left' | 'right'; seq: number } | null>(null);
  const rippleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (rippleTimer.current !== null) clearTimeout(rippleTimer.current);
  }, []);
  const seekWithRipple = useCallback(
    (seconds: number) => {
      seekBy(seconds);
      setRipple({ side: seconds > 0 ? 'right' : 'left', seq: Date.now() });
      if (rippleTimer.current !== null) clearTimeout(rippleTimer.current);
      rippleTimer.current = setTimeout(() => setRipple(null), 500);
    },
    [seekBy],
  );

  // Double-click: sides seek ±10s with the ripple, the center keeps the
  // maximize toggle.
  const onContainerDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / Math.max(1, rect.width);
      if (rel < 0.35) seekWithRipple(-10);
      else if (rel > 0.65) seekWithRipple(10);
      else toggleWindowMaximize();
    },
    [seekWithRipple, toggleWindowMaximize],
  );

  // #2 frame grab — ffmpeg pulls the full-res frame in the main process
  // (the sf-media stream would taint a renderer canvas), then the data URL
  // goes to the clipboard or a native Save dialog.
  const grabFrame = useCallback(
    async (copy: boolean) => {
      const v = videoRef.current;
      if (v === null || filePath === '' || grabbingFrame) return;
      setGrabbingFrame(true);
      try {
        const { dataUrl } = await window.desktop.app.extractFrame({ filePath, seconds: v.currentTime });
        if (copy) {
          await window.desktop.app.copyImage({ dataUrl });
          pushToast({ level: 'info', title: 'Frame copied', message: 'Screenshot copied to the clipboard.' });
          return;
        }
        const stamp = formatTimecodeStamp(v.currentTime);
        const safeTitle = title.replace(/[^\w\-. ]+/g, '_').trim().slice(0, 60) || 'screenshot';
        const saved = await window.desktop.app.saveImage({
          dataUrl,
          suggestedName: `${safeTitle}_${stamp}.png`,
        });
        if (saved.canceled) return;
        pushToast({ level: 'info', title: 'Screenshot saved', message: saved.filePath ?? '' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushToast({ level: 'error', title: 'Screenshot failed', message: msg.slice(0, 200) });
      } finally {
        setGrabbingFrame(false);
      }
    },
    [filePath, grabbingFrame, pushToast, title],
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      // ponytail: don't hijack typing in the editor's timecode fields —
      // previously an 'm' in an input muted the video. Escape stays allowed.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && e.key !== 'Escape') return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault(); togglePlay(); break;
        // ponytail: while the editor is open, ←/→ belong to the editor panel
        // (1-frame stepping, Shift = 1s) — the player's ±5s seek stands down.
        // #3: holding → arms a 2× boost (no repeated seeks); the tap-or-boost
        // decision happens on keyup below.
        case 'ArrowRight':
          if (editing || e.repeat) break;
          startHoldBoost();
          break;
        case 'ArrowLeft':
          if (editing) break;
          seekBy(-5); break;
        case 'l': seekWithRipple(10); break;
        case 'j': seekWithRipple(-10); break;
        case 'ArrowUp': {
          e.preventDefault();
          const v = videoRef.current;
          if (v) { v.volume = Math.min(1, v.volume + 0.1); setVolume(v.volume); }
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const v = videoRef.current;
          if (v) { v.volume = Math.max(0, v.volume - 0.1); setVolume(v.volume); }
          break;
        }
        case 'm': {
          const v = videoRef.current;
          if (v) { v.muted = !v.muted; setMuted(v.muted); }
          break;
        }
        case 'f': toggleWindowMaximize(); break;
        case 'p': void togglePiP(); break;
        case 's':
          e.preventDefault();
          void grabFrame(false); break;
        // #4 loop controls
        case 'r': {
          const next = !loopAll;
          setLoopAll(next);
          if (next) { setLoopA(null); setLoopB(null); }
          showOsd(next ? 'Loop: whole video' : 'Loop off');
          break;
        }
        case '[': {
          // Set A — or clear the finished A-B pair.
          if (loopA !== null && loopB !== null) {
            setLoopA(null);
            setLoopB(null);
            showOsd('Loop off');
          } else {
            const v = videoRef.current;
            if (v !== null) {
              setLoopA(v.currentTime);
              setLoopB(null);
              showOsd(`Loop A set · ${formatDuration(Math.floor(v.currentTime))}`);
            }
          }
          break;
        }
        case ']': {
          const v = videoRef.current;
          if (v !== null) {
            const a = loopA;
            if (a !== null && v.currentTime > a) {
              setLoopB(v.currentTime);
              showOsd(`Loop A-B · ${formatDuration(Math.floor(a))} → ${formatDuration(Math.floor(v.currentTime))}`);
            } else {
              setLoopB(v.currentTime);
              showOsd('Loop B set — press [ first for A');
            }
          }
          break;
        }
        // #7 rotate / fit
        case 'v': {
          const next = (rotation + 90) % 360;
          setRotation(next);
          showOsd(next === 0 ? 'Rotation reset' : `Rotated ${next}°`);
          break;
        }
        case 'z': {
          const order: Array<'contain' | 'fill' | 'cover'> = ['contain', 'fill', 'cover'];
          const next = order[(order.indexOf(fitMode) + 1) % order.length]!;
          setFitMode(next);
          showOsd(next === 'contain' ? 'Fit: contain' : next === 'fill' ? 'Fit: stretch' : 'Fit: fill (crop)');
          break;
        }
        // #13 markers: B adds at the playhead, Shift+B removes the nearest.
        // ponytail: 'm' is taken by mute — markers were dead code when they
        // collided on the same case (mute won, bookmarks never fired).
        case 'b':
          addMarker();
          break;
        case 'B':
          removeNearestMarker();
          break;
        // #12 skip quiet parts
        case 'x': {
          const next = !skipQuiet;
          setSkipQuiet(next);
          if (!next) showOsd('Skip quiet: off');
          else if (quietSpans !== null) showOsd(`${quietSpans.length} quiet spans skipped`);
          break;
        }
        // #11 captions toggle — always responds, even without a sidecar.
        case 'c': {
          if (subtitleUrl !== null) {
            setCaptionsOn((v) => !v);
            showOsd(captionsOn ? 'Subtitles off' : 'Subtitles on');
          } else {
            showOsd('No subtitles found next to this video');
          }
          break;
        }
        // #5 remaining-time toggle (also clickable on the time label).
        case 't': {
          const next = !showRemaining;
          setShowRemaining(next);
          showOsd(next ? 'Showing remaining time' : 'Showing total time');
          break;
        }
        // #8 stats overlay
        case 'd':
          setShowStats((v) => !v);
          break;
        case 'Escape': onOpenChange(false); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, editing, loopAll, loopA, loopB, fitMode, rotation, subtitleUrl, captionsOn, skipQuiet, quietSpans, markers, showRemaining, togglePlay, seekWithRipple, togglePiP, grabFrame, startHoldBoost, addMarker, removeNearestMarker, showOsd, onOpenChange, toggleWindowMaximize]);

  // #3 keyup decides tap (±5s seek) vs hold (restore 2× boost).
  useEffect(() => {
    if (!open) return;
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key !== 'ArrowRight') return;
      const hold = holdBoost.current;
      if (hold.boosted) {
        endHoldBoost();
        return;
      }
      if (hold.timer !== null) {
        clearTimeout(hold.timer);
        hold.timer = null;
        if (!editing) seekBy(5);
      }
    };
    const onBlur = (): void => endHoldBoost();
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [open, editing, seekBy, endHoldBoost]);

  // Reset state when opened with a new file
  useEffect(() => {
    if (open) {
      setCurrentTime(0);
      setDuration(0);
      setError(false);
      setPlaying(false);
      setShowControls(true);
      setEditing(initialEditing ?? false);
      setLoopA(null);
      setLoopB(null);
      setLoopAll(false);
      setRotation(0);
      setFitMode('contain');
      setUpNext(null);
      setSkipQuiet(false);
      setQuietSpans(null);
    }
  }, [open, filePath, initialEditing]);

  // #10 auto-advance: when the video ends and a next recording exists, show
  // an "Up next" card with a 5s countdown (cancelable).
  const [upNext, setUpNext] = useState<RecordingDto | null>(null);
  const [upNextCount, setUpNextCount] = useState(5);
  useEffect(() => {
    if (upNext === null) return;
    setUpNextCount(5);
    const interval = setInterval(() => {
      setUpNextCount((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [upNext]);
  useEffect(() => {
    if (upNext !== null && upNextCount === 0 && onPlayRecording !== undefined) {
      const rec = upNext;
      setUpNext(null);
      onPlayRecording(rec);
    }
  }, [upNext, upNextCount, onPlayRecording]);

  // #1 hover thumbnails — one cached filmstrip per file (shared with the
  // editor's timeline cache); generation is background/best-effort and the
  // plain seek bar keeps working until it's ready.
  const [filmstrip, setFilmstrip] = useState<EditorTimelineDto | null>(null);
  const [seekHover, setSeekHover] = useState<{ pct: number; time: number } | null>(null);
  useEffect(() => {
    if (!open || filePath === '') return;
    let alive = true;
    setFilmstrip(null);
    window.desktop.editor
      .timeline({ filePath, thumbCount: 20, includeWaveform: false })
      .then((t) => {
        if (alive) setFilmstrip(t);
      })
      .catch(() => {
        if (alive) setFilmstrip(null);
      });
    return () => {
      alive = false;
    };
  }, [open, filePath]);

  const updateSeekHover = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (v === null || !v.duration || v.duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setSeekHover({ pct, time: (pct / 100) * v.duration });
  }, []);

  // #9 resume: save the position every ~5s + on close; restore on metadata.
  const watchKey = watchPositionKey(recordingId, filePath);
  useEffect(() => {
    if (!open) return;
    const save = (): void => {
      const v = videoRef.current;
      if (v === null || !v.duration || v.duration <= 0) return;
      // Don't persist near start (nothing to resume) or near end (finished).
      if (v.currentTime < 5 || v.currentTime > v.duration - 10) return;
      persistWatchPosition(watchKey, { t: v.currentTime, d: v.duration, at: Date.now() });
    };
    const interval = setInterval(save, 5000);
    return () => {
      clearInterval(interval);
      save();
    };
  }, [open, watchKey]);

  const clearWatchPosition = useCallback((key: string): void => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, []);

  // #6 mouse-wheel volume over the video — 5% steps with an OSD readout.
  const onWheelVolume = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      const v = videoRef.current;
      if (v === null) return;
      const next = Math.max(0, Math.min(1, v.volume + (e.deltaY < 0 ? 0.05 : -0.05)));
      v.volume = next;
      v.muted = next === 0;
      setVolume(next);
      setMuted(next === 0);
      showOsd(next === 0 ? 'Muted' : `Volume ${Math.round(next * 100)}%`);
    },
    [showOsd],
  );

  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current !== null) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      // ponytail: keep controls visible while editing — the editor panel is
      // driven from the control bar.
      if (!videoRef.current?.paused && !editing) setShowControls(false);
    }, 2500);
  }, [editing]);

  useEffect(() => () => {
    if (hideControlsTimer.current !== null) clearTimeout(hideControlsTimer.current);
  }, []);

  if (!open) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black" style={NO_DRAG_REGION}>
      {/* Top bar — pointer-events-none except the close button, AND confined
          to the video area while editing (same as the bottom bar). The inset
          follows the adjustable editor sidebar width (45% ceiling). */}
      <div
        className={`pointer-events-none absolute left-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 py-3 ${
          resizing ? '' : 'transition-all duration-200'
        } ${showControls || !playing ? 'opacity-100' : 'opacity-0'}`}
        style={{ right: editing && canEdit ? `min(${editorWidth}px, 45%)` : 0 }}
      >
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{title}</p>
        <button
          type="button"
          onClick={(e) => { e.currentTarget.blur(); onOpenChange(false); }}
          className="pointer-events-auto min-h-9 min-w-9 shrink-0 rounded-sm bg-black/40 p-2 text-white transition-colors hover:bg-white/15"
          aria-label="Close player"
          title="Close player (Esc)"
        >
          <X size={20} />
        </button>
      </div>

      {/* Video area + editor sidebar */}
      <div className="flex min-h-0 flex-1">
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onMouseMove={bumpControls}
        onClick={togglePlay}
        onDoubleClick={onContainerDoubleClick}
        onWheel={onWheelVolume}
      >
        {filePath ? (
          <video
            ref={videoRef}
            src={toMediaUrl(filePath)}
            poster={posterPath ? toMediaUrl(posterPath) : undefined}
            className={`h-full w-full ${fitClass}`}
            style={rotation !== 0 ? { transform: `rotate(${rotation}deg) scale(${rotateScale})` } : undefined}
            autoPlay
            playsInline
            loop={loopAll}
            onPlay={() => setPlaying(true)}
            onPause={() => { setPlaying(false); setShowControls(true); }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              // #12 skip quiet parts — jump over silence as playback crosses it.
              const spans = skipSpansRef.current;
              if (spans !== null) {
                for (const s of spans) {
                  if (v.currentTime >= s.start && v.currentTime < s.end) {
                    v.currentTime = s.end;
                    break;
                  }
                }
              }
              // #4 A-B loop — jump back to A when playback crosses B.
              const ab = abLoopRef.current;
              if (ab !== null && v.currentTime >= ab.b) {
                v.currentTime = ab.a;
                setCurrentTime(ab.a);
                return;
              }
              setCurrentTime(v.currentTime);
              if (v.buffered.length > 0) {
                setBuffered(v.buffered.end(v.buffered.length - 1));
              }
            }}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setDuration(v.duration || 0);
              // #9 resume — only for genuinely long partial watches.
              const saved = loadWatchPosition(watchKey);
              if (
                saved !== null &&
                saved.d > 0 &&
                Math.abs(saved.d - (v.duration || saved.d)) < 5 &&
                saved.t > 30 &&
                saved.t < (v.duration || saved.d) - 60
              ) {
                v.currentTime = saved.t;
                setCurrentTime(saved.t);
                showOsd(`Resumed · ${formatDuration(Math.floor(saved.t))} (press 0 to restart)`);
              }
            }}
            onEnded={() => {
              clearWatchPosition(watchKey);
              // #10 auto-advance to the next recording in the view.
              if (nextRecording !== null && nextRecording !== undefined && onPlayRecording !== undefined) {
                setUpNext(nextRecording);
              }
            }}
            onError={() => setError(true)}
          >
            {subtitleUrl !== null && (
              <track ref={trackRef} kind="subtitles" srcLang="en" src={subtitleUrl} default />
            )}
          </video>
        ) : null}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Failed to load video. The file may have been moved or deleted.
          </div>
        )}

        {/* OSD pill (2× boost, volume, rotate, fit…) */}
        {osd !== null && (
          <div className="pointer-events-none absolute left-1/2 top-[42%] z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/75 px-4 py-2 text-sm font-medium text-white">
            {osd}
          </div>
        )}

        {/* #8 stats-for-nerds overlay */}
        {showStats && (
          <div
            className="absolute left-3 top-3 z-10 select-none rounded-sm bg-black/80 px-3 py-2 text-[11px] leading-relaxed text-white/90 ring-1 ring-white/15"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 font-medium text-white">Stats</p>
            <p>Resolution: {mediaInfo?.resolution ?? 'probing…'}</p>
            <p>Video: {mediaInfo?.videoCodec ?? '—'}{mediaInfo?.fps ? ` · ${mediaInfo.fps}fps` : ''}</p>
            <p>Audio: {mediaInfo?.audioCodec ?? '—'}</p>
            <p>Bitrate: {mediaInfo?.bitrate ? `${Math.round(mediaInfo.bitrate / 1000)}kbps` : '—'}</p>
            <p>Buffer: {Math.max(0, buffered - currentTime).toFixed(1)}s</p>
            <p>Speed: {speed}x · Vol: {muted ? 'muted' : `${Math.round(volume * 100)}%`}</p>
            <p>Fit: {fitMode}{rotation !== 0 ? ` · ${rotation}°` : ''}</p>
            <p className="max-w-[280px] truncate text-white/50" title={filePath}>{filePath}</p>
          </div>
        )}

        {/* #14 double-tap skip ripple */}
        {ripple !== null && (
          <div
            key={ripple.seq}
            className={`pointer-events-none absolute top-1/2 z-10 flex h-24 w-24 -translate-y-1/2 items-center justify-center ${ripple.side === 'left' ? 'left-[12%]' : 'right-[12%]'}`}
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/25" />
            <span className="relative rounded-full bg-black/60 px-2 py-1 text-[11px] font-medium text-white">
              {ripple.side === 'left' ? '« 10s' : '10s »'}
            </span>
          </div>
        )}

        {/* Center play button when paused */}
        {!playing && !error && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              togglePlay()
            }}
            className="absolute rounded-full bg-black/50 p-6 text-white transition-transform hover:scale-105"
            aria-label="Play"
          >
            <Play size={40} />
          </button>
        )}

        {/* #10 Up next card — YouTube-style: centered ABOVE the control bar
            with thumbnail + countdown bar (the old corner position hid the
            card behind the bar, which is a higher stacking layer). */}
        {upNext !== null && (
          <div
            className="absolute bottom-[92px] left-1/2 z-30 w-[340px] -translate-x-1/2 overflow-hidden rounded-md bg-black/90 p-3 shadow-xl ring-1 ring-white/15"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-3">
              {upNext.thumbnailPath ? (
                <img src={toMediaUrl(upNext.thumbnailPath)} alt="" className="h-[54px] w-[96px] shrink-0 rounded-sm object-cover" />
              ) : (
                <div className="flex h-[54px] w-[96px] shrink-0 items-center justify-center rounded-sm bg-white/5">
                  <Play size={18} className="text-white/60" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-white/60">Up next in {upNextCount}s</p>
                <p className="mt-0.5 truncate text-xs font-medium text-white" title={upNext.title}>{upNext.title}</p>
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const rec = upNext;
                      setUpNext(null);
                      onPlayRecording?.(rec);
                    }}
                    className="rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-white hover:brightness-110"
                  >
                    Play now
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpNext(null)}
                    className="rounded-sm bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cancel autoplay"
                onClick={() => setUpNext(null)}
                className="self-start p-0.5 text-white/50 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
            {/* countdown bar */}
            <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full bg-primary transition-all duration-1000 ease-linear"
                style={{ width: `${(upNextCount / 5) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Built-in trim/cut sidebar — own stacking layer above the player
          bars so no overlay can cover the editor controls. Safe: both bars
          already inset by the same adjustable width. */}
      {editing && canEdit && recordingId && (
        <>
          {/* Grab strip: drag to resize the editor panel, double-click to
              reset. Above the bars (z-30) so it never gets covered. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize editor panel"
            title="Drag to resize — double-click to reset"
            className={`relative z-30 w-1 shrink-0 cursor-col-resize bg-white/10 transition-colors hover:bg-primary/60 ${resizing ? 'bg-primary' : ''}`}
            onPointerDown={beginEditorResize}
            onPointerMove={moveEditorResize}
            onPointerUp={endEditorResize}
            onPointerCancel={endEditorResize}
            onDoubleClick={() => {
              persistEditorWidth(EDITOR_DEFAULT_WIDTH);
              setEditorWidth(EDITOR_DEFAULT_WIDTH);
            }}
          />
          <aside
            className="relative z-30 shrink-0 overflow-hidden border-l border-white/10 bg-black/85"
            style={{ width: editorWidth, maxWidth: '45%' }}
            onClick={(e) => e.stopPropagation()}
          >
          <EditorPanel
            key={`${recordingId}:${filePath}`}
            videoRef={videoRef}
            recordingId={recordingId}
            duration={duration}
            currentTime={currentTime}
            fps={fps ?? null}
            onSeek={seekTo}
            onEdited={(rec) => onEdited?.(rec)}
            onOpenResult={(rec) => onOpenResult?.(rec)}
          />
        </aside>
        </>
      )}
      </div>

      {/* Bottom control bar — stops at the editor sidebar so the seek bar
          stays clickable while editing (it used to run underneath it). */}
      <div
        className={`absolute bottom-0 left-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-10 ${
          resizing ? '' : 'transition-all duration-200'
        } ${
          showControls || !playing ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ right: editing && canEdit ? `min(${editorWidth}px, 45%)` : 0 }}
      >
        {/* Seek bar */}
        <div
          className="group/seek relative h-1.5 w-full cursor-pointer rounded-full bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            const v = videoRef.current;
            if (v !== null && duration > 0) v.currentTime = ratio * duration;
          }}
          onMouseEnter={updateSeekHover}
          onMouseMove={updateSeekHover}
          onMouseLeave={() => setSeekHover(null)}
        >
          {/* #1 hover preview: exact frame cell + timecode, clamped near edges */}
          {seekHover !== null && duration > 0 && (
            <div
              className="pointer-events-none absolute bottom-full z-10 mb-2 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${Math.max(5, Math.min(95, seekHover.pct))}%` }}
            >
              {filmstrip !== null && (
                <div
                  className="h-[68px] w-[120px] overflow-hidden rounded-sm bg-black ring-1 ring-white/20"
                  style={{
                    backgroundImage: `url(${filmstrip.stripUrl})`,
                    backgroundSize: `${filmstrip.thumbCount * 100}% 100%`,
                    backgroundPositionX: `-${Math.min(filmstrip.thumbCount - 1, Math.floor((seekHover.time / duration) * filmstrip.thumbCount)) * 120}px`,
                  }}
                />
              )}
              <div className="mt-1 rounded-sm bg-black/80 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
                {formatDuration(Math.floor(seekHover.time))}
              </div>
            </div>
          )}
          {/* #4 A-B loop segment */}
          {abLoopRef.current !== null && duration > 0 && (
            <div
              className="pointer-events-none absolute inset-y-0 rounded-full bg-amber-400/60"
              style={{
                left: `${(abLoopRef.current.a / duration) * 100}%`,
                width: `${((abLoopRef.current.b - abLoopRef.current.a) / duration) * 100}%`,
              }}
            />
          )}
          {/* #12 quiet spans — grey stripes show what will be skipped */}
          {skipQuiet && quietSpans !== null && duration > 0 && quietSpans.map((s, i) => (
            <div
              key={i}
              className="pointer-events-none absolute inset-y-0 rounded-full bg-neutral-500/60"
              style={{
                left: `${(s.start / duration) * 100}%`,
                width: `${((s.end - s.start) / duration) * 100}%`,
              }}
            />
          ))}
          {/* #13 marker ticks — click to jump */}
          {markers.map((t, i) => (
            <div
              key={i}
              title={`Marker · ${formatDuration(Math.floor(t))}`}
              className="absolute inset-y-0 z-10 w-[3px] -translate-x-1/2 cursor-pointer bg-amber-300 transition-colors hover:bg-amber-200"
              style={{ left: `${(t / duration) * 100}%` }}
              onClick={(e) => {
                e.stopPropagation();
                seekTo(t);
              }}
            />
          ))}
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${bufferedPercent}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${progress}%` }} />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover/seek:opacity-100"
            style={{ left: `${progress}%` }}
          />
        </div>

        <div className="mt-2 flex items-center gap-2 text-white">
          <button type="button" onClick={togglePlay} className="p-1 hover:text-primary" aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button type="button" onClick={() => seekWithRipple(-10)} className="p-1 hover:text-primary" aria-label="Back 10 seconds">
            <RotateCcw size={17} />
          </button>
          <button type="button" onClick={() => seekWithRipple(10)} className="p-1 hover:text-primary" aria-label="Forward 10 seconds">
            <RotateCw size={17} />
          </button>

          <div className="group/vol flex items-center gap-1">
            <button
              type="button"
              className="p-1 hover:text-primary"
              aria-label="Mute"
              onClick={() => {
                const v = videoRef.current;
                if (v) { v.muted = !v.muted; setMuted(v.muted); }
              }}
            >
              {muted || volume === 0 ? <VolumeX size={19} /> : volume < 0.5 ? <Volume1 size={19} /> : <Volume2 size={19} />}
            </button>
            {/* Volume slider appears only while hovering the speaker icon */}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const val = Number(e.target.value);
                const v = videoRef.current;
                if (v) { v.volume = val; v.muted = val === 0; }
                setVolume(val);
                setMuted(val === 0);
              }}
              style={{
                background: `linear-gradient(to right, var(--color-primary, #6366f1) ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.25) ${(muted ? 0 : volume) * 100}%)`,
              }}
              className="h-1 w-0 cursor-pointer appearance-none rounded-full opacity-0 transition-all duration-200 group-hover/vol:w-24 group-hover/vol:opacity-100 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              aria-label="Volume"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !showRemaining;
              setShowRemaining(next);
              showOsd(next ? 'Showing remaining time' : 'Showing total time');
            }}
            className="ml-1 rounded-sm px-1 py-0.5 text-xs tabular-nums text-white/90 hover:bg-white/10 hover:text-white"
            title="Toggle remaining time (T)"
          >
            {showRemaining
              ? `${formatDuration(Math.floor(currentTime))} / -${formatDuration(Math.floor(Math.max(0, duration - currentTime)))}`
              : `${formatDuration(Math.floor(currentTime))} / ${formatDuration(Math.floor(duration))}`}
          </button>

          <div className="ml-auto flex items-center gap-1">
            <select
              value={speed}
              onChange={(e) => {
                const s = Number(e.target.value);
                setSpeed(s);
                const v = videoRef.current;
                if (v) v.playbackRate = s;
              }}
              className="rounded-sm bg-white/10 px-1 py-0.5 text-xs text-white outline-none"
              aria-label="Playback speed"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s} className="text-black">{s}x</option>
              ))}
            </select>
          {/* #10 playlist navigation */}
          {previousRecording !== null && previousRecording !== undefined && onPlayRecording !== undefined && (
            <button
              type="button"
              onClick={() => onPlayRecording(previousRecording)}
              className="p-1 hover:text-primary"
              aria-label="Previous video"
              title="Previous video"
            >
              <SkipBack size={17} />
            </button>
          )}
          {nextRecording !== null && nextRecording !== undefined && onPlayRecording !== undefined && (
            <button
              type="button"
              onClick={() => onPlayRecording(nextRecording)}
              className="p-1 hover:text-primary"
              aria-label="Next video"
              title="Next video"
            >
              <SkipForward size={17} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const next = (rotation + 90) % 360;
                setRotation(next);
                showOsd(next === 0 ? 'Rotation reset' : `Rotated ${next}°`);
              }}
              className={`p-1 hover:text-primary ${rotation !== 0 ? 'text-primary' : ''}`}
              aria-label="Rotate video"
              title="Rotate 90° (V)"
            >
              <RotateCw size={17} />
            </button>
            <button
              type="button"
              onClick={() => {
                const order: Array<'contain' | 'fill' | 'cover'> = ['contain', 'fill', 'cover'];
                const next = order[(order.indexOf(fitMode) + 1) % order.length]!;
                setFitMode(next);
                showOsd(next === 'contain' ? 'Fit: contain' : next === 'fill' ? 'Fit: stretch' : 'Fit: fill (crop)');
              }}
              className={`p-1 hover:text-primary ${fitMode !== 'contain' ? 'text-primary' : ''}`}
              aria-label="Fit mode"
              title="Fit mode (Z): contain → stretch → fill"
            >
              <Expand size={17} />
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !loopAll;
                setLoopAll(next);
                if (next) { setLoopA(null); setLoopB(null); }
                showOsd(next ? 'Loop: whole video' : 'Loop off');
              }}
              className={`p-1 hover:text-primary ${loopAll ? 'text-primary' : abLoopRef.current !== null ? 'text-amber-400' : ''}`}
              aria-label="Loop"
              title="Loop whole video (R) · A-B loop: [ then ]"
            >
              <Repeat size={17} />
            </button>
            <button
              type="button"
              onClick={() => void grabFrame(false)}
              disabled={grabbingFrame}
              className="p-1 hover:text-primary disabled:opacity-40"
              aria-label="Screenshot"
              title="Screenshot (S)"
            >
              <Camera size={17} />
            </button>
          {/* #13 bookmark button for discoverability */}
          <button
            type="button"
            onClick={addMarker}
            className="p-1 hover:text-primary"
            aria-label="Add marker"
            title="Add marker (B) — Shift+B removes the nearest"
          >
            <Bookmark size={17} />
          </button>
          {/* #12 skip quiet parts */}
          <button
            type="button"
            onClick={() => setSkipQuiet((v) => !v)}
            className={`p-1 hover:text-primary ${skipQuiet ? 'text-primary' : ''}`}
            aria-label="Skip quiet parts"
            title="Skip quiet parts (X)"
          >
            <FastForward size={17} />
          </button>
          {/* #11 captions — always visible; dimmed when no sidecar exists */}
          <button
            type="button"
            onClick={() => {
              if (subtitleUrl === null) {
                showOsd('No subtitles found next to this video');
                return;
              }
              setCaptionsOn((v) => !v);
              showOsd(captionsOn ? 'Subtitles off' : 'Subtitles on');
            }}
            className={`p-1 hover:text-primary ${subtitleUrl === null ? 'text-white/30' : captionsOn ? 'text-primary' : 'text-white/50'}`}
            aria-label="Subtitles"
            title={subtitleUrl !== null ? 'Subtitles (C)' : 'No subtitles file next to this video'}
          >
            <Captions size={17} />
          </button>
          <button
            type="button"
            onClick={() => void togglePiP()} className="p-1 hover:text-primary" aria-label="Picture in picture">
              <PictureInPicture2 size={17} />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className={`rounded-sm p-1 hover:text-primary ${editing ? 'bg-primary/30 text-primary' : ''}`}
                aria-label={editing ? 'Close editor' : 'Trim / edit video'}
                title="Trim / edit (non-destructive)"
              >
                <Scissors size={17} />
              </button>
            )}
            <button type="button" onClick={toggleWindowMaximize} className="p-1 hover:text-primary" aria-label={maximized ? 'Restore window' : 'Maximize window'}>
              {maximized ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}