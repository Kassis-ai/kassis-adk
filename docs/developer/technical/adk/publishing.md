# Publishing

Version rules are in the [semver policy](../addons/semver-policy.md). Do not bump a public export of `@kassis/addon-sdk` without a matching report change.

## API Extractor

```bash
node tools/adk/api-surface.mjs
node tools/adk/api-surface.mjs --write
```

The first command fails when `packages/addon-sdk/etc/addon-sdk.api.md` would change. `--write` updates that file. It compiles declarations into `packages/addon-sdk/dist` (gitignored) and runs API Extractor. The report is the public surface.

## Changesets

`@changesets/cli` is a dev dependency. Config is `.changeset/config.json` and the base branch is `main`.

```bash
npm run changeset
```

## Registry

`@kassis/addon-sdk` and `@kassis/addon-testkit` set `publishConfig.registry` to GitHub Packages, `access` to `restricted`, and `provenance` to `true`. `npm publish` from a trusted CI run attaches provenance. A packed file can also be signed locally:

```bash
npm pack
node tools/adk/sign-tarball.mjs <file.tgz> --key=<private-key-hex-file>
```

## Release checklist

1. `node tools/adk/api-surface.mjs` is clean, or you committed a new report with `--write`.
2. A changeset describes the public change.
3. The tarball is published with provenance, or signed with `sign-tarball.mjs`.
4. The air-gap bundle still excludes the private key: `node tools/adk/airgap-bundle.mjs --out=./airgap`.
