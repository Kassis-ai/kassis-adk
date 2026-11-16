# Testing

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-11-16

`@kassis/addon-testkit` checks an evidence pack. `checkAddonImports` is the import boundary used by `assertNoHostImports` and by the CLI `conformance` command.

`createTestContext()` reads `manifest.json` from the current working directory when you do not pass `manifest` or `manifestPath`. It maps the manifest onto the same declared-name lists the host uses and refuses undeclared `audit`, `events`, `jobs`, `prompts`, `secrets` and `egress` calls with the same KADK codes (606, 401, 610, 608, 605, 607). Pass `tier: 1` or `tier: 2` (default `2`). For that tier, `capabilities`, `locks`, `extend`, and `data` fakes consult `@kassis/addon-sdk/tier-matrix.json` and throw KADK-219 when the manifest tier cannot use the facade, matching `kassis-addon doctor --requirements`. Tier 2 may call `capabilities.provide`, the wave 1 `extend` methods (`registerAuditSubject`, `registerDeletable`, `registerDocumentable`, `registerLinkable`, `registerRecordAccess`), the wave 2 methods (`registerApprovable`, `registerApprovableFields`, `registerCommunicable`), the wave 3 method (`registerFlaggable`), the wave 4 automation methods (`registerAutomationTrigger`, `registerAutomationAction`, `registerAutomationFields`), the wave 5 methods (`registerRiskFactors`, `registerAnalyticsContributor`, `registerGraphRiskMirror`, `registerPredictionCapability`), and the wave 6 methods (`registerInvestigationDomain`, `registerInvestigationTemplate`, `registerEchoStrategy`, `registerQuestionnaireDomain`, `setQuestionnaireDomainAdapter`, `importQuestionnairePack`, `registerEmployeeDirectory`). `capabilities.register`, `registerLicenseFeatures`, `registerShutdownHook`, `locks`, and Prisma data helpers stay refused. Tier 2 `data.query` / `execute` / `transaction` are allowed. Wave 1 through wave 6 extend calls are recorded on `ctx.recorded.extend`. Pass an explicit manifest in unit tests when the working directory is not the addon root.

Every top-level `AddonContext` member has an in-memory fake: `config`, `routes` (including `principalOf`), `data`, `core` (cases, approvals, parties, entities, documents, users), `risk`, `settings`, `flags`, `notify`, `prompts`, plus the earlier audit/events/jobs/llm/http/secrets/capabilities/locks/extend recorders. Calls land on `ctx.recorded.*`. A unit test walks `keyof AddonContext` and fails when a new SDK member has no testkit entry.

JavaScript is read with `es-module-lexer` (static `import`, dynamic `import()`, and `export ... from`). `require()` is not an ECMAScript import, so the TypeScript scanner records it. `.ts` files use that scanner for every form.

An import is allowed when the specifier is a relative path that stays inside the addon folder, one of `@kassis/addon-sdk`, `@kassis/host-sdk`, `@kassis/addon-ui`, or `@kassis/agent-kit`, a package named in `dependencies`, `optionalDependencies`, or `peerDependencies`, or a Node built-in in server code. Server code is every checked file except `src/ui/` and `frontend/`. Anything else fails with a KADK-2xx code, the file, and the line: KADK-201 for the host alias `@/`, KADK-202 for Kassis core (`server/`), KADK-203 for the core capability registry, KADK-204 for a relative path outside the package, and KADK-205 for an undeclared package or a Node built-in in UI code.

`conformance` runs that check on `src/`, `frontend/`, and, when the files exist, `dist/server/index.js` and `frontend/dist/index.js`. A migration that goes up still needs a down script.

`certify` runs the CLI commands `check`, `conformance`, `build` and `test`, then `requirements`, `plan`, and the pinned-profile attestation check, then computes the content hash. It writes `.kassis/evidence/checks.json` with the CLI version, the Node version, and for each check the input hash, exit code, duration and output digest. `adk.attest-pinned-profile` exits 0 when no profile is pinned. When a lock is present it exits 0 only if `.kassis/attestation.json` matches that lock and answers every guardrail.

An outcome must be `followed`, `violated` or `not_applicable`. Anything else, including a blank string or null, fails with KADK-714. The helper that prepares a new attestation writes null for each outcome so the file fails until it is answered.

Machine evidence comes only from `.kassis/evidence/checks.json`. Evidence typed into the attestation is ignored and reported as KADK-715. That warning does not fail certify. A followed machine guardrail with no passing row for its check fails with KADK-707.

`certify` fails on KADK-701 through KADK-711 and on KADK-714. Advisory KADK-712, KADK-713 and KADK-715 do not fail it. Codes are listed in [KADK error codes](../reference/adk-error-codes.md).

The KADK checks that matter while you are writing an addon:

- the manifest matches v2 (`check`)
- imports stay inside the addon boundary (`conformance`)
- a migration that goes up can come down (`conformance`)
- the attestation matches the signed profile lock (`certify`)

