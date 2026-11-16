---
id: adk-error-codes
title: ADK error codes (KADK)
sidebar_label: ADK error codes
---

# ADK error codes (KADK)

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-11-16 (KADK-125 to KADK-129, KADK-223, KADK-313, KADK-314, KADK-316 to KADK-318, KADK-729 to KADK-732)

Every check of the addon development kit reports a stable `KADK-NNN` code with a message, a fix hint and a link to this page. The catalog is data: `packages/addon-sdk/codes/kadk-codes.json`, read through `listKadkCodes()` and `getKadkCode()` in `@kassis/addon-sdk`. A test keeps this page and the catalog in step (one anchor per code, no extra anchors).

A published code keeps its number, category and meaning. A retired code is marked as retired here and in the catalog; its number is never reused. Text in braces, such as `{path}`, is filled in by the reporter.

| Range | Category                    |
| ----- | --------------------------- |
| 1xx   | Manifest (`manifest`)       |
| 2xx   | Boundaries (`boundaries`)   |
| 3xx   | Data (`data`)               |
| 4xx   | Events (`events`)           |
| 5xx   | UI (`ui`)                   |
| 6xx   | Security (`security`)       |
| 7xx   | Attestation (`attestation`) |

## 1xx Manifest

<a id="kadk-101"></a>

### KADK-101 Manifest does not match the schema

- Severity: error
- Message: `{path}: {detail}`
- Fix: Fix the value at \{path\}. The schema is @kassis/addon-sdk/schema/addon-manifest.v2.schema.json.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-102"></a>

### KADK-102 Required manifest field is missing

- Severity: error
- Message: `{path} is missing '{field}'`
- Fix: Add '\{field\}' at \{path\}.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-103"></a>

### KADK-103 Unknown manifest field

- Severity: error
- Message: `{path} has an unknown field '{field}'`
- Fix: Remove '\{field\}'. Informational values go under metadata.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-104"></a>

### KADK-104 Not a manifest v2

- Severity: error
- Message: `manifestVersion must be 2`
- Fix: Set "manifestVersion": 2 and move the v1 fields as the v1-to-v2 map in the @kassis/addon-sdk README describes.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-105"></a>

### KADK-105 routing cannot be set

- Severity: error
- Message: `routing is derived from the addon id and cannot be set`
- Fix: Remove routing. Routes mount at /api/v1/addons/\<id>; pass a sub-path to ctx.routes.mount.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-106"></a>

### KADK-106 entry is removed

- Severity: error
- Message: `entry is an old scaffold field that the host does not read`
- Fix: Remove entry. Set entrypoints.main when the module is not index.js.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-107"></a>

### KADK-107 permissionNamespaceWaiver is removed

- Severity: error
- Message: `permissionNamespaceWaiver is no longer supported`
- Fix: Remove it and name every permission \<id>.\<resource>.\<action>.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-108"></a>

### KADK-108 Manifest v1 field

- Severity: error
- Message: `'{field}' is a manifest v1 field; in v2 use {home}`
- Fix: Move the value to \{home\}.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-109"></a>

### KADK-109 Addon id is a core namespace

- Severity: error
- Message: `Addon id '{id}' collides with the core namespace '{namespace}'`
- Fix: Choose an id that is not a core namespace.
- Reported by: `validateManifestV2`, when the host passes its reserved namespaces (manifest loader, 3d)

<a id="kadk-110"></a>

### KADK-110 Permission outside the addon namespace

- Severity: error
- Message: `Permission '{value}' at {path} must start with {prefixes}`
- Fix: Rename the permission so it starts with \{prefixes\}.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-111"></a>

### KADK-111 Job type outside the addon namespace

- Severity: error
- Message: `Job type '{value}' at {path} must start with {prefixes}`
- Fix: Rename the job type so it starts with \{prefixes\}.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-112"></a>

### KADK-112 Prompt key outside the addon namespace

- Severity: error
- Message: `Prompt key '{value}' at {path} must start with {prefixes}`
- Fix: Rename the prompt key so it starts with \{prefixes\}.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-113"></a>

### KADK-113 Secret key outside the addon namespace

- Severity: error
- Message: `Secret key '{value}' at {path} must start with {prefixes}`
- Fix: Rename the secret key so it starts with \{prefixes\}.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-114"></a>

### KADK-114 Published event outside the addon namespace

- Severity: error
- Message: `Event '{value}' at {path} must start with {prefixes}`
- Fix: Rename the event so it starts with \{prefixes\}. Events other addons publish go in events.subscribes.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-115"></a>

### KADK-115 Audit action outside the addon namespace

- Severity: error
- Message: `Audit action '{value}' at {path} must start with {prefixes}`
- Fix: Rename the audit action so it starts with \{prefixes\}.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-116"></a>

### KADK-116 Duplicate manifest entry

- Severity: error
- Message: `{path} lists '{value}' more than once`
- Fix: Remove the duplicate entry.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-117"></a>

### KADK-117 Capability is both required and optional

- Severity: error
- Message: `Capability '{value}' is in both requires and optional`
- Fix: Keep it in one list: requires when the addon cannot work without it, optional when it degrades.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-118"></a>

