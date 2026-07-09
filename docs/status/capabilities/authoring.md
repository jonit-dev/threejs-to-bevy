# Authoring Status

Authoring source is durable structured JSON under `content/**` plus gameplay
scripts under `src/scripts/**/*.ts`. Generated bundle files stay derived.

Current support:

- Stable `@threenative/authoring` diagnostics, operation result shapes,
  deterministic formatting, source discovery, and generated-artifact rejection.
- CLI-first scene, material, UI, system, prefab, physics, recipe, cookbook, and
  iterate workflows exposed through `tn ... --json`.
- `tn playtest schema --json` exposes the executable assertion/step/setup DSL
  from the assertion registry, and `tn playtest scaffold --assert
  <movement|pickup|win-state|retry> --json` writes loader-valid proof-bar
  scenarios without engine-source lookup.
- Command-first mutation coverage includes scene transforms, scene
  prefab/entity operations, UI binding, material editing, prefab material
  assignment, and compositional mechanic blocks; direct `content/**` edits
  remain a last resort.
- Source document and scene mutation helpers validate candidate source before
  writing; generated-only scaffold writers are classified in the write-time
  validation audit.
- Experimental typed game-spec APIs type-check high-friction IDs and component
  write declarations, clear stale legacy systems on compile, scaffold an
  explicit starter camera, and emit canonical scene/input/material source
  documents; starter defaults remain gated on benchmark evidence.
- `tn types generate --json` emits project-local script context and ID-union
  declarations under `.threenative/types/`, and `tn build` plus
  `tn dev --watch` refresh them before compiling.
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
- `docs/architecture/typed-game-spec.md` documents the experimental
  TypeScript-spec boundary and remaining default-migration gates.
- `pnpm --filter @threenative/sdk test -- dist/gameSpecTypes.test.js`,
  `pnpm --filter @threenative/compiler test -- dist/scripts/diagnostics.test.js dist/gameSpec/compile.test.js`,
  and `pnpm --filter @threenative/cli test -- dist/commands/playtestAssertions.test.js dist/commands/playtestSchema.test.js dist/commands/playtestScaffold.test.js dist/commands/create.test.js dist/commands/authoring.test.js`
  cover typed-spec writes, stale systems cleanup, starter camera/script
  commands, playtest DSL discovery/scaffolding, and unchanged-state playtest
  diagnostics.
- `tools/agent-benchmark/COOKBOOK-TOPIC-AUDIT-2026-07-07.md`
  maps benchmark needs to the existing validated cookbook entries.
- `pnpm --filter @threenative/authoring test`
- `pnpm --filter @threenative/mcp-server test`
- `pnpm verify:cookbook`
- `pnpm verify:template-production`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
