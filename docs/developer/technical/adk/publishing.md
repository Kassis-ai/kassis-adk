# Publishing

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


Version rules are in the [semver policy](../addons/semver-policy.md). Do not bump a public export of `@kassis/addon-sdk` without a matching report change.

## API Extractor

```bash
node tools/adk/api-surface.mjs
node tools/adk/api-surface.mjs --write
```

The first command fails when `packages/addon-sdk/etc/addon-sdk.api.md` or `packages/host-sdk/etc/host-sdk.api.md` would change. `--write` updates those files. It compiles `@kassis/addon-sdk` into `packages/addon-sdk/dist` (gitignored) and rolls `@kassis/host-sdk` into one `.d.ts` per public subpath. The reports are the public surface.

## Changesets

`@changesets/cli` is a dev dependency. Config is `.changeset/config.json` and the base branch is `main`.

```bash
npm run changeset
```

## Registry

The six public packages (`addon-sdk`, `addon-testkit`, `addon-ui`, `host-sdk`, `agent-kit`, `addon-cli`) set `publishConfig.registry` to GitHub Packages, `access` to `restricted`, and `provenance` to `true`. `npm run ci:packages:publish-config` fails when a non-private `@kassis/*` package is missing that registry. Internal packages stay `"private": true`. `npm publish` from a trusted CI run attaches provenance. A packed file can also be signed locally:

```bash
npm pack
node tools/adk/sign-tarball.mjs <file.tgz> --key=<private-key-hex-file>
```

## Release checklist

1. `node tools/adk/api-surface.mjs` is clean, or you committed a new report with `--write`.
2. A changeset describes the public change.
3. The tarball is published with provenance, or signed with `sign-tarball.mjs`.
4. The air-gap bundle still excludes the private key: `node tools/adk/airgap-bundle.mjs --out=./airgap`.
5. `npm run ci:packages:publish-config` passes.

## Addon package

`kassis-addon package` writes `<id>-<version>.addon` beside the addon folder. The file is a zip. It contains the signed `manifest.json`, the files covered by `contentHash`, `evidence/` when that folder is present, and `sbom.json` produced by `tools/adk/package-sbom.mjs`. `package` does not sign the manifest and does not call the network. It refuses a manifest that has no signature or no `contentHash`. `sbom.json` is inside the content hash, so write it with `package-sbom.mjs` and run `sign` before `package`. `frontend/dist` stays outside the hash. When that folder exists, `package` still copies it into the zip so the host can serve `/addons-ui/<id>/`. A later image rebuild of first-party UI does not change `contentHash`.

`kassis-addon deploy --instance=<url>` uploads that file to `POST /api/v1/addon-security/deploy` and prints the approval request id. The token is `KASSIS_ADK_TOKEN`. An optional `archiveSha256` field is the sha256 of the uploaded bytes and checks the transfer only. The same command works from a jump host that has the `.addon` file. `kassis-addon status --instance=<url>` calls `GET /api/v1/platform/addons/installations` and prints the installed version and the pending staged versions. That route uses the same admin token as deploy. The body is the addon id, the active version, the publisher, and the pending versions. It does not include secrets.

## Instance install

The host does not compare `manifest.checksum` to the archive. The manifest is inside the package, so that digest cannot be a property of the package. Integrity is the signature plus `contentHash`, recomputed on the extracted folder before the host copies anything. An optional upload field `archiveSha256` is compared to the uploaded bytes and protects the transfer only.

The install path is `addons-installed/<id>/<version>/`. The version must be higher than the one already installed. A lower version is a rollback, not an install. `hostApi` must accept the instance host API. A tier 1 package is refused unless the publisher is `kassis`. Install waits for an `addon_deployment` approval. See [Operators](./operators.md).

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-28 | `kassis-addon package` writes a self-contained `.addon` zip. `deploy` uploads it and prints the approval request id. `status` lists installed and pending versions. |
| 2026-10-28 | The instance installs a package only after signature and `contentHash` checks. `manifest.checksum` is not used. |
| 2026-10-28 | All six public packages publish to GitHub Packages. API Extractor also checks `host-sdk.api.md`. |
