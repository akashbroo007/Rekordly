import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow, Rectangle } from 'electron';

export interface WindowState {
  bounds: Partial<Rectangle>;
  maximized: boolean;
}

const DEFAULT_STATE: WindowState = {
  bounds: { width: 1440, height: 900 },
  maximized: false,
};

export function loadWindowState(userDataPath: string): WindowState {
  const file = join(userDataPath, 'window-state.json');
  if (!existsSync(file)) {
    return DEFAULT_STATE;
  }
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as {
      bounds?: Partial<Record<keyof Rectangle, unknown>>;
      maximized?: unknown;
    };
    const num = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    const bounds: Partial<Rectangle> = {
      x: num(data.bounds?.x),
      y: num(data.bounds?.y),
      width: num(data.bounds?.width),
      height: num(data.bounds?.height),
    };
    return { bounds, maximized: data.maximized === true };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveWindowState(userDataPath: string, win: BrowserWindow): void {
  const file = join(userDataPath, 'window-state.json');
  const state: WindowState = {
    bounds: win.getNormalBounds(),
    maximized: win.isMaximized(),
  };
  mkdirSync(userDataPath, { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2));
}
