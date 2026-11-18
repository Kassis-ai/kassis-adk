# TEST-REPORT — BRD-ADK-001 Mode A

`kassis-addon test` in this folder: 16 passed, 0 failed. `kassis-addon certify` returned ok against the workspace CLI.

`node scripts/adk-reference-build.mjs` (repo root) copied this folder outside the checkout and certified it twice from packed tarballs. Both passes returned `ok: true`. The second pass signed with a generated acme key that stays in `~/.kassis/keys` and is not part of this tree. The package was written only in the temp directory and then removed.

Live acceptance was not run. This environment has no Docker engine, so the lab stack was not started. The tier 2 runner also drops the HTTP body, query and user principal (`GAPS.md`), so AT-01 through AT-14 would not pass on the current host even with a stack.

P1 and P2 are the data and approval facades this addon calls (`ctx.data`, `ctx.core.approvals`). They are used as shipped on this branch. They were not re-proven against Postgres here.

| Id | Result | Evidence |
| --- | --- | --- |
| AT-01 | blocked | Live POST is gated by the first permission (`view`), and the child does not receive the caller. Unit ingest is covered in `test/server/messages.test.ts`. |
| AT-02 | blocked | Live POST was not run. Unit ingest returns 202, `requestId`, and audit `received`. The host can list holders with `ctx.core.users.listByPermission`. The fixture still does not call `ctx.notify.send`. |
| AT-03 | blocked live / pass in unit | Invalid BIC returns 422, stores nothing, audits `refused`. |
| AT-04 | blocked live / pass in unit | Duplicate sender and reference returns 409. |
| AT-05 | blocked live / pass in unit | Missing threshold and a large EUR amount are high value. |
| AT-06 | blocked | Page was not opened in a browser. Nav and the empty catalog string are asserted from the manifest and locales. |
| AT-07 | blocked live / pass in unit | Detail returns `rawText`. The page source renders `ApprovalStatusPanel`. |
| AT-08 | blocked | Maker exclusion in the product policy was not published. The page hides buttons for `inbox.requested`. `resolveMakers` returns `submittedBy`. |
| AT-09 | blocked live / pass in unit | Applier sets APPROVED, writes history, audits and publishes. |
| AT-10 | blocked live / pass in unit | A short reject comment is refused by `commentRejection`. A real comment is stored on REJECTED. |
| AT-11 | blocked live / pass in unit | A second approve does not change the row. |
| AT-12 | blocked | FR-25. Policy condition for a second approver is not confirmed. |
| AT-13 | blocked live / pass in unit | Expiry with `expiryHours: 1` marks an old pending row EXPIRED. A second run is a no-op. |
| AT-14 | blocked | FR-57. Configuration is frozen at initialize. |
| AT-15 | blocked live / pass in unit | Manifest declares `settingsTabs[].permissions`. Live Settings was not opened. |
| AT-16 | blocked | FR-60. Runner health is not the addon's policy check. `GET /release-policy` is the addon probe. |
| AT-17 | blocked live / pass in unit | `contributions.mcp` and `tools` export; see `test/mcp/list-pending.mcp.test.ts`. Live MCP call not run. |
| AT-18 | blocked live / pass in unit | Audit and event JSON from the unit ingest and decision do not contain `Lab Customer AG`. |
| AT-19 | blocked | No lab restart. |
| AT-20 | blocked | No lab, and no first-party page was opened. |
