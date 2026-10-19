/**
 * Bundles the plugin into a SINGLE self-contained dist/index.js for
 * distribution through the Marketplace.
 *
 * ponytail: the plugin manager's install() copies a plugin folder while
 * stripping node_modules (core/plugin-manager/manager.ts). A downloaded
 * plugin therefore cannot require('@rekordly/plugin-sdk') at runtime — the
 * published artifact must inline the SDK (and zod, which the SDK imports
 * for the manifest schema). In the REPO the workspace dependency keeps
 * working via pnpm symlinks, so CI builds with plain tsc; this step is only
 * for the published zip.
 */
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, '..');

/** esbuild lives in the pnpm store, not in the workspace root node_modules. */
function requireEsbuild() {
  const errors = [];
  try {
    return createRequire(import.meta.url)('esbuild');
  } catch (e) {
    errors.push(e);
  }
  try {
    // resolve against the workspace root store layout
    const globDir = path.resolve(pluginRoot, '..', '..', 'node_modules', '.pnpm');
    const req = createRequire(path.join(globDir, 'noop.js'));
    return req("esbuild");
  } catch (e) {
    errors.push(e);
  }
  throw new Error(`Cannot resolve esbuild: ${errors.map(String).join('; ')}`);
}

const esbuild = requireEsbuild();
await esbuild.build({
  entryPoints: [path.join(pluginRoot, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: path.join(pluginRoot, 'dist', 'index.js'),
  sourcemap: true,
  minify: false,
  legalComments: 'none',
  external: [],
  logLevel: 'info',
});
console.log('bundle written to dist/index.js');