### KADK-118 Required permission is not declared

- Severity: error
- Message: `requiredPermissions lists '{value}', which is not in permissions`
- Fix: Declare '\{value\}' in permissions, or remove it from requiredPermissions.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-119"></a>

### KADK-119 Host API version not supported

- Severity: error
- Message: `The addon needs host API {range}; this host provides {hostVersion}`
- Fix: Build against an @kassis/addon-sdk major this host supports, or upgrade the host.
- Reported by: Host manifest loader (3d) and `kassis addon check` (7a)

<a id="kadk-120"></a>

### KADK-120 Path leaves the addon package

- Severity: error
- Message: `{path} '{value}' must be a relative path inside the addon package`
- Fix: Use a path relative to the package root, without '..' segments.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-121"></a>

### KADK-121 Addon configuration does not match config.schema

- Severity: error
- Message: `Configuration of '{id}' is invalid: {detail}`
- Fix: Change the addon configuration so it matches config.schema in the manifest.
- Reported by: `createAddonContext`, before `initialize()` (3b)

<a id="kadk-122"></a>

### KADK-122 Group name outside the addon namespace

- Severity: error
- Message: `Group name '{value}' at {path} must start with {prefixes}`
- Fix: Rename the group so it starts with \{prefixes\}.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-123"></a>

### KADK-123 Group lists an undeclared permission

- Severity: error
- Message: `groups lists '{value}', which is not in permissions`
- Fix: Declare '\{value\}' in permissions, or remove it from the group.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-124"></a>

### KADK-124 Resource type missing sensitivity

- Severity: error
- Message: `{path} must declare sensitivity ({levels}) when database.ownedTables is non-empty`
- Fix: Set sensitivity on every resourceTypes entry to one of the seal levels: {levels}.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-125"></a>

### KADK-125 Process pack key outside the addon namespace

- Severity: error
- Message: `Pack key '{value}' at {path} must start with {prefixes}`
- Fix: Rename the pack key so it starts with \{prefixes\}.
- Reported by: `kassis-addon check`

<a id="kadk-126"></a>

### KADK-126 Process pack file is missing or outside process/

- Severity: error
- Message: `Pack file '{file}' is missing or is not under process/`
- Fix: Put the item at process/\<name\>.json and set process.packs[].file to that path.
- Reported by: `kassis-addon check`

<a id="kadk-127"></a>

### KADK-127 Process pack file does not match the manifest

- Severity: error
- Message: `Pack file '{file}' key or kind does not match process.packs`
- Fix: Set the file's key and kind to the same values as its process.packs entry.
- Reported by: `kassis-addon check`

<a id="kadk-128"></a>

### KADK-128 Process pack lists an undeclared permission

- Severity: error
- Message: `Pack '{key}' lists permission '{value}', which is not in permissions`
- Fix: Declare '\{value\}' in permissions, or remove it from the pack.
- Reported by: `kassis-addon check`

<a id="kadk-129"></a>

### KADK-129 Process pack names an undeclared record type

- Severity: error
- Message: `Pack '{key}' names record type '{value}', which is not in resourceTypes`
- Fix: Declare '\{value\}' in resourceTypes, or remove it from the pack.
- Reported by: `kassis-addon check`

## 2xx Boundaries

<a id="kadk-201"></a>

### KADK-201 Import from the host alias @/

- Severity: error
- Message: `{file} imports '{specifier}', which is host source`
- Fix: Import from @kassis/\* packages or from your own src/.
- Reported by: `npm run ci:packages:addon-sdk-boundary`; `kassis addon check` for addon packages (7a)

<a id="kadk-202"></a>

### KADK-202 Import from Kassis core

- Severity: error
- Message: `{file} imports '{specifier}', which is Kassis core (server/)`
- Fix: Use an AddonContext facade or a capability declared in requires or optional.
- Reported by: `npm run ci:packages:addon-sdk-boundary`; `kassis addon check` for addon packages (7a)

<a id="kadk-203"></a>

### KADK-203 Import of the core capability registry

- Severity: error
- Message: `{file} imports '{specifier}', which skips the capability access check`
- Fix: Consume capabilities through ctx.capabilities.consume, declared in requires or optional.
- Reported by: `npm run ci:addons:capability-access`; `kassis addon check` (7a)

<a id="kadk-204"></a>

### KADK-204 Import outside the package

- Severity: error
- Message: `{file} imports '{specifier}', which resolves outside the package`
- Fix: Keep relative imports inside the package; depend on other code through a declared package.
- Reported by: `npm run ci:packages:addon-sdk-boundary`; `kassis addon check` for addon packages (7a)

<a id="kadk-205"></a>

### KADK-205 Import of an undeclared package

- Severity: error
- Message: `{file} imports '{specifier}', which is not declared in the package dependencies`
- Fix: Declare the package in dependencies, or remove the import. Node built-ins and unverified @kassis/\* packages are not allowed.
- Reported by: `npm run ci:packages:addon-sdk-boundary`; `kassis addon check` for addon packages (7a)

<a id="kadk-206"></a>

### KADK-206 Host service resolved by name

