// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('addon cli package', () => {
  it('does not pack a private signing key', () => {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: 'packages/addon-cli',
      encoding: 'utf8',
      shell: true,
    });
    expect(result.status).toBe(0);
    const start = result.stdout.indexOf('[');
    const files = JSON.parse(result.stdout.slice(start))[0].files as Array<{ path: string }>;
    const leaked = files.filter((file) => /private/i.test(file.path));
    expect(leaked).toEqual([]);
  });
});
