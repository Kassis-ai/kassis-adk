import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectDirWithinRoot, runContainedTool } from '../../../../packages/adk-core/src/mcpServer.ts';

describe('MCP scaffold stays inside the project root', () => {
  it('rejects a parent directory and a symlink that leaves the root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-mcp-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-mcp-out-'));
    const link = path.join(root, 'escape');
    fs.symlinkSync(outside, link, 'junction');
    try {
      const parent = runContainedTool(root, 'scaffold', { kind: 'addon', dir: path.join(root, '..', 'outside') });
      expect(parent.ok).toBe(false);
      expect(parent.issues.some((issue) => issue.code === 'KADK-217')).toBe(true);
      expect(projectDirWithinRoot(root, link)).toBeNull();
      const escaped = runContainedTool(root, 'scaffold', { kind: 'route', dir: link, name: 'ping' });
      expect(escaped.ok).toBe(false);
      expect(escaped.issues.some((issue) => issue.code === 'KADK-217')).toBe(true);
      expect(projectDirWithinRoot(root, root)).toBe(fs.realpathSync(root));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