- Severity: error
- Message: `Add-on '{id}' resolved '{key}' from the host container`
- Fix: Use the AddonContext facade that replaces '\{key\}' (see the facade table in the @kassis/addon-sdk README).
- Reported by: Host, when the addon registers or resolves (rules from 0b; code attached in 3b/3d)

<a id="kadk-207"></a>

### KADK-207 Service name outside the addon namespace

- Severity: error
- Message: `Service '{value}' must start with {prefixes}`
- Fix: Publish the service as a capability, or rename it so it starts with \{prefixes\}.
- Reported by: Host, when the addon registers or resolves (rules from 0b; code attached in 3b/3d)

<a id="kadk-208"></a>

### KADK-208 Service name already registered

- Severity: error
- Message: `Service '{value}' is already registered by {owner}`
- Fix: Pick a name in your namespace. An addon cannot replace a core or another addon's service.
- Reported by: Host, when the addon registers or resolves (rules from 0b; code attached in 3b/3d)

<a id="kadk-209"></a>

### KADK-209 Job type already has a handler

- Severity: error
- Message: `Job type '{value}' already has a handler from {owner}`
- Fix: Use a job type in your namespace and declare it in jobs.types.
- Reported by: Host, when the addon registers or resolves (rules from 0b; code attached in 3b/3d)

<a id="kadk-210"></a>

### KADK-210 Prompt key already registered

- Severity: error
- Message: `Prompt key '{value}' is already registered by {owner}`
- Fix: Use a prompt key in your namespace and declare it in prompts.keys.
- Reported by: Host, when the addon registers or resolves (rules from 0b; code attached in 3b/3d)

<a id="kadk-211"></a>

### KADK-211 Mount path outside the addon

- Severity: error
- Message: `Mount path '{value}' must be /api/v1/addons/{id} or below it`
- Fix: Mount through ctx.routes.mount, which places routes under /api/v1/addons/\{id\}.
- Reported by: Host, when the addon registers or resolves (rules from 0b; code attached in 3b/3d)

<a id="kadk-212"></a>

### KADK-212 Required capability is missing

- Severity: error
- Message: `Add-on '{id}' requires {capability} {range}; available: {available}`
- Fix: Enable an addon that provides a matching version, or move the capability to optional and handle null.
- Reported by: Capability graph at enable time (3f)

<a id="kadk-213"></a>

### KADK-213 Capability dependency cycle

- Severity: error
- Message: `Required capabilities form a cycle: {cycle}`
- Fix: Make one edge optional, or move the shared contract into a third addon.
- Reported by: Capability graph at enable time (3f)

<a id="kadk-214"></a>

### KADK-214 Capability consumed without a declaration

- Severity: error
- Message: `Add-on '{id}' consumed '{capability}', which is not in requires or optional`
- Fix: Declare '\{capability\}' in requires or optional.
- Reported by: `ctx.capabilities` (3b, 3f)

<a id="kadk-215"></a>

### KADK-215 Capability provided without a declaration

- Severity: error
- Message: `Add-on '{id}' provided '{capability}', which is not in provides`
- Fix: Declare '\{capability\}' in provides with the version it implements.
- Reported by: `ctx.capabilities` (3b, 3f)

<a id="kadk-216"></a>

### KADK-216 Route permission is not declared

- Severity: error
- Message: `Add-on '{id}' mounted a route with permission '{value}', which is not in permissions`
- Fix: Declare '\{value\}' in permissions, or mount the route with a permission the manifest declares.
- Reported by: `ctx.routes.mount` (3b)

<a id="kadk-217"></a>

### KADK-217 Tool path is outside the project

- Severity: error
- Message: `{path} is outside the project root`
- Fix: Pass a dir inside the directory where kassis-adk-mcp was started, or set --root to that directory.
- Reported by: `kassis-adk-mcp`

<a id="kadk-218"></a>

### KADK-218 Tier 2 cannot provide a capability yet

- Severity: error
- Message: `Add-on '{id}' is tier 2; ctx.capabilities.provide is refused by the host`
- Fix: Use requires to consume another addon's capability. Do not add provides[] for tier 2 until the host accepts provide.
- Reported by: older `kassis-addon scaffold` builds. Current scaffold writes `provides` for tier 2. The code stays so those logs still resolve.

<a id="kadk-219"></a>

### KADK-219 Facade call refused for this tier

- Severity: error
- Message: `{file} calls {method}, which tier {tier} addons cannot use`
- Fix: Use a facade allowed for your tier in `@kassis/addon-sdk/tier-matrix.json`, pick tier 1 when appropriate, or consume another addon through `requires`.
- Reported by: `kassis-addon doctor --requirements` when addon source calls a `ctx` method the manifest tier cannot use; `createTestContext()` at runtime when a unit test calls a facade the chosen tier cannot use

<a id="kadk-220"></a>

### KADK-220 Capability outside the addon namespace

- Severity: error
- Message: `Capability '{value}' at {path} must start with {prefixes}`
- Fix: Rename the capability so it starts with {prefixes}, and declare that id in provides.
- Reported by: `validateManifestV2` on `provides[]`, and `ctx.capabilities.provide` for a tier 2 addon

