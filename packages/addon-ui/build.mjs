/**
 * Types-only publish for @kassis/addon-ui.
 * API Extractor rolls the declarations into dist/index.d.ts.
 * dist/index.js is a shim so plain Node can import the package.
 * The host still serves the runtime at /host-sdk/addon-ui.js.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pkgRoot, '../..');
const tsc = path.join(repoRoot, 'node_modules/typescript/lib/tsc.js');
const extractor = path.join(repoRoot, 'node_modules/@microsoft/api-extractor/bin/api-extractor');
const dist = path.join(pkgRoot, 'dist');
const temp = path.join(pkgRoot, 'temp');

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.rmSync(temp, { recursive: true, force: true });
run([tsc, '-p', path.join(pkgRoot, 'tsconfig.json'), '--pretty', 'false']);

const configPath = path.join(temp, 'api-extractor.json');
fs.mkdirSync(temp, { recursive: true });
fs.writeFileSync(
  path.join(temp, 'tsconfig.extractor.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: false,
        skipLibCheck: true,
        noEmit: true,
      },
      files: ['index.d.ts'],
    },
    null,
    2
  )
);
const config = {
  mainEntryPointFilePath: '<projectFolder>/temp/index.d.ts',
  bundledPackages: [],
  compiler: {
    tsconfigFilePath: '<projectFolder>/temp/tsconfig.extractor.json',
  },
  apiReport: { enabled: false },
  docModel: { enabled: false },
  dtsRollup: {
    enabled: true,
    untrimmedFilePath: '<projectFolder>/dist/index.d.ts',
  },
  tsdocMetadata: { enabled: false },
  newlineKind: 'lf',
  messages: {
    compilerMessageReporting: { default: { logLevel: 'warning' } },
    extractorMessageReporting: {
      default: { logLevel: 'warning' },
      'ae-missing-release-tag': { logLevel: 'none', addToApiReportFile: false },
      'ae-forgotten-export': { logLevel: 'none', addToApiReportFile: false },
    },
    tsdocMessageReporting: { default: { logLevel: 'none' } },
  },
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
run([extractor, 'run', '--local', '--config', configPath]);

fs.writeFileSync(
  path.join(dist, 'index.js'),
  '/** Types-only. The host serves this module at /host-sdk/addon-ui.js. */\nexport {};\n'
);

const rolled = fs.readFileSync(path.join(dist, 'index.d.ts'), 'utf8');
if (rolled.includes('@/')) {
  console.error('addon-ui rollup still imports the host alias @/');
  process.exit(1);
}
