# Signing and trust

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


## Publisher keys

`server/core/addon-platform/trust/publisher-trust.json` lists publishers. `*` is the platform default. A named publisher does not fall back to `*`.

Each publisher has:

- `current` — the fingerprint in use
- `keys` — more fingerprints that are current at the same time
- `previous` — fingerprints still accepted during rotation

`revoked` is checked first. A fingerprint in `revoked` is refused even when it is still listed under `current`, `keys`, or `previous`.

## Rotation and revocation

Add the new fingerprint to `keys` (or replace `current` and move the old one to `previous`) before you stop signing with the old key. When the old key must die, put its fingerprint in `revoked`. Revocation is enforced when signature checks are strict and when they are not. An invalid signature that is not a trust failure still warns and continues in non-strict mode. That is separate from revocation.

Addon load and deploy verification call the same trust check.

## Signed tarballs

```bash
node tools/adk/sign-tarball.mjs <file.tgz> --key=<private-key-hex-file>
```

This writes `<file.tgz>.sig`. The default key path is `server/keys/addon_signing_private.key`. Do not put that file in an air-gap bundle.

## SBOM

`node tools/adk/package-sbom.mjs` writes a CycloneDX document. `airgap-bundle.mjs` includes it as `sbom.json`.