<a id="kadk-221"></a>

### KADK-221 Banned dependency

- Severity: error
- Message: `Dependency '{name}' is a banned {category} package`
- Fix: Remove '{name}' from package.json and use the core facade for {category}.
- Reported by: `kassis-addon check` and `kassis-addon certify` against `@kassis/addon-sdk/banned-dependencies.json`

<a id="kadk-222"></a>

### KADK-222 Extension point is not declared

- Severity: error
- Message: `Add-on '{id}' registered '{value}', which is not in extends`
- Fix: Add '{value}' to extends in the manifest.
- Reported by: tier 2 `ctx.extend.*` when the point is missing from manifest `extends`

<a id="kadk-223"></a>

### KADK-223 Extension name is already registered

- Severity: error
- Message: `Add-on '{id}' cannot register '{value}' on '{path}'; another registration already owns that name`
- Fix: Use a name this add-on owns, or disable the add-on that registered '{value}'.
- Reported by: tier 2 wave 1 and wave 2 registration when another addon or a core type already owns the name

## 3xx Data

<a id="kadk-301"></a>

### KADK-301 Tier 2 addon declares legacyTables

- Severity: error
- Message: `legacyTables is allowed only for tier 1 addons`
- Fix: Remove legacyTables and keep the addon's tables in data.schema.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-302"></a>

### KADK-302 Tier 2 addon reads core tables

- Severity: error
- Message: `database.readAccess is allowed only for tier 1 addons`
- Fix: Remove database.readAccess and read core data through ctx.core facades.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-303"></a>

### KADK-303 Owned table outside data.schema

- Severity: error
- Message: `Owned table '{value}' at {path} is not in {schema}`
- Fix: Qualify the table as \{schema\}.\<table>.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-304"></a>

### KADK-304 data.schema does not match the addon id

- Severity: error
- Message: `data.schema is '{value}'; it must be '{expected}'`
- Fix: Set data.schema to '\{expected\}'.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-305"></a>

### KADK-305 Tier 2 tables without data.schema

- Severity: error
- Message: `A tier 2 addon that owns tables must declare data.schema`
- Fix: Add data.schema and qualify every owned table with it.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-306"></a>

### KADK-306 Legacy table is not owned

- Severity: error
- Message: `legacyTables entry '{value}' is not in database.ownedTables`
- Fix: List the table in database.ownedTables, or remove the legacyTables entry.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-307"></a>

### KADK-307 Legacy rename outside the addon prefix

- Severity: error
- Message: `legacyTables newName '{value}' must start with {prefixes}`
- Fix: Rename the table into the addon prefix or into data.schema.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-308"></a>

### KADK-308 Core table queried through ctx.data

- Severity: error
- Message: `Add-on '{id}' queried '{table}', which it does not own`
- Fix: Read core data through ctx.core facades; ctx.data reaches only the addon's own schema.
- Reported by: Addon database role (Phase 4)

<a id="kadk-309"></a>

### KADK-309 Owned tables without data.retention

- Severity: error
- Message: `database.ownedTables is set but data.retention is missing`
- Fix: Set data.retention to retain, archive, or purge.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-310"></a>

### KADK-310 Private mechanism table

- Severity: error
- Message: `Table '{table}' is a private {mechanism} table`
- Fix: Use the core {mechanism} feature, or add an explained row for '{table}' in REUSE.md.
- Reported by: `kassis-addon check` and `kassis-addon certify`

<a id="kadk-311"></a>

### KADK-311 Private mechanism table needs acknowledgement

- Severity: warning
- Message: `Table '{table}' is a private {mechanism} table with an override`
- Fix: An approver must acknowledge the REUSE.md reason for '{table}' before this ships.
- Reported by: `kassis-addon check` and `kassis-addon certify` when REUSE.md explains the table

<a id="kadk-312"></a>

### KADK-312 Owned table has no core alternative

- Severity: warning
- Message: `Owned table '{table}' does not say which core record it could not be`
- Fix: Add database.tableNotes for '{table}' with notCoreRecord and why.
- Reported by: `kassis-addon check` and `kassis-addon certify`

<a id="kadk-313"></a>

### KADK-313 Process pack kind has no stable schema

- Severity: warning
- Message: `Pack '{key}' kind '{kind}' has no stable schema, so its body was not checked`
- Fix: Leave the body unchecked until the host publishes a schema for '\{kind\}'. Do not add one in the kit.
- Reported by: `kassis-addon check`

<a id="kadk-314"></a>

### KADK-314 Process pack reference does not resolve

- Severity: error
- Message: `Pack '{key}' references '{value}', which is not a pack key`
- Fix: Point '\{value\}' at another pack key in this addon. References use keys, never ids.
- Reported by: `kassis-addon check`

<a id="kadk-316"></a>

### KADK-316 Process pack file does not match the pack schema

- Severity: error
- Message: `{path}: {detail}`
- Fix: Match the file to @kassis/addon-sdk/schema/process-pack.schema.json. The body stays an object; do not add settings, users, role assignments or secrets.
- Reported by: `kassis-addon check`

<a id="kadk-317"></a>

### KADK-317 Duplicate process pack key

