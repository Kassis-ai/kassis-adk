# Install

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Platform Engineering (ADK)
**Last reviewed:** 2026-11-19

## Prerequisites

- Node.js 20 or newer (`kassis-addon doctor` checks the runtime).
- Docker or Podman when you want `kassis-addon dev` against a local dev host image.

## Packages

The packages an addon installs are `@kassis/addon-sdk`, `@kassis/addon-testkit`, `@kassis/addon-ui`, `@kassis/host-sdk`, `@kassis/agent-kit`, and `@kassis/addon-cli`. They are public on npmjs.com under the `@kassis` scope, so `npm install` needs no token. A project `.npmrc` with `@kassis:registry=https://registry.npmjs.org/` keeps the scope on npmjs.com when a global `.npmrc` maps `@kassis` somewhere else.

Depend on `@kassis/addon-sdk` at `^0.2.0`. That is the kit npm line. It is not the host API. `manifest.hostApi` stays `^1.0.0`. The version rules are in the [semver policy](../addons/semver-policy.md). `@kassis/adk-core` and `@kassis/mcp-contract` share that kit line. Install the CLI for commands. An addon that scaffolds an MCP tool depends on `@kassis/mcp-contract`.

The packages in the install command below build to `dist` in the published tarball. `@kassis/addon-sdk`, `@kassis/addon-testkit`, `@kassis/agent-kit`, and `@kassis/addon-cli` ship JavaScript. `@kassis/host-sdk` and `@kassis/addon-ui` ship type declarations plus a small JavaScript shim so plain Node can import the package. The shim does not contain the host UI. The running host serves `@kassis/host-sdk` at `/host-sdk/index.js` and `@kassis/addon-ui` at `/host-sdk/addon-ui.js`. An addon frontend build leaves those imports external.

```bash
npm install @kassis/addon-sdk @kassis/addon-testkit @kassis/addon-ui @kassis/host-sdk @kassis/agent-kit @kassis/addon-cli
```

Published tarballs request [provenance](./publishing.md) when installed from the registry.

## CLI

Install `@kassis/addon-cli` and run `npx kassis-addon`. `--version` reads that package's own `package.json`. The MCP server is `npx kassis-adk-mcp`. The package bundles the addon template, manifest schema, signed coding profiles, and the public verification key. It does not contain a private signing key. `sign` without `--key` exits 1 unless your environment supplies a host signer.

## Air-gapped bundle

Every kit release attaches a signed bundle to its GitHub release: https://github.com/Kassis-ai/kassis-adk/releases (tag `adk/vX.Y.Z`). Download three files from the release:

| File | What it is |
| --- | --- |
| `kassis-adk-X.Y.Z-airgap.zip` | The bundle: package tarballs, `sbom.cdx.json`, `checksums.txt`, `checksums.txt.sig`, `cosign.pub`, `verify.sh` |
| `kassis-adk-X.Y.Z-airgap.zip.sha256` | SHA-256 of the zip |
| `kassis-adk-X.Y.Z-airgap.zip.sig` | cosign signature of the zip |

Verify before you install. You need [cosign](https://docs.sigstore.dev/cosign/system_config/installation/) and the Kassis release public key. The key's SHA-256 is `2b65f3b60e9cebbf81da5419286dd105c79801d29e33aff47cd252285f34aad5`; check it against the copy Kassis gives you on a separate channel (email or your support contract), not only the copy inside the zip.

```bash
sha256sum -c kassis-adk-X.Y.Z-airgap.zip.sha256
cosign verify-blob --key cosign.pub --insecure-ignore-tlog=true \
  --signature kassis-adk-X.Y.Z-airgap.zip.sig kassis-adk-X.Y.Z-airgap.zip
unzip kassis-adk-X.Y.Z-airgap.zip -d airgap
sh airgap/verify.sh
```

`verify.sh` checks `checksums.txt.sig` with the bundled `cosign.pub`, then every file hash in `checksums.txt`. Stop if any step fails. Then install with the `file:` tarballs under `airgap/packs/`. The bundle contains the public verification key and no private signing key.

After install, run `npx kassis-addon init` and the [Quickstart](./quickstart.md) flow without the npm registry.

Kit maintainers who build the bundle from the kassis repository use [Maintainers](./maintainers.md).

## Changelog

| Date       | Change                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-23 | Addon installs use `@kassis/addon-sdk` `^0.2.0` for the Tier 1 context types. `hostApi` stays `^1.0.0`. |
| 2026-11-19 | Air-gapped bundle: download from the kassis-adk GitHub release and verify with cosign; release key fingerprint published. |
| 2026-11-19 | The kit packages publish publicly to npmjs.com under `@kassis`. Installs need no token.                                                                         |
| 2026-11-19 | Addon installs use `@kassis/addon-sdk` `^0.1.0`. `hostApi` stays `^1.0.0`. See the [semver policy](../addons/semver-policy.md). |
| 2026-11-19 | Client install docs use registry and air-gap bundles only; repository pack scripts moved to [Maintainers](./maintainers.md).                                   |
| 2026-11-16 | Clean room scaffolds route, event, job, migration, ui-slot, ui-page, mcp-tool, and tier 2 capability after init, and packs `@kassis/mcp-contract` for offline MCP tests. |
| 2026-10-30 | The `.npmrc.example` path is text. The docs site does not publish files outside `docs/`.                                                                        |
| 2026-10-28 | The packed `@kassis/addon-cli` bundles the CLI and the MCP server. An install outside the kassis repository runs `init`, `check`, and `kassis-adk-mcp`.          |
| 2026-10-28 | The six public packages build to `dist` and publish to GitHub Packages. `host-sdk` and `addon-ui` publish types and a Node shim. The host still serves the runtime. |