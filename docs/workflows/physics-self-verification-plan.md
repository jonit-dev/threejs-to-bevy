# Self-Verification Plan: Physics Runtime Correctness

**Repository/Path:** `/home/joao/projects/threejs-to-bevy`  
**Environment:** local TypeScript workspace plus native Bevy runtime under `runtime-bevy`  
**Planned Test Run ID Format:** `qa_YYYYMMDD_HHMMSS_physics`  
**Final Report Path:** `tools/verify/artifacts/physics-self-verification/validation-report.md`

## 1. Target Statement

Verify that ThreeNative's promoted portable physics contract works end to end from authored TypeScript/source scene data through IR validation, bundle emission, web Three.js runtime traces, Bevy runtime traces, and visual/evidence artifacts. When physics is working, authored rigid bodies, colliders, character controllers, sensors, queries, mesh collider metadata, CCD metadata, and portable joint metadata produce deterministic, matching observations across web and Bevy within documented tolerances.

The verification boundary is the portable contract, not backend-specific physics behavior. Bevy/Rapier/native handles must remain rejected or diagnostic-only. The plan must prove behavior with real fixtures and runtime traces, not only schema inspection or synthetic reports. Forbidden side effects include changing authored material/light values to make screenshots match, writing evidence outside the documented artifact ownership locations, or silently accepting unsupported backend physics APIs.

Key journeys:

- Author or fixture a physics scene.
- Build and validate the emitted bundle.
- Execute web and Bevy runtime traces from the same bundle.
- Compare deterministic JSON observations and, where meaningful, rendered frame/contact-sheet evidence.
- Confirm unsupported physics breadth fails with stable diagnostics.

## 2. Acceptance Criteria

- Existing promoted physics gates pass: `pnpm verify:v8:rigid-body-primitive`, `pnpm verify:v9:physics-character`, `pnpm verify:animation-physics-residuals`, `pnpm verify:v10:advanced-physics`, and `pnpm verify:conformance`.
- Every promoted physics claim in `docs/bevy-feature-parity.md` has at least one evidence anchor in a fixture, gate report, runtime trace, or diagnostic test.
- New scene coverage exists for gravity, collision response, restitution, friction, damping, mass/inverse-mass response, solver stacking, character movement, sensors/queries, mesh collider/CCD, and joint metadata, with one-example evidence under `examples/<name>/artifacts/physics-self-verification/` and aggregate reports under `tools/verify/artifacts/physics-self-verification/`.
- Web and Bevy traces are generated from the same validated bundle and compared with stable entity ids, fixed timestep settings, and numeric tolerance no looser than `0.000001` unless a PRD explicitly justifies otherwise.
- Unsupported backend-specific handles, arbitrary triangle narrow phase, full constraint solving, vehicles, tire/friction drivetrain models, soft bodies, and ragdolls are either rejected with stable diagnostics or recorded as explicit residual gaps.
- The final validation report can conclude `PASS` only if all P0 scenarios pass and all residuals are classified as promoted, diagnostic-only, or deferred with owner documentation.

## 3. System Discovery

- Startup commands:
  - `pnpm build`
  - `pnpm build:verify-tools`
  - `pnpm verify:v8:rigid-body-primitive`
  - `pnpm verify:v9:physics-character`
  - `pnpm verify:animation-physics-residuals`
  - `pnpm verify:v10:advanced-physics`
  - `pnpm verify:conformance`
  - Native trace commands run through `cargo run -p threenative_runtime --bin <trace-bin>` in `runtime-bevy`.
- Routes/endpoints: none. This is local CLI, runtime trace, and artifact verification.
- Database/storage: filesystem artifacts only.
- Auth/test credentials: none.
- Workers/queues/websockets: none.
- External dependencies: local Node/pnpm toolchain, Rust toolchain, Bevy runtime dependencies, headless browser/native capture dependencies for visual parity gates when used.
- Existing tests and fixtures:
  - `packages/ir/fixtures/conformance/v8-rigid-body-primitive/game.bundle`
  - `packages/ir/fixtures/conformance/physics-character/game.bundle`
  - `packages/ir/fixtures/conformance/physics-character-solver/game.bundle`
  - `packages/ir/fixtures/conformance/advanced-physics-character/game.bundle`
  - `packages/ir/fixtures/conformance/animation-physics-residuals/game.bundle`
  - `scripts/verify-v8-rigid-body-primitive-trace.mjs`
  - `scripts/verify-v9-physics-character.mjs`
  - `scripts/verify-animation-physics-residuals.mjs`
  - `scripts/verify-v10-advanced-physics.mjs`
  - `packages/ir/src/validate.test.ts`, `packages/ir/src/conformance.test.ts`, `runtime-bevy/crates/threenative_runtime/tests/`