- Severity: error
- Message: `Pack key '{value}' is listed more than once`
- Fix: Keep one process.packs entry for '\{value\}'.
- Reported by: `kassis-addon check`

<a id="kadk-318"></a>

### KADK-318 Process file is not listed

- Severity: error
- Message: `'{file}' is under process/ but not listed in process.packs`
- Fix: Add a process.packs entry for '\{file\}', or remove the file. The list is what the signature approval diff shows.
- Reported by: `kassis-addon check`

## 4xx Events

<a id="kadk-401"></a>

### KADK-401 Event is not declared in publishes

- Severity: error
- Message: `Add-on '{id}' published '{event}', which is not in events.publishes`
- Fix: Declare the event with its schema in events.publishes.
- Reported by: `ctx.events` (name check 3b, schemas 3c)

<a id="kadk-402"></a>

### KADK-402 Event payload fails its schema

- Severity: error
- Message: `Payload for '{event}' is invalid: {detail}`
- Fix: Send a payload that matches the event schema, or change the schema in a compatible way.
- Reported by: `ctx.events` (3c)

<a id="kadk-403"></a>

### KADK-403 Event is not declared in subscribes

- Severity: error
- Message: `Add-on '{id}' subscribed to '{event}', which is not in events.subscribes`
- Fix: Declare the event in events.subscribes.
- Reported by: `ctx.events` (3b)

<a id="kadk-404"></a>

### KADK-404 Event schema file is missing

- Severity: error
- Message: `Schema '{value}' for event '{event}' is not in the package`
- Fix: Add the schema file at that path, inside the package.
- Reported by: Manifest loader, when it reads event schemas (3c, 3d)

<a id="kadk-405"></a>

### KADK-405 Event schema is not valid

- Severity: error
- Message: `Schema '{value}' for event '{event}' is not a valid JSON Schema: {detail}`
- Fix: Fix the schema so it compiles as JSON Schema draft 2020-12.
- Reported by: Manifest loader, when it reads event schemas (3c, 3d)

<a id="kadk-406"></a>

### KADK-406 Event schema path is not a schema file

- Severity: error
- Message: `Schema '{value}' at {path} must end with .schema.json`
- Fix: Point events.publishes[].schema at a .schema.json file inside the package.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

## 5xx UI

<a id="kadk-501"></a>

### KADK-501 Runtime-loaded UI without an entry file

- Severity: error
- Message: `ui.runtimeLoad is true but ui.entryFile is not set`
- Fix: Set ui.entryFile to the built UI entry, or set ui.runtimeLoad to false.
- Reported by: `validateManifestV2` in `@kassis/addon-sdk`

<a id="kadk-502"></a>

### KADK-502 UI slot contribution collides

- Severity: error
- Message: `Slot '{slot}' already has component '{component}' from {owner}`
- Fix: Use a different component name or slot.
- Reported by: Host UI runtime (Phase 6)

<a id="kadk-503"></a>

### KADK-503 UI slot failed to render

- Severity: error
- Message: `Component '{component}' in slot '{slot}' threw while rendering: {detail}`
- Fix: Fix the render error; the host shows an error state in the slot until then.
- Reported by: Host UI runtime (Phase 6)

<a id="kadk-504"></a>

### KADK-504 UI entry file includes a directory

- Severity: warning
- Message: `ui.entryFile '{value}' includes a slash`
- Fix: Set ui.entryFile to the file name inside frontend/dist, for example index.js.
- Reported by: `kassis-addon check`

## 6xx Security

<a id="kadk-601"></a>

### KADK-601 Manifest signature is invalid

- Severity: error
- Message: `The signature of '{id}' does not match its manifest`
- Fix: Sign the package again with a trusted publisher key.
- Reported by: Signature and content hash gate (0a)

<a id="kadk-602"></a>

### KADK-602 Content hash does not match

- Severity: error
- Message: `The files of '{id}' do not match contentHash`
- Fix: Rebuild and sign the package again; never edit files after signing.
- Reported by: Signature and content hash gate (0a)

<a id="kadk-603"></a>

### KADK-603 Addon identity mismatch

- Severity: error
- Message: `Add-on '{id}' called {operation} as '{claimed}'`
- Fix: Do not pass another addon's id; the host fills in the caller.
- Reported by: Bound host (0b) and `AddonContext` (3b)

<a id="kadk-604"></a>

### KADK-604 Secret mapping rejected

- Severity: error
- Message: `Secret mapping '{value}' for '{id}' was rejected: {detail}`
- Fix: Map only keys that start with '\{id\}:' to secret names and variables with the addon prefix.
- Reported by: Secret mapping rules (0b)

<a id="kadk-605"></a>

### KADK-605 Secret key is not declared

- Severity: error
- Message: `Add-on '{id}' read secret '{value}', which is not in secrets.keys`
- Fix: Declare the key in secrets.keys.
- Reported by: `AddonContext` facades (3b, 3d)

<a id="kadk-606"></a>

### KADK-606 Audit action is not declared

- Severity: error
- Message: `Add-on '{id}' recorded audit action '{value}', which is not in audit.actions`
- Fix: Declare the action in audit.actions.
- Reported by: `AddonContext` facades (3b, 3d)

