# Native Bevy FPS Diagnosis: humanoid-physics-course cannot reach 60 FPS

Date: 2026-07-06. Status: root cause identified and reproduced with a fresh
release-build measurement. This report is written so another agent can implement
the fix without re-deriving the investigation.

## Measured evidence (reproduced today)

Fresh run, release binary (`runtime-bevy/target/release/threenative_runtime`,
rebuilt and confirmed up to date before measuring):

```bash
cd examples/humanoid-physics-course
node ../../packages/cli/dist/index.js playtest \
  --scenario playtests/humanoid-course-forward-movement.playtest.json \
  --target desktop --stable-artifacts --json
```

Result (`artifacts/playtest/humanoid-course-forward-movement/latest/summary.json`,
`performance` block, source `native-proof-harness`):

| Metric | Value | Budget |
| --- | --- | --- |
| averageFps | **7.39** | 60 |
| averageFrameMs | **135.4 ms** | 16.67 ms |
| median frameMs | **100.02 ms** | 16.67 ms |
| p95FrameMs | 257.6 ms | |
| worstFrameMs | 1464 ms | |
| framesOverBudget | 39 / 39 (100%) | |

Scene load is trivial: 31 entities with transforms, 2 script systems total.
This is not a content/scale problem — it is a per-frame fixed-cost problem in
the native script host.

## Root cause 1 (primary): QuickJS context rebuilt + full re-eval on every schedule run, every frame

`runtime-bevy/crates/threenative_runtime/src/systems_host.rs:422`
(`run_native_system_schedules`) does ALL of the following **on every call**:

1. `fs::read_to_string(scripts.bundle.js)` — synchronous disk read of the
   compiled script bundle (56 KB for this example) — systems_host.rs:455.
2. `Context::builder().build()` — constructs a brand-new QuickJS runtime +
   context — systems_host.rs:462.
3. `context.eval_module(&module_source(&script_source), true)` — re-parses and
   re-evaluates the entire 56 KB script bundle — systems_host.rs:469.

`run_native_systems_frame_with_input` (systems_host.rs:182) calls
`run_native_system_schedules` **once per fixed step** (`fixedUpdate`) and
**once more per frame** (`update` + `postUpdate`). The driving Bevy system is
`run_scripted_runtime_systems`, registered in the plain `Update` schedule
(`lib.rs:279` block, and the call site at `lib.rs:522`).

So the minimum per rendered frame is: 2 disk reads + 2 QuickJS runtime/context
constructions + 2 full 56 KB module evals — and that multiplies with fixed-step
catch-up (see root cause 2).

## Root cause 2 (amplifier): bridge JS re-evaluated per system invocation + triple JSON round-trip

`call_system_export` (systems_host.rs:609) runs **per system, per schedule run,
per tick** and:

- Concatenates and evaluates the entire `BRIDGE_SOURCE`
  (`systems_host_bridge.js`, **62 KB**) into the fresh context on every
  invocation — systems_host.rs:640-648
  (`format!("{}\n__tnInvokeSystem({});", BRIDGE_SOURCE, ...)`).
- JSON round-trips the context snapshot three times: `serde_json::to_string`
  → `serde_json::from_str::<Value>` → re-serialize via `json!`/`format!`
  (systems_host.rs:631-648), then parses the returned effects JSON string
  again (systems_host.rs:670).

Net: for this example (~2 systems), each frame parses/evaluates roughly
2×56 KB (module) + 2×62 KB (bridge) ≈ **236 KB of JavaScript from scratch in
fresh interpreters, every frame**, in release mode. That is what the measured
~100 ms median frame is made of.

## Root cause 3 (real-gameplay death spiral): unclamped fixed-timestep accumulator

`run_native_systems_frame_with_input` (systems_host.rs:182):

```rust
state.accumulator += options.delta;
while state.accumulator >= options.fixed_delta { /* fixed step */ }
```

