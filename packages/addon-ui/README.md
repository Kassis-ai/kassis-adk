# @kassis/addon-ui

Shared **addon slot** runtime: error boundaries per addon, a global per-addon kill switch, and a thin bulk-selection chrome helper. The host and every addon UI are expected to share **one** copy of this module at runtime (import map → `/host-sdk/addon-ui.js`), not bundle separate copies.

**Stability:** `0.1.0` — small, focused API. Component props and kill-switch semantics are stable within `0.x`. A broader “addon UI kit” described in older ADK plans is **not** in this package yet.

## Public API

| Export | Kind | Role |
| ------ | ---- | ---- |
| `AddonSlotBoundary` | component | Wraps one addon’s UI; uncaught errors render `fallback`; killed addons render `killedFallback`. |
| `AddonSlotBoundaryProps` | type | `addonId`, optional `children`, `fallback`, `killedFallback`. |
| `BulkActionBar` | component | Renders `children` in a `div` when `selectedCount > 0`; otherwise `null`. Styling is entirely via `className`. |
| `BulkActionBarProps` | type | `selectedCount`, `className`, `children`. |
| `killAddon` / `reviveAddon` | function | Add or remove an addon id from the host-global kill set (`globalThis.__kassisAddonKilled`). |
| `isAddonKilled` | function | Query the kill set. |
| `resetAddonKillSwitch` | function | Clears the whole set — **tests only**; production should not call this. |

### Kill switch

State lives on `globalThis.__kassisAddonKilled` so the host-created module and an addon that accidentally bundled an older copy still see the same switch when the host loads first. `AddonSlotBoundary` checks `isAddonKilled(addonId)` before rendering children.

### Where it runs

- **Host:** `src/addons/AddonRoutes.tsx` wraps addon routes in `AddonSlotBoundary`.
- **Re-export:** `@kassis/host-sdk` re-exports `BulkActionBar` for addons that already depend on host-sdk only.
- **Core UI:** `src/shared/components/BulkActionBar.tsx` re-exports from this package.

**Peer dependency:** `react` `^19.2.3` (matches the host import map).

## Published package vs browser runtime

`npm run build` (`build.mjs`) rolls TypeScript declarations into `dist/index.d.ts` and writes a **no-op** `dist/index.js` shim. Comments in the build script and tarball: **types for npm; executable code is served by the host.**

- Dev / app build: Vite resolves `@kassis/addon-ui` to `packages/addon-ui/src/index.ts` and bundles it to `/host-sdk/addon-ui.js` (see root `vite.config.js` `HOST_RUNTIME_SHIMS`).
- **Plain Node** `import '@kassis/addon-ui'` from a `.tgz` gets types only — not React components. Addon UI must use the import map URL at runtime, same as `@kassis/host-sdk`.

This matches how `host-sdk` is published: compile-time contract on npm, live ESM from the host in the browser.

## Supported today

- Isolate addon render failures so the rest of the host shell keeps working.
- Operator or test kill switch without unloading the SPA.
- Minimal shared bulk-action container used by host list screens.

## Not covered (by design in 0.1.0)

- Shared form controls, tables, dialogs, or design tokens from `src/shared/ui`.
- Data hooks, API client, routing, or TanStack Query integration.
- Slot registry types, contribution loaders, or runtime-load addon bundle helpers (`tools/addon-build/*` is separate).
- i18n (`useTranslation` / `useAddonTranslation`) — callers pass translated `fallback` / `children`.
- Styling system beyond whatever `className` the host passes to `BulkActionBar`.

Addons may import `@kassis/addon-ui` directly (allowed by addon import check) or get `BulkActionBar` via `@kassis/host-sdk`.

## Workspace vs published

Monorepo `exports` point at `src/index.ts`. The published tarball uses rolled `dist/index.d.ts` and the empty `dist/index.js` shim after `prepack`. GitHub Packages: `publishConfig.registry` is `https://npm.pkg.github.com`, access `restricted`.

## Boundary

Sources must not import `@/`, `server/`, or other `@kassis/*` packages. React is the only peer. The package is not yet in `SELF_CONTAINED_KASSIS_PACKAGES` in `tools/ci/check-addon-sdk-boundary.mjs`.