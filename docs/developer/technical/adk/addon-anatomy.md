# Addon anatomy

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-11-16

## Manifest

`manifest.json` is validated as manifest v2 by `kassis-addon check`. The host runs the same check when it inspects a package and when it loads an addon, and only when `manifestVersion` is `2`. A failure uses the same KADK code as `check`. A manifest without that version keeps the previous inspect and load path. The fields an addon author sets most often:

| Field                                          | Role                                                                                                                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                           | Addon id. Routes mount at `/api/v1/addons/<id>`.                                                                                                                                                                      |
| `signing`                                      | Optional `{ alg: "ed25519", keyId }`. `keyId` is the sha256 hex of the Ed25519 SPKI DER. It is inside the signed body. A first-party manifest that still has no `signing` block verifies with the kassis current key. |
| `tier`                                         | `1` (default) or `2`. See [Tiers](./tiers.md).                                                                                                                                                                        |
| `routing.mountPath`                            | Path the host passes into `initialize()`.                                                                                                                                                                             |
| `database.ownedTables` / `database.readAccess` | Tables this addon owns or may read. Do not use a wildcard for a new addon.                                                                                                                                            |
| `permissions`                                  | Catalog entries (`{ name, displayName, … }`) in the addon permission namespace. On enable, the host registers them in core RBAC the same way it used to for v1 `definedPermissions`. The RBAC configuration screen lists them under the addon id; an administrator assigns them to roles (nothing is granted automatically). See [Permission namespaces](../addons/permission-namespaces.md). |
| `groups`                                       | Optional RBAC groups (`name`, `displayName`, `permissions[]`). Each name stays in the addon namespace; each permission must be declared in `permissions`. The host creates them empty at install (S2.12).                                             |
| `process.packs[]`                              | Planned (S2.52+). Signed pack manifests. When a pack installs core templates or rules, the host will record `source_addon`, `source_key` and `source_version` on those rows (release step `20261116-process-pack-provenance`; null means administrator-authored). |
| `extends`                                      | Optional list of `ctx.extend` extension point ids the addon registers (for example `documentable`, `auditSubject`). The host refuses a registration not named here. |
| `resourceTypes[].sensitivity`                  | Codex seal level: `standard`, `confidential`, or `mnpi`. Required on every `resourceTypes` entry when `database.ownedTables` is non-empty (KADK-124). |
| `ui.entryFile`                                 | Frontend bundle entry, usually `index.js`.                                                                                                                                                                            |
| `ui.runtimeLoad`                               | When true, the host loads the page from the runtime catalog instead of a static import.                                                                                                                               |
| `mcp.tools`                                    | Tool names. Tier 2 tools are forwarded. They are not imported into the host.                                                                                                                                          |

## initialize()

The loader calls `initialize()` with the platform host, the database handles, config, secrets, a logger, and `ctx`. `ctx` is the [addon context](../addons/addon-context-facades.md). Addons are not required to read `ctx`, but new code should.

Register HTTP with `host.registerRoute({ mountPath, handler })`. `mountPath` comes from the manifest. Register callable features with `host.registerCapability`. Callers use `getCapability` and must keep working when the capability is absent.

## Frontend register()

`frontend/index.ts` must export a function named `register`. The runtime loader calls `mod.register` or `mod.default.register`. It also reads `routes`. Without `register`, the page can load and still show no widgets.

```ts
import { registerExampleExtensions } from './register';
export { registerExampleExtensions };
export const register = registerExampleExtensions;
```

User-visible chrome goes through the addon i18n helpers. See [Frontend i18n](../addons/frontend-i18n.md). Do not import `i18next` from an addon.

An addon built outside this repository keeps `@kassis/host-sdk` and `@kassis/addon-ui` external. For rung 2 and 3, `kassis-addon init` copies `vite.config.mjs`. The UI entry is `src/ui/index.ts`. The bundle is `frontend/dist/index.js`. `ui.entryFile` is `index.js`, relative to that folder. The config reads externals from `@kassis/addon-sdk/browser-externals.json`. The host serves those modules from `/host-sdk/`.

