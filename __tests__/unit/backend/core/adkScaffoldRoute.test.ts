import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scaffoldProject } from '../../../../packages/adk-core/src/scaffoldFeature.ts';
import { initAddon } from '../../../../tools/adk/scaffold.mjs';

function scaffoldRouteOnFreshAddon(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-route-'));
  initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 1 });
  const result = scaffoldProject({
    dir,
    kind: 'route',
    id: '',
    name,
    publisher: '',
    tier: '',
    rung: '',
  });
  expect(result.ok).toBe(true);
  return dir;
}

describe('scaffold route', () => {
  it('writes a handler, mounts it in initialize, and declares the permission', async () => {
    const dir = scaffoldRouteOnFreshAddon('hello');
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.permissions).toEqual(
        expect.arrayContaining([{ name: 'acme-widget.hello', displayName: 'acme-widget.hello' }])
      );

      const routePath = path.join(dir, 'src/server/routes/hello.ts');
      const routeSource = fs.readFileSync(routePath, 'utf8');
      expect(routeSource).toContain('express.Router()');
      expect(routeSource).toContain("router.get('/',");
      expect(routeSource).not.toContain('as AddonRouter');

      const initSource = fs.readFileSync(path.join(dir, 'src/server/index.ts'), 'utf8');
      expect(initSource).toContain("import { mountHello } from './routes/hello.js';");
      expect(initSource).toContain('mountHello(ctx);');

      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      expect(pkg.dependencies.express).toBe('^5.3.0');

      const routeModule = await import(pathToFileURL(routePath).href);
      const mounted: Array<{ permission: string; path?: string }> = [];
      routeModule.mountHello({
        routes: {
          mount(_router: unknown, options: { permission: string; path?: string }) {
            mounted.push(options);
            return { dispose: async () => undefined };
          },
        },
      });
      expect(mounted).toEqual([{ permission: 'acme-widget.hello', path: '/hello' }]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not duplicate initialize wiring on a second scaffold of the same route file', () => {
    const dir = scaffoldRouteOnFreshAddon('status');
    try {
      const second = scaffoldProject({
        dir,
        kind: 'route',
        id: '',
        name: 'status',
        publisher: '',
        tier: '',
        rung: '',
      });
      expect(second.ok).toBe(true);
      const initSource = fs.readFileSync(path.join(dir, 'src/server/index.ts'), 'utf8');
      expect(initSource.match(/mountStatus\(ctx\)/g)?.length).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});