# Engine Code Review — Rust (runtime-bevy) + Three.js (runtime-web-three)

Date: 2026-07-07. Static review of `runtime-bevy/crates/*` (~30k lines Rust) and
`packages/runtime-web-three/src` (~150 TS files) by four parallel review passes
(Rust gameplay/physics, Rust rendering/UI/loader, TS gameplay/physics, TS
rendering/assets/UI). Every finding was verified by reading the cited code; no
tests were run. Sorted by priority: P0 = fix first (crashes, security, silent
gameplay corruption), P1 = high (wrong behavior or major perf/leaks), P2 =
medium, P3 = low.

---

## P0 — Critical

### P0.1 Dev server file disclosure (security)
`packages/runtime-web-three/src/devServer.ts:111-124`
`url.replace(/^\//, "")` strips only one leading slash, so
`GET /bundle//etc/passwd` resolves to `resolve(bundlePath, "/etc/passwd")` =
`/etc/passwd` and streams it. The `url.includes("..")` check doesn't cover
absolute paths. Any page talking to localhost while the preview server runs can
read arbitrary files.
**Fix:** strip the query string, then
`const p = resolve(bundlePath, "." + normalize(pathname));`
and reject unless `p.startsWith(resolve(bundlePath) + sep)`.

### P0.2 Rapier world rebuilt from scratch every fixed tick (TS)
`packages/runtime-web-three/src/physics.ts:99-188`
`stepRapierBodies` constructs a new `RAPIER.World`, rebuilds all bodies and
colliders, steps, copies back, and `free()`s — 60+ times/sec (more with
substeps). Besides the CPU cost, Rapier loses contact warm-starting, island
sleep, and CCD history every tick: stacks jitter, restitution is inconsistent,
sleeping never engages.
**Fix:** cache the world + body handles per `IWorldIr` (e.g. `WeakMap`, same
pattern as `previousPairsByWorld`), reconcile entity diffs per tick, write back
only changed transforms.

### P0.3 No fixed-timestep clamp → spiral of death (TS)
`packages/runtime-web-three/src/gameLoop.ts:65-72`, `performanceMetrics.ts:77`
Frame delta has no upper bound and the accumulator grows even while
`state.paused` (line 66 is outside the pause guard). Tab suspended 60 s →
~3600 fixed steps in one frame, each rebuilding a Rapier world (P0.2) →
multi-second freeze.
**Fix:** clamp per-frame delta (`Math.min(delta, 0.25)`) or cap substeps per
frame; don't accumulate while paused.

### P0.4 Camera viewModel offset accumulates every frame (Rust)
`runtime-bevy/crates/threenative_runtime/src/cameras.rs:233-237`
`view_model.offset` is `+=`'d onto `transform.translation` each frame with no
base transform, so a camera with only a viewModel offset drifts off into space
at `offset * 60/s`.
**Fix:** apply the offset relative to a stored base transform (as
`NativeGrassWindMotion` does) or once at spawn.

### P0.5 Negative-axis analog input never negated → inverted controls (Rust)
`runtime-bevy/crates/threenative_runtime/src/input.rs:946-962, 1020-1067`
`binding_axis_value` never negates values from an axis's `negative` slot; a
gamepad/touch binding on "move left" yields `+1.0`, and the analog path wins
over the correctly signed digital path.
**Fix:** track which slot a binding came from and multiply `negative`-slot
values by `-1.0` before selection.

### P0.6 World events never cleared → effects re-applied forever (Rust)
`runtime-bevy/.../systems_effects.rs:584-595`, `systems_context.rs:768-782`,
policy documented at `runtime_gameplay_host.rs:44-47`
Events written to `bundle.world.events` are never drained; the documented
clear-after-postUpdate policy is not implemented in `systems_host.rs:198-307`.
A `DamageEvent` emitted once is re-consumed every frame forever, and queues
grow unboundedly.
**Fix:** drain/age-out `world.events` at end of frame after postUpdate.

