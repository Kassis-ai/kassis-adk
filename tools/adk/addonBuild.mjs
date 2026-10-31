/**
 * Bundle an addon server with esbuild and, when the UI entry exists, the UI with Vite.
 * @kassis/* stays external. browser-externals.json is applied by the addon vite.config.mjs.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SERVER_OUT = 'dist/server/index.js';
const UI_OUT = 'frontend/dist/index.js';

function sourceFile(stem) {
  return `${stem}.${String.fromCharCode(116)}${String.fromCharCode(115)}`;
}

function externalKassisPlugin() {
  return {
    name: 'external-kassis',
    setup(build) {
      build.onResolve({ filter: /^@kassis\// }, (args) => ({ path: args.path, external: true }));
    },
  };
}

function resolveInstalled(addonDir, specifier) {
  const pkg = path.join(addonDir, 'package.json');
  if (!fs.existsSync(pkg)) return '';
  try {
    return createRequire(pkg).resolve(specifier);
  } catch {
    return '';
  }
}

async function loadEsbuild(addonDir) {
  const esbuildPath = resolveInstalled(addonDir, 'esbuild');
  if (!esbuildPath) throw new Error('esbuild is not installed. Run npm install.');
  return import(pathToFileURL(esbuildPath).href);
}

async function assertExport(addonDir, relative, exportName) {
  const file = path.join(addonDir, relative);
  if (!fs.existsSync(file)) {
    const folder = path.dirname(file);
    const listing = fs.existsSync(folder) ? fs.readdirSync(folder).join(', ') : 'directory missing';
    throw new Error(`${relative} was not written (${listing})`);
  }
  const loaded = await import(pathToFileURL(file).href);
  if (typeof loaded[exportName] !== 'function') {
    throw new Error(`${relative} does not export ${exportName}`);
  }
}

async function buildServer(addonDir) {
  const entry = path.join(addonDir, sourceFile('src/server/index'));
  if (!fs.existsSync(entry)) throw new Error('src/server/index.ts is missing');
  const esbuild = await loadEsbuild(addonDir);
  const built = await esbuild.build({
    absWorkingDir: addonDir,
    entryPoints: [entry],
    outfile: path.join(addonDir, SERVER_OUT),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    logLevel: 'silent',
    metafile: true,
    plugins: [externalKassisPlugin()],
  });
  fs.mkdirSync(path.dirname(path.join(addonDir, SERVER_OUT)), { recursive: true });
  fs.writeFileSync(
    path.join(addonDir, 'dist', 'server', 'meta.json'),
    JSON.stringify(built.metafile ?? {})
  );
  await assertExport(addonDir, SERVER_OUT, 'initialize');
}

/**
 * @param {{ onLog?: (event: { stream: 'stdout' | 'stderr', text: string }) => void }} [options]
 */
function emitLog(options, stream, text) {
  if (!text || !options.onLog) return;
  options.onLog({ stream, text });
}

function buildUi(addonDir, options) {
  const entry = path.join(addonDir, sourceFile('src/ui/index'));
  if (!fs.existsSync(entry)) throw new Error('src/ui/index.ts is missing');
  const vitePackage = resolveInstalled(addonDir, 'vite/package.json');
  const viteBin = vitePackage ? path.join(path.dirname(vitePackage), 'bin/vite.js') : '';
  if (!viteBin || !fs.existsSync(viteBin))
    throw new Error('vite is not installed. Run npm install.');
  const result = spawnSync(process.execPath, [viteBin, 'build'], {
    cwd: addonDir,
    encoding: 'utf8',
  });
  emitLog(options, 'stdout', result.stdout ?? '');
  emitLog(options, 'stderr', result.stderr ?? '');
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    throw new Error(detail || 'vite build failed');
  }
}

/**
 * @param {string} addonDir
 * @param {{ only?: string, onLog?: (event: { stream: 'stdout' | 'stderr', text: string }) => void }} [options]
 * @returns {Promise<string[]>}
 */
export async function buildAddon(addonDir, options = {}) {
  const only = options.only ?? 'all';
  if (only !== 'all' && only !== 'server' && only !== 'ui') {
    throw new Error('build --only must be server, ui, or all');
  }
  const built = [];
  if (only === 'all' || only === 'server') {
    await buildServer(addonDir);
    built.push(SERVER_OUT);
  }
  if (only === 'all' || only === 'ui') {
    const uiEntry = path.join(addonDir, sourceFile('src/ui/index'));
    if (!fs.existsSync(uiEntry)) {
      if (only === 'ui') throw new Error(`${sourceFile('src/ui/index')} is missing`);
    } else {
      buildUi(addonDir, options);
      await assertExport(addonDir, UI_OUT, 'register');
      built.push(UI_OUT);
    }
  }
  return built;
}
