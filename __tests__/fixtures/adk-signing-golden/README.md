# ADK signing golden vectors (S3.01)

Committed expected values for canonical manifest hashing, `contentHash`, `uiContentHash`, and Ed25519 signatures. Row **S3.02** (`@kassis/adk-protocol`) must recompute these bytes exactly.

| Path | Purpose |
| ---- | ------- |
| `vectors.json` | Expected hashes, signatures, and flags for synthetic fixtures and the nine first-party addons |
| `synthetic/*` | Minimal addon trees signed with the **TEST ONLY** public key in `vectors.json` → `testFixtureSigning` |
| `canonical-edge/manifest-without-signature.json` | Manifest shape for canonical JSON edge cases (no on-disk addon) |

Synthetic signing uses an Ed25519 keypair generated only for this fixture. The **public** SPKI DER hex is in `vectors.json`. Do not use `publisher-trust.json` or repo signing keys for synthetic cases.

If you change `canonicalJson.mjs`, `addonContentHash.mjs`, or signing scope config and the vectors update intentionally, regenerate fixtures with the repo maintainer script or update `vectors.json` and synthetic trees together in one change.