<a id="kadk-607"></a>

### KADK-607 Egress host is not allowed

- Severity: error
- Message: `Add-on '{id}' called '{host}', which is not in egress.hosts`
- Fix: Declare the host in egress.hosts; the change shows in the evidence pack.
- Reported by: `AddonContext` facades (3b, 3d)

<a id="kadk-608"></a>

### KADK-608 Prompt key is not declared

- Severity: error
- Message: `Add-on '{id}' used prompt key '{value}', which is not in prompts.keys`
- Fix: Declare the key in prompts.keys.
- Reported by: `AddonContext` facades (3b, 3d)

<a id="kadk-609"></a>

### KADK-609 LLM settings override rejected

- Severity: error
- Message: `Add-on '{id}' passed '{option}' to ctx.llm.invoke`
- Fix: Remove the option. Model, provider, temperature, token limits and timeouts come from AI Settings and the prompt.
- Reported by: `AddonContext` facades (3b, 3d)

<a id="kadk-610"></a>

### KADK-610 Job type is not declared

- Severity: error
- Message: `Add-on '{id}' used job type '{value}', which is not in jobs.types`
- Fix: Declare the job type in jobs.types.
- Reported by: `AddonContext` facades (3b, 3d)

<a id="kadk-611"></a>

### KADK-611 Principal not issued by the host

- Severity: error
- Message: `Add-on '{id}' passed {operation} a principal or request the host did not issue`
- Fix: Pass the principal from ctx.routes.principalOf(request), event.principal or job.principal, unchanged.
- Reported by: `AddonContext` facades (3b)

<a id="kadk-612"></a>

### KADK-612 Setting outside the addon's read scope

- Severity: error
- Message: `Add-on '{id}' read setting '{value}', which is outside its namespace`
- Fix: Read settings that start with \{prefixes\}. Core settings reach an addon through a facade, such as ctx.settings.search().
- Reported by: `ctx.settings.get` (3b)

<a id="kadk-613"></a>

### KADK-613 No user to attribute the write to

- Severity: error
- Message: `Add-on '{id}' called {operation} with a principal that has no user`
- Fix: Act for the signed-in user's principal, or provision the addon's service user; audited writes never run as 'system'.
- Reported by: `AddonContext` facades that write on behalf of a principal (3b)

<a id="kadk-614"></a>

### KADK-614 Egress limit exceeded

- Severity: error
- Message: `Add-on '{id}' call to '{host}' exceeded the egress {limit} limit of {value}`
- Fix: Ask for less data or a faster answer, or have an operator raise addons.egress.timeoutMs or addons.egress.maxResponseBytes in Settings.
- Reported by: `ctx.http.fetch` (3b)

<a id="kadk-615"></a>

### KADK-615 Principal lacks the permission

- Severity: error
- Message: `Add-on '{id}' called {operation} for a principal without {permission}`
- Fix: Act for a user who holds \{permission\}, or have an operator grant it to the addon's service account. Facades check the principal's permissions, never the addon's.
- Reported by: `ctx.core`, `ctx.risk` and `ctx.audit.search` (3b)

<a id="kadk-616"></a>

### KADK-616 Record outside the principal's scope

- Severity: error
- Message: `Add-on '{id}' called {operation} on {resource} '{value}', which the principal cannot access`
- Fix: Act for a user whose scope (own, department, jurisdiction) includes the record.
- Reported by: `ctx.core` and `ctx.risk` (3b)

<a id="kadk-617"></a>

### KADK-617 Record type not open to the addon

- Severity: error
- Message: `Add-on '{id}' called {operation} on record type '{value}', which is not open to it`
- Fix: Use a record type the addon owns: one it registered through ctx.extend, or one in its namespace. Core record types are reached only through the facade operations that apply their API checks.
- Reported by: `ctx.core.approvals`, `ctx.core.entities.link` and `ctx.core.documents.indexText` (3b)

## 7xx Attestation

<a id="kadk-701"></a>

### KADK-701 Attestation file is missing

- Severity: error
- Message: `.kassis/attestation.json was not found`
- Fix: Run kassis addon attest and answer every guardrail of the pinned profile version.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-702"></a>

### KADK-702 Blocking guardrail has no answer

- Severity: error
- Message: `Guardrail '{key}' is blocking and has no answer`
- Fix: Answer '\{key\}' with followed, not_applicable (with a reason) or violated (with an explanation).
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-703"></a>

### KADK-703 Blocking guardrail violated

- Severity: error
- Message: `Guardrail '{key}' is blocking and was answered violated`
- Fix: Undo the change that broke '\{key\}', then attest again.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-704"></a>

### KADK-704 Attestation does not match the lock file

- Severity: error
- Message: `The attestation is for profile version {attested}; the lock file pins {locked}`
- Fix: Run kassis addon attest again against the pinned profile version.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-705"></a>

### KADK-705 not_applicable without a reason

- Severity: error
- Message: `Guardrail '{key}' is not_applicable but has no reason`
- Fix: Add the reason in the answer note.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-706"></a>

### KADK-706 violated without an explanation