- Unknowns/assumptions:
  - `verify:v10:advanced-physics` currently creates matching web/native traces inside the verifier; this is useful artifact plumbing evidence but not sufficient behavioral proof until backed by authored fixture data and real web/Bevy trace execution.
  - Some docs mark broad physics rows complete by classifying features as diagnostic/deferred rather than full runtime parity. The final report must preserve that distinction.

## 4. Verification Matrix

| Area | Scenario | Method | Evidence to Capture | Expected Result | Priority |
|---|---|---|---|---|---|
| Smoke | Workspace and native runtime build | `pnpm build`, targeted `cargo test` | command output, versions, failures | Build passes without physics-related compile errors | P0 |
| Contract | Physics IR accepts promoted declarations | IR tests plus fixture validation | test output, diagnostics, validated fixture paths | Box/sphere/capsule colliders, rigid body metadata, filters, sensors, character controller, mesh bounds, CCD, and joint metadata validate | P0 |
| Contract | Backend-specific handles are rejected | negative IR fixtures/tests | diagnostic code, path, suggestion | Raw Bevy/Rapier/native handles fail explicitly | P0 |
| Existing Gate | Primitive rigid-body fall/contact | `pnpm verify:v8:rigid-body-primitive` | `web-rigid-body.json`, `native-rigid-body.json`, `rigid-body-diff.json` | Dynamic body position, velocity, damping, friction, restitution, and contact observations match | P0 |
| Existing Gate | Character, solver, sensor, navigation trace | `pnpm verify:v9:physics-character` | web/native trace JSON, diff, report | Solver, sensors, push behavior, character blocking, and static navigation match | P0 |
| Existing Gate | Residual character grounding/nav behavior | `pnpm verify:animation-physics-residuals` | web/native reports, `diff.json`, contact sheet | Sloped grounding, bounded dynamic navmesh, off-mesh links, and crowd reports match | P0 |
| Existing Gate | Advanced physics artifact gate | `pnpm verify:v10:advanced-physics` | frame PNGs, contact sheet, traces, report | Artifact plumbing passes; report is flagged as needing real fixture-backed proof | P1 |
| New Scene | `physics-gravity-collision-lab` | authored example + web/native trace gate | bundle, per-step transforms, velocity, acceleration, contact phase, diff | Gravity accelerates bodies, static floors stop penetration, and collision contacts match | P0 |
| New Scene | `physics-material-lab` | authored example + web/native trace gate | restitution heights, slide distances, damping velocity decay, friction coefficients, diff | Bounce, friction, and damping behave deterministically and match across runtimes | P0 |
| New Scene | `physics-mass-stack-lab` | authored example + web/native trace gate | mass/inverse-mass metadata, impulse response, stack settle trace, sleep state, diff | Different masses respond correctly and stacked bodies settle without penetration drift | P0 |
| New Scene | `physics-character-obstacles` | authored example + trace + optional visual capture | movement inputs, resolved character poses, grounded/blocking flags, push events | Step offset, ledge ungrounding, wall blocking, and object pushing match | P0 |
| New Scene | `physics-query-lab` | authored example + scripting service trace | raycast/overlap/shapeCast/sensor payloads | Query hit ids, normals, distances, and filtering match in stable order | P0 |
| New Scene | `physics-mesh-ccd-track` | authored example + trace + frame contact sheet | high-speed body frames, mesh AABB contact, CCD observations | Swept-AABB contact prevents tunneling and reports identical web/Bevy metadata | P1 |
| New Scene | `physics-joint-metadata` | authored example + conformance trace | hinge/slider/suspension metadata observations | Portable joint metadata is preserved and unsupported full solving is not implied | P1 |
| Negative | Unsupported arbitrary triangle narrow phase | rejected fixture/test | diagnostic code/path/suggestion | Feature is rejected or explicitly diagnostic-only; no silent fallback | P0 |
| Negative | Unsupported full constraints/vehicles/soft bodies/ragdolls | rejected fixtures/tests | diagnostics, docs links | Each gap has stable diagnostic classification and owner doc | P1 |
| Visual | Physics-contact visual sanity | Playwright/native capture for selected scenes | web.png, bevy.png, diff/contact-sheet, console logs | Visual evidence agrees with trace state and has no runtime console errors | P1 |
| Regression | Gate registry and release inclusion | `pnpm check:docs`, `pnpm verify:release` when scope warrants | release report, script gate metadata | New focused gate is routable through `tools/verify/src/cli/run.ts` and docs are current | P1 |

