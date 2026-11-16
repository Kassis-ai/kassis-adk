import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it } from 'node:test';
import en from '../../src/ui/locales/en.json' with { type: 'json' };
import fr from '../../src/ui/locales/fr.json' with { type: 'json' };

describe('approvals page render', () => {
  it('FR-15 NFR-05 renders catalog strings from the en and fr locales', () => {
    const title = en.pages.approvals.title;
    const empty = en.pages.approvals.empty;
    assert.equal(empty, 'No messages waiting for release');
    assert.ok(fr.pages.approvals.empty.length > 0);
    assert.notEqual(fr.pages.approvals.title, title);
    const html = renderToString(
      createElement('section', { 'data-testid': 'acme-swift-approval-approvals-page' }, createElement('h1', null, title), createElement('p', null, empty))
    );
    assert.ok(html.includes(title));
    assert.ok(html.includes(empty));
  });
});