### P0.7 UI action queue never drained → buttons do nothing (Rust)
`runtime-bevy/crates/threenative_runtime/src/ui.rs:1698-1714` (registered
`lib.rs:196-200`)
`dispatch_native_ui_actions` pushes into `NativeUiActionQueue`, but no
production system consumes it (only tests). Runtime UI interactivity is
effectively non-functional, and the Vec leaks. Related: `node.disabled` is
ignored — disabled buttons still dispatch (`ui.rs:1296-1384`).
**Fix:** drain the queue into the scripted runtime each frame and clear it;
filter disabled nodes in dispatch and navigation-activate.

### P0.8 Per-system controllers recreated per frame → broken RNG and animation queries (TS)
`packages/runtime-web-three/src/systems/context.ts:98-101` (runner.ts:85-101)
`createSystemContext` recreates `createDeterministicRandom(randomSeed(world))`,
the animation controller, audio controller, and particle service per system per
frame. `ctx.random.float()` returns the identical sequence every frame;
`ctx.animation.query()` never sees clips played on previous frames.
**Fix:** hoist controllers and RNG cursor to per-world/session state passed
into `runSchedule` (like `persistence`).

### P0.9 Component patches written to `extra`, read from typed fields (Rust)
`runtime-bevy/.../systems_effects.rs:450-453, 604-644` vs
`systems_context.rs:810-867`
`apply_patch`/spawn write `Collider`/`RigidBody`/`Camera`/`Light`/`Visibility`
into `components.extra`, while reads use the typed fields — script writes are
invisible to queries, snapshots, and conformance.
**Fix:** deserialize into typed fields for all built-in component names
(mirror `remove_component`'s match); use `extra` only for unknown names.

### P0.10 Partial MeshRenderer patch deletes the component (Rust)
`runtime-bevy/.../systems_effects.rs:445-448, 707-716`
MeshRenderer patching is whole-replacement via `read_mesh_renderer`, which
returns `None` when `material` is absent — `patch(e, "MeshRenderer",
{visible:false})` sets `mesh_renderer = None` and the entity vanishes
irrecoverably.
**Fix:** merge field-by-field like the Transform path (lines 424-443).

### P0.11 QuickJS host in a thread_local under the multithreaded executor (Rust)
`runtime-bevy/.../systems_host.rs:29-31` with `lib.rs:275-281, 927, 941`
The script host lives in `thread_local SCRIPT_HOST` but the driving system is a
normal Update system that may run on a different task-pool thread each frame —
silently re-evaluating the bundle (losing all JS module state) and leaking one
context per thread.
**Fix:** hold the context in a `NonSend` resource (pins to main thread) or make
the system exclusive (`&mut World`).

---

## P1 — High

### Bugs

- **P1.1 Kinematic double-integration live in TS runtime.**
  `runtime-web-three/src/kinematicMover.ts:46-67` + `physics.ts:168,346` +
  `gameLoop.ts:74-75`. Movers set position analytically AND write
  `RigidBody.velocity`; `stepPhysics` advances position again by `v*dt`
  (the skip set only covers `scriptAuthoredTransforms`). Platforms drift
  ahead of their analytic trajectory; TS diverges from Rust parity.
  **Fix:** `stepKinematicMovers` should call
  `markScriptAuthoredTransform(world, entity.id)` per mover (or a dedicated
  mover skip set). Note: the Rust side fixed this
  (`systems_host.rs:238-249`, `physics.rs:564-597`) — port the same policy.

- **P1.2 Collider-center quirk still latent in Rust primitive solver.**
  `runtime-bevy/.../physics.rs:341-390` (esp. 372-374).
  `resolve_vertical_contact` includes `collider_center` in overlap math but
  drops it when resolving: bodies with a vertical center offset settle
  hovering/embedded. Rapier path is fixed (`physics.rs:522-530`); the
  fallback and trace/parity surfaces are wrong.
  **Fix:** `entity.center[1] = round(floor_top + bounds.half_extents[1] -
  entity.collider_center[1])`.

- **P1.3 Mesh-collider half-extents drift (both runtimes).**
  Rust: `half_extents` duplicated in `physics.rs:868-892`,
  `physics_sensors.rs`, `character.rs:444-459`; only physics.rs handles
  `"mesh"` colliders, the others default to `[0.5,0.5,0.5]`.
  TS: same drift at `runtime-web-three/src/character.ts:254-268` vs
  `physics.ts:454-472`. Characters clip through large mesh obstacles or
  ground on phantom 1 m cubes; physics vs character-trace disagree.
  **Fix:** extract one shared `colliderHalfExtents` helper per runtime and
  use it everywhere.

- **P1.4 Transform facade writes clobber each other (TS).**
  `runtime-web-three/src/systems/context.ts:816-829, 910-916, 1002-1004`.
  Each write emits a full `{position, rotation, scale}` built from the
  stale snapshot; `setPosition` then `setRotation` silently reverts the
  position.
  **Fix:** emit only the fields actually written (applyCommands already
  merges partial Transform patches).

- **P1.5 `IRenderResult.dispose()` leaks nearly everything (TS).**
  `runtime-web-three/src/render.ts:296-306` only cancels RAF + disposes the
  debug overlay and renderer. Never disposed: scene geometries/materials/
  textures, `WebGLRenderTarget`s (`render.ts:963`), the `EffectComposer`
  (`:980`), particle resources (`:188, 835-872`), environment geometry,
  skybox/env textures, looping audio (`audio.ts:190-234` keeps playing
  after dispose), and the document-level click listener in
  `ui/domOverlay.ts:26-38` (retains the whole UI tree). Hot-reload cycles
  leak GPU memory until context loss and stack music tracks.
  **Fix:** adopt an `IDisposable[]` registry — every subsystem factory
  returns `{dispose()}`, and `dispose()` drains it in reverse order (also
  covers P2 arch finding on render.ts god-module).

- **P1.6 Despawn path never disposes GPU resources (TS).**
  `runtime-web-three/src/mapWorld.ts:992-999` (`syncTransforms` despawn) and
  `:1027-1029` (replaced materials). Projectile/pickup-heavy games leak
  GPU buffers per despawn.
  **Fix:** traverse and dispose geometry + non-shared materials/textures on
  removal.

- **P1.7 Render-target camera passes skipped when composer is active (TS).**
  `runtime-web-three/src/render.ts:970-997` vs `renderTargets.ts:149-193`.
  With bloom/color-grading enabled, only `composer.render()` runs — all
  texture/depth camera-view targets bound to materials stay black.
  **Fix:** call `renderTargetCameraPasses(...)` before `composer.render()`
  in the composer branch.

- **P1.8 No resize handling at all (TS).**
  `runtime-web-three/src/render.ts:229, 1129-1146`. Renderer/composer/camera
  aspect sized once at mount; no `resize` listener or `ResizeObserver`
  exists in the package. Window resizes distort the scene.
  **Fix:** `ResizeObserver` on the container calling `resizeRenderer` +
  `pipeline.setSize`, removed in `dispose()`.

- **P1.9 Scene-manager and trace panics on runtime data (Rust).**
  `scene_manager.rs:228-245` (`panic!` on unknown scene id from script
  payloads — `scene.push("typo")` aborts the process),
  `render_transitions.rs:163-169` (same for transitions),
  `input_ui_polish.rs:190` (`.expect` on UI-less bundle),
  `production_hardening.rs:7` (`.expect` on missing audio IR),
  `animation.rs:472-476` (indexing panic on empty `graph.states`).
  **Fix:** return diagnostics (`TN_SCENE_UNKNOWN` etc.) instead of
  panicking, matching the crate's diagnostics pattern.

- **P1.10 Loader allocation bombs on malformed bundles (Rust).**
  `threenative_loader/src/generated_mesh.rs:67` (`Vec::with_capacity` on
  untrusted `count` before validation) and `:24, 43, 78` (unchecked `usize`
  multiplications — wrap in release defeats the length check).
  **Fix:** validate length before allocating; `checked_mul` mapped to
  `LoadError::InvalidGeneratedMeshPayload`.

- **P1.11 wgpu validation failures on legitimate content (Rust).**
  `render_targets.rs:92-109`: depth targets created as `Depth24Plus` with
  CPU-initialized data + `COPY_SRC` — wgpu disallows copies for that format.
  `emissive_postprocess.rs:167-171`: pipeline hardcodes the HDR view format;
  non-HDR cameras (Bevy default) fail validation every frame.
  **Fix:** no initial data / no `COPY_SRC` for depth (or `Depth32Float`);
  cache HDR+SDR pipeline variants selected per view.

- **P1.12 Sensor service reports `enter` every frame (TS).**
  `runtime-web-three/src/systems/context.ts:541-548` + `sensors.ts:32-47`.
  Each `ctx.physics.sensor()` call runs a fresh 1-step trace with a local
  `previous` map, so persisting occupants re-enter 60×/sec.
  **Fix:** persist per-sensor occupant sets across frames (WeakMap on
  world) and diff in the service path.

### Performance

- **P1.13 Per-tick world signature via string formatting (Rust).**
  `physics.rs:459-473, 604-652`: ~25-field `format!` per entity + Vec sort
  every fixed tick just to compare a cache key.
  **Fix:** hash to `u64` or invalidate explicitly on change events.

- **P1.14 O(n²) contact scan computed then discarded (Rust).**
  `physics.rs:600, 719-742, 814-841`: `step` always ends with
  `contacts_from_overlaps` (O(n²) + per-pair `format!` keys); the runtime
  caller (`physics.rs:183`) throws the result away.
  **Fix:** split stepping from contact extraction; compute contacts only in
  the trace path.

- **P1.15 Per-system context snapshot serialization (Rust).**
  `systems_context.rs:266-331, 635-698` (from `systems_host.rs:704-706`):
  full resources/events/registry snapshot JSON-serialized per system per
  schedule per fixed step per frame; `ancestor_ids` rebuilds a BTreeMap of
  all entities inside a per-entity loop (O(n² log n)).
  **Fix:** build frame-invariant parts once per frame; hoist the id map.

- **P1.16 structuredClone + deepFreeze per entity per query per frame (TS).**
  `runtime-web-three/src/systems/context.ts:815-816, 414-417, 104-107`:
  ~300k deep clones/sec at 500 entities × 10 systems × 60 fps, plus linear
  `entities.find` per lookup.
  **Fix:** cache views per (entity, stage), clone lazily per accessed
  component, drop deepFreeze in production.

---

## P2 — Medium

### Rust runtime

- **P2.1** `cameras.rs:295-313` — screen shake adds a decaying offset but never
  subtracts the previous frame's → permanent random-walk drift. Store and
  subtract the prior offset.
- **P2.2** `physics.rs:571-576` — `set_translation/set_linvel(..., false)`
  never wakes sleeping bodies; teleported/velocity-set sleeping bodies stay
  frozen. Pass `wake_up: true` when values change.
- **P2.3** `character.rs:370-427` — `ground_position` has no max snap
  distance: a character 50 m in the air is "grounded" and teleported down.
  Add a step-offset-bounded snap distance.
- **P2.4** `map_world.rs:2284-2286` — unapplied animation service commands
  retried forever (per-frame full player walk; stale commands fire late).
  Add TTL/retry budget + diagnostic.
- **P2.5** `overlay_host.rs:340-418, 665-681` — `webviews`/`mounts` index
  pairing desyncs after a partial mount failure (wrong overlay resized).
  Store the mount with its webview.
- **P2.6** `ui.rs:1669-1696` — wheel scroll applies to all containers (no
  hover test) and force-sets `PositionType::Relative` on children,
  clobbering absolute layouts.
- **P2.7** `ui.rs:1378-1383, 1832-1848` — `NativeUiBar` fill computed once at
  spawn, never synced: health/progress bars never move. Add a sync system
  like `sync_native_minimap_markers`.
- **P2.8** `capture.rs:293-320` — UI cameras deactivated before verifying a
  scene camera exists; when none, all cameras disabled and screenshots fail
  luma. Select the scene camera first.
- **P2.9** `picking.rs:146-156, 227-250` — Drop/DragEnd/cancel emitted even
  when `active.started == false`; drop handlers fire on plain clicks.
- **P2.10** `systems_host.rs:498` — effect-log frame/tick hardcoded `1, 1`,
  corrupting the log's sort key. Thread real counters through.
- **P2.11** `generated_mesh.rs:17-27` — binary attribute `format` never
  checked; non-f32 payloads reinterpreted as garbage geometry.
- **P2.12** `bundle.rs:32-39` — `files.animations` fallback missing (unlike
  local_data/prefabs); files-only animation decls silently dropped.
- **P2.13** `paths.rs:5-8` — path validation lexical only; a symlink inside
  the bundle escapes the root. Canonicalize + `starts_with(bundle_root)`.
- **P2.14** `systems_effects.rs:414-421, 456-582` — all patch/command failures
  silently return while the effect log records them as applied. Surface
  per-effect outcomes.
- **P2.15 (arch)** `systems_host.rs:665-669` and TS `systems/runner.ts:148` —
  both runtimes silently fall back to alphabetical order on system-ordering
  cycles. Emit a cycle diagnostic naming the systems.
- **P2.16 (arch)** `map_world.rs` (3320 lines) is a god-module, and its
  animation condition evaluator (`:2872-2907`) has already drifted from
  `animation.rs:538-568` (defaults-only vs overrides). Split the module;
  share one condition matcher.
- **P2.17 (arch)** `is_focusable` implemented 3× with divergent semantics
  (`ui.rs:1202`, `ui_debug.rs:90`, `input_ui_polish.rs:548`); role mapping
  duplicated/divergent (`ui.rs:1529` vs `ui_debug.rs:113`). Share helpers.
- **P2.18 (arch)** `overlay_host.rs:266-278, 843-849` — engine hardcodes
  game-specific CSS (242×207 px `.inventory`) and clamps every non-modal
  overlay to it. Move bounds/anchor into overlay IR.
- **P2.19 (perf)** `assets.rs:137-174` re-loads paths and scans all images
  every frame (drive from `AssetEvent`); `rendering.rs:715-743` O(mats ×
  handles) per frame; `rendering.rs:445-464, 538-559, 776-802` environment
  textures decoded 2-3× synchronously at startup; `assets.rs:303-359`
  mipmap gen 3-5× peak memory; `ui.rs:1729-1805` minimap re-parses JSON per
  marker per frame; `overlay_host.rs:655-682` `Changed<Window>` fires on
  cursor move → native set_bounds every frame; `systems_context.rs:938-941`
  quadratic re-serialization in change diffing; `lib.rs:604-637`
  `sync_scripted_materials` writes every material handle every frame
  (fires change detection → constant render-world re-extraction) and both
  sync systems rebuild id→entity HashMaps per frame; `cameras.rs:216-220`
  snapshots all entity translations per frame even with no helpers;
  `physics.rs:177-204` O(n²) write-back via `find`;
  `systems_host.rs:452-457, 611-670` clones the systems IR and re-sorts the
  graph per schedule run.

### TS runtime

- **P2.20** `worldMapping/textureLoading.ts:4-17` — `pendingTextureLoads` is
  module-global; concurrent loads/hot reloads reset/steal each other's
  queue, so "textures ready" resolves early. Also texture load failures are
  swallowed (`mapWorld.ts:939-948`, `stylizedNature.ts:630-639`) with no
  `TN-WEB-TEXTURE-LOAD-FAILED` diagnostic. Scope the queue per world; emit
  diagnostics.
- **P2.21** `physics.ts:400-425` — primitive fallback snaps bodies on top of
  any overlapping AABB with no from-above check: sliding into a wall
  teleports you onto it. Gate on previous-center or min-penetration axis.
- **P2.22** `physics.ts:83, 304-318, 437-481` — collision/trigger events
  always derived from unrotated, unscaled AABBs (even when Rapier stepped
  the sim); O(n²) `detectPairs` per tick. Source events from Rapier's
  EventQueue in the Rapier path.
- **P2.23** `physics.ts:194-213` — silent 16-layer cap: overflow layers get
  membership 0xffff but mask bits 0 (asymmetric filtering, no diagnostic).
- **P2.24** `gameLoop.ts:74, 96` — movers stepped with frame-constant
  `state.elapsed` across substeps (velocity disagrees with displacement);
  stateless path passes `fixedDelta` as elapsed so movers freeze at
  t=1/60. Advance elapsed per substep.
- **P2.25** `input.ts:250-266, 323-330` — pressed edges reported on two
  consecutive frames (pending ∪ frame sets) → double jump from one press.
  Pick one delivery window.
- **P2.26** `input.ts:291-299, 722-724` — pointer normalization ignores
  `rect.left/top`; picking is offset for any canvas not at viewport origin.
- **P2.27** `worldMapping/hierarchy.ts:9-22` + `physics.ts:437-452` —
  rendering treats `Transform` as parent-relative but all physics/raycast
  paths read it as world-space: parented colliders collide at the wrong
  place. Resolve parent chains in shared bounds helpers or validate
  colliders are root-level.
- **P2.28** `ui/domOverlay.ts:73-94` + `ui/renderUi.ts:56-58` — DOM handlers
  close over creation-time node snapshots: disabled state is stale both
  directions; nodes added later never get DOM elements. Look up current
  state by id at event time.
- **P2.29** `rendering.ts:88-136` — `patchThreeFogShaderChunk` permanently
  mutates global `THREE.ShaderChunk.fog_vertex`; after one exponential-fog
  bundle, linear-fog bundles get radial fog for the page lifetime. Rely
  solely on the per-material `onBeforeCompile` path.
- **P2.30** `overlay/host.ts:62` — `sandbox="allow-scripts allow-same-origin"`
  is the documented no-op combo; overlays are effectively unsandboxed.
  Either drop the attribute (trusted) or sandbox for real + postMessage.
- **P2.31** `mapWorld.ts:320-326` — DRACO decoder fetched from
  `www.gstatic.com` (breaks offline/CI) and `DRACOLoader` never disposed
  (worker leak per load). Ship the decoder locally; dispose the loader.
- **P2.32 (perf)** `bundleHydration.ts:30-95, 121-142` — ~15 manifest reads
  awaited serially; binary mesh payloads expanded to boxed `number[]`
  (8-16× memory). `Promise.all` the reads; keep typed arrays.
  `mapWorld.ts:292-317` + `environment.ts:137-159` — GLTF loads awaited
  serially per asset (parallelize + dedupe); `environment.ts:74,85`
  O(n²) `.find` per instance.
- **P2.33 (perf)** `gameLoop.ts:73-89, 163, 188, 205-218` — full world
  transform snapshot 2×/substep + 3×/frame, `entities.find` in per-entity
  loops. Snapshot only physics/mover-tracked entities; use a Map.
- **P2.34 (perf)** `input.ts:168-242` — `refreshActions` re-scans all
  actions×bindings on every device event and every query. Index by id;
  refresh once per frame.
- **P2.35 (perf)** `ui/renderUi.ts:56-58` + `ui/domOverlay.ts:42-47, 245-329,
  700-751` — whole UI tree re-rendered and every DOM attribute rewritten
  every frame; minimap fully redrawn; per-frame `input.value` writes can
  clobber user typing. Diff against the previous tree; skip focused inputs.
- **P2.36 (perf)** unbounded growth: TS `picking/drag.ts:88-97, 222-231`
  (eventLog/pointerRays), `overlay/bridge.ts:31,66` (events), Rust
  `picking.rs:295, 309-327` and `overlay.rs:100-108, 166-172` (same
  pattern), audio playback maps on both sides
  (`audio.ts:290-358` TS, `audio.rs:571-585` Rust) — one-shot-per-frame
  games accumulate ~200k records/hour. Ring-buffer caps / delete on stop.
- **P2.37 (arch)** `render.ts` (1146 lines) god-module — `renderLoadedBundle`
  owns physics, mapping, assets, particles, input, audio, UI, overlays,
  pipeline, lifecycle; this is why dispose misses resources (see P1.5 fix).

---

## P3 — Low

- `navigation.rs:212-214` — `point_in_polygon` underflows on empty points
  (debug panic). Guard `len() < 3`.
- `input.rs:408-430` (Rust) — keyboard axis delta accumulation desyncs with
  two keys on one direction; recompute from held state.
- `animation_physics_residuals.rs:337` — missing duplicate-keyframe-time
  guard → NaN weights in residual JSON (sibling `animation.rs:329` has it).
- `audio.rs:283-300` — `attenuation_gain` NaN for `min_distance == 0`.
- `rendering.rs:824-833` — `#fff`/`#rrggbbaa` hex rejected, silent white
  fallback.
- `ui.rs:1855-1896` — minimap markers hard-capped at 12, silently dropped;
  `ui.rs:1386-1391` — duplicate node ids silently overwrite the id map;
  `ui.rs:530-564` — UI camera routing runs only at startup (UI stops
  rendering if the active camera changes).
- `systems_services.rs:456-513` (Rust) and
  `systems/services/physics.ts:50-73, 136` (TS) — parallel raycast issues:
  inside-AABB hits return distance 0 with zero normal; TS also ignores
  collider `center` and doesn't normalize direction; Rust tie-breaking is
  nondeterministic across services.
- `lib.rs:539-545` — one failing system aborts the frame after earlier
  effects applied: logs dropped, transform sync skipped (1-frame desync).
- `systems_context.rs:237-264` — telescoping wrapper chain; conformance
  (`conformance.rs:802-809`) reimplements a weaker `matches_query` that can
  drift from host semantics. `bundle.rs:189-210` — version gating
  inconsistent (`ensure_supported` accepts any 0.x, target-profile requires
  exactly "0.1.0").
- `mesh_bounds.rs:44-56` — mesh points sampled twice per query.
- `systems_host.rs:237-294, 523-531` — ~13 transform-map clones/frame;
  script file stat'd multiple times per frame.
- `generated_mesh.rs:9-27, 41-98` — `item_size == 0` accepted (deferred
  divide-by-zero); payloads double-buffered.
- `firstPerson.ts:34-35` — linear lerp factor is frame-rate dependent; use
  `1 - exp(-a·dt)` like `transformInterpolation.ts:54-57`.
- `render.ts:536-546` — failing frames push one diagnostic per RAF tick,
  unbounded; rate-limit.
- `render.ts:911-946, 459-471` — per-frame Color/Vector3/viewport-literal
  allocations in the render loop; hoist scratch objects.
- `renderTargets.ts:184` + `render.ts:938` — `setClearColor` mutated and
  never restored (autoClear/scissor are). Save/restore.
- `renderTargets.ts:92-147` — render-target textures bound as color maps
  keep linear colorspace while file textures get sRGB → gamma mismatch on
  mirrors/monitors.
- `loadBundle.ts:88-94` — relative bundle path in a browser falls through to
  the Node fs branch with an obscure error; `loadBundle.ts:33-95` also
  carries dead fetch branches duplicating `loadBundleUrl` (delete them).
- `browser/main.ts:37` — top-level await with no try/catch: load failures
  leave `__THREENATIVE_READY__` undefined (playtest timeout instead of a
  readable failure).
- `stylizedNature.ts:111-144` — grass wind recomputes/uploads ~5k instance
  matrices on CPU per frame with per-object allocations; move to a vertex
  shader uniform.
- `environment.ts:41-186` (arch) — placement plan duplicated between
  placeholder and GLTF paths; compute one plan both consume.

---

## Known-quirk status (from memory: kinematic double-integration, collider center)

| Quirk | Rust | TS |
|---|---|---|
| Kinematic double-integration | Fixed on runtime path (`systems_host.rs:238-249` + `physics.rs:564-597`); bounded 1-tick lag remains | **Still live** — P1.1 |
| Collider center offset | Fixed in Rapier path (`physics.rs:522-530`); **broken in primitive resolver** — P1.2 | Correct in Rapier build path (`physics.ts:146-148`); inconsistent in events (P2.22), raycasts (P3), fallback resolver |

## Verified clean

Loader has no other unwrap/indexing on untrusted data; overlay static server
guards traversal and joins its thread on Drop; glTF loads dedupe by path in the
asset server; TS trace/parity modules (`runtimeGameplayHost`,
`runtimeQueryDiffing`, `runtimePrefabsHierarchy`, `navigation`, `pathSampling`,
`walkability`, `transformInterpolation` — including quaternion slerp hemisphere
correction) checked with no high-confidence issues.

## Suggested fix order

1. P0.1 (security), P0.4/P0.5 (one-line-ish gameplay breakers), P0.3 (clamp).
2. Script-host effect pipeline cluster: P0.6, P0.9, P0.10, P0.11 — these
   silently corrupt gameplay state and undermine parity evidence.
3. P0.7 (UI actions) — runtime UI is currently non-functional.
4. P0.2 + P0.8 + P1.16 (TS per-frame rebuild costs) — biggest TS perf wins.
5. P1.1-P1.3 (parity quirks) — shared-helper extraction kills three bug
   classes at once.
6. P1.5/P1.6 dispose registry — unblocks leak-free hot reload.
7. Panic hardening (P1.9, P1.10) before any release-gate claims.
