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
- `tn actor add <character|vehicle|pickup|camera-boom|prop-static> --id
  <actor-id> --json`, `tn actor update`, and registry operations
  `archetype.apply|update|list` stamp reusable actor source: scene provenance,
  supported physics/camera/input/UI defaults, system documents, and generated
  `defineBehavior` script stubs.
- Cookbook lookup supports both `tn cookbook show <id> --json` and the compact
  `tn cookbook <id> --json` shorthand for validated pattern pairs.
- Recipe application stages the whole project mutation before commit, adopts
  existing scene entities/cameras without replacing authored transforms or
  active-camera ownership, scaffolds required script exports, and reports an
  exact no-op on idempotent retry. Compact JSON is the default; `--full-json`
  retains operation traces for debugging.
- `tn game plan` resolves project IDs and derives recipe flags and maintained
  cookbook references from their owning descriptors. `tn authoring inspect`
  includes a compact project map of scene entity, prefab, resource, system,
  and UI IDs.
- Maintained starters include `docs/API-CARD.md`, a compact generated
  ScriptContext/source contract validated against `packages/script-stdlib`;
  the cards now surface `tn actor`, `tn types generate`, and
  `defineBehavior` as the preferred path before lower-level JSON edits.
- MCP and authoring-client adapters are thin wrappers over the same core
  operations; migrated scene/material/runtime/UI hot spots now carry
  descriptor-backed CLI adapter metadata for MCP argv construction and selected
  CLI usage output.
- Prescriptive diagnostics now attach optional structured `fix` payloads for
  high-friction rejection codes.
- Resource access literals in `defineBehavior` scripts can derive declared
  resource fields at compile time; missing-schema fixes now name the exact
  authoring file and emit a loader-valid full-document snippet, while legacy
  IR-shaped schema documents receive a structured shape diagnostic instead of
  an uncaught build exception.
- Literal `context.events.emit(...)` calls derive event writes and payload
  schemas, while authored `kind: "event"` documents, event-triggered flows,
  tag/pattern command selectors, and compact prefab instance tags share the
  same validated IR path.
- Scene cleanup is reference-aware across sibling system/UI documents, batch
  prefab placement is available through the CLI, and ownership warnings point
  authors back to `content/systems/*.systems.json` and `content/ui/*.ui.json`.
- Workspace-aware project creation installs a generated project in isolation,
  and maintained starter scripts can import relative local helper modules.
- Plan and cookbook proof surfaces are cross-reference checked against the
  CLI registry and diagnostic catalog. Gameplay cookbook scripts are bundled
  and rejected when their exported systems are empty, and generated-game
  scoring rejects registered empty systems or missing resource/HUD mutation
  proof.
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
- `pnpm --filter @threenative/authoring test -- --run "archetype|actor"`
- `pnpm --filter @threenative/cli test -- --run "actor"`
- `pnpm --filter @threenative/mcp-server test`
- `pnpm verify:cookbook`
- `pnpm verify:emitted-commands`
- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/cli test`
- `pnpm verify:template-production`
- `pnpm verify:emitted-commands` executes every plan-emitted mutation, actor
  suggestion, proof command, and cookbook reference across both maintained
  starters and five goal archetypes, and reports emitted-command failure rate.
- Structured-source starter smoke with `defineBehavior`-owned access metadata
  and systems JSON reduced to script attachments.

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
