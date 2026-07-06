# Diagnosis: humanoid-physics-course — stuck animation, judder/"low fps", surface moire, camera

Date: 2026-07-06. Evidence: static read of both runtimes + committed playtest
artifacts under `artifacts/playtest/humanoid-course-forward-movement-{web,native}/latest/`
and the user screenshot `image.png` (floor moire).

## TL;DR

| Symptom | Root cause | Where |
| --- | --- | --- |
| Character moves but does not animate | Native Bevy runtime never applies `animation.play` service effects to the Bevy `AnimationPlayer`; it binds one default clip at spawn and never switches | `runtime-bevy/.../map_world.rs:2137`, `systems_host_bridge.js:653` |
| "Low fps" / not smooth | All gameplay + camera + character run in `fixedUpdate` (60 Hz) and the renderer draws at monitor refresh with **no transform interpolation** between fixed ticks; camera also lags the player by one tick | `packages/runtime-web-three/src/gameLoop.ts`, `src/scripts/player.ts` |
| Moire "weird effect" on floor (image.png) | Web runtime never sets `texture.anisotropy` (defaults to 1) on any texture; floor grid tiles 24x24 so grazing angles alias | `packages/runtime-web-three/src/worldMapping/textureLoading.ts` |
| Camera code | Numerically fine, but wrong schedule + wrong order relative to character move (see 2 and 4) | `src/scripts/player.ts:44` |

The example's own durable source (scene/assets/script) is correct. All four
problems are engine-side (runtime adapters) or scheduling, not authored data.

---

## 1. Animation stuck while moving

### What is proven

- The script side works. The web playtest effect log
  (`...-web/latest/effect-log.json`) shows 117 `animation.play` calls: `idle`
  at speed 1.0 while standing, `walk` with speed ramping 0.1 → 1.0 while
  moving. The compiled bundle (`dist/.../assets.manifest.json`) carries the
  `idle/run/walk` clip declarations with `sourceClip` Idle/Run/Walk. So
  `CharacterRig.update` + `arena.assets.json` wiring is correct.
- **Native Bevy runtime has no consumer for those effects.** The QuickJS host
  bridge (`runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.js:653`)
  records `animation.play` in JS-side state and pushes it into
  `effects.services`, but no Rust system reads those service entries. The only
  code touching `AnimationPlayer` is `bind_native_animation_players`
  (`src/map_world.rs:2137`), which runs once per player entity, picks the
  asset's *default* playback clip (first entry = `idle`), plays it, and never
  revisits. Result on desktop: the Soldier loops idle (or freezes on a default
  handle if the named clip lookup misses) forever while sliding around —
  exactly "moves but no animation".

### Fix (native runtime)

1. Add a `NativeAnimationCommand`-style component or event queue: when the
   systems host drains script effects each fixed tick, route entries with
   `service == "animation.play"` / `"animation.stop"` to the entity named in
   `payload.request.entity`.
2. In a new system (schedule it after the script host, before rendering),
   resolve the entity's `NativeAnimationSceneBinding` → `gltfs.get(binding.gltf)`
   → `named_animations.get(sourceClip)` (fall back to `request.clip`), rebuild
   or extend the `AnimationGraph` with that clip, and switch the
   `AnimationPlayer`: `play(node).set_speed(options.speed).repeat()` when
   `options.loop`. Skip the switch when the requested source clip is already
   the active one — only update speed (mirror the dedup in web
   `applyAnimationPlayService`, `packages/runtime-web-three/src/mapWorld.ts:539`).
   Bevy 0.14 has no built-in crossfade on a single-clip graph; either add both
   clips to one graph and lerp weights over ~0.12 s, or accept a hard cut first.
3. Multiply the requested speed by the asset-declared clip speed
   (`walk` = 1.1, `run` = 1.15) for parity with the declaration; note the web
   runtime currently ignores the declared multiplier after a service play too —
   fix both sides the same way (shared contract).
4. Test: extend `runtime-bevy/.../tests/systems_host.rs` (or `animation.rs`)
   with: run the scripted course bundle, press W for N ticks, assert the active
   clip on the player's `AnimationPlayer` is the GLB "Walk" clip and its
   elapsed time advances. Then rerun
   `tn playtest --scenario playtests/humanoid-course-forward-movement.playtest.json --target desktop`.
5. This is a capability/parity change: update `docs/STATUS.md` and
   `docs/bevy-feature-parity.md`.

Web note: the web path (mixer swap + fadeIn 0.12 in `mapWorld.ts:497-566`,
mixer advanced per frame in `render.ts:264`) is implemented and should be
visually verified after the smoothness fix; the effect log says the right
requests reach it.

## 2. "Low fps" / not smooth (both runtimes, clearly visible on web)

There is no real throughput problem in this scene (few meshes, one shadowed
directional light). What reads as low fps is **temporal aliasing**:

