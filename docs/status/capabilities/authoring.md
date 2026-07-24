# Authoring Status

Authoring source is durable structured JSON under `content/**` plus gameplay
scripts under `src/scripts/**/*.ts`. Generated bundle files stay derived.

Current support:

- Stable `@threenative/authoring` diagnostics, operation result shapes,
  deterministic formatting, source discovery, and generated-artifact rejection.
- CLI-first scene, material, UI, system, prefab, physics, recipe, cookbook, and
  iterate workflows exposed through `tn ... --json`.
- Arbitrary registered mutations can be grouped with `tn authoring batch plan`
  and `tn authoring batch apply`. Planning reports descriptor-predicted paths,
  source/generator ownership, base and next hashes, bounded structural diffs,
  per-document bytes/addressable items, and a deterministic `planHash`.
  Applying rechecks that hash, then publishes every changed file through one
  recovery journal. CLI, MCP, editor chat/composites, recipes, overlays, and
  the TypeScript transaction client share this planner and publisher.
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
- Cookbook lookup supports `tn cookbook show <id> --json`, the compact
  `tn cookbook <id> --json` shorthand, and ranked keyword discovery via
  `tn cookbook search <query> --json`. Entry frontmatter owns the matching
  vocabulary (`keywords`, `blocks`); `tn game plan` derives its goal and
  gameplay-block cookbook references from that metadata instead of hardcoded
  maps, and unknown-id errors suggest the best keyword match or the complete
  list when no match clears the floor. The descriptor-derived MCP
  `cookbook_lookup` tool exposes the same show-by-id and search-by-query JSON
  paths to MCP agents.
- Recipe application stages only descriptor-declared source dependencies before commit, adopts
  existing scene entities/cameras without replacing authored transforms or
  active-camera ownership, scaffolds required script exports, and reports an
  exact no-op on idempotent retry. Compact JSON is the default; `--full-json`
  retains operation traces for debugging.
- Generator provenance is a correctness boundary: ordinary batches cannot
  overwrite a declared output, while an explicitly authorized owning
  generator advances its output hash in the same journaled commit. The
  descriptive batch `actor` never grants ownership.
- Batch staging is target-bounded. The scale gate generates, then removes,
  64 KiB, 1 MiB, 10 MiB, and 50 MiB fixtures across 1/10/100 touched files;
  it records median latency, peak RSS, paths, and copied bytes against a
  reviewed 20% relative-regression baseline. A 10 MiB affected document emits
  `TN_AUTHORING_DOCUMENT_GROWTH_WARNING`; use prefabs, PlacementSets, sibling
  UI/system/resource documents, or a separate scene before proposing a
  sharding, streaming-parser, or format-change PRD.
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
  descriptor-backed CLI adapter metadata for MCP argv construction, while the
  cookbook CLI command descriptor owns its read-only MCP lookup exposure.
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
- Inline `PlacementSet` source expands deterministic
  grid/line/ring/lanes/explicit prefab populations before bundle emission.
  Descriptor-backed `tn scene placement add|inspect|migrate|apply` commands
  expose generated IDs and provenance; migration is dry-run first and apply
  refuses any candidate that is not an exact semantic match. Canonical dense,
  chess-pawn, orb, and metro-coin source now exercises the expanded contract;
  broader editor adoption remains in progress.
- Exact shared archetype, flow, and sequence documents can use closed
  registry-owned `preset` references that expand before validation and
  compilation. Canonical examples keep bespoke retained UI nodes local and
  share only the matching HUD recipe/provenance contract.
- Workspace-aware project creation installs a generated project in isolation,
  and maintained starter scripts can import relative local helper modules.
- Plan and cookbook proof surfaces are cross-reference checked against the
  CLI registry and diagnostic catalog. Gameplay cookbook scripts are bundled
  and rejected when their exported systems are empty, and generated-game
  scoring rejects registered empty systems or missing resource/HUD mutation
  proof.
- Rigid body kind diagnostics include the exact `fixed` to `static` repair for
  immovable authored bodies.
- Off-recipe plans now expose stable acceptance IDs and semantic coverage;
  project inspection names derived scene/system/UI/resource owners, while
  portable behavior scaffold/check commands preflight context access.
- Descriptor-owned grid-step, push-interaction, and occupancy-objective blocks
  compose atomically behind the experimental `spatial-grid-objective` recipe.
  Plan-derived scenarios bind live project IDs, and `tn iterate` separates
  successful execution from complete current-run prompt coverage.
- Capability-selected interaction prototypes now give unsupported continuous
  pressure and alternating grid-pursuit plans one atomic custom-on-starter
  path. Plans now route through project inspection first. Exact untouched
  starter files and empty destinations remain the automatic lane; any authored
  durable owner outside the transaction blocks application and requires an
  isolated destination. Authored target collisions return
  `TN_AUTHORING_PROTOTYPE_COLLISION` with a hash-bound replacement plan and
  require the exact reviewed target list. Staging stays in memory, publication
  uses the authoring transaction journal, and provenance retains exact
  preimages so proof rollback and later ownership-checked removal restore
  replaced/deleted source rather than deleting its prior owner. An abandoned,
  blocked, or failed prototype therefore cannot leak newly discoverable
  `prototype.*` source into production.
- The fresh three-prompt unfamiliar-game rerun attempted all 18 frozen slots.
  Sixteen emitted authoritative usage and all exceeded the 300,000-token cap;
  two hard-capped attempts lacked a final usage event, and five ThreeNative
  reports missed complete equal-proof scoring. Screenshots show recognizable
  nonblank WebGL games, but no authoring-efficiency promotion is claimed.
  July 16 follow-up pilots brought ThreeNative grid, wave-defense, and tactics
  individually under the cap with exact iterate proof; the equal-proof vanilla
  control still failed to retain required proof, so no replacement 18-run
  promotion matrix is claimed.

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
- `pnpm verify:adapter-surfaces`
- `pnpm verify:authoring-batch-scale`
- `pnpm --filter @threenative/authoring test -- --run "placement"`
- `pnpm --filter @threenative/cli test -- --run "placement"`
- `pnpm --filter @threenative/authoring test -- --run "archetype|actor"`
- `pnpm --filter @threenative/cli test -- --run "actor"`
- `pnpm --filter @threenative/mcp-server test`
- `pnpm verify:cookbook`
- `pnpm verify:emitted-commands`
- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/cli test`
- `pnpm verify:template-production`
- `tools/agent-benchmark/OFF-RECIPE-EFFICIENCY-RERUN.md`
- `pnpm verify:emitted-commands` executes every plan-emitted mutation, actor
  suggestion, proof command, and cookbook reference across both maintained
  starters and five goal archetypes, and reports emitted-command failure rate.
- Structured-source starter smoke with `defineBehavior`-owned access metadata
  and systems JSON reduced to script attachments.

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
