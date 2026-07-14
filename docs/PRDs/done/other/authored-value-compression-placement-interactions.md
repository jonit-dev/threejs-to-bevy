# PRD: Authored-Value Compression — Placement Sets and Objective Interactions

**Status:** Complete. All feature acceptance rows pass; unrelated aggregate
gate debt remains owned by its respective systems.
**Date:** 2026-07-12
**Owner:** ThreeNative authoring/runtime
**Scope:** Durable `content/**/*.json`, `src/scripts/**/*.ts`, compiler expansion, shared IR, web Three.js and native Bevy adapters, CLI/editor/MCP derivation

## Decision

ThreeNative should add **two bounded abstractions**, then migrate canonical examples to the abstractions that already exist:

1. **`PlacementSet`** — compiler-expanded static population for repeated scene instances with stable IDs, deterministic transforms, component defaults, and explicit per-index overrides.
2. **`Interaction`** — a portable fixed-tick contract for the recurring `detect → gate → mutate → consume → emit` gameplay loop.

Do **not** add a universal game controller, arbitrary JSON expressions, generic inheritance, or another actor/mechanic/flow registry.

The implementation must also add an adoption ratchet. Existing canonical abstractions—`defineBehavior`, actor archetypes, prefabs, filtered/tag queries, `ControllerEx`/`CharacterRig`, countdowns, GameFlow, Sequence, UI recipes, feedback presets, and retained UI bindings—already solve several repeated patterns but examples still teach more expensive paths.

## Why now

A read-only audit of all runnable examples found:

- **112** durable JSON files totaling approximately **283 KB**.
- **13** gameplay script files totaling approximately **1.3K lines**.
- Two scenes dominate authored JSON:
  - `examples/dense-world-benchmark/content/scenes/arena.scene.json`: **226 entities**, approximately **61.9 KB**.
  - `examples/chess/content/scenes/chess.scene.json`: **84 entities**, approximately **57.6 KB**.
- Four examples carry exact copies of the same match flow, intro camera sequence, top-down archetype, arena materials/meshes, and runtime configuration.
- Four simple examples hand-roll input → fixed delta → movement despite promoted controller/rig helpers.
- Collectible/objective loops are independently reimplemented in Orb Reactor, Coin Patrol, and Metro Surfer Heist.

The repository does not lack abstractions generally. It lacks two high-leverage contracts and consistent adoption of the abstractions already shipped.

## Evidence

### Repeated static placement

- `examples/chess/content/scenes/chess.scene.json:5-2879`
  - 32 piece declarations, 28 legal markers, 6 move-arc markers, and 4 selected-edge markers.
  - Pawn rows repeat prefab, scale, `ChessPiece` defaults, and regular board transforms.
- `examples/dense-world-benchmark/content/scenes/arena.scene.json`
  - 88 `prefab.dense.mid`, 72 `prefab.dense.tall`, and 56 `prefab.dense.low` instances.
- `examples/metro-surfer-heist/content/scenes/arena.scene.json:38-46`
  - Six coins and three hazards repeat placement and physics envelopes.
- `examples/orb-reactor/content/scenes/arena.scene.json:147-239`
  - Eight orb instances repeat the same prefab/component structure with position/phase variation.

Prefabs reduce mesh/material repetition, but do not currently express deterministic bulk placement with stable semantic IDs and indexed overrides.

### Repeated objective interaction

- `examples/orb-reactor/src/scripts/orbs.ts:17-43`
  - tag query, proximity detection, despawn, resource increment, HUD patch, terminal state, win event.
- `examples/coin-patrol/src/scripts/player.ts:84-170`
  - hard-coded coin IDs, sensor plus distance fallback, hide-at-`y=-100`, score/lives/status/HUD updates, win/loss transitions.
- `examples/metro-surfer-heist/src/scripts/player.ts:130-178`
  - entity scan, lane/height overlap, reward update, component patch, deterministic recycle.
- `docs/cookbook/top-down-collector-recipe.md:43-58`
  - repeats find → distance → consume → increment → HUD.
- `packages/collector-kit/src/index.ts:14-58`
  - already contains a pure collector reducer, but it is not a shared portable runtime interaction contract.

The repeated value is not a fixed score schema. It is the interaction pipeline and its ordering/uniqueness semantics.

### Existing abstractions not consistently adopted

- Movement/camera:
  - hand-rolled in `orb-reactor`, `coin-patrol`, `neon-harbor-rescue`, and `dense-world-benchmark`;
  - existing helpers in `packages/script-stdlib/src/gameplay.ts` and `packages/script-stdlib/src/rigs.ts`.
