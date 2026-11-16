import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { scaffoldProject } from '../../../../packages/adk-core/src/scaffoldFeature.ts';
import { initAddon } from '../../../../tools/adk/scaffold.mjs';

function scaffoldUiSlotOnFreshAddon(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-ui-slot-'));
  initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 2 });
  const result = scaffoldProject({
    dir,
    kind: 'ui-slot',
    id: '',
    name,
    publisher: '',
    tier: '',
    rung: '',
  });
  expect(result.ok).toBe(true);
  return dir;
}

describe('scaffold ui-slot', () => {
  it('writes a page component, locales, nav entry, UI route wiring, and a render test', async () => {
    const dir = scaffoldUiSlotOnFreshAddon('vendor-risk');
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.ui?.contributions?.nav).toEqual(
        expect.arrayContaining([
          {
            section: 'addons',
            name: 'vendor-risk',
            href: '/acme-widget/vendor-risk',
            permission: 'acme-widget.view',
          },
        ])
      );

      const pagePath = path.join(dir, 'src/ui/pages/vendor-risk.tsx');
      const pageSource = fs.readFileSync(pagePath, 'utf8');
      expect(pageSource).toContain("import { useAddonTranslation } from '@kassis/host-sdk'");
      expect(pageSource).toContain('export function VendorRiskPage');

      const en = JSON.parse(fs.readFileSync(path.join(dir, 'src/ui/locales/en.json'), 'utf8'));
      expect(en.pages?.vendorRisk?.title).toBe('Vendor Risk');
      const fr = JSON.parse(fs.readFileSync(path.join(dir, 'src/ui/locales/fr.json'), 'utf8'));
      expect(fr.pages?.vendorRisk?.body).toContain('emplacement UI');

      const indexSource = fs.readFileSync(path.join(dir, 'src/ui/index.ts'), 'utf8');
      expect(indexSource).toContain("import { VendorRiskPage } from './pages/vendor-risk.js'");
      expect(indexSource).toContain("path: '/acme-widget/vendor-risk'");
      expect(indexSource).toContain("registerAddonLocales('acme-widget'");

      const renderTestPath = path.join(dir, 'test/ui/vendor-riskPage.render.test.ts');
      expect(fs.existsSync(renderTestPath)).toBe(true);
      const renderTestSource = fs.readFileSync(renderTestPath, 'utf8');
      expect(renderTestSource).toContain('renderToString');

      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      expect(pkg.dependencies?.react).toBe('^19.3.1');
      expect(pkg.scripts.test).toContain('test/**/*.test.ts');

      const copy = en.pages.vendorRisk as { title: string; body: string };
      const html = renderToString(
        createElement(
          'section',
          { 'data-testid': 'acme-widget-vendor-risk-page' },
          createElement('h1', null, copy.title),
          createElement('p', null, copy.body)
        )
      );
      expect(html).toContain(copy.title);
      expect(html).toContain(copy.body);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not duplicate nav entries on a second scaffold of the same slot', () => {
    const dir = scaffoldUiSlotOnFreshAddon('insights');
    try {
      const second = scaffoldProject({
        dir,
        kind: 'ui-slot',
        id: '',
        name: 'insights',
        publisher: '',
        tier: '',
        rung: '',
      });
      expect(second.ok).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const hrefs = (manifest.ui?.contributions?.nav ?? []).map(
        (entry: { href: string }) => entry.href
      );
      expect(hrefs.filter((href: string) => href === '/acme-widget/insights').length).toBe(1);
      const indexSource = fs.readFileSync(path.join(dir, 'src/ui/index.ts'), 'utf8');
      expect(indexSource.match(/path: '\/acme-widget\/insights'/g)?.length).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses ui-slot when the addon was initialized without a UI rung', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-ui-slot-rung1-'));
    try {
      initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 1 });
      const result = scaffoldProject({
        dir,
        kind: 'ui-slot',
        id: '',
        name: 'summary',
        publisher: '',
        tier: '',
        rung: '',
      });
      expect(result.ok).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});