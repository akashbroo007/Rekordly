import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';

// Subpath aliases keep pino (and the rest of the main-side barrel) out of
// renderer/preload bundles; see packages/shared/src/logger.ts.
const workspaceAliases = {
  '@rekordly/ui/theme.css': fileURLToPath(
    new URL('../../packages/ui/src/theme.css', import.meta.url),
  ),
  '@rekordly/shared/format': fileURLToPath(
    new URL('../../packages/shared/src/format.ts', import.meta.url),
  ),
  '@rekordly/shared/contracts': fileURLToPath(
    new URL('../../packages/shared/src/ipc/contracts.ts', import.meta.url),
  ),
  '@rekordly/shared': fileURLToPath(
    new URL('../../packages/shared/src/index.ts', import.meta.url),
  ),
  '@rekordly/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
};

/**
 * Injects a strict CSP meta tag into the built index.html only.
 * Dev mode stays free of inline-script restrictions so React HMR works.
 */
function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const csp =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        // ponytail: sf-media: is the app's custom protocol streaming local
        // recordings/thumbnails into the renderer (see media-protocol.ts) —
        // without it the packaged app blocks every library thumbnail and
        // video (dev has no CSP, which is why this only broke in builds).
        // ponytail: every remote image in this app is USER-SUPPLIED data from
        // a platform CDN, so 'self' can never enumerate it: creator avatars
        // and live thumbnails come back from each plugin's own CDN (verified
        // in a real profile: static-proxy.strpst.com, imagetransform.icfcdn.com,
        // yt3.googleusercontent.com, static.cam4.com, bss-cdn.dreamcam.com,
        // files.kick.com, hugh.cdn.rumble.cloud — a new plugin adds more), and
        // plugin tiles fetch favicons from public icon services. Blocking them
        // made every avatar, tile and thumbnail blank ONLY in packaged builds,
        // because dev has no CSP at all. Images cannot execute script, so
        // https: is the narrowest source that covers all of them.
        "img-src 'self' data: blob: sf-media: https:; " +
        "font-src 'self' data:; " +
        // ponytail: hls.js fetches playlists/segments over the sf-media relay
        // (XHR/fetch → connect-src) and feeds MSE buffers (media-src); its
        // transmuxer runs in a web worker (worker-src blob:).
        "media-src 'self' sf-media: blob:; connect-src 'self' sf-media:; worker-src 'self' blob:;"
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    // Sandboxed preloads can only require 'electron', so workspace packages
    // are bundled from source instead of being externalized.
    resolve: { alias: workspaceAliases },
    plugins: [],
  },
  renderer: {
    resolve: { alias: workspaceAliases },
    plugins: [react(), tailwindcss(), cspPlugin()],
    server: {
      host: '127.0.0.1',
      port: 5331,
    },
  },
});