There is **no clamp / max-steps limit** on `state.accumulator`. `fixed_delta`
is 1/60 s. Because one fixed step costs ~50–100 ms (root causes 1+2), real-time
play accrues ~6 new fixed steps of debt per step executed. The loop can never
drain the accumulator, each frame runs more fixed steps than the last, and
frame time diverges — the classic fixed-timestep death spiral. Even after
root causes 1–2 are fixed, any temporary stall (asset load, window drag) will
replay unbounded catch-up steps. Note: playtest harness runs mask this because
they force `delta = fixed_delta` (lib.rs:498), so real interactive play is
strictly worse than the numbers above.

Each fixed step also calls `snapshot_bundle_transforms` twice
(systems_host.rs:219, 245) building `BTreeMap<String, ...>` over all bundle
entities — cheap at 31 entities, but it scales with the spiral.

## Root cause 4 (high): Rapier physics world rebuilt from scratch every fixed step

`physics.rs:454` (`step_rapier_bodies`, called once per fixed step via the
closure at lib.rs:526 → systems_host.rs:229): every step it does
`PhysicsWorld::new()`, then re-creates and re-inserts **every** RigidBody and
Collider from the bundle entities, sets 12 solver iterations, steps 2
substeps, and throws the world away. This discards the broad-phase, contact
cache, island/sleeping state, and solver warm-start every step — and each
accumulator catch-up step (root cause 3) pays the full rebuild again.

Fix: persist the `PhysicsWorld` (plus the entity→handle map) in a Bevy
resource created at startup; per step, only write kinematic poses/velocities
in and read transforms out. Rebuild individual bodies only when the bundle
entity set or collider shape actually changes. This also improves physical
correctness (warm-started contacts, persistent sleeping).

## Root cause 5 (high): `Assets::iter_mut()` over ALL materials and ALL images every frame → full GPU re-upload

Two systems registered in plain `Update` (lib.rs:265-273):

- `rendering::normalize_loaded_gltf_materials` (rendering.rs:715) —
  `materials.iter_mut()` over every `StandardMaterial`, every frame.
- `assets::apply_loaded_texture_controls` (assets.rs:155 area) — ends with
  `images.iter_mut()` over every `Image`, every frame.

In Bevy 0.14, `Assets::iter_mut()` queues `AssetEvent::Modified` for **every
asset it yields**, regardless of whether the loop body mutated it (the
`continue` guards do not help). Every material uniform and every texture —
including the 13.5 MB concrete floor texture set — is therefore re-extracted
and re-prepared/re-uploaded to the render world every frame.

Fix: iterate read-only (`iter()`) to find candidates and use targeted
`get_mut(id)` only on the ones that need mutation — or better, drive both
systems from `EventReader<AssetEvent<...>>` so only newly-loaded assets are
touched once.

## Fixes, in priority order

1. **Persist the QuickJS context.** Create the context once (e.g. store it in
   the `NativeGameLoopState` resource or a dedicated `NativeScriptHost`
   resource), eval `scripts.bundle.js` + `BRIDGE_SOURCE` once at startup, and
   reuse the context for every schedule run. Per-frame work should be only:
   serialize snapshot → call `__tnInvokeSystem` → parse effects. This is the
   web runtime's model already (persistent JS module state); the current
   context-per-call design only works at all because scripts are written to be
   stateless against the snapshot. Watch out: `rquickjs`/QuickJS contexts are
   not `Send + Sync`, so the resource must be `NonSend` (Bevy `NonSendMut`) or
   the host must live on a dedicated thread with a channel.
2. **Stop re-evaluating `BRIDGE_SOURCE` per invocation.** Eval it once into the
   persistent context; per call, invoke the already-defined global
   `__tnInvokeSystem` function with the snapshot (via `Function::call` or a
   small `eval_as` that references only globals).
3. **Cut the JSON round-trips.** Serialize the snapshot once and pass it as a
   string argument (parse with `JSON.parse` inside JS), instead of
   to_string → from_str::<Value> → json! re-serialization.
4. **Persist the Rapier `PhysicsWorld`** across fixed steps (root cause 4).
5. **Fix the per-frame `Assets::iter_mut()` scans** in
   `normalize_loaded_gltf_materials` and `apply_loaded_texture_controls`
   (root cause 5).
