import { Copy, Minus, RadioTower, Square, X } from 'lucide-react';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';

const DRAG_REGION = { WebkitAppRegion: 'drag' } as CSSProperties;
const NO_DRAG_REGION = { WebkitAppRegion: 'no-drag' } as CSSProperties;

// ponytail: standard Windows-style caption buttons — full-height, square,
// no rounded hover highlight (matches native window controls).
const CONTROL_CLASS =
  'flex h-10 w-11 items-center justify-center rounded-none transition-colors duration-150';

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.desktop.windowControls.isMaximized().then(setMaximized);
    return window.desktop.windowControls.onMaximizedChanged(setMaximized);
  }, []);

  const toggleMaximize = useCallback(() => {
    void window.desktop.windowControls.toggleMaximize().then(setMaximized);
  }, []);

  return (
    <header
      className="flex h-10 shrink-0 select-none items-center border-b border-border bg-panel"
      style={DRAG_REGION}
      onDoubleClick={toggleMaximize}
    >
      <div className="flex items-center gap-2 pl-3 pr-1">
        <RadioTower size={16} className="shrink-0 text-primary" />
        <span className="text-sm font-bold tracking-tight text-foreground">Rekordly</span>
      </div>

      <div className="ml-auto flex items-stretch gap-0 pr-0" style={NO_DRAG_REGION}>
        <button
          type="button"
          aria-label="Minimize"
          title="Minimize"
          onClick={() => void window.desktop.windowControls.minimize()}
          className={`${CONTROL_CLASS} text-foreground-secondary hover:bg-hover hover:text-foreground`}
        >
          <Minus size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={toggleMaximize}
          className={`${CONTROL_CLASS} text-foreground-secondary hover:bg-hover hover:text-foreground`}
        >
          {maximized ? <Copy size={13} strokeWidth={1.5} /> : <Square size={12} strokeWidth={1.5} />}
        </button>
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={() => void window.desktop.windowControls.close()}
          className={`${CONTROL_CLASS} text-foreground-secondary hover:bg-error hover:text-white`}
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
