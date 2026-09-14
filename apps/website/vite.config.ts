import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ponytail: absolute base so SPA routes (/docs/:section, /roadmap, …) get
  // valid asset URLs on Cloudflare Pages — with "./" a deep link like
  // /docs/plugins would resolve assets against /docs/.
  base: "/",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
  },
});
