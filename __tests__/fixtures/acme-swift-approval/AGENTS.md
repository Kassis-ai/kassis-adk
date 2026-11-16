# addon-coding-agent 2

Pinned profile hash: 52a0b5b0ad80419eaad17babdcee65159e1d7bce389d7fc927a87415b8ac03a1

Read every guardrail before you edit. Fill `.kassis/attestation.json` before you finish.

## adk.work-in-own-repo (blocking)

Catalogue: group F, L5. Check: self-attestation. Primary code: KADK-703.
Advisory: a machine cannot see which repository the agent edited. Work only in this addon repository. Import Kassis as @kassis/* packages; never edit core or host paths.

Work only in this repository. Kassis core is a dependency, never a file to edit.

## adk.sdk-imports-only (blocking)

Catalogue: group A, L2. Check: kassis-addon-conformance. Primary code: KADK-201.
Import only from @kassis/* and this addon's src/. kassis-addon conformance fails host paths and undeclared packages (KADK-201 to KADK-205).

Import only from @kassis/* packages and your own src/. Never resolve host services by name.

## adk.lowest-rung (advisory)

Catalogue: group B, L5. Check: self-attestation. Primary code: KADK-712.
Prefer configuration, then declarative addon features, then code. Record the rung and reason in the change summary.

Choose the lowest rung: configuration first, a declarative addon second, code last. State the rung you chose and why in the change summary.

## adk.declared-permissions-and-audit (blocking)

Catalogue: group F, L5. Check: self-attestation. Primary code: KADK-703.
Advisory: check does not see route handlers or write sites. Declare a permission per route and record every write through ctx.data or a facade with a manifest audit action.

Every route declares a permission in your addon namespace. Every write goes through ctx.data or a host facade and records an audit action declared in the manifest.

## adk.event-schemas-and-null-capabilities (blocking)

Catalogue: group E, L3. Check: kassis-addon-check. Primary code: KADK-703.
kassis-addon check requires each published event schema path to end in .schema.json (KADK-406). It does not scan source for null when a consumed capability is absent.

Every published event has a schema. Every consumed capability handles null, because the addon that provides it can be switched off.

## adk.reversible-migrations (blocking)

Catalogue: group E, L3. Check: kassis-addon-conformance. Primary code: KADK-703.
Ship a down script for every up script or mark the migration irreversible with a reason in the SQL.

Every migration has a down script, or is marked irreversible with a reason.

## adk.declare-widened-access (blocking)

Catalogue: group F, L4. Check: evidence-pack:change-summary. Primary code: KADK-703.
Advisory in the profile: a machine cannot detect widened access. Describe wider permissions, egress hosts, or data access in the change summary. The approver reads that summary in the evidence pack (L4).

Never widen permissions, egress hosts or data access without saying so in the change summary.

## adk.certify (blocking)

Catalogue: group F, L3. Check: kassis-addon-check, kassis-addon-conformance, kassis-addon-build, kassis-addon-test. Primary code: KADK-707.
Run kassis-addon certify and fix every error so checks.json records exit 0 for each machine check.

Run kassis addon certify before you say you are done, and fix every error. Certify runs check, conformance, build and test, and those results are the only machine evidence.

## adk.document-changes (advisory)

Catalogue: group E, L5. Check: self-attestation. Primary code: KADK-713.
Update Kassisdoc business and/or technical pages, README.md, and CHANGELOG.md when the change affects them.

When a change is described by Kassisdoc, update the business page, the technical page, or both, and link the business page from the technical guide. Also update README.md and CHANGELOG.md.

## adk.no-unrequested-refactors (blocking)

Catalogue: group F, L5. Check: self-attestation. Primary code: KADK-703.
Advisory: a machine cannot tell which edits were requested. Limit edits to files and behaviour the task asked for; revert drive-by refactors.

Do not refactor code you were not asked to change.

## adk.attest-pinned-profile (blocking)

Catalogue: group F, L3. Check: adk.attest-pinned-profile. Primary code: KADK-702.
Run kassis adk sync, then kassis-addon attest and answer every pinned guardrail. Certify records check adk.attest-pinned-profile. Reading the rules at the start of a run is not observable.

At the start, read the guardrails and skills of your pinned profile (kassis adk sync). Before you say you are done, fill in .kassis/attestation.json with one answer per guardrail.
