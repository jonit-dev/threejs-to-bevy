# Advanced Physics PRD Implementation Review — 2026-07-22

Scope: commits `3a876450..23c085ab` implementing
`docs/PRDs/done/PRD-advanced-physics-major-games-2026-07-22.md` (Phases 1–6:
compound colliders / at-point forces / queries, wheels/tires/surfaces,
drivetrain, aerodynamics, rich joints, fracture/destruction), plus the
uncommitted Phase 7 work-in-progress (physics debugging/telemetry and public
authoring operations). Four independent reviewers covered the web runtime
(TypeScript), the Bevy runtime (Rust), the IR/compiler/SDK/CLI/verify contract
layer, and the working tree. Every finding below was re-verified against source
before inclusion.

## Verification status

- Committed Rust at `23c085ab` compiles and passes in an isolated worktree:
  `physics` (23), `physics_destruction` (9), `physics_vehicle` (12),
  `physics_sensors` (1) — all green.
- Working tree (as of this review): `pnpm typecheck` clean,
  `cargo check -p threenative_runtime` clean; web `physicsDebug.test.ts` 3/3,
  authoring `advancedPhysicsOperations.test.ts` 3/3,
  `vehicleOperations.test.ts` 5/5, native `tests/physics_debug.rs` 3/3.
- **The working tree mutated during the review** — an execution agent is
  actively working in this checkout (it completed the native
  `debug_snapshot`/`debug_timing` wiring and created
  `packages/ir/src/physicsDebug.ts` mid-review, fixing a transient
  does-not-compile state). Working-tree line numbers below are approximate.

## Top priorities for the execution agent

1. **[MAJOR][web] Fracture pieces spawn from a pose/velocity snapshot frozen at
   tick 0.** `packages/runtime-web-three/src/physics.ts:255-274`
   (`syncPhysicsDestructionBodies`) builds the per-assembly kinematic state
   (`position`, `rotation`, `linearVelocity`, `angularVelocity`) on first sync
   and never refreshes it; nothing else writes those fields. Since
   `stepPhysicsDestruction` syncs every assembly every tick from tick 0, any
   destructible that moves, falls, or is hit by a fast projectile shatters into
   pieces that teleport back to the tick-0 pose with ~0 velocity — no momentum
   transfer, pieces don't fly apart. The mass/momentum test masks this by
   fracturing on the same tick the state is created. Fix: capture (or refresh)
   the snapshot from the live body at activation time. This also interacts with
   the topology-rebuild path, which re-derives recovered pieces from the frozen
   IR transform.

2. **[MAJOR][bevy] Contact damage targets a different bond than web.**
   `physics_destruction.rs:956-961` always breaks the lexicographically-first
   non-broken bond; web (`physicsDestruction.ts:163-174`) selects the bond
   attached to the piece nearest the contact point. Any assembly with ≥2 bonds
   produces divergent `bondBroken`/`pieceActivated`/piece-ID streams for the
   same recorded impact — a direct violation of the PRD Phase 6 "same bonds for
   a recorded impact" conformance requirement. Fix: port the nearest-piece
   spatial selection to the native runtime.

3. **[MAJOR][bevy] Malformed or missing fracture manifests are silently
   swallowed.** `physics_destruction.rs:876-893` (`reconcile`) `continue`s on
   deserialize failure, unreadable file, parse failure, and failed
   registration; web raises actionable errors for the same cases. A typo'd
   manifest path yields a wall that never fractures with no diagnostic — the
   silent-fallback pattern CLAUDE.md prohibits. Fix: emit a
   `TN_PHYSICS_DESTRUCTION_*` diagnostic with the source path.

4. **[MEDIUM][contract] `stage:"contract"` descriptors are exempt from
   fixture/gate drift protection.** `packages/ir/src/physicsCapabilities.ts:274-277`
   only enforces `fixtures`/`gates` consumers for un-staged or
   `stage:"promoted"` descriptors, but `Destructible`, `PhysicsJoint`,
   `AerodynamicBody`, `WindVolume`, and `VehicleController` are
   `stage:"contract"` — their `fixture`/`gate` fields are ignored and
   `Destructible` has none. Deleting the Phase 6 gate wiring or dropping the
   fixture from `fixture-catalog.json` fails no drift test, yet the PRD marks
   Phases 3–6 PASS on that evidence. Fix: promote descriptors when their phase
   passes, or enforce a `gatedPhases` set.

