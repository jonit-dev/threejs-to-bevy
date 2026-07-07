# Authoring Status

Authoring source is durable structured JSON under `content/**` plus gameplay
scripts under `src/scripts/**/*.ts`. Generated bundle files stay derived.

Current support:

- Stable `@threenative/authoring` diagnostics, operation result shapes,
  deterministic formatting, source discovery, and generated-artifact rejection.
- CLI-first scene, material, UI, system, prefab, physics, recipe, cookbook, and
  iterate workflows exposed through `tn ... --json`.
- Command-first mutation coverage includes scene transforms, scene
  prefab/entity operations, UI binding, material editing, prefab material
  assignment, and compositional mechanic blocks; direct `content/**` edits
  remain a last resort.
- Source document and scene mutation helpers validate candidate source before
  writing; generated-only scaffold writers are classified in the write-time
  validation audit.
- Cookbook lookup supports both `tn cookbook show <id> --json` and the compact
  `tn cookbook <id> --json` shorthand for validated pattern pairs.
- Maintained starters include `docs/API-CARD.md`, a compact generated
  ScriptContext/source contract validated against `packages/script-stdlib`.
- MCP and authoring-client adapters are thin wrappers over the same core
  operations.
- Prescriptive diagnostics now attach optional structured `fix` payloads for
  high-friction rejection codes.
- Rigid body kind diagnostics include the exact `fixed` to `static` repair for
  immovable authored bodies.

Verification:

- `tools/agent-benchmark/MUTATION-SURFACE-AUDIT-2026-07-07.md`
  maps observed raw `content/**` edit shapes to bounded commands or explicit
  deferrals.
- `tools/agent-benchmark/DIAGNOSTIC-FAILURE-AUDIT-2026-07-07.md`
  ranks failed benchmark command shapes and selected diagnostic fixes.
- `tools/agent-benchmark/WRITE-TIME-VALIDATION-AUDIT-2026-07-07.md`
  classifies source writers as validate-before-write, generated-only, or
  deferred.
- `tools/agent-benchmark/COOKBOOK-TOPIC-AUDIT-2026-07-07.md`
  maps benchmark needs to the existing validated cookbook entries.
- `pnpm --filter @threenative/authoring test`
- `pnpm --filter @threenative/mcp-server test`
- `pnpm verify:cookbook`
- `pnpm verify:template-production`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
