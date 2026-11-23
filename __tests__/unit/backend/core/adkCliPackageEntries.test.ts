import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(import.meta.dirname, '../../../..');

describe('@kassis/addon-cli package entries', () => {
  it('does not resolve tools/adk from the bin or prepack', () => {
    const relatives = [
      'packages/addon-cli/bin/kassis-addon.mjs',
      'packages/addon-cli/bin/kassis-adk-mcp.mjs',
      'packages/addon-cli/prepack.mjs',
    ];
    for (const relative of relatives) {
      const text = fs.readFileSync(path.join(repo, relative), 'utf8');
      expect(text, relative).not.toContain('tools/adk');
    }
  });

  it('keeps coding profiles only in @kassis/adk-core', () => {
    expect(fs.existsSync(path.join(repo, 'tools/adk/profiles'))).toBe(false);
    const names = fs
      .readdirSync(path.join(repo, 'packages/adk-core/profiles'))
      .filter((name) => name.endsWith('.json'))
      .sort();
    expect(names).toEqual([
      'addon-coding-agent.json',
      'addon-coding-agent.v1.json',
      'addon-coding-agent.v3.draft.json',
      'addon-coding-agent.v3.json',
    ]);
    const build = fs.readFileSync(path.join(repo, 'packages/adk-core/build.mjs'), 'utf8');
    expect(build).not.toContain('tools/adk');
    expect(build).toContain("path.join(pkgRoot, 'profiles')");
    const bundle = fs.readFileSync(
      path.join(repo, 'packages/adk-core/src/engine/profileBundle.mjs'),
      'utf8'
    );
    expect(bundle).not.toContain('tools');
    const scaffold = fs.readFileSync(
      path.join(repo, 'packages/adk-core/src/engine/scaffold.mjs'),
      'utf8'
    );
    const packedReturn = scaffold.indexOf(
      "if (globalThis.__KASSIS_ADK_PACKED__ === true) return 'kassis-addon';"
    );
    const repoProbe = scaffold.indexOf('tools/adk/kassis-addon.mjs');
    expect(packedReturn).toBeGreaterThan(-1);
    expect(repoProbe).toBeGreaterThan(packedReturn);
  });
});
