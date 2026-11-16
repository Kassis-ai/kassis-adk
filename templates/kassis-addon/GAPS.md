# Gaps

Platform gaps for `__ADDON_ID__`. One section per blocked Must requirement. Remove an entry when the platform ships the needed capability and the requirement is implemented.

When there are no gaps, this file keeps only the format sample below (or delete the sample once you add a real gap).

## GAP-00 Example entry (delete when unused)

Requirement: FR-04 (example: persist rows in an owned table)
Check: `npx kassis-addon test` or `npx kassis-addon doctor --requirements`
Observed: `KADK-…` or the exact refusal text from the host or testkit
Mode B behaviour: what the addon does instead (if any)
Needed from the platform: the smallest facade or extension point that would unblock it

A gap is a finding about the ADK, not a failure of the build. See BRD-ADK-001 section 10.3 in the ADK documentation.