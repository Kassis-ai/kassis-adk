# Requirement plan

Map every `FR-*` and `NFR-*` row in `REQUIREMENTS.md` before writing code. `kassis-addon plan` and `certify` fail when a row has no rung (KADK-720, KADK-721, KADK-722).

Rungs, lowest first: `configuration`, `extension-point`, `facade`, `own-code`, `gap`.

| ID | Rung | Note |
| --- | --- | --- |
| FR-01 | configuration | Manifest v2, health and the view permission. |
| FR-02 | facade | `defineAddon` / `initialize` from the addon SDK. |
| FR-03 | configuration | Offline check, conformance, build and test. |
| FR-04 | configuration | Rung 2 UI and rung 3 migrations. |
| NFR-01 | own-code | Imports stay inside this addon. |
| NFR-02 | own-code | UI copy uses addon i18n when a UI exists. |
| NFR-03 | configuration | Must ids stay traced before ship. |
| FR-90 | configuration | Example: re-run project wiring. |
| FR-91 | facade | Example: route mounted through the host. |
| FR-92 | extension-point | Example: capability in the addon namespace. |
| FR-93 | extension-point | Example: published event and schema. |
| FR-94 | facade | Example: job handler registered from initialize. |
| FR-95 | own-code | Example: owned table this addon stores. |
| FR-96 | extension-point | Example: host UI slot. |
| FR-97 | extension-point | Example: addon page on the host nav. |
| FR-98 | facade | Example: MCP tool contribution. |