- Severity: error
- Message: `Guardrail '{key}' is violated but has no explanation`
- Fix: Add the explanation in the answer note.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-707"></a>

### KADK-707 Machine-verified guardrail without evidence

- Severity: error
- Message: `Guardrail '{key}' is followed but has no evidence from {check}`
- Fix: Run certify so \{check\} is recorded in `.kassis/evidence/checks.json`. Evidence typed into the attestation is ignored.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-708"></a>

### KADK-708 Agent run expired

- Severity: error
- Message: `Run '{runId}' expired before the attestation was submitted`
- Fix: Start a new run, read the pinned guardrails and attest again.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-709"></a>

### KADK-709 Profile lock file is missing

- Severity: error
- Message: `.kassis/agent-profile.lock.json was not found`
- Fix: Run kassis adk sync to pin the latest published profile version.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-710"></a>

### KADK-710 Answer for an unknown guardrail

- Severity: error
- Message: `Guardrail '{key}' is not in the pinned profile version`
- Fix: Remove the answer or sync the lock file.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-711"></a>

### KADK-711 Guardrail answered twice

- Severity: error
- Message: `Guardrail '{key}' has more than one answer`
- Fix: Keep one answer per guardrail.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-712"></a>

### KADK-712 Advisory guardrail violated

- Severity: warning
- Message: `Advisory guardrail '{key}' was answered violated`
- Fix: Say why in the change summary; the answer is recorded.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-713"></a>

### KADK-713 Advisory guardrail has no answer

- Severity: warning
- Message: `Advisory guardrail '{key}' has no answer`
- Fix: Answer every guardrail, including advisory ones.
- Reported by: `kassis addon certify` (7a) and the agent run service (2a)

<a id="kadk-714"></a>

### KADK-714 Attestation outcome is not allowed

- Severity: error
- Message: `Guardrail '{key}' has outcome '{outcome}', which is not followed, violated or not_applicable`
- Fix: Set the outcome to followed, violated or not_applicable. A blank outcome fails certify.
- Reported by: `kassis addon certify`

<a id="kadk-715"></a>

### KADK-715 Typed machine evidence is ignored

- Severity: warning
- Message: `Guardrail '{key}' has typed evidence. Machine evidence comes only from .kassis/evidence/checks.json.`
- Fix: Remove the typed evidence for '\{key\}'. Certify records \{check\} itself.
- Reported by: `kassis addon certify`

<a id="kadk-718"></a>

### KADK-718 Requirements file is missing

- Severity: error
- Message: `REQUIREMENTS.md was not found`
- Fix: Add REQUIREMENTS.md with FR-* and NFR-* rows, or run kassis-addon init from the template.
- Reported by: `kassis-addon requirements`; `kassis-addon certify`

<a id="kadk-719"></a>

### KADK-719 Must requirement is not traced

- Severity: error
- Message: `Must requirement '{id}' is not named in test/ or GAPS.md`
- Fix: Add the id to a test under test/, or record the gap in GAPS.md, then run kassis-addon requirements.
- Reported by: `kassis-addon requirements`; `kassis-addon certify`

<a id="kadk-720"></a>

### KADK-720 Requirement plan is missing

- Severity: error
- Message: `PLAN.md was not found`
- Fix: Add PLAN.md with a rung for every FR-* and NFR-* row, then run kassis-addon plan.
- Reported by: `kassis-addon plan`; `kassis-addon certify`

<a id="kadk-721"></a>

### KADK-721 Requirement has no rung

- Severity: error
- Message: `Requirement '{id}' has no rung in PLAN.md`
- Fix: Map '{id}' to configuration, extension-point, facade, own-code, or gap, then run kassis-addon plan.
- Reported by: `kassis-addon plan`; `kassis-addon certify`

<a id="kadk-722"></a>

### KADK-722 Requirement rung is not allowed

- Severity: error
- Message: `Requirement '{id}' has rung '{rung}', which is not configuration, extension-point, facade, own-code or gap`
- Fix: Set the rung for '{id}' to configuration, extension-point, facade, own-code, or gap. A duplicate row uses rung duplicate.
- Reported by: `kassis-addon plan`; `kassis-addon certify`

<a id="kadk-723"></a>

### KADK-723 Soft budget exceeded without reason

- Severity: error
- Message: `Soft budget '{metric}' is {count} (limit {limit}) and BUDGETS.md has no reason`
- Fix: Add a BUDGETS.md row for '{metric}' with Count, Limit and a written reason the approver can acknowledge, then run kassis-addon budgets.
- Reported by: `kassis-addon budgets`; `kassis-addon certify`

<a id="kadk-724"></a>

### KADK-724 Outbound call has no timeout

- Severity: error
- Message: `Outbound call in '{path}' has no timeout, AbortSignal or signal option`
- Fix: Pass a timeout, AbortSignal.timeout, or signal on every fetch/HTTP call in '{path}', then run kassis-addon engineering.
- Reported by: `kassis-addon engineering`; `kassis-addon certify`

<a id="kadk-725"></a>

### KADK-725 Query has no pagination cap