Tier 2 isolation is covered by `n14Tier2Isolation` (no host database URL in the child, egress refusal, and disable after the restart limit). Those tests load the `sample-tprm-check` fixture. They do not install it into the product addon list.

Pack only after certify passes. It writes `index.json` and `README.md` in the output directory, plus the attestation, the lock and the certify result. `index.json` holds:

- the change summary from `.kassis/change-summary.json` (`reference`, `rung`, `why`, `summary`), including the rung and why
- the manifest diff against `.kassis/previous-manifest.json` (permissions, egress hosts, events, capabilities, data access and tier; when that file is missing, every current value is listed as added)
- migrations, with up and down status (`present`, `missing`, `irreversible` or `unknown`)
- the test and conformance rows from the checks file
- the SBOM of the addon `package.json` dependencies
- the content hash, the signer fingerprint (`signing.keyId`) and the CLI version

```bash
node tools/adk/kassis-addon.mjs pack --out=evidence
```

## Reference addon

`__tests__/fixtures/acme-swift-approval` is the BRD-ADK-001 Mode A addon (`acme-swift-approval`, publisher `acme`, tier 2). `node scripts/adk-reference-build.mjs` packs the public `@kassis` tarballs, copies the fixture outside the checkout, and certifies it twice. The second pass signs with `kassis-addon keys generate --publisher=acme` and packages. The private key stays in `~/.kassis/keys`. The script does not deploy and does not register the key.

`node scripts/adk-reference-build.mjs --check-fixture` only checks the fixture id, publisher, tier and that `GAPS.md` names FR-57 and FR-60.

The live lab repeats that toggle under load:

```bash
node scripts/adk-live-lab.mjs --only=H
```

`--only=H` copies the fixture outside the checkout, signs it with a new acme key, and trusts that key only through `KASSIS_PUBLISHER_TRUST_FILE` (`/addons-installed/lab-hot-toggle-trust.json` inside the backend container). It does not edit `publisher-trust.json`. The private key stays in `~/.kassis/keys`. After maker/checker approval it loops `GET /api/v1/adk/version` while it `POST`s `disable` and `enable` six times. The version route must stay 200. `GET /api/v1/addons/acme-swift-approval/release-policy` must answer while the addon is enabled (200, or 503 when the approval policy is not enforced) and fail cleanly while it is disabled (404, or 503 `not running` / `stopped`). The workflow runs this step after L1–L22.

Until the tier 2 route bridge forwards the request body, that release-policy route is the probe. `POST /messages` returns 503 `tier2-route-body-not-forwarded` on the current runner. `GAPS.md` in the fixture records FR-57 (configuration frozen at initialize) and FR-60 (runner-owned `health.path`).

## Changelog

| Date       | Change                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | `node scripts/adk-live-lab.mjs --only=H` toggles `acme-swift-approval` under a core request loop. The acme key is trusted only through the lab trust file. |
| 2026-11-16 | Reference addon `acme-swift-approval` is certified twice by `scripts/adk-reference-build.mjs`. Live deploy stays outside that script. |
| 2026-11-16 | `createTestContext` allows tier 2 wave 6 `extend` methods and records them. License and shutdown extend methods, locks, `capabilities.register`, and Prisma data helpers still throw KADK-219. |
| 2026-11-16 | `createTestContext` fakes every `AddonContext` area (core.*, risk, settings, flags, notify, prompts, config, routes.principalOf) with recorders; SDK key walk fails when a member has no fake. |
| 2026-11-16 | Certify records `adk.requirement-plan-mapped` and `adk.attest-pinned-profile` in `checks.json` beside requirements tracing. |
| 2026-11-16 | `createTestContext` allows tier 2 wave 4 automation `extend` methods and records them. Later-wave extend methods still throw KADK-219. |
| 2026-11-16 | `createTestContext` allows tier 2 wave 2 `extend` methods (`registerApprovable`, `registerApprovableFields`, `registerCommunicable`) and records them. Later-wave extend methods still throw KADK-219. |
| 2026-11-16 | `createTestContext` allows tier 2 wave 1 `extend` methods and records them. Later-wave extend methods, locks, `capabilities.register`, and Prisma data helpers still throw KADK-219. |
| 2026-11-16 | `createTestContext` allows tier 2 `capabilities.provide` and still refuses extend, locks, `capabilities.register`, and data writes with KADK-219 from `tier-matrix.json`.                                          |
| 2026-11-16 | `createTestContext` enforces manifest declared-name lists for audit, events, jobs, prompts, secrets and egress with host KADK codes.                                                                          |
| 2026-10-28 | Conformance uses one import checker. Forbidden imports fail with KADK-201 through KADK-205, including `dist/server/index.js` and `frontend/dist/index.js` when those files exist.                             |
| 2026-10-28 | Certify records check, conformance, build and test in `.kassis/evidence/checks.json`. A blank outcome is KADK-714. Typed machine evidence is KADK-715. The evidence pack writes `index.json` and `README.md`. |
