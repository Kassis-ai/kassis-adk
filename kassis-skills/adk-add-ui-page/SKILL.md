---
name: adk.add-ui-page
description: >-
  Add an addon UI page and nav entry with kassis-addon scaffold ui-page.
  Use for rung 2 or 3 addons that need a host-sdk page, en/fr locales, and a render test.
---

# Add a UI page

## When to use

A Must requirement needs an operator-facing screen inside Kassis. Prefer composing `@kassis/host-sdk` components. Use rung 2 (UI) or rung 3 (UI + migrations).

## Steps

1. From the addon root: `kassis-addon scaffold --kind=ui-page --name=<kebab-case>`.
2. Confirm `ui.contributions.nav` gained an entry and `src/ui/index.ts` routes to the page.
3. Edit `src/ui/pages/<name>.tsx` using `@kassis/host-sdk` only — no `@/features/*` or other addon internals.
4. Put every chrome string through the generated locale keys in `src/ui/locales/en.json` and `fr.json`.
5. Keep `test/ui/<name>Page.render.test.ts` green; name the requirement id in a test or `GAPS.md`.
6. Run `kassis-addon check`, `kassis-addon requirements`, then `kassis-addon certify`.

## Do not

- Hardcode English button or empty-state chrome.
- Import React components from the host app path aliases.
- Scaffold ui-page on a rung 1 (server-only) addon without raising the rung first.
