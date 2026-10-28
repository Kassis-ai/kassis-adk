# Testing

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


`@kassis/addon-testkit` checks an evidence pack and rejects host imports. The CLI `conformance` command uses the same idea on `src/` and `frontend/`.

`certify` runs the CLI commands `check`, `conformance`, `build` and `test`, then computes the content hash. It writes `.kassis/evidence/checks.json` with the CLI version, the Node version, and for each check the input hash, exit code, duration and output digest.

An outcome must be `followed`, `violated` or `not_applicable`. Anything else, including a blank string or null, fails with KADK-714. The helper that prepares a new attestation writes null for each outcome so the file fails until it is answered.

Machine evidence comes only from `.kassis/evidence/checks.json`. Evidence typed into the attestation is ignored and reported as KADK-715. That warning does not fail certify. A followed machine guardrail with no passing row for its check fails with KADK-707.

`certify` fails on KADK-701 through KADK-711 and on KADK-714. Advisory KADK-712, KADK-713 and KADK-715 do not fail it. Codes are listed in [KADK error codes](../reference/adk-error-codes.md).

The KADK checks that matter while you are writing an addon:

- the manifest matches v2 (`check`)
- source does not import the host (`conformance`)
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

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-28 | Certify records check, conformance, build and test in `.kassis/evidence/checks.json`. A blank outcome is KADK-714. Typed machine evidence is KADK-715. The evidence pack writes `index.json` and `README.md`. |