## Template

`kassis-addon init` copies `templates/kassis-addon` and fills `publisher`, the addon id, and tier.

| Path                            | Role                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `manifest.json`                 | Tier 2 unless publisher `kassis` passes `--tier=1`. `hostApi` is `^1.0.0`. Tier 2 includes `resources.memoryMb` (128) and `health.path` (`/health`); the supervisor refuses a tier 2 addon without memory. `entrypoints.main` is `dist/server/index.js`. `signing` is omitted until `sign`. A publisher other than `kassis` cannot use tier 1, and the id is prefixed with `<publisher>-` when it does not already start with that prefix. Declares `audit.actions`, `events.publishes` (with `events/*.schema.json`), `jobs.types`, and `prompts.keys` for the names exercised in `test/server.test.ts`, so offline tests match what the host enforces. |
| `package.json`                  | `build`, `build:server`, `build:ui`, `test`, `check`, and `certify`.                                                                                                                                                                                                                                                                                                                                                                       |
| `tsconfig.json`                 | Typecheck for `src`. It does not emit JavaScript.                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/server/index.ts`           | `defineAddon({ initialize })` from `@kassis/addon-sdk`. The host still calls the exported `initialize`. A record type passed to `defineRecordType` requires `canAccess`, `onDelete`, `sensitivity` (`standard`, `confidential`, or `mnpi`), and `auditSubject`. A manifest slice with a non-empty `database.ownedTables` requires `data.retention`. Missing one of those is a type error. `check` reports KADK-124 (sensitivity) and KADK-309 (retention) for the same manifest rules. |
| `src/ui/index.ts`               | `routes` and `register`. Copied for rung 2 and rung 3.                                                                                                                                                                                                                                                                                                                                                                                     |
| `frontend/dist/index.js`        | UI bundle. `ui.entryFile` is `index.js` inside this folder. Present after build when the rung has a UI.                                                                                                                                                                                                                                                                                                                                    |
| `test/server.test.ts`           | Calls `createTestContext({ manifestPath })` from `@kassis/addon-testkit`. No database; undeclared facade names fail like the host.                                                                                                                                                                                                                                                                                                                                                                     |
| `migrations/`                   | Rung 3 only. Each `*.up.sql` has a `*.down.sql`.                                                                                                                                                                                                                                                                                                                                                                                           |
| `.github/workflows/certify.yml` | Installs, builds, tests, checks, and certifies.                                                                                                                                                                                                                                                                                                                                                                                            |
| `REQUIREMENTS.md`               | Structured requirements (YAML front matter, `FR-*` / `NFR-*` rows, scaffold examples). Replace with your BRD for real addons.                                                                                                                                                                                                                                                                                                              |
| `PLAN.md`                       | One rung per requirement row: `configuration`, `extension-point`, `facade`, `own-code`, or `gap`. `kassis-addon plan` writes the split to `.kassis/evidence/requirement-mapping.json`. `certify` fails when a row has no rung.                                                                                                                                                                                                              |
| `GAPS.md`                       | Blocked Must requirements and the platform capability needed to unblock them. Naming a Must id here satisfies `kassis-addon requirements`.                                                                                                                                                                                                                                                                                                 |
| `TEST-REPORT.md`                | Platform prerequisite checks (P1–P3) and acceptance test evidence (AT-*).                                                                                                                                                                                                                                                                                                                                                                   |
| `.gitignore`                    | `dist`, `frontend/dist`, `.kassis/evidence`, `node_modules`.                                                                                                                                                                                                                                                                                                                                                                               |

Rung 1, the default, is the server only. Rung 2 adds the UI. Rung 3 adds the UI and `migrations/`. `npm run build` prints `dist/server/index.js` and, when the UI entry exists, `frontend/dist/index.js`. The build fails when `initialize` is missing, and when the UI was built and `register` is missing. The server bundle is ESM and leaves `@kassis/*` external. The UI bundle leaves the modules in `browser-externals.json` external.

## Changelog

| Date       | Change                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | Release step `20261116-process-pack-provenance` adds nullable `source_addon`, `source_key` and `source_version` on core template and rule tables for future process packs (S2.51). Apply the step before a backend that writes those columns. |
| 2026-11-16 | `kassis-addon plan` maps each requirement row in `PLAN.md` and writes `.kassis/evidence/requirement-mapping.json`; `certify` fails on KADK-720/721/722 (S2.48). |
| 2026-11-16 | `kassis-addon requirements` traces Must rows in `REQUIREMENTS.md` to `test/` or `GAPS.md` and writes `.kassis/evidence/requirements-coverage.json`; `certify` fails on KADK-719 (S2.39). |
| 2026-11-16 | SDK `defineAddon` and `defineRecordType`: a record type requires `canAccess`, `onDelete`, `sensitivity`, and an audit subject; owned tables require `data.retention` at the type level. The template entry uses `defineAddon` (S2.17). |
| 2026-11-16 | RBAC role editor groups manifest-registered permissions under the addon id (`permissions.category`); assignable in the picker without automatic role grants (S2.10). |
| 2026-11-16 | Host install creates manifest `groups[]` as empty core RBAC groups (`groups.owner_addon`). Update reconciles the permission list and keeps members. Uninstall removes the groups, memberships and direct grants (S2.12). |
| 2026-11-16 | Optional manifest `groups[]`: namespaced group slugs and permission lists validated like `requiredPermissions` (KADK-122, KADK-123). |
| 2026-11-16 | Manifest v2 adds `extends[]` and fixes `resourceTypes[].sensitivity` to `standard`, `confidential`, or `mnpi`; sensitivity is required when `database.ownedTables` is set (KADK-124). |
| 2026-11-16 | Package inspect and addon load refuse a `manifestVersion: 2` manifest with the same KADK code as `kassis-addon check`.                                              |
| 2026-11-16 | Integration proof (`templateAddonPermissionProof.integration.test.ts`): template v2 permissions register in RBAC and gate addon routes instead of `system.admin` (B13 / S1.04). |
| 2026-11-16 | Route and MCP gates read manifest v2 `permissions` objects (`{ name }`) for mount-level checks, not only string entries (B13 / S1.03).                               |
| 2026-11-16 | Tier 1 and tier 2 start paths register manifest v2 `permissions` objects in the core permission catalog (B13 / S1.02).                                            |
| 2026-11-16 | The template manifest declares audit, event, job, and prompt names used in `test/server.test.ts`, plus `events/started.schema.json` for the sample publish call.   |
| 2026-11-16 | `createTestContext` reads the manifest and refuses undeclared facade names with the same KADK codes as the host. See [Testing](./testing.md).                    |
| 2026-11-16 | `init` copies `REQUIREMENTS.md`, `GAPS.md`, and `TEST-REPORT.md` shaped after BRD-ADK-001, including scaffold-kind requirement examples.                            |
| 2026-10-28 | The tier 2 template sets `resources.memoryMb` to 128 and `health.path` to `/health`. The host refuses a tier 2 addon without memory.                                |
| 2026-10-28 | Manifest v2 may carry `signing.keyId`, covered by the signature.                                                                                                    |
| 2026-10-28 | `ui.entryFile` is `index.js`, relative to `frontend/dist`. A path with a slash is KADK-504. The catalog strips a leading `frontend/dist/`.                          |
| 2026-10-28 | The template server bundle is `dist/server/index.js`. The UI bundle is `frontend/dist/index.js`. Rung 1 is server only, rung 2 adds UI, and rung 3 adds migrations. |