6. **Clamp fixed-step catch-up.** Cap the accumulator (e.g.
   `state.accumulator = state.accumulator.min(fixed_delta * MAX_STEPS)` with
   MAX_STEPS ≈ 5, mirroring whatever the web runtime's `gameLoop.ts` does —
   keep web/Bevy semantics aligned per repo rules) and drop the excess time.
   This also caps the blast radius of 1, 2, and 4 during stalls.
7. **De-quadratize the per-frame sync loops.** `sync_scripted_transforms` and
   `sync_scripted_materials` (lib.rs:556-611) do
   `bundle.world.entities.iter().find(...)` per queried entity — O(N²) per
   frame. Build a `HashMap<&str, &Entity>` index once per frame. Harmless at
   27 entities, wrong shape for bigger scenes.
8. **(Measurement hygiene, minor)** `proof_harness.rs:327-328` +
   `write_native_proof_harness_readiness` (proof_harness.rs:503) do
   `create_dir_all` + `serde_json::to_string_pretty` + synchronous `fs::write`
   **every frame** on the frame-timing path, so harness FPS slightly
   understates true FPS. Fine to keep for a proof harness, but consider
   caching the dir creation and writing compact JSON; do not let anyone
   "optimize" game code to satisfy a number that includes this tax.

## What was checked and is NOT the problem

- **Build profile**: measurement used a freshly rebuilt `--release` binary.
  Caveat for future runs: `resolveBevyRuntimeBinaryPath`
  (`packages/cli/src/native/bevy.ts:92`) silently falls back to the *other*
  profile's binary if the preferred one is missing, and never checks staleness
  vs sources — always `cargo build --release -p threenative_runtime` before
  trusting FPS numbers.
- **Scene content**: 27 IR entities (31 transform samples at runtime), 2 script
  systems, 56 KB script bundle. Not a content-scale issue. Detail from a
  content sweep: 5 lights but only 1 shadow-caster (directional, 2048x2048
  single-cascade shadow map, `content/environment/arena.environment.json`);
  MSAA4 + bloom + ACES (`dist/.../runtime.config.json`); largest assets are
  the floor texture set (concrete042a normal/color/roughness = 13.5 MB
  combined) and Soldier.glb (2.1 MB). None of that explains 100 ms frames on a
  desktop GPU, but after the script-host fix lands, the 2048 shadow map and
  MSAA4+bloom are the first knobs to check if the last few ms are needed.
  Script per-tick work is O(27) queries — negligible.
- **systems_log.rs**: separate binary, not registered per-frame.
- **capture.rs** (GPU readback + 25 ms sleeps): separate binary with its own
  `main()`, not linked into the game hot path.
- **emissive_postprocess.rs**: pipeline/layout/sampler built once in
  `FromWorld`; only a bind group per frame. It does run one fullscreen pass
  even when no emissive markers exist — minor, not the cause.
- **bind_native_animation_players / animate_native_stylized_motion**
  (map_world.rs): guarded/bounded queries, real work only until bound. Fine.
- **Window/present mode**: default `WindowPlugin` (Fifo vsync,
  `WinitSettings::game()` continuous) — caps at refresh rate but is not a
  sub-60 artificial cap; irrelevant while frames cost 100 ms.

## How to verify the fix

```bash
cd runtime-bevy && cargo build --release -p threenative_runtime
cd ../examples/humanoid-physics-course
node ../../packages/cli/dist/index.js playtest \
  --scenario playtests/humanoid-course-forward-movement.playtest.json \
  --target desktop --stable-artifacts --json
```

Then read `performance` in the summary: target `averageFps >= 58`,
`jankFramePercent` near 0, `worstFrameMs` bounded (asset-load warmup frames
excluded). Also rerun the web scenario to confirm no shared-contract
regression, and `pnpm verify:conformance` for the shared runtime contracts.
Add a regression test that runs two consecutive
`run_native_systems_frame_with_input` calls and asserts the script host does
not re-create its context (e.g. expose a context-generation counter), plus a
unit test that a huge `delta` executes at most MAX_STEPS fixed steps.
