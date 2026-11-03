/**
 * Two wasm binaries stand between us and an Open Graph card, and neither one ends up where its
 * loader looks for it without help:
 *
 *   prepare — resvg's `index_bg.wasm` lives in `node_modules`, while nitro only inlines files that
 *             live under `server/assets`. Copied at build time, never committed, so the binary
 *             stays pinned to whatever the lockfile installed.
 *   finish  — satori shapes text with harfbuzz, whose emscripten glue reads `hb.wasm` from next to
 *             its own JS at runtime. The file tracer follows the JS but not that read, so a lambda
 *             would ship `hb.js` alone and every card would silently degrade to the static image.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const require = createRequire(import.meta.url);

const copy = (source, target) => {
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log(`[og-assets] ${path.basename(source)} (${statSync(target).size} bytes) -> ${path.relative(appDir, target)}`);
};

const prepare = () => {
  const wasm = fileURLToPath(import.meta.resolve('@resvg/resvg-wasm/index_bg.wasm'));
  copy(wasm, path.join(appDir, 'server/assets/og/index_bg.wasm'));
};

/** harfbuzz is a dependency of satori, not of this app, so it is resolved through satori's own tree. */
const harfbuzzWasm = () => {
  const satoriDir = path.dirname(require.resolve('satori'));
  return require.resolve('harfbuzzjs/hb.wasm', { paths: [satoriDir] });
};

const finish = () => {
  const source = harfbuzzWasm();
  const dirs = [path.join(appDir, '.output/server/node_modules')];
  const functions = path.join(appDir, '.vercel/output/functions');
  if (existsSync(functions)) {
    for (const entry of readdirSync(functions)) dirs.push(path.join(functions, entry, 'node_modules'));
  }
  let staged = 0;
  for (const dir of dirs) {
    const target = path.join(dir, 'harfbuzzjs/hb.wasm');
    if (!existsSync(path.dirname(target))) continue;
    if (existsSync(target)) {
      staged += 1;
      continue;
    }
    copy(source, target);
    staged += 1;
  }
  if (!staged) console.warn('[og-assets] no traced harfbuzzjs folder found — did the build run?');
};

const run = process.argv[2] === 'finish' ? finish : prepare;
run();