- Entity lookup:
  - Coin Patrol hard-codes 10 coin IDs and 2 drone IDs;
  - Orb Reactor already demonstrates tag queries.
- Timers:
  - runtime countdowns exist, but scripts still repeat expiry/transition logic.
- Flow/sequence:
  - four examples contain exact copies of the same ready/playing/win flow and intro camera sequence.
- Top-down archetype:
  - four examples carry equivalent local documents instead of registry-owned defaults plus local overrides.
- UI:
  - retained bindings and UI recipes exist, but status/resource clusters remain manually expanded.

These are migration/enforcement findings, not justification for new runtime systems.

## Goals

1. Cut repeated authored JSON in dense/static scenes without hiding the expanded entity contract.
2. Cut repeated gameplay glue for pickups, hazards, checkpoints, trigger-zone completion, and projectile impacts.
3. Preserve deterministic, inspectable web/Bevy behavior and source-linked diagnostics.
4. Make canonical examples teach the cheapest supported path.
5. Produce measurable reductions in authored lines, authoring operations, failed commands, and agent context—not just smaller generated bundles.

## Non-goals

- No universal `GameController` or gameplay framework.
- No arbitrary code, loops, or general expression language in JSON.
- No generic inheritance across document families.
- No replacement for TypeScript in chess rules, bespoke AI, lane-runner motion/recycling, procedural generation, or complex physics.
- No second actor archetype, prefab, recipe, mechanic-block, GameFlow, Sequence, or UI system.
- No runtime-specific authored source or Bevy-facing public contract.
- No compression of lighting/material source where explicit values are the point of the example.
- No success claim based only on emitted line count or schema acceptance.

# 1. PlacementSet

## Author-facing contract

`PlacementSet` is durable structured source owned by the scene document or a referenced placement document. It expands before runtime into ordinary scene entities.

```json
{
  "id": "board.white.pawns",
  "kind": "placement-set",
  "prefab": "prefab.white.pawn",
  "pattern": {
    "kind": "grid",
    "origin": [-3.626, 0.07, 2.59],
    "step": [1.036, 0, 0],
    "rows": 1,
    "columns": 8
  },
  "idFormat": "piece.white.pawn.{column}",
  "defaults": {
    "transform": { "scale": [10.5, 10.5, 10.5] },
    "components": {
      "ChessPiece": {
        "color": "white",
        "kind": "pawn",
        "initialKind": "pawn",
        "rank": 1,
        "initialRank": 1,
        "moved": false,
        "alive": true
      }
    }
  },
  "indexBindings": {
    "components.ChessPiece.file": "column",
    "components.ChessPiece.initialFile": "column"
  },
  "overrides": {
    "3": {
      "components.ChessPiece.file": 3
    }
  }
}
```

## V1 patterns

Closed vocabulary only:

- `grid`
- `line`
- `ring`
- `lanes`
- `explicit`

Each pattern must declare a finite count. No nested placement sets in V1.

## Merge and ownership semantics

- Prefab component defaults resolve first.
- Placement-set `defaults` apply second.
- Index bindings apply third.
- Per-index `overrides` apply last.
- Component object merge behavior must be explicit and field-level.
- Unknown override paths fail validation; they must never be silently ignored.
- Generated IDs must be deterministic, unique, and previewable before write/build.
- Every expanded entity records placement-set ID, source path, index, and generated ID in compiler provenance.
- Generated entities are emitted IR/bundle data, not durable duplicated source.

## CLI/editor/MCP surface

One owning operation descriptor must derive all adapters:

```bash
tn scene placement add <scene-id> \
  --id board.white.pawns \
  --prefab prefab.white.pawn \
  --pattern grid \
  --rows 1 --columns 8 \
  --origin=-3.626,0.07,2.59 \
  --step=1.036,0,0 \
  --json

tn scene placement inspect <scene-id> board.white.pawns --expand --json
tn scene placement migrate <scene-id> --candidate board.white.pawns --dry-run --json
```

The migration command may suggest candidates but must not rewrite source without an exact semantic match and an explicit apply operation.

## First migrations

1. Dense World Benchmark: three dense prefab classes.
2. Chess: pawn rows only; keep pieces with semantic exceptions explicit until overrides prove readable.
3. Orb Reactor: orb ring/explicit placement.
4. Metro Surfer: coin lanes only; keep hazards explicit.

# 2. Interaction

## Author-facing contract