## 5. Test Data Plan

- Generate `test_run_id`: `qa_YYYYMMDD_HHMMSS_physics`.
- Use deterministic scene ids and entity ids prefixed by the scene name, not random ids, so trace ordering is stable.
- Store one-example evidence under:
  - `examples/physics-gravity-collision-lab/artifacts/physics-self-verification/`
  - `examples/physics-material-lab/artifacts/physics-self-verification/`
  - `examples/physics-mass-stack-lab/artifacts/physics-self-verification/`
  - `examples/physics-character-obstacles/artifacts/physics-self-verification/`
  - `examples/physics-query-lab/artifacts/physics-self-verification/`
  - `examples/physics-mesh-ccd-track/artifacts/physics-self-verification/`
  - `examples/physics-joint-metadata/artifacts/physics-self-verification/`
- Store aggregate reports under `tools/verify/artifacts/physics-self-verification/`.
- Store reusable conformance fixtures under `packages/ir/fixtures/conformance/<scene-id>/game.bundle`.
- Avoid modifying checked-in baseline artifacts except through an intentional gate implementation.

## 6. Execution Steps

1. Record toolchain versions with `node --version`, `pnpm --version`, `rustc --version`, and `cargo --version`.
2. Run `pnpm build:verify-tools` and inspect the focused gate registry.
3. Run current physics gates and collect existing reports:
   - `pnpm verify:v8:rigid-body-primitive`
   - `pnpm verify:v9:physics-character`
   - `pnpm verify:animation-physics-residuals`
   - `pnpm verify:v10:advanced-physics`
4. Run `pnpm verify:conformance` to confirm cataloged fixtures and shared runtime observations still pass.
5. Create the new authored examples and matching conformance fixture bundles listed in the test data plan.
6. Add or extend focused trace functions in web and Bevy so each new scene produces comparable JSON observations from the same bundle.
7. Add a focused aggregate gate, preferably `pnpm verify:physics-self-verification`, implemented under `tools/verify/src` and routed through `tools/verify/src/cli/run.ts`.
8. For scenes with useful visual proof, capture web/native frames and a contact sheet without tuning materials, colors, opacity, or lighting per runtime.
9. Add negative fixtures/tests for unsupported physics breadth and backend handles.
10. Compare each promoted docs claim against evidence. Update the gap map in the final report.
11. Run `pnpm check:names`, `pnpm check:docs`, and the focused physics gate. Run `pnpm verify:release` before handoff if any promoted capability or release-gate behavior changes.
12. Write `tools/verify/artifacts/physics-self-verification/validation-report.md`.

## 7. Evidence Requirements

- Commands run, exit codes, timestamps, and key stdout/stderr.
- Bundle validation results and diagnostic payloads for accepted and rejected fixtures.
- Web trace JSON, Bevy trace JSON, and machine-readable diff JSON for every P0 scene.
- Per-step physics observations: entity id, body type, position, rotation when relevant, velocity, acceleration, mass, inverse mass, damping, friction, restitution, grounded/blocking flags, contact phase, contact normal, contact impulse when exposed by the portable trace, hit id, hit distance, layer/mask behavior, and fixed timestep.
- Visual evidence for selected scenes: web frame, Bevy frame, diff/contact-sheet, and any console/native logs.
- Gate reports with artifact paths and promoted/deferred feature lists.
- Docs cross-reference table mapping each physics parity row to evidence or a residual classification.

## 8. Bug Handling

For every bug:

1. Freeze and copy the failing trace, diff, report, and visual frame into the current `test_run_id` evidence directory.
2. Create the smallest reproducible fixture or scene.
3. Run the focused check red before fixing.
4. Fix only the relevant contract/runtime/gate issue.
5. Rerun the same check green in both web and Bevy.
6. Keep a regression test when the failure is in validation, trace comparison, runtime mapping, or gate routing.
7. Document severity, status, red evidence, fix summary, green evidence, and remaining risk in the final report.

