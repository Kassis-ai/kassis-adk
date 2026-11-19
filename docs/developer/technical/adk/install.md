# Install

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Platform Engineering (ADK)
**Last reviewed:** 2026-11-19

## Prerequisites

- Node.js 20 or newer (`kassis-addon doctor` checks the runtime).
- Docker or Podman when you want `kassis-addon dev` against a local dev host image.

## Packages

The packages an addon installs are `@kassis/addon-sdk`, `@kassis/addon-testkit`, `@kassis/addon-ui`, `@kassis/host-sdk`, `@kassis/agent-kit`, and `@kassis/addon-cli`. They publish to GitHub Packages. Copy `.npmrc.example` to `.npmrc` and set `NODE_AUTH_TOKEN` in the environment. Do not commit a token.

Depend on `@kassis/addon-sdk` at `^0.1.0`. That is the kit npm line. It is not the host API. `manifest.hostApi` stays `^1.0.0`. The version rules are in the [semver policy](../addons/semver-policy.md). `@kassis/adk-core` and `@kassis/mcp-contract` share that kit line. Install the CLI for commands. An addon that scaffolds an MCP tool depends on `@kassis/mcp-contract`.

The packages in the install command below build to `dist` in the published tarball. `@kassis/addon-sdk`, `@kassis/addon-testkit`, `@kassis/agent-kit`, and `@kassis/addon-cli` ship JavaScript. `@kassis/host-sdk` and `@kassis/addon-ui` ship type declarations plus a small JavaScript shim so plain Node can import the package. The shim does not contain the host UI. The running host serves `@kassis/host-sdk` at `/host-sdk/index.js` and `@kassis/addon-ui` at `/host-sdk/addon-ui.js`. An addon frontend build leaves those imports external.

```bash
npm install @kassis/addon-sdk @kassis/addon-testkit @kassis/addon-ui @kassis/host-sdk @kassis/agent-kit @kassis/addon-cli
```

Published tarballs request [provenance](./publishing.md) when installed from the registry.

## CLI

Install `@kassis/addon-cli` and run `npx kassis-addon`. `--version` reads that package's own `package.json`. The MCP server is `npx kassis-adk-mcp`. The package bundles the addon template, manifest schema, signed coding profiles, and the public verification key. It does not contain a private signing key. `sign` without `--key` exits 1 unless your environment supplies a host signer.

## Air-gapped bundle

Download the kit air-gap bundle from your release channel (checksums and signatures ship with the bundle). Extract it to a directory such as `./airgap`. Install dependencies with `file:` tarballs listed in `checksums.txt` and verify hashes before use. The bundle includes the SDK, testkit, template, public verification key, `sbom.json`, and the six public package tarballs. It refuses to include a private signing key.

After install, run `npx kassis-addon init` and the [Quickstart](./quickstart.md) flow without the npm registry.

Kit maintainers who build the bundle from the kassis repository use [Maintainers](./maintainers.md).

## Changelog

| Date       | Change                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-19 | Addon installs use `@kassis/addon-sdk` `^0.1.0`. `hostApi` stays `^1.0.0`. See the [semver policy](../addons/semver-policy.md). |
| 2026-11-19 | Client install docs use registry and air-gap bundles only; repository pack scripts moved to [Maintainers](./maintainers.md).                                   |
| 2026-11-16 | Clean room scaffolds route, event, job, migration, ui-slot, ui-page, mcp-tool, and tier 2 capability after init, and packs `@kassis/mcp-contract` for offline MCP tests. |
| 2026-10-30 | The `.npmrc.example` path is text. The docs site does not publish files outside `docs/`.                                                                        |
| 2026-10-28 | The packed `@kassis/addon-cli` bundles the CLI and the MCP server. An install outside the kassis repository runs `init`, `check`, and `kassis-adk-mcp`.          |
| 2026-10-28 | The six public packages build to `dist` and publish to GitHub Packages. `host-sdk` and `addon-ui` publish types and a Node shim. The host still serves the runtime. |