- Severity: error
- Message: `findMany in '{path}' has no take or skip`
- Fix: Add take or skip to the findMany call in '{path}', then run kassis-addon engineering.
- Reported by: `kassis-addon engineering`; `kassis-addon certify`

<a id="kadk-726"></a>

### KADK-726 UI chrome is outside i18n

- Severity: error
- Message: `UI file '{path}' has chrome outside translation keys or imports i18next`
- Fix: Move user-visible chrome in '{path}' to host-sdk translation keys (en/fr). Do not import i18next from addon UI. Then run kassis-addon engineering.
- Reported by: `kassis-addon engineering`; `kassis-addon certify`

<a id="kadk-727"></a>

### KADK-727 Handler is not idempotent

- Severity: error
- Message: `Handler '{path}' mutates without an idempotency marker, upsert, findFirst/findUnique or ON CONFLICT`
- Fix: Make the job or event handler in '{path}' safe to run twice (idempotent key, upsert, or prior find), then run kassis-addon engineering.
- Reported by: `kassis-addon engineering`; `kassis-addon certify`

<a id="kadk-728"></a>

### KADK-728 Module-level mutable state

- Severity: error
- Message: `Server file '{path}' declares module-level let or var state`
- Fix: Move mutable state out of module scope in '{path}' so hot toggle does not keep stale values, then run kassis-addon engineering.
- Reported by: `kassis-addon engineering`; `kassis-addon certify`

<a id="kadk-729"></a>

### KADK-729 Record access check is missing

- Severity: error
- Message: `Record access check is missing for a declared record type ('{path}')`
- Fix: Add a canAccess handler for each resourceTypes entry. A missing handler is not an allow.
- Reported by: `kassis-addon check`; `kassis-addon certify`; enable

<a id="kadk-730"></a>

### KADK-730 Record access check is a stub

- Severity: error
- Message: `Access check '{name}' in '{path}' returns true or only throws`
- Fix: Replace the access check in '{path}' so it decides from the principal and the record. A return true body and a body that only throws are stubs, including the record-type scaffold.
- Reported by: `kassis-addon check`; `kassis-addon certify`; enable

<a id="kadk-731"></a>

### KADK-731 Deletion handler is missing

- Severity: error
- Message: `Deletion handler is missing while the addon owns tables ('{path}')`
- Fix: Add an onDelete handler when database.ownedTables is not empty.
- Reported by: `kassis-addon check`; `kassis-addon certify`; enable

<a id="kadk-732"></a>

### KADK-732 Deletion handler is a stub

- Severity: error
- Message: `Deletion handler '{name}' in '{path}' is empty or only throws`
- Fix: Replace the deletion handler in '{path}' so it erases or detaches the record. An empty body and a body that only throws are stubs, including the record-type scaffold.
- Reported by: `kassis-addon check`; `kassis-addon certify`; enable

## Changelog

| Date       | Change                                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | KADK-729 when a manifest v2 addon declares a record type and has no canAccess handler. KADK-730 when that handler returns true or only throws. KADK-731 when owned tables have no onDelete handler. KADK-732 when that handler is empty or only throws. `kassis-addon check` and `certify` report them. Enable refuses the same addon. |
| 2026-11-16 | KADK-125 to KADK-129 and KADK-314, KADK-316 to KADK-318 when a process pack key, file, permission, record type, or reference is wrong. KADK-313 warns when the kind has no host JSON Schema, so the body is not checked. |
| 2026-11-16 | KADK-723 soft budgets without BUDGETS.md reason. KADK-724–728 engineering practice (timeouts, pagination, i18n, idempotent handlers, no module state). `kassis-addon budgets` / `engineering`; certify applies the same gates. |
| 2026-11-16 | KADK-223 when two tier 2 registrations claim the same wave 1 or wave 2 name.                                                                                                                                              |
| 2026-11-16 | KADK-223 when two tier 2 registrations claim the same wave 1 name.                                                                                                                                                        |
| 2026-11-16 | KADK-222 when a tier 2 addon registers a `ctx.extend` point that manifest `extends` does not name.                                                                                                                          |
| 2026-11-16 | KADK-221 when package.json depends on a banned mail, scheduler, upload, storage, auth, database, UI kit, or LLM package. KADK-310 when an owned or created table is a private approval, notification, audit, user, or role table. KADK-311 warns when REUSE.md explains that table. KADK-312 warns when an owned table has no database.tableNotes core alternative. |
| 2026-11-16 | KADK-720 when PLAN.md is missing. KADK-721 when a requirement row has no rung. KADK-722 when the rung is not configuration, extension-point, facade, own-code, or gap. `kassis-addon plan` writes `.kassis/evidence/requirement-mapping.json`; certify applies the same gate. |
| 2026-11-16 | KADK-718 when REQUIREMENTS.md is missing. KADK-719 when a Must row has no mention in test/ or GAPS.md. `kassis-addon requirements` writes `.kassis/evidence/requirements-coverage.json`; certify applies the same gate.       |
| 2026-10-28 | KADK-714 blocks an outcome that is not followed, violated or not_applicable. KADK-715 warns when machine evidence is typed into the attestation. KADK-707 still means the checks file has no passing result for that check. |
