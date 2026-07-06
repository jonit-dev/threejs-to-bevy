# Authoring Status

Authoring source is durable structured JSON under `content/**` plus gameplay
scripts under `src/scripts/**/*.ts`. Generated bundle files stay derived.

Current support:

- Stable `@threenative/authoring` diagnostics, operation result shapes,
  deterministic formatting, source discovery, and generated-artifact rejection.
- CLI-first scene, material, UI, system, prefab, physics, recipe, cookbook, and
  iterate workflows exposed through `tn ... --json`.
- MCP and authoring-client adapters are thin wrappers over the same core
  operations.
- Prescriptive diagnostics now attach optional structured `fix` payloads for
  high-friction rejection codes.

Verification:

- `pnpm --filter @threenative/authoring test`
- `pnpm --filter @threenative/mcp-server test`
- `pnpm verify:cookbook`
- `pnpm verify:template-production`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
