---
kassisRequirements:
  version: 1
  addonId: __ADDON_ID__
  publisher: __PUBLISHER__
  ticket: ''
  rung: 1
  rungReason: Server-only starter from `kassis-addon init`; use `--rung 2` for UI or `--rung 3` for UI and migrations.
  outOfScope:
    - Production signing, deploy and operator policy setup (see README and the ADK quickstart).
    - Features not listed below; add rows before you implement them.
acceptanceCriteria:
  - id: AC-01
    text: `initialize` runs offline and the starter test passes.
    test: test/server.test.ts
  - id: AC-02
    text: Every Must requirement is traced in TEST-REPORT.md or recorded in GAPS.md before certify.
    test: TEST-REPORT.md
---

# Requirements: __ADDON_NAME__

Priority uses MoSCoW: **M** must, **S** should, **C** could. Replace this document with your BRD when you know the product scope. **BRD-ADK-001** (SWIFT Message Approval sample in the ADK documentation) is the reference shape.

## 0. How the build agent uses this file

1. **ADK only.** Use `kassis-addon`, `@kassis/addon-sdk`, `@kassis/host-sdk`, `@kassis/addon-testkit`, and the ADK guides. Do not import Kassis host code.
2. **Work in this project folder.** Run `npx kassis-addon sync --profile=addon-coding-agent` and follow `AGENTS.md`.
3. **Map first.** Give every requirement row a rung in `PLAN.md`, then run `kassis-addon plan`, before feature code.
4. **Prerequisites first.** Run the platform checks in `TEST-REPORT.md` before feature code.
5. **Never work around the platform.** If the ADK cannot meet a Must requirement, record it in `GAPS.md`, map that row to `gap`, and build the rest.
6. **Done means** every Must for your build mode is met or gap-recorded, `plan` and `certify` pass, and `TEST-REPORT.md` lists evidence for each acceptance row.

## 1. Purpose

Deliver a minimal tier 2 addon that proves the toolchain: manifest v2, `initialize`, optional UI, offline tests, and the certify flow.

## 2. Scope

### In scope

- Server entry `src/server/index.ts` with `initialize`.
- View permission `__ADDON_ID__.view` in the manifest.
- Starter unit test with `createTestContext()`.
- Workflow files `REQUIREMENTS.md`, `GAPS.md`, `TEST-REPORT.md`.

### Out of scope

- Business logic beyond the starter test.
- Production egress, secrets, or owned data until platform prerequisites in `TEST-REPORT.md` pass.

## 3. Functional requirements (starter)

| ID    | Pri | Requirement                                                                                                                                    |
| ----- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | M   | `manifest.json` is manifest v2 with id `__ADDON_ID__`, publisher `__PUBLISHER__`, tier 2, `hostApi` `^1.0.0`, health `/health`, and view permission. |
| FR-02 | M   | `initialize(ctx)` from `@kassis/addon-sdk` is exported from `src/server/index.ts` and runs without a database in unit tests.                 |
| FR-03 | M   | `npx kassis-addon check`, `conformance`, `build`, and `test` succeed on a clean `npm install`.                                                 |
| FR-04 | S   | Rung 2 adds `src/ui/index.ts`, `vite.config.mjs`, and `ui.entryFile` `index.js`. Rung 3 adds reversible `migrations/`.                        |

## 4. Non-functional requirements (starter)

| ID     | Pri | Requirement                                                                                           |
| ------ | --- | ----------------------------------------------------------------------------------------------------- |
| NFR-01 | M   | Imports stay inside the addon; `conformance` reports no host paths.                                   |
| NFR-02 | M   | User-visible UI text uses addon i18n helpers (en and fr) when UI exists; do not import `i18next`.     |
| NFR-03 | S   | Each Must requirement id appears in a test name, assertion comment, or a `GAPS.md` entry before ship. |

## 5. Platform prerequisites

Record outcomes in `TEST-REPORT.md` (section Platform prerequisites) before you rely on owned tables, tier 2 writes, or live deploy.

| Check | Meaning                                      |
| ----- | -------------------------------------------- |
| P1    | Tier 2 can write owned tables through `ctx.data` |
| P2    | Migrations run on install/update             |
| P3    | Dev host loads the addon UI after deploy     |

