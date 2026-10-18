import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ponytail: absolute base so SPA routes (/docs/:section, /roadmap, …) get
  // valid asset URLs on Cloudflare Pages — with "./" a deep link like
  // /docs/plugins would resolve assets against /docs/.
  base: "/",
  define: {
    // ponytail: baked in at build time so the direct installer download link
    // points at the release the site was built for (the version is part of
    // the release-asset filename). Falls back to apps/desktop/package.json
    // locally so a plain `npm run build` still produces a working link.
    __APP_VERSION__: JSON.stringify(process.env.REKORDLY_VERSION ?? "0.1.0"),
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
  },
});
