import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { scaffoldProject } from '../../../../packages/adk-core/src/scaffoldFeature.ts';
import { initAddon } from '../../../../tools/adk/scaffold.mjs';

function scaffoldUiPageOnFreshAddon(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-ui-page-'));
  initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 2 });
  const result = scaffoldProject({
    dir,
    kind: 'ui-page',
    id: '',
    name,
    publisher: '',
    tier: '',
    rung: '',
  });
  expect(result.ok).toBe(true);
  return dir;
}

describe('scaffold ui-page', () => {
  it('writes a page component, locales, nav entry, UI route wiring, and a render test', async () => {
    const dir = scaffoldUiPageOnFreshAddon('executive-summary');
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.ui?.contributions?.nav).toEqual(
        expect.arrayContaining([
          {
            section: 'addons',
            name: 'executive-summary',
            href: '/acme-widget/executive-summary',
            permission: 'acme-widget.view',
          },
        ])
      );

      const pagePath = path.join(dir, 'src/ui/pages/executive-summary.tsx');
      const pageSource = fs.readFileSync(pagePath, 'utf8');
      expect(pageSource).toContain("import { useAddonTranslation } from '@kassis/host-sdk'");
      expect(pageSource).toContain('export function ExecutiveSummaryPage');

      const indexSource = fs.readFileSync(path.join(dir, 'src/ui/index.ts'), 'utf8');
      expect(indexSource).toContain(
        "import { ExecutiveSummaryPage } from './pages/executive-summary.js'"
      );
      expect(indexSource).toContain("path: '/acme-widget/executive-summary'");

      const en = JSON.parse(fs.readFileSync(path.join(dir, 'src/ui/locales/en.json'), 'utf8'));
      const copy = en.pages.executiveSummary as { title: string; body: string };
      const html = renderToString(
        createElement(
          'section',
          { 'data-testid': 'acme-widget-executive-summary-page' },
          createElement('h1', null, copy.title),
          createElement('p', null, copy.body)
        )
      );
      expect(html).toContain(copy.title);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses ui-page when the addon was initialized without a UI rung', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-ui-page-rung1-'));
    try {
      initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 1 });
      const result = scaffoldProject({
        dir,
        kind: 'ui-page',
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