See BRD-ADK-001 section 10 for the full prerequisite checklist.

## 6. Gap protocol

When a Must requirement cannot be met, add one section per gap in `GAPS.md` (see the sample `GAP-00` there). A gap is a platform finding, not a failed build.

## 7. Scaffold requirement examples

Use `npx kassis-addon scaffold <kind> <name>` after `init`. Each kind below shows how to write the matching requirement row before you run scaffold.

### Scaffold kind `addon`

| ID    | Pri | Requirement                                                                                      |
| ----- | --- | ------------------------------------------------------------------------------------------------ |
| FR-90 | C   | _Example only._ Re-run project wiring; normally satisfied by `init`. Command: `scaffold addon`. |

### Scaffold kind `route`

| ID    | Pri | Requirement                                                                                                                                          |
| ----- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-91 | C   | _Example._ Mount `GET /hello` at `/api/v1/addons/__ADDON_ID__/hello` with permission `__ADDON_ID__.view`. Command: `scaffold route hello`. Manifest lists the route permission; handler lives under `src/server/routes/`. |

### Scaffold kind `capability`

| ID    | Pri | Requirement                                                                                                                                |
| ----- | --- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-92 | C   | _Example._ Expose callable `__ADDON_ID__.score` version `1.0.0` in `capabilities.provides`. Command: `scaffold capability score`. Tier 2 `provide` is accepted when that id is in the addon namespace. |

### Scaffold kind `event`

| ID    | Pri | Requirement                                                                                                                                 |
| ----- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-93 | C   | _Example._ Publish `__ADDON_ID__.updated` with a JSON Schema under `schemas/`. Command: `scaffold event updated`. Declare `events.publishes` in the manifest. |

### Scaffold kind `job`

| ID    | Pri | Requirement                                                                              |
| ----- | --- | ---------------------------------------------------------------------------------------- |
| FR-94 | C   | _Example._ Register job type `__ADDON_ID__.refresh`. Command: `scaffold job refresh`. Declare `jobs.types` and register a handler in `initialize`. |

### Scaffold kind `migration`

| ID    | Pri | Requirement                                                                                                                      |
| ----- | --- | --------------------------------------------------------------------------------------------------------------------------- |
| FR-95 | C   | _Example._ Add owned table `__ADDON_ID___snapshot` with up/down SQL. Command: `scaffold migration snapshot`. Declare `database.ownedTables` when P1–P2 pass. |

### Scaffold kind `ui-slot`

| ID    | Pri | Requirement                                                                                                      |
| ----- | --- | ---------------------------------------------------------------------------------------------------------------- |
| FR-96 | C   | _Example._ Add a party tab slot entry in the manifest. Command: `scaffold ui-slot vendor-risk`. Implement the component under `src/ui/`. |

### Scaffold kind `ui-page`

| ID    | Pri | Requirement                                                                                                                      |
| ----- | --- | -------------------------------------------------------------------------------------------------------------------------------- |
| FR-97 | C   | _Example._ Add a full addon page with nav and route wiring. Command: `scaffold ui-page executive-summary`. Same outputs as `ui-slot`. |

### Scaffold kind `mcp-tool`

| ID    | Pri | Requirement                                                                                                                                      |
| ----- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-98 | C   | _Example._ Expose read-only MCP tool `__ADDON_ID__.ping`. Command: `scaffold mcp-tool ping`. Declare `contributions.mcp` and wire `src/mcp/contribution.ts`. |

## 8. Acceptance tests (starter)

| ID    | Covers  | Steps                         | Expected                          |
| ----- | ------- | ----------------------------- | --------------------------------- |
| AT-01 | FR-02   | `npm test`                    | Starter test passes offline       |
| AT-02 | FR-03   | `npm run check` and `conformance` | Exit code 0                   |
| AT-03 | NFR-01  | `npm run conformance`         | No KADK-201–KADK-205 import issues |

Record results in `TEST-REPORT.md`.

## Changelog

| Date       | Change                                      |
| ---------- | ------------------------------------------- |
| 2026-11-16 | Starter requirements file for ADK template. |