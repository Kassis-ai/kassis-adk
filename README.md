# kassis-adk

The Kassis addon development kit. Clients use it to build, certify, sign and package
addons for a Kassis instance without access to the Kassis source.

Published packages (npmjs.com, public, scope `@kassis`):

| Package | Role |
| --- | --- |
| `@kassis/addon-sdk` | Addon contract: `AddonContext` types, manifest v2 schema, KADK codes |
| `@kassis/addon-cli` | `kassis-addon` and `kassis-adk-mcp` commands |
| `@kassis/adk-core` | Command library behind the CLI and the MCP server |
| `@kassis/adk-protocol` | Canonical JSON, content hash, signature verify, publisher trust |
| `@kassis/addon-testkit` | Assertions for addon packs |
| `@kassis/mcp-contract` | Typed MCP tool contract |
| `@kassis/addon-ui`, `@kassis/agent-kit` | Addon UI slot types and task-agent manifest |

`@kassis/host-sdk` is the host's surface and is published from the Kassis repository.

## Work in this repository

```
npm install
npm run build
npm run gate
```

`npm run gate` builds every package, runs the boundary and docs checks, packs each
package, and runs the kit tests. Run it before every push.

Client documentation is under `docs/developer/technical/adk`. Maintainer notes are in
`docs/developer/technical/adk/maintainers.md`.

## Release

A maintainer pushes a tag `adk/vX.Y.Z`. `.github/workflows/adk-release.yml` builds,
tests, packs, signs and publishes the changesets fixed group to npmjs.com and attaches
the signed air-gap bundle to the GitHub release.
