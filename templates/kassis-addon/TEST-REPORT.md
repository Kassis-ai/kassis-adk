# Test report: __ADDON_NAME__

Record platform checks and acceptance tests here before `certify` and deploy. Use pass, fail, blocked, or skipped. Attach command output, response bodies, or screenshots as evidence.

## Platform prerequisites

Run these before feature code that depends on owned data, migrations on install, or live UI load.

| Check | How | Result | Evidence |
| ----- | --- | ------ | -------- |
| P1 Tier 2 can write owned tables | Scaffolded test or ADK docs for `ctx.data` writes | not run | |
| P2 Migrations run on install | Deploy a build whose migration creates a table, then read with `ctx.data.read` | not run | |
| P3 Installed addon UI loads | Open the addon page after deploy on the dev instance | not run | |

Known platform state is described in BRD-ADK-001 section 10.1 in the ADK documentation. Update this table when you rerun checks.

## Offline checks (starter)

| Step | Command | Result | Evidence |
| ---- | ------- | ------ | -------- |
| Unit tests | `npm test` | not run | |
| Manifest | `npm run check` | not run | |
| Imports | `npm run conformance` | not run | |
| Build | `npm run build` | not run | |

## Acceptance tests

| ID    | Covers | Steps | Expected | Result | Evidence |
| ----- | ------ | ----- | -------- | ------ | -------- |
| AT-01 | FR-02 | Run `npm test` | Starter test passes | not run | |
| AT-02 | FR-03 | Run `npm run check` and `npm run conformance` | Exit code 0 | not run | |
| AT-03 | NFR-01 | Run `npm run conformance` | No forbidden imports | not run | |

Add rows for every Must requirement in `REQUIREMENTS.md` as you implement features. Name each row with the requirement id in the test file or in a `GAPS.md` entry when blocked.

## Changelog

| Date       | Change                                |
| ---------- | ------------------------------------- |
| 2026-11-16 | Starter test report for ADK template. |