## 9. Cleanup Plan

- Delete only temporary artifacts containing the current `test_run_id`.
- Keep canonical evidence only under the planned example artifact folders and `tools/verify/artifacts/physics-self-verification/`.
- Remove temporary bundles, browser state, native run logs, and scratch screenshots outside those directories.
- Stop any local dev/browser/native capture processes started for visual checks.
- Verify no unrelated docs, generated bundles, or existing artifacts changed unless intentionally updated.

## 10. Final Report Template

The executed verification report should include:

- Scope and exact commit.
- Toolchain versions.
- Expected promoted physics behavior.
- Verification matrix with `PASS`, `FAIL`, `PARTIAL`, or `NOT RUN`.
- Commands and tools used.
- Evidence summary with artifact links.
- New scenes created and what each proves.
- Bugs found.
- Cleanup performed.
- Residual risks and gaps.
- Final conclusion: `PASS`, `FAIL`, or `PARTIAL`.

## Gap Map

| Physics Surface | Current Evidence | Gap | Proposed Closure | Priority |
|---|---|---|---|---|
| Gravity | `verify:v8:rigid-body-primitive` real web/native trace | Narrow falling-box case | Add `physics-gravity-collision-lab` with multiple body types and explicit acceleration/velocity samples | P0 |
| Collision response | `verify:v8:rigid-body-primitive` and `verify:v9:physics-character` | Needs isolated contact-phase and contact-normal proof | Add `physics-gravity-collision-lab` with floor, wall, and moving body collisions | P0 |
| Restitution/bounce | `verify:v8:rigid-body-primitive` includes restitution metadata | Needs clear bounce-height comparison and no-bounce contrast case | Add `physics-material-lab` with high/low restitution bodies dropped from equal height | P0 |
| Friction/slide | `verify:v8:rigid-body-primitive` includes friction metadata | Needs explicit sliding-distance proof | Add `physics-material-lab` with low/high friction blocks on flat and sloped surfaces | P0 |
| Linear/angular damping | `verify:v8:rigid-body-primitive` includes damping metadata | Needs isolated velocity-decay proof | Add `physics-material-lab` with damped and undamped bodies using identical initial velocity | P0 |
| Mass/inverse-mass response | `physics-character-solver` fixture advertises inverse mass | Needs impulse/contact response proof | Add `physics-mass-stack-lab` with light/heavy bodies and stable trace expectations | P0 |
| Primitive solver v2 metadata | `physics-character` fixture and gate | Needs broader stress beyond fixture | Reuse `physics-mass-stack-lab` and add solver iteration, inverse mass, sleep, and stacking observations | P0 |
| Character blocking/push | `verify:v9:physics-character` | Existing scene is canonical but narrow | Add `physics-character-obstacles` for step offset, ledge, wall, and push combinations | P0 |
| Sensors and query services | `advanced-physics-character` conformance plus `physics-character` traces | Needs one isolated query lab with stable expected outputs | Add `physics-query-lab` with raycast, overlap, shapeCast, sensor, layer/mask cases | P0 |
| Sloped grounding | `verify:animation-physics-residuals` | Covered as residual report, not isolated character test | Mirror in `physics-character-obstacles` for focused regression | P1 |
| Mesh collider AABB and CCD | `verify:v10:advanced-physics` report | Current verifier appears synthetic rather than fixture-backed | Add `physics-mesh-ccd-track` real bundle and web/Bevy trace bins | P1 |
| Joint metadata | `verify:v10:advanced-physics` report | Metadata preservation is not separated from solving expectations | Add `physics-joint-metadata` proving preservation and diagnostic boundary | P1 |
| Full constraint solving | Docs classify as diagnostic/deferred | No runtime parity claim should be made | Add rejected/diagnostic fixture and docs evidence row | P1 |
| Arbitrary triangle narrow phase | Docs classify as bounded diagnostic boundary | Needs explicit negative proof if not already covered | Add rejected fixture with stable diagnostic | P0 |
| Vehicles/tire models | Deferred residual | No runtime proof expected | Add diagnostic fixture or docs-only residual row | P2 |
| Soft bodies/ragdolls | Deferred residual | No runtime proof expected | Add diagnostic fixture or docs-only residual row | P2 |
| Public backend physics handles | Existing docs and diagnostics mention rejection | Must remain impossible through SDK/IR | Keep negative IR tests and conformance diagnostics | P0 |