5. **[MEDIUM][verify] Circular-proof surface in the destruction gate.**
   `tools/verify/src/advancedPhysicsDestruction.ts:160` passes the `expected`
   outcomes object into the web trace generator that is later compared against
   those same expectations; the native side correctly receives only
   fixture/target/output. Also `:98,:153-154,:164`: both adapters echo back the
   harness-computed `sourceHash`/`bundleHash`, so the cross-runtime provenance
   check compares a constant to itself and can never fail. Fix: don't pass
   `expected` (or the hashes) to trace producers; have each adapter recompute
   the hash of the bytes it loads.

## Web runtime (packages/runtime-web-three)

Besides priority 1 above:

- **[MINOR]** `advancedPhysicsJoints.ts:80-96` — the load-ramp trace queues
  each sample's force once, but `pendingPointCommands` is consumed on the first
  `stepPhysics`, so multi-step samples apply the load for only one of their
  ticks. Confirm the Bevy trace does the same, else the conformance comparison
  tests divergent semantics.
- **[MINOR]** `physicsDestruction.ts:237-241` — budget eviction
  (sleep-oldest/despawn-oldest) silently changes the evicted piece's lifecycle;
  only the new piece's `budgetExceeded` event is emitted. Consumers of the
  deterministic event stream never learn the old piece was deactivated.
- **[MINOR]** `physicsJoints.ts:139-163` — a broken joint stays in the impulse
  set through the current tick's remaining substeps; removal happens at the
  next tick's reconcile. Event semantics are correct (exactly one break event).
- **[MINOR]** `physics.ts:844-872` — the collision-layer map is silently capped
  at 16; a collider on a dropped layer gets membership 0 and collides with
  nothing. Should be a bounded diagnostic, not a silent fallback.

Sound: event/entity/joint iteration is deterministically sorted; vehicle/aero
forces are queued before the same-tick solve (no one-tick latency); joint
motor/break, mass/momentum, and budget tests assert exact values; aero stall
hysteresis and drag signs are correct.

## Bevy runtime (runtime-bevy/crates/threenative_runtime)

Besides priorities 2–3 above:

- **[MAJOR, medium confidence]** Contact damage applies one tick later than
  web: web observes and applies in the same tick
  (`physicsDestruction.ts:120-132`); Bevy queues for `tick + 1`
  (`physics_destruction.rs:963-981`). If conformance compares per-tick event
  ordering, the contact path is off by one. Confirm against the paired traces.
- **[MINOR]** `cause.contact` ids never match web:
  `"{assembly}:{impact}:{tick+1}"` (tick-embedded, unstable) vs web's
  `rapier:{a}:{b}` (`physics_destruction.rs:967-970` vs
  `physicsDestruction.ts:154`).
- **[MINOR]** `impactFilter.layers: []` blocks all damage on web but allows all
  on Bevy — `#[serde(default)]` collapses missing and empty
  (`physics_destruction.rs:146,:814`). Use `Option<Vec<String>>`.
- **[MINOR]** Scene-budget eviction tie-breaks equal `activated_at` by
  `(assembly_id, piece_id)` vs web's `source.id` alone → different victims
  under scene-wide overflow (`physics_destruction.rs:764-779`).
- **[MINOR]** Pool-vs-despawn selection iterates BTreeMap id order vs web's
  manifest order, and `+ f32::EPSILON` can trip cleanup one tick early at exact
  boundaries (`physics_destruction.rs:720-762`).
- **[MINOR]** Assembly removal leaks retirement state: `reconcile` never clears
  `intact_collision_retired`/`assembly_snapshots` and the disabled intact body
  stays in the world forever; a re-registered same-id destructible can never
  fracture again (`physics_destruction.rs:906-909`, `:1056`, `:1141`, `:1308`).

Sound: aerodynamics and tire/drivetrain are faithful ports of the web
formulas; iteration is BTreeMap/BTreeSet throughout and contact queues are
sorted, so Rapier pair order doesn't leak; handle lifecycle is clean for the
normal fracture flow.

## Contract layer (IR / compiler / SDK / CLI / tools/verify)

Besides priorities 4–5 above:

- **[MEDIUM]** `physicsCapabilities.test.ts:116-125` — the per-service
  negative-control loop is dead code: the guard's `.some(...)` runs on the
  clean baseline (always empty), so `continue` fires unconditionally for all
  four `*Services` groups. The "removing a service must cause drift" check
  never runs. (The readiness test at `:227-244` covers one value.)
