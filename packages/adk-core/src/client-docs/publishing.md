# Publishing

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Platform Engineering (ADK)
**Last reviewed:** 2026-11-19

Version rules are in the [semver policy](../addons/semver-policy.md). Do not bump a public export of `@kassis/addon-sdk` without a matching report change.

## npm registry (kit packages)

`@kassis/addon-sdk`, `@kassis/adk-core`, `@kassis/mcp-contract`, `@kassis/addon-cli`, and `@kassis/addon-testkit` share kit version `0.1.0`. `@kassis/addon-ui`, `@kassis/host-sdk`, and `@kassis/agent-kit` publish on their own lines and are also `0.1.0` today. All of them publish publicly to npmjs.com under the `@kassis` scope, with npm provenance once the source repository is public. `manifest.hostApi` stays `^1.0.0`. Workspace layout, API Extractor reports, changesets, and air-gap bundling are described in [Maintainers](./maintainers.md) for people working in the kassis repository. The `@kassis/adk-core` tarball ships compiled JavaScript. Use `@kassis/addon-cli` for commands.

## Addon package

`kassis-addon package` writes `<id>-<version>.addon` beside the addon folder. The file is a zip. It contains the signed `manifest.json`, the files covered by `contentHash`, the certify evidence pack (`checks.json`, `attestation.json`, and `agent-profile.lock.json`), and `sbom.json`. `kassis-addon sbom` writes that SBOM from the addon build and `package-lock.json`. `package` writes it when it is missing or older than the server build. `package` does not sign the manifest and does not call the network. It refuses a manifest that has no signature or no `contentHash`, a folder whose certify evidence does not match `contentHash`, and a folder whose certify checks did not all exit 0. `sbom.json` is inside the content hash, so run `sign` after it changes and before `package`. `frontend/dist` stays outside the hash. When that folder exists, `package` still copies it into the zip so the host can serve `/addons-ui/<id>/`. A later image rebuild of first-party UI does not change `contentHash`.

`kassis-addon deploy --instance=<url>` uploads that file to `POST /api/v1/addon-security/deploy` and prints the approval request id. The token is `KASSIS_ADK_TOKEN`. An optional `archiveSha256` field is the sha256 of the uploaded bytes and checks the transfer only. The same command works from a jump host that has the `.addon` file. `kassis-addon status --instance=<url>` calls `GET /api/v1/platform/addons/installations` and prints the installed version and the pending staged versions. That route uses the same admin token as deploy. The body is the addon id, the active version, the publisher, and the pending versions. It does not include secrets.

## Instance install

The host does not compare `manifest.checksum` to the archive. The manifest is inside the package, so that digest cannot be a property of the package. Integrity is the signature plus `contentHash`, recomputed on the extracted folder before the host copies anything. An optional upload field `archiveSha256` is compared to the uploaded bytes and protects the transfer only.

The install path is `addons-installed/<id>/<version>/`. The version must be higher than the one already installed. A lower version is a rollback, not an install. `hostApi` must accept the instance host API. A tier 1 package is refused unless the publisher is `kassis`. Install waits for an `addon_deployment` approval. See [Operators](./operators.md).

## Changelog

| Date       | Change                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-19 | Kit packages publish publicly to npmjs.com under `@kassis`. Provenance is added when the source repository is public.                                                                       |
| 2026-11-19 | `@kassis/adk-core` npm pack ships compiled JavaScript in `dist`. `hostApi` stays `^1.0.0`.                                                                                                    |
| 2026-11-19 | Kit version group is `0.1.0`, including `@kassis/adk-core` and `@kassis/mcp-contract`. `hostApi` stays `^1.0.0`. |
| 2026-11-19 | Kit publish workflow moved to [Maintainers](./maintainers.md); this page covers addon `.addon` packages and deploy.                                                                           |
| 2026-11-16 | `host-sdk.api.md` includes `OwnerCommunicationTab` and `OwnerCommunicationTabProps`. `ci:packages:host-sdk-self-contained` passes on that report.                                              |
| 2026-10-30 | `host-sdk.api.md` matches a clean API Extractor run (`React_2.JSX.Element`). `addon-sdk.api.md` lists `ManifestSigning`, which the source already exported.                                    |
| 2026-10-28 | `package` refuses a failed certify and includes attestation and lock in the evidence pack. `ci:packages:publish-config` also checks that committed `package.json` files still point at `src/`. |
| 2026-10-28 | Public tarballs publish `dist` entry points. `ci:packages:publish-config` packs each package and checks those entries.                                                                         |
| 2026-10-28 | `kassis-addon package` writes a self-contained `.addon` zip. `deploy` uploads it and prints the approval request id. `status` lists installed and pending versions.                            |
| 2026-10-28 | The instance installs a package only after signature and `contentHash` checks. `manifest.checksum` is not used.                                                                                |
| 2026-10-28 | All six public packages publish to GitHub Packages. API Extractor also checks `host-sdk.api.md`.                                                                                               |