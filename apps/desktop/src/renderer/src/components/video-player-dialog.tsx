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
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { formatDuration } from '@rekordly/shared/format';

/** Convert an absolute local file path into a sf-media:// URL. */
export function toMediaUrl(filePath: string): string {
  return `sf-media:///${filePath.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function VideoPlayerDialog({
  title,
  filePath,
  posterPath,
  open,
  onOpenChange,
}: {
  title: string;
  filePath: string;
  posterPath?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
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

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': seekBy(5); break;
        case 'ArrowLeft': seekBy(-5); break;
        case 'l': seekBy(10); break;
        case 'j': seekBy(-10); break;
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
        case 'Escape': onOpenChange(false); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, togglePlay, seekBy, togglePiP, onOpenChange, toggleWindowMaximize]);

  // Reset state when opened with a new file
  useEffect(() => {
    if (open) {
      setCurrentTime(0);
      setDuration(0);
      setError(false);
      setPlaying(false);
      setShowControls(true);
    }
  }, [open, filePath]);

  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current !== null) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setShowControls(false);
    }, 2500);
  }, []);

  useEffect(() => () => {
    if (hideControlsTimer.current !== null) clearTimeout(hideControlsTimer.current);
  }, []);

  if (!open) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Top bar */}
      <div
        className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3 transition-opacity duration-200 ${
          showControls || !playing ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <p className="truncate text-sm font-medium text-white">{title}</p>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-sm p-1 text-white hover:bg-white/10"
          aria-label="Close player"
        >
          <X size={20} />
        </button>
      </div>

      {/* Video area — fills the entire window */}
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onMouseMove={bumpControls}
        onClick={togglePlay}
        onDoubleClick={toggleWindowMaximize}
      >
        {filePath ? (
          <video
            ref={videoRef}
            src={toMediaUrl(filePath)}
            poster={posterPath ? toMediaUrl(posterPath) : undefined}
            className="h-full w-full object-contain"
            autoPlay
            playsInline
            onPlay={() => setPlaying(true)}
            onPause={() => { setPlaying(false); setShowControls(true); }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              setCurrentTime(v.currentTime);
              if (v.buffered.length > 0) {
                setBuffered(v.buffered.end(v.buffered.length - 1));
              }
            }}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onError={() => setError(true)}
          />
        ) : null}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Failed to load video. The file may have been moved or deleted.
          </div>
        )}

        {/* Center play button when paused */}
        {!playing && !error && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute rounded-full bg-black/50 p-6 text-white transition-transform hover:scale-105"
            aria-label="Play"
          >
            <Play size={40} />
          </button>
        )}
      </div>

      {/* Bottom control bar */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-10 transition-opacity duration-200 ${
          showControls || !playing ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
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
        >
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
          <button type="button" onClick={() => seekBy(-10)} className="p-1 hover:text-primary" aria-label="Back 10 seconds">
            <RotateCcw size={17} />
          </button>
          <button type="button" onClick={() => seekBy(10)} className="p-1 hover:text-primary" aria-label="Forward 10 seconds">
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

          <span className="ml-1 text-xs tabular-nums text-white/90">
            {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(duration))}
          </span>

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
            <button type="button" onClick={() => void togglePiP()} className="p-1 hover:text-primary" aria-label="Picture in picture">
              <PictureInPicture2 size={17} />
            </button>
            <button type="button" onClick={toggleWindowMaximize} className="p-1 hover:text-primary" aria-label={maximized ? 'Restore window' : 'Maximize window'}>
              {maximized ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}