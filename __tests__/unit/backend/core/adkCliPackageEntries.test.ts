import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(import.meta.dirname, '../../../..');

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

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

  it('keeps the packed coding profiles identical to tools/adk', () => {
    const source = path.join(repo, 'tools/adk/profiles');
    const copy = path.join(repo, 'packages/adk-core/profiles');
    const names = fs
      .readdirSync(source)
      .filter((name) => name.endsWith('.json'))
      .sort();
    expect(names.length).toBeGreaterThan(0);
    expect(
      fs
        .readdirSync(copy)
        .filter((name) => name.endsWith('.json'))
        .sort()
    ).toEqual(names);
    for (const name of names) {
      expect(sha256(path.join(copy, name)), name).toBe(sha256(path.join(source, name)));
    }
  });
});