- `gameLoop.ts` steps `fixedUpdate` on a 1/60 accumulator; the
  `humanoid-course` system (the *only* system, including the camera rig and
  `transform.setPose` for the player) is registered as `schedule: "fixedUpdate"`
  (`content/systems/arena.systems.json`). The render loop
  (`render.ts:242-268`) renders every rAF with whatever poses the last fixed
  tick left. Nothing interpolates between ticks —
  `transformInterpolation.ts` exists but is only re-exported from `index.ts`,
  never used in the frame path. On a >60 Hz monitor you get 60 Hz motion
  inside 144 Hz rendering; even at 60 Hz the accumulator runs 0 or 2 steps on
  some frames → visible stutter.
- Additionally the camera rig runs **before** `CharacterRig.update` in
  `updateHumanoidCourse`, so the camera always frames the player's previous
  tick position — a one-tick rubber-band on top of the judder.

### Fix

1. Engine (proper fix): keep previous+current fixed-tick poses for
   script-written transforms and the camera, and in the render frame apply
   `interpolateTransform(prev, curr, accumulator / fixedDelta)` (helpers
   already exist in `packages/runtime-web-three/src/transformInterpolation.ts`).
   Mirror the same rule in the Bevy adapter (interpolate in a `Update`-schedule
   system off `FixedUpdate` results) to preserve shared semantics.
2. Cheaper interim fix, authored-side: split the camera into its own system
   with `schedule: "update"` so it runs per rendered frame with the real frame
   delta. The rig already reads per-frame delta (`readDelta`) and keeps its
   state in `tn.cameraOrbitRig.camera.main`; the character system can read the
   camera yaw from that resource instead of the rig's return value. That makes
   camera motion (the dominant smoothness cue) frame-rate smooth even while
   the character stays on fixed ticks.
3. In `updateHumanoidCourse`, move the `CameraRig.orbitThirdPerson` call to
   **after** `CharacterRig.update` (grab the previous yaw from the rig state
   resource for `cameraYaw` before moving) to remove the one-tick camera lag.
4. Native only: make sure you are judging fps on a `--release` build; the
   QuickJS host also serializes a full JSON context snapshot per system per
   tick (`systems_host.rs:471-488`) — profile that if desktop fps stays low in
   release.

## 3. Moire / "weird effect on surfaces" (`image.png`)

The banding in the screenshot is texture minification aliasing on the tiled
floor grid (`tex.surface.ue-grid`, repeat 24x24; also `tex.grid.floor`
12x18):

- The web runtime maps `wrapS/wrapT/minFilter/magFilter/repeat` in
  `applyTextureControls` (`worldMapping/textureLoading.ts:23`) but **never sets
  `texture.anisotropy`** — there is no `anisotropy` reference anywhere in
  `packages/runtime-web-three/src`. With anisotropy = 1, a 24x-tiled grid at a
  grazing third-person angle produces exactly this ripple/moire.
- The Bevy adapter already does the right thing (`assets.rs:191`,
  `anisotropy_clamp: 8` when mipmapping is requested), so this is also a
  web/native parity gap.

### Fix

1. In `applyTextureControls` (or where the renderer is available), set
   `texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())`
   whenever the min filter is a mipmap variant. 8 matches the Bevy clamp —
   keep them identical and note it in the shared contract docs.
2. Rebuild, rerun the web playtest, and compare `after.png` floor at the
   horizon. If faint banding remains, it is shadow acne from the directional
   light — raise `shadows.normalBias` (currently 0.015 in
   `content/environment/arena.environment.json`) toward 0.02–0.04 rather than
   touching material colors.
3. Add a regression test around texture-control mapping asserting anisotropy
   is applied (web runtime test next to existing textureLoading coverage).

## 4. Camera code review (`src/scripts/player.ts:44-72`)

The `orbitThirdPerson` options themselves are sane (distance 5.2, pitch
clamps, collision mask `world|pushable` with `ignore: ["player"]`, rounding at
5 digits is harmless). The real problems are the ones above: fixed-tick
scheduling without interpolation (judder) and running before the character
move (one-tick lag). Two minor observations, not bugs:

- Yaw/pitch steps are clamped per fixed tick (`maxYawStep 0.07` ≈ 240°/s), so
  fast mouse flicks saturate; raise the caps if aiming feels sluggish after
  the smoothness fix.
- `camera.far: 90` + exponential fog is fine for this arena; `near: 0.05` is
  tighter than needed (0.1 gives better depth precision) but is not the cause
  of the surface artifact.

## Suggested order of work

1. Web anisotropy fix (small, kills the moire, visible immediately).
2. Camera-after-character reorder + camera on `update` schedule (small,
   authored+stdlib-level, fixes most of the perceived smoothness).
3. Native `animation.play` consumer (the real feature gap; includes parity
   docs + tests).
4. Engine-level fixed-tick interpolation (bigger, benefits every example).

Verification loop after each step:

```bash
pnpm --filter @threenative/example-humanoid-physics-course build
tn playtest --project . --scenario playtests/humanoid-course-forward-movement.playtest.json --stable-artifacts --json
tn playtest --project . --scenario playtests/humanoid-course-forward-movement.playtest.json --target desktop --json
```