- **[MEDIUM]** `validate.ts:790-796` + `physicsValidation.ts:284-286` — bundle
  validation only checks the `fractureManifest` path shape; it never runs
  `validateFractureManifest` on the referenced file. The conformance suite's
  `validateBundle` pass would accept a structurally invalid shipped manifest;
  the Phase 6 gate loads the manifest but also never validates it.
- **[LOW]** `emit/bundle.ts:355-376` — the compiler copies committed fracture
  manifests verbatim without re-verifying `source.sourceHash` against a
  recompute, leaving the PRD §7 destruction-nondeterminism mitigation
  unenforced at the real boundary.

Sound: fracture-manifest TS schema and Rust parse match exactly (names,
casing, optionality, kebab-case overflow policy); joint validation has genuine
negative paths with stable codes; `bakePrimitive` mass fractions sum to 1 with
bijective piece ids; the source-grep drift test and its VehicleController
readiness negatives are real; CLI `fracture` dispatch is wired and
path-traversal-guarded.

Gap to note: drift tests verify component-level consumption by both adapters,
not field-level — `Destructible.bondStrength`/`maxDepth`/`impactFilter`/
`cleanupPolicy` etc. are not individually guarded, so PRD §2.3 "every promoted
public field is consumed by both adapters or rejected" is only partially
enforced.

## Uncommitted Phase 7 WIP (debug/telemetry + authoring operations)

Builds and its tests pass, but the two `physicsDebug` implementations disagree
on what they report — defeating a cross-runtime debug view:

- **[MAJOR]** `center-of-mass` primitive: web uses body translation
  (`physicsDebug.ts:70`); native uses `body.center_of_mass()`
  (`physics.rs:~1752`). Diverges for any offset-COM body — exactly the
  compound-collider case the view exists to inspect.
- **[MAJOR]** `contact` primitives: web emits one per collision contact with
  the real impulse; native iterates all `previous_pairs` including
  trigger/sensor intersections with `value: Some(0.0)` — different sets,
  different ids, always-zero impulse (`physicsDebug.ts:79-82` vs
  `physics.rs:~1783-1791`).
- **[MAJOR]** `bond` primitives: native draws a real line between the two
  piece bodies with value broken?0:1; web sets only a point position with
  value broken?0:rawHealth. The newly exposed `bonds[].pieces` endpoints are
  never consumed by the web builder (dead data).
- **[MAJOR]** `telemetry.allocatedPieces`: web sums active+sleeping only;
  native counts every instantiated piece including pooled/bound.
- **[MINOR]** `telemetry.contacts` (collision-only vs all pairs) and
  `telemetry.solverIterations` (per-body authored default 1 vs global
  integration parameter default ~12) also diverge.
- **[MINOR]** Native summary cap is hardcoded 128 while web is configurable to
  the IR limit of 512, and the native drift test string-matches the raw IR
  `.ts` source (indent- and formatting-brittle) without asserting the cap
  against the IR limit.
- **[MINOR]** `physics.*.validate` operations validate the whole scene, so an
  unrelated scene error fails `tn physics compound validate`; the mutation
  path scopes correctly.

Registry/derivation health of the WIP is good: the six portable physics
components derive from `PORTABLE_PHYSICS_AUTHORING_COMPONENTS`, descriptors
were updated to `physics.<x>.add`, and authoring/vehicle tests assert
descriptor/CLI/editor parity.

## Cross-cutting themes

1. **Destruction conformance is the weak spot.** Web and Bevy agree on
   structure but diverge on contact-path semantics (bond selection, damage
   tick, contact ids, empty-filter meaning, eviction tie-breaks) while the
   Phase 6 gate has a circular-proof surface and a tautological provenance
   check — so the passing gate may not be detecting these divergences.
   Fix the gate (priority 5) first, then the divergences; the strengthened
   gate should catch regressions.
2. **Silent fallbacks persist despite the CLAUDE.md rule** — manifest-load
   `continue`s in Bevy, the 16-layer cap on web, and unvalidated referenced
   manifests at the IR boundary.
3. **Drift protection has holes exactly where the newest phases live** —
   contract-stage descriptors, dead negative controls, and component-level
   (not field-level) consumption checks.
4. **Two agents are working in this checkout concurrently.** The working tree
   changed mid-review; coordinate before rebasing or committing.

## Remediation closure — 2026-07-22