`Interaction` is a shared fixed-tick gameplay declaration with a closed detector, gate, condition, effect, and trace vocabulary.

```json
{
  "schema": "threenative.interactions",
  "version": 1,
  "id": "arena-interactions",
  "interactions": [
    {
      "id": "player-collects-orb",
      "detector": {
        "kind": "sensor-enter",
        "source": { "entity": "player" },
        "target": { "withTag": "orb" },
        "fallback": { "kind": "distance2d", "radius": 0.7 }
      },
      "gate": {
        "kind": "once-per-target"
      },
      "when": [
        { "resource": "Match", "field": "over", "equals": false }
      ],
      "effects": [
        { "kind": "addResource", "resource": "Orbs", "field": "collected", "value": 1 },
        { "kind": "despawn", "target": "detected" },
        { "kind": "emitEvent", "event": "orb.collected" }
      ],
      "complete": {
        "when": { "resource": "Orbs", "field": "collected", "gte": 10 },
        "event": "match.win"
      }
    }
  ]
}
```

## V1 detector vocabulary

- `sensor-enter`
- `sensor-exit`
- `overlap`
- `distance2d`
- `distance3d`
- `ray-hit`
- `event`

Do not include lane crossing in V1. Metro’s lane/height/trajectory algorithm remains local until a second lane-runner proves a stable contract.

## V1 gates

- `once`
- `once-per-target`
- `cooldown`
- explicit resource/component equality predicate

Deduplication/cooldown state is host-owned and visible in traces. User-visible progression remains resource-owned.

## V1 effects

- `addResource`
- `setResource`
- `patchComponent`
- `emitEvent`
- `feedbackPreset`
- `setTransform`
- `instantiate`
- `despawn`
- `requestFlowTransition`

No arbitrary effect payloads or script snippets.

## Ordering

For each fixed tick:

1. collect detector candidates;
2. normalize and sort by interaction ID, source entity ID, target entity ID;
3. evaluate gates and predicates;
4. apply effects in declaration order;
5. apply completion check after the interaction’s effects;
6. emit completion at most once per declared lifecycle cycle;
7. record a normalized trace.

Conflicting writes within one tick must be deterministic and diagnosed. V1 should reject two interactions that claim exclusive lifecycle ownership of the same field unless an explicit priority is declared.

## Runtime trace

Both adapters emit the same normalized fields:

```json
{
  "tick": 42,
  "interaction": "player-collects-orb",
  "source": "player",
  "target": "orb.03",
  "detector": "sensor-enter",
  "gate": "passed",
  "effects": ["addResource", "despawn", "emitEvent"],
  "completion": false
}
```

Default CLI output reports only pass/fail summary and artifact path. Full traces stay in bounded artifacts.

## First migrations

1. Orb Reactor collectible loop — first cross-adapter fixture and example migration.
2. Coin Patrol coin collection — replace hard-coded IDs with tags and make the sensor/distance fallback explicit.
3. Add standalone hazard-hit and checkpoint fixtures.
4. Do not migrate Metro recycling or chess rules in V1.

# 3. Adoption ratchet

Before or alongside new runtime work:

1. Migrate simple top-down movement to `ControllerEx.worldCardinalCharacter` or the current promoted equivalent.
2. Keep `CharacterRig`/`CameraRig` as the character and third-person camera path; do not add another controller.
3. Replace hard-coded collectible/drone ID arrays with tag/component queries where identity is not gameplay-significant.
4. Route match expiry through existing countdown events and flow transitions.
5. Make `follow-camera` honest: either attach the promoted follow behavior or label it metadata-only.
6. Replace copied top-down archetype documents with registry ownership plus local overrides/provenance.
7. Package the copied ready/playing/win flow and intro camera sequence as registered authoring recipes over existing GameFlow/Sequence contracts.
8. Expand existing UI recipes only for bounded patterns such as resource counter, status line, phase label, and score cluster.
9. Keep system JSON attachment-only when `defineBehavior` metadata owns access declarations.
10. Add diagnostics/info codes for deprecated expensive patterns only after canonical examples and cookbook entries show the replacement.

This track must not introduce new runtime semantics.

# 4. Implementation plan

## Phase 0 — Baseline and collision audit

- Record current source metrics for all runnable examples:
  - authored JSON bytes/lines;
  - authored TypeScript lines;
  - entity declarations;
  - manual system/resource declarations;
  - CLI operations and failed commands in benchmark runs;
  - raw and uncached tokens;
  - tool-output bytes.
