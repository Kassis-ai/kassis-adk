import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { findPackageBoundaryViolations } from '../../../../../tools/ci/check-addon-sdk-boundary.mjs';

const tempDirs: string[] = [];

/** A throwaway package `<tmp>/pkg` with the given source files and dependencies. */
function tempPackage(
  files: Record<string, string>,
  dependencies: Record<string, string> = {}
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addon-sdk-boundary-'));
  tempDirs.push(root);
  const packageRoot = path.join(root, 'pkg');
  fs.mkdirSync(path.join(packageRoot, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies })
  );
  for (const [rel, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(packageRoot, rel)), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, rel), source);
  }
  return packageRoot;
}

function codes(packageRoot: string): string[] {
  return findPackageBoundaryViolations(packageRoot).map(
    (violation) => `${violation.code} ${violation.spec}`
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('ci:packages:addon-sdk-boundary', () => {
  it('passes the real @kassis/addon-sdk package', () => {
    expect(findPackageBoundaryViolations(path.resolve('packages/addon-sdk'))).toEqual([]);
  });

  it('passes imports inside the package and declared dependencies', () => {
    const root = tempPackage(
      {
        'src/a.ts':
          "import { b } from './b.js';\nimport { Ajv2020 } from 'ajv/dist/2020.js';\nexport const a = b;",
        'src/b.ts':
          "import data from '../codes/data.json' with { type: 'json' };\nexport const b = data;",
      },
      { ajv: '^8.17.1' }
    );
    expect(codes(root)).toEqual([]);
  });

  it('fails on the host alias @/ (KADK-201) and on Kassis core (KADK-202)', () => {
    const root = tempPackage({
      'src/bad.ts': [
        "import { x } from '@/shared/x';",
        "import type { Y } from '../../server/core/types/addonPlatform.js';",
        "export { z } from 'server/core/z.js';",
        "const lazy = () => import('../../server/index.js');",
      ].join('\n'),
    });
    expect(codes(root)).toEqual([
      'KADK-201 @/shared/x',
      'KADK-202 ../../server/core/types/addonPlatform.js',
      'KADK-202 server/core/z.js',
      'KADK-202 ../../server/index.js',
    ]);
  });

  it('fails on a relative path that leaves the package (KADK-204)', () => {
    const root = tempPackage({
      'src/bad.ts': "import { t } from '../../packages/types/src/index.js';",
    });
    expect(codes(root)).toEqual(['KADK-204 ../../packages/types/src/index.js']);
  });

  it('fails on undeclared packages, Node built-ins and unverified @kassis packages (KADK-205)', () => {
    const root = tempPackage(
      {
        'src/bad.ts': [
          "import express from 'express';",
          "import fs from 'node:fs';",
          "import { McpContext } from '@kassis/mcp-contract';",
        ].join('\n'),
      },
      { '@kassis/types': 'workspace:*' }
    );
    expect(codes(root)).toEqual([
      'KADK-205 @kassis/types',
      'KADK-204 @kassis/types@workspace:*',
      'KADK-205 express',
      'KADK-205 node:fs',
      'KADK-205 @kassis/mcp-contract',
    ]);
  });
});
