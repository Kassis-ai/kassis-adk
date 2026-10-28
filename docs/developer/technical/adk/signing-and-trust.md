# Signing and trust

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


## Publisher keys

The instance trust store is the database (`platform_addon_publishers` and `platform_addon_publisher_keys`), merged with `server/core/addon-platform/trust/publisher-trust.json`. That file seeds publisher `kassis` so boot and unit tests can verify first-party addons before the database is up.

`KASSIS_PUBLISHER_TRUST_FILE`, when set, is a read-only JSON file in the same shape: `publishers` and `keys`, with key status `pending`, `current`, `previous`, or `revoked`. It is merged with the seeded file and the database. A `revoked` key in any source is revoked. A `suspended` publisher in any source is suspended.

`kassis` may sign tiers 1 and 2, and its id prefix `*` matches any addon id. A bank publisher is limited to tier 2. Each of its id prefixes must start with the publisher id and a hyphen, so publisher `acme` can sign `acme-tprm` and cannot sign `ubo-panel`. Tier 1 is refused for every publisher other than `kassis`. A key, a rotation, or a tier or prefix change stays pending until a second person approves it. If no approval policy is published, that change is refused.

`signing.keyId` on the manifest is the sha256 hex of the Ed25519 SPKI DER. The verifier loads that key. A bank key cannot sign `publisher: "kassis"`. A manifest with no `signing` block is verified only with the kassis current key, and only when `publisher` is `kassis` or the legacy first-party id `kassis-corp`. Any other publisher without `signing` is refused. `ADDON_VERIFICATION_PUBLIC_KEY` is only a bootstrap fallback for the kassis public key bytes.

Guardrail profiles still accept the kassis key, including a fingerprint listed as `previous` during rotation.

## Rotation and revocation

`current` and `previous` keys verify. `pending` does not, until an approver accepts it. Add the new key and wait for approval before you stop signing with the old one; approval moves the new key to `current` and the old one to `previous`.

Revocation is immediate and does not wait for approval. A revoked fingerprint is refused when signature checks are strict and when they are not. An invalid signature that is not a trust failure still warns and continues in non-strict mode, and only for `kassis` and `kassis-corp`. Any other named publisher is verified in strict mode whatever `ENABLE_STRICT_ADDON_SIGNATURES` says.

Addon load, deploy verification, and the MCP contribution loader call the same trust loader. A revocation emits `system.addon.publisher_trust.invalidated`. The in-process cache also expires after a short TTL, which covers a process that misses the event.

## Signed tarballs

```bash
node tools/adk/sign-tarball.mjs <file.tgz> --key=<private-key-hex-file>
```

This writes `<file.tgz>.sig`. The default key path is `server/keys/addon_signing_private.key`. Do not put that file in an air-gap bundle.

## SBOM

`node tools/adk/package-sbom.mjs` writes a CycloneDX document. `airgap-bundle.mjs` includes it as `sbom.json`.

## Content hash and runtime UI

`contentHash` covers the files in `server/core/addon-deployment/addonContentHash.config.json`. `frontend/dist/**` is outside the hash. The server image builds that folder after the manifest is signed, so including it would make every first-party addon fail verification. `frontend/src/**`, `frontend/node_modules/**`, `.kassis/**`, `.cursor/**`, `.claude/**`, `.github/**`, `evidence/**` and `test/**` are outside the hash too. A scope change changes every hash. Re-sign with `npm run sign:addons`.

`GET /addons-ui/<id>/*` is served only when that addon passed the signature gate on its last load and is enabled. Each response re-checks the content-hash cache fingerprint (file size, mtime and ctime) and does not re-read file bytes when the fingerprint still matches. Any other case is 404.

The runtime UI catalog entry carries `contentHash`. The loader appends it as a query string (`?contentHash=`), so a browser cache does not mix versions.

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-28 | Tool, evidence, test, and `frontend/dist/**` folders are outside `contentHash`. The server image builds `frontend/dist` after signing. Runtime UI is served only after a passing signature gate while the addon stays enabled and the content-hash fingerprint still matches. The catalog `contentHash` is the loader query string. |
| 2026-10-28 | Trust is the database plus the seeded file and optional `KASSIS_PUBLISHER_TRUST_FILE`. Revoked wins. Bank publishers are always strict, cannot use tier 1, and their id prefixes must start with the publisher id and a hyphen. A key or scope change is refused when no approval policy is published. |