- Confirm existing PRD status in code, not checkboxes alone.
- Produce a candidate inventory distinguishing:
  - missing abstraction;
  - existing abstraction not adopted;
  - domain logic that must remain local.

## Phase 1 — PlacementSet contract and compiler expansion

Likely areas:

- `packages/ir`: schema, types, validation, provenance fixture.
- `packages/compiler`: deterministic expansion before bundle emission.
- `packages/authoring`: operation descriptor and dry-run migration analysis.
- `packages/cli`: registry-derived command adapter.
- editor/MCP adapters: generated from the owning descriptor or covered by drift tests.

Required tests:

- every V1 pattern;
- stable ordering and IDs;
- duplicate-ID rejection;
- invalid binding/override path;
- prefab → defaults → binding → override precedence;
- deterministic repeated builds;
- expanded IR equivalence against an explicit-entity fixture;
- no durable generated entity copies written by build.

## Phase 2 — Placement migrations and authoring proof

- Migrate Dense World Benchmark, selected Chess groups, Orb Reactor orbs, and Metro coin lanes.
- Add `inspect --expand` and migration dry-run artifacts.
- Update cookbook/API card.
- Prove each migrated scene renders and behaves equivalently before/after.

## Phase 3 — Interaction IR and web runtime

- Add the closed shared contract and diagnostics.
- Implement fixed-tick detector/gate/effect ordering in the web adapter.
- Reuse existing physics sensors, resource/component patching, events, feedback, flow, and spawn/despawn services.
- Emit bounded normalized traces.
- Add pickup, hazard, checkpoint, projectile, duplicate-contact, and unsupported-effect fixtures.

Web-first exploration is allowed, but the capability remains unpromoted until native parity lands.

## Phase 4 — Bevy parity and conformance

- Consume the same emitted interaction contract.
- Reuse native live spawn/despawn reconciliation.
- Compare normalized traces, resulting resources/components, and live entity state.
- Add negative controls proving the gate catches an intentionally broken adapter.

## Phase 5 — Example migrations and composition

- Migrate Orb Reactor, then Coin Patrol.
- Bind standard interaction events to existing feedback presets and retained UI resources; do not embed bespoke copy in the interaction schema.
- Keep Metro lane recycling and Chess rules local.
- Add focused web and desktop playtests with stable artifacts.

## Phase 6 — Adoption and token ratchet

- Complete the no-runtime-change migrations listed above.
- Add source-aware diagnostics only for replacement paths that are implemented and documented.
- Rerun off-recipe benchmark prompts with equal proof requirements.
- Gate the new surface through cookbook, registry drift, agent IO, session cost, conformance, and generated-game proof checks.

# 5. Diagnostics

Minimum stable codes:

- `TN_PLACEMENT_PATTERN_UNSUPPORTED`
- `TN_PLACEMENT_COUNT_INVALID`
- `TN_PLACEMENT_ID_COLLISION`
- `TN_PLACEMENT_BINDING_INVALID`
- `TN_PLACEMENT_OVERRIDE_INVALID`
- `TN_PLACEMENT_MERGE_AMBIGUOUS`
- `TN_INTERACTION_DETECTOR_UNSUPPORTED`
- `TN_INTERACTION_SELECTOR_INVALID`
- `TN_INTERACTION_GATE_UNSUPPORTED`
- `TN_INTERACTION_EFFECT_UNSUPPORTED`
- `TN_INTERACTION_WRITE_CONFLICT`
- `TN_INTERACTION_ORDER_AMBIGUOUS`
- `TN_INTERACTION_RUNTIME_UNSUPPORTED`
- `TN_INTERACTION_PARITY_MISMATCH`

Every diagnostic includes code, severity, source path, stable declaration ID, failing field, and a structured fix or exact supported alternative.

# 6. Acceptance criteria

## PlacementSet

- [ ] Four V1 placement patterns are proven in fixtures; `explicit` remains the escape hatch.
- [ ] Expanded output is deterministic across repeated builds.
- [ ] Expanded entities are behaviorally and visually equivalent to explicit source fixtures.
- [ ] Dense World Benchmark scene source drops by at least **60%** without reducing entity count or proof quality.
- [ ] Selected Chess placement source drops by at least **30%** while piece IDs/state remain stable.
- [ ] Build does not write expanded entities back into durable source.
- [ ] Inspect/dry-run exposes every generated ID and provenance record.

## Interaction