All findings above were addressed in `8b878b59` and `778e69e3`, with the final
audit regressions and documentation recorded in the subsequent closure commit.
The resolution was made at the owning contract/runtime boundaries:

1. Web destruction refreshes the intact body's live pose, velocities, and mass
   until activation; a moving-wall regression proves inherited momentum.
2. Native contact damage uses the contact point and nearest stable piece, then
   a stable bond-ID tie-break matching web. The native contact regression aims
   at a non-lexicographic region and asserts `bond.north`.
3. Native missing, malformed, invalid, and failed-registration manifests now
   fail closed with `TN_PHYSICS_DESTRUCTION_*` code and source path.
4. Descriptor fixture and gate consumers are enforced for every declared
   stage, including `stage: "contract"`; negative controls cover removal.
5. The destruction gate no longer supplies expected outcomes or hashes to
   either adapter. Each trace reads and hashes its own fixture bytes.
6. Web and native rich-joint traces queue each sample load on every simulated
   step rather than once per multi-step sample.
7. Web budget eviction emits `pieceLifecycleChanged` for the displaced piece;
   web and native tests assert the declared lifecycle.
8. Web removes a broken joint before later substeps in the same fixed tick.
9. Web fails closed with `TN_PHYSICS_LAYER_CAPACITY_EXCEEDED`; IR validation
   counts both collider and compound-child filters, with positive regressions.
10. Native queues solver contact damage before destruction resolution in the
    same tick; the integration test asserts the event's solver tick.
11. Native contact IDs now use the shared stable
    `rapier:{sorted-a}:{sorted-b}` identity and are asserted exactly.
12. Native distinguishes an absent impact layer list from an explicitly empty
    list; empty blocks every contact layer like web.
13. Web scene eviction now breaks equal-age ties by assembly ID then piece ID,
    matching native ordering.
14. Web and native cleanup both use stable piece-ID order and exact authored
    timing boundaries; the native epsilon shortcut was removed.
15. Native unregister clears snapshots and intact-retirement state, removes
    stale piece topology through the Destructible-aware world signature, and a
    same-ID remove/re-register regression proves the second fracture.
16. The service-consumer negative loop now mutates the tested group before
    deciding whether it is required, so every required group executes.
17. `validateBundle` loads every referenced fracture manifest and runs
    `validateFractureManifest`; invalid referenced-content coverage is included.
18. Compiler emission recomputes the canonical fracture source hash and rejects
    tampering with `TN_COMPILER_FRACTURE_SOURCE_HASH_MISMATCH`.
19. Capability descriptors now own every public top-level runtime field and
    require web and Bevy consumption independently. This exposed and fixed the
    previously unused native `VehicleController.bindings` path, including
    one-edge manual gear behavior.
20. Both debug adapters report the portable body origin for center-of-mass
    primitives; offset-compound regressions cover the former disagreement.
21. Native contact debug primitives now include only real solver contacts with
    positive measured impulses, aligned with web and telemetry counts.
22. Both bond debug views emit stable line endpoints and raw remaining health,
    including deterministic fallback positions before piece bodies activate.
23. Both adapters count allocated destruction pieces as active plus sleeping.
24. Contact telemetry is collision-only and solver-iteration telemetry comes
    from each retained world's actual integration parameters.
25. `physicsDebugRegistry.json` owns schema, categories, primitive kinds,
    defaults, and limits. Rust parses that owner and accepts bounded summary,
    artifact, and timing limits instead of source-text matching.
26. `physics.*.validate` validates only the requested declaration (plus its
    required joint graph context); an unrelated invalid collider regression no
    longer poisons a scoped compound validation.

Self-verification after remediation:

- `pnpm verify:focused verify:advanced-physics-destruction`: PASS, zero
  diagnostics, with independently generated web/native traces.
- Web runtime: 543/543 tests; IR: 416/416; authoring: 142/142; compiler:
  293/293.
- Native focused suites: physics debug 5/5 and destruction 12/12; the native
  vehicle binding regression also passes.
- Both partial-commit hooks passed docs consistency and the full example build
  sweep. Repository typecheck, lint, docs, and Rust quality pass; Rust quality
  reports 0 warnings and 0 blockers. The aggregate conformance rerun passed
  its IR, web, Bevy, and physics steps, then stopped later on the unrelated V9
  rendering-lights browser screenshot timeout (`page.waitForFunction`, 30 s).
