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

## Instance install

The host does not compare `manifest.checksum` to the archive. The manifest is inside the package, so that digest cannot be a property of the package. Integrity is the signature plus `contentHash`, recomputed on the extracted folder before the host copies anything. An optional upload field `archiveSha256` is compared to the uploaded bytes and protects the transfer only.

The install path is `addons-installed/<id>/<version>/`. The version must be higher than the one already installed. A lower version is a rollback, not an install. `hostApi` must accept the instance host API. A tier 1 package is refused unless the publisher is `kassis`. Install waits for an `addon_deployment` approval. See [Operators](./operators.md).

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-28 | The instance installs a package only after signature and `contentHash` checks. `manifest.checksum` is not used. |
| 2026-10-28 | All six public packages publish to GitHub Packages. API Extractor also checks `host-sdk.api.md`. |
