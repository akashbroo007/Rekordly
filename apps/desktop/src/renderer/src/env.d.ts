/// <reference types="vite/client" />
import type { DesktopApi } from '@rekordly/shared/contracts';

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}

export {};
