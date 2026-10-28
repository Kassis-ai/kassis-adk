# Testing

`@kassis/addon-testkit` checks an evidence pack and rejects host imports. The CLI `conformance` command uses the same idea on `src/` and `frontend/`.

`certify` fails on KADK-701 through KADK-711. Advisory KADK-712 and KADK-713 do not fail it. Codes are listed in [KADK error codes](../reference/adk-error-codes.md).

The KADK checks that matter while you are writing an addon:

- the manifest matches v2 (`check`)
- source does not import the host (`conformance`)
- a migration that goes up can come down (`conformance`)
- the attestation matches the signed profile lock (`certify`)

Tier 2 isolation is covered by `n14Tier2Isolation` (no host database URL in the child, egress refusal, and disable after the restart limit). Those tests load the `sample-tprm-check` fixture. They do not install it into the product addon list.

Pack only after certify passes:

```bash
node tools/adk/kassis-addon.mjs pack --out=evidence
```