- [ ] Pickup, hazard, checkpoint, and projectile fixtures pass on web and Bevy.
- [ ] Duplicate sensor stay/contact cannot double-reward a once-per-target interaction.
- [ ] Completion events fire exactly once per lifecycle cycle.
- [ ] Orb Reactor no longer owns manual detect/despawn/reward/win glue for migrated collectibles.
- [ ] Coin Patrol no longer hard-codes coin IDs or hides collected coins by moving them to `y=-100`.
- [ ] Same normalized traces and resulting live state pass on both adapters.
- [ ] Unsupported detectors/effects fail before runtime where statically knowable.
- [ ] Default playtest output remains compact; full traces are artifact-backed.

## Adoption and efficiency

- [ ] Canonical simple-movement examples use the promoted controller/helper path.
- [ ] Registry-owned archetype/flow/sequence/UI defaults replace exact local copies where semantics match.
- [ ] Canonical scripts do not duplicate access metadata statically derivable by `defineBehavior`.
- [ ] At least four fixtures across at least three genres use the new contracts.
- [ ] Fresh equal-proof benchmark shows at least **30% fewer authored TS lines** for covered objective loops.
- [ ] Fresh equal-proof benchmark shows at least **50% fewer authored JSON bytes** for covered repeated-placement scenes.
- [ ] Covered prompts use at least **30% fewer authoring/repair operations** and no more failed commands than baseline.
- [ ] No regression in screenshot, visible-motion, input-playtest, generated-game QA, or native parity gates.

# 7. Verification

Use the narrowest package checks while implementing, then run:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:conformance
pnpm verify:gameplay-parity
pnpm verify:cookbook
pnpm verify:agent-io
pnpm verify:session-cost
pnpm check:docs
```

For each migrated runnable example:

```bash
tn authoring validate --project examples/<name> --json
tn build --project examples/<name> --json
tn playtest --project examples/<name> --scenario playtests/<scenario>.playtest.json --stable-artifacts --json
tn playtest --project examples/<name> --target desktop --scenario playtests/<scenario>.playtest.json --stable-artifacts --json
```

If command names differ in the current CLI, use the owning package scripts and update this PRD/index in the same change; do not invent compatibility wrappers.

# 8. Prior-work boundaries

- **Derived resource declarations:** already shipped. Extend only to missing statically provable metadata; do not rebuild it.
- **Actor archetypes and typed scripting:** already own actor setup, `defineBehavior`, typegen, and provenance. No second actor registry.
- **Compositional mechanic blocks:** already own spawner/timer/trigger-sequence/score/projectile/follow-camera command composition. Interaction should be the missing portable primitive those recipes can reference, not another command family.
- **GameFlow, Spawner, Sequence:** existing bounded contracts. The work here is composition/adoption and event wiring.
- **Prefabs:** existing hierarchy contract. PlacementSet references prefabs and supplies deterministic population; it does not replace prefabs.
- **Recipes and authoring operation descriptors:** use them as the owning plan/adapter surface.
- **UI remediation and feedback presets:** runtime semantics already exist; add bounded recipes/bindings only.
- **Token-efficiency IO/loop PRDs:** run in parallel. Smaller source is not a win if agents still ingest oversized playtest output or fragmented command responses.
- **Editor-ready modular authoring:** placement/interaction must use the same authoring core, provenance, and generated adapters; no editor-only graph.

# 9. Open decisions

1. **PlacementSet location**
   Recommendation: allow inline scene placement sets and referenced placement documents, but normalize both into one IR contract.

2. **Prefab merge semantics**
   Recommendation: explicit field-level deep merge for `components`; replacement for arrays unless a typed field defines keyed merge behavior.

3. **Interaction document ownership**
   Recommendation: a dedicated document family referenced by systems/scene composition. Do not overload `systems.json` further.

4. **Distance fallback**
   Recommendation: explicit fallback only. Never silently combine sensor and distance semantics.

5. **Interaction priority**
   Recommendation: reject conflicting exclusive writes in V1; add explicit integer priority only when a real example needs it.

6. **Typed resource/state follow-up**
   Recommendation: keep outside this MVP unless Phase 0 proves current schema-derived project types cannot remove the audited hydration/coercion boilerplate. Prefer completing existing typegen before adding another state contract.

## Go / no-go

**Go** on Phase 0 and PlacementSet. The static-placement evidence is large, deterministic, and low-risk because expansion happens before runtime.

**Go** on an Interaction spike using Orb Reactor as the first fixture. Promote only after the vocabulary stays bounded and web/Bevy traces match.

**No-go** on a universal composition manifest, generic gameplay graph, broad JSON inheritance, or central game manager in this PRD. Existing registries and recipes should be composed and enforced, not replaced.
