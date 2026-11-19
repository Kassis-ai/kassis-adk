# ADK signing golden vectors (S3.01)

Committed expected values for canonical manifest hashing, `contentHash`, `uiContentHash`, and Ed25519 signatures. Row **S3.02** (`@kassis/adk-protocol`) must recompute these bytes exactly.

| Path | Purpose |
| ---- | ------- |
| `vectors.json` | Expected hashes, signatures, and flags for synthetic fixtures and the nine first-party addons |
| `synthetic/*` | Minimal addon trees signed with the **TEST ONLY** public key in `vectors.json` → `testFixtureSigning` |
| `canonical-edge/manifest-without-signature.json` | Manifest shape for canonical JSON edge cases (no on-disk addon) |

Synthetic signing uses an Ed25519 keypair generated only for this fixture. The **public** SPKI DER hex is in `vectors.json`. Do not use `publisher-trust.json` or repo signing keys for synthetic cases.

`synthetic/kassis-first-party/data/crlf.txt` is stored with CRLF bytes (`.gitattributes` marks that file `-text`). `computeAddonContentHash` reads each CRLF as LF. The golden `contentHash` stays the same as the LF form. A checkout that strips the CR, or a hash that stops normalizing CRLF, fails the test.

`firstPartyAddons.contentHash` and `uiContentHash` are the on-disk tree hashes from `computeAddonContentHash` and `computeUiContentHash`. They are not a second copy of the field inside `manifest.json`. `canonicalSha256` is the sha256 of `buildCanonicalManifestString` for that manifest, and `signature` is the hex already on the manifest. The test verifies that signature with the kassis public key. It does not re-sign.

Eight first-party manifests still store a `contentHash` that is not the current tree hash (`aml-services-core`, `control-room`, `document-intelligence`, `investigation-panel`, `list-management`, `market-data-core`, `party-management`, `ubo-panel`). `aml-txn-bridge` matches. Re-sign the eight. Do not edit the golden tree hash to equal the stale manifest field.

If you change `canonicalJson.mjs`, `addonContentHash.mjs`, or signing scope config and the vectors update intentionally, regenerate fixtures with the repo maintainer script or update `vectors.json` and synthetic trees together in one change.