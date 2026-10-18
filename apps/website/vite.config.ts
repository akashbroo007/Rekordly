import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// ponytail: the desktop release workflow rewrites public/app-version.json and
// pushes it to main on every release, so each Pages deploy links the installer
// asset of the release it shipped with. Falling back to the REKORDLY_VERSION
// env (local overrides), then 0.1.0, so local builds stay working.
const installerVersion = (() => {
  if (process.env.REKORDLY_VERSION) return process.env.REKORDLY_VERSION;
  try {
    const path = fileURLToPath(new URL("./public/app-version.json", import.meta.url));
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { version?: string };
    if (typeof parsed.version === "string" && parsed.version !== "") return parsed.version;
  } catch {
    /* file missing — fall through */
  }
  return "0.1.0";
})();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ponytail: absolute base so SPA routes (/docs/:section, /roadmap, …) get
  // valid asset URLs on Cloudflare Pages — with "./" a deep link like
  // /docs/plugins would resolve assets against /docs/.
  base: "/",
  define: {
    // ponytail: baked in at build time so the direct installer download link
    // points at the release the site was built for (the version is part of
    // the release-asset filename). REKORDLY_VERSION overrides for local
    // testing of a specific version.
    __APP_VERSION__: JSON.stringify(installerVersion),
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
  },
});