## Proposed New Scene Set

| Scene | Location | Purpose | Minimum Entities | Required Evidence |
|---|---|---|---|---|
| `physics-gravity-collision-lab` | `examples/physics-gravity-collision-lab` | Prove gravity and basic collision response | static floor, static wall, dynamic box, dynamic sphere/capsule if supported | per-step position/velocity/acceleration, contact phase/normal, no-penetration assertion, web/native diff |
| `physics-material-lab` | `examples/physics-material-lab` | Prove friction, restitution, and damping | high/low restitution balls, high/low friction sliders, damped/undamped moving bodies, flat and sloped surfaces | bounce-height samples, slide-distance samples, velocity-decay samples, material metadata, web/native diff |
| `physics-mass-stack-lab` | `examples/physics-mass-stack-lab` | Prove mass response and multi-body solver stability | static floor, light box, heavy box, 3-box stack, optional sphere/capsule | impulse response samples, stack settle trace, sleep state, penetration tolerance, web/native diff |
| `physics-character-obstacles` | `examples/physics-character-obstacles` | Prove practical character movement | character capsule, wall, step, ledge, pushable crate, sloped ramp | input trace, resolved poses, grounded/blocking flags, push events |
| `physics-query-lab` | `examples/physics-query-lab` | Prove query APIs and filters | ray target, overlap volume, shape-cast corridor, trigger sensor, filtered layers | service payload JSON, stable ordered hit list, negative filter case |
| `physics-mesh-ccd-track` | `examples/physics-mesh-ccd-track` | Prove bounded racing-useful mesh/CCD behavior | track mesh bounds, high-speed chassis body, static/dynamic mesh collider metadata | frame trace, CCD/contact observations, contact sheet |
| `physics-joint-metadata` | `examples/physics-joint-metadata` | Prove portable joint metadata preservation without overstating solver parity | hinge, slider, suspension declarations | metadata trace, diagnostics for unsupported full solving |

## Behavioral Assertions

These assertions should be encoded in the focused verifier rather than checked by visual inspection alone.

| Behavior | Scene | Assertion |
|---|---|---|
| Gravity | `physics-gravity-collision-lab` | Before contact, dynamic bodies have monotonically decreasing Y velocity under the authored gravity scale and fixed timestep. |
| Floor collision | `physics-gravity-collision-lab` | After contact, body bottom never penetrates the floor beyond tolerance and vertical velocity resolves according to restitution. |
| Wall collision | `physics-gravity-collision-lab` | A body moving into a static wall reports a stable contact normal and does not pass through the wall. |
| Restitution | `physics-material-lab` | The high-restitution body bounces higher than the low-restitution body from the same drop height, and both runtimes report matching peak heights. |
| Friction | `physics-material-lab` | The high-friction slider travels a shorter distance than the low-friction slider under the same initial velocity. |
| Slope friction | `physics-material-lab` | A low-friction body slides farther down the ramp than a high-friction body with matching starting pose and mass. |
| Linear damping | `physics-material-lab` | The damped body loses speed faster than the undamped body under equal initial velocity and no contacts. |
| Angular damping | `physics-material-lab` | The damped spinning body loses angular speed faster than the undamped spinning body when angular velocity is promoted in the trace. |
| Mass response | `physics-mass-stack-lab` | Under the same impulse or contact, the lighter body changes velocity more than the heavier body, matching authored mass/inverse-mass metadata. |
| Stack stability | `physics-mass-stack-lab` | A three-body stack settles into sleep or stable near-zero velocity without visible penetration or frame-to-frame jitter beyond tolerance. |
| Contact ordering | `physics-mass-stack-lab` | Contact reports are sorted by stable entity ids and phase/type order so web/Bevy diffs are deterministic. |

## Pass/Fail Rules

- `PASS`: all P0 scenes and existing gates pass, evidence is cross-runtime and fixture-backed, docs rows map to evidence or explicit residuals, and cleanup succeeds.
- `FAIL`: any P0 promoted physics behavior fails, any unsupported backend API is silently accepted, web/Bevy traces drift outside tolerance, or the system cannot produce inspectable evidence.
- `PARTIAL`: existing gates pass but one or more new scenes, visual captures, or residual diagnostics are not implemented or not run.
