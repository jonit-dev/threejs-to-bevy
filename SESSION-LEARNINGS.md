# Session Learnings — Battle of the Pacific (2026-07-23)

Notes from the session that took `examples/battle-of-pacific` from "gates green
but unplayable" to an actually playable flight slice, and fixed the engine bugs
uncovered along the way. Honest brain-dump: what broke, why it was hard to see,
and what to build so the next aircraft (or vehicle) example is cheap.

## The big one: green gates hid an unplayable game

Every proof gate passed — iterate, playtests, score, QA, desktop target — while
the game was literally unflyable and uncontrollable. Three separate causes, each
a general lesson:

1. **Playtests inject input programmatically**, so they never exercise browser
   keyboard focus. A fullscreen `pointer`-mode overlay iframe swallowed every
   real keypress; no scenario could ever catch it. *Lesson: at least one proof
   per game should drive real `KeyboardEvent`s through the DOM, or the harness
   should have a "focus-realistic" input mode.*
2. **Acceptance scenarios were too short.** The aerodynamic death spiral took
   ~10 s; scenarios covered ~3 s. The 30 s `probe-long-cruise` scenario found it
   in one run. *Lesson: every objective-driven game needs a scenario at the
   objective's full duration. A 45 s objective proven with 3 s of flight is not
   proven.*
3. **The aerodynamics model had an inverted angle-of-attack sign in both
   runtimes**, making lift feedback destabilizing (sinking reduced lift). Every
   aerodynamic body was dynamically unstable no matter how it was tuned, and no
   analytic-parity test caught it because both runtimes agreed with each other.
   *Lesson: cross-runtime parity tests verify consistency, not correctness.
   Physics needs at least one test asserting the physical sign/direction of a
   behavior (e.g. "sinking increases lift"), not just symmetric magnitudes.*

## Debugging technique that actually worked

- `physicsDebugSeries` in the playtest runtime-trace is gold: per-step,
  per-surface lift/drag/thruster force vectors and world positions. One probe
  scenario with fifteen 1 s `waitTicks` steps turned a vague "plane falls" into
  "total lift is 20 kN against 41 kN of weight, and the flaps produce 2.6 kN of
  parasitic drag while stowed". Static analysis of the config then matched the
  numbers exactly. Instrument first, hypothesize second.
- Deterministic sim + identical trace output is a feature: when two runs
  produced byte-identical force series, that itself was the signal that my
  change hadn't reached the executed bundle (stale build) or had no effect.
- Sign conventions cannot be reasoned out reliably in this stack (quaternion
  handedness × torque application × aero force direction × model yaw-flip).
  Empirical probes ("hold W for 90 frames, did y go up?") settle in one run
  what an hour of algebra kept getting wrong. Budget for a probe per sign.

## Stale feedback loops burned the most wall-clock

Two separate staleness traps cost several full user feedback cycles:

- `strictPort: false` in the preview server: a stale `tn dev` kept port 5173
  while each "restart" silently bound 5174/5175/5176. The user kept evaluating
  a build that was several fixes old — and I kept "fixing" things that were
  already fixed. Fixed in-engine now (`TN_DEV_PORT_IN_USE` + strict ports).
- `packages/cli/dist/runtime-bevy` is wiped by every CLI build, so prebuilding
  its cargo target dir is wasted work; and the runtime-binary reuse probe
  failed silently (missing `LD_LIBRARY_PATH` for libcef) so every desktop
  playtest recompiled the entire native runtime *inside* the 180 s harness
  timeout. Fixed in-engine now.

*Lesson: when a user says "looks the same", the first hypothesis should be
"they are not running what I built" — verify the served artifact hash (the
`/__threenative/dev-state.json` endpoint exists for exactly this; I never used
it). Hot reload was added at session end; it should have existed on day one.*

## Engine gaps found (fixed this session)

- Aerodynamic AoA sign inverted (web + native) — fixed with regression tests.
- Native playtests: prebuilt-binary probe never succeeded (libcef library
  path), bundled runtime root not probed — fixed.
- Native runtime reported no animation evidence; readiness now carries
  `animations[]` and the CLI converts advancing samples into effect-log
  evidence (`TN_PLAYTEST_ANIMATION_NOT_OBSERVED` is now provable natively).
- Prefab-wrapper model assets (`scene.prefab.*`) dropped `animations` /
  `animationGraph`, so nothing animated natively — bundle emit now inherits
  animation metadata across same-path model assets.
- Fullscreen pointer overlays swallowed the keyboard — web overlay host now
  forwards key events to the game window for `none`/`pointer` modes.
- `tn game score`'s "record an explicit blocker" suggestion was
  unimplementable (keyword matching only) — `threenative.game-scope-blockers`
  artifacts now waive surfaces with a visible warning.
- Scale QA didn't know vehicles could be heroes (aircraft/ship ids now infer
  the `vehicle` role).
- Dev server: strict ports + `--port` + hot-reload broadcast on watch rebuild.

## Engine gaps found (still open — worth PRDs)

- **Energy-budget lint for aerodynamic configs.** Everything that made the
  plane unflyable was statically computable from the scene JSON: max thrust vs
  drag-at-cruise, lift-at-spawn vs weight, rigid-body damping double-counting
  aero drag, stowed control surfaces with nonzero baseline lift creating trim
  moments. A `tn physics lint` (or authoring validation pass) that evaluates
  the force balance at the declared spawn state would have rejected this scene
  at author time with three precise diagnostics.
- **Transform layers / cosmetic child transforms.** A script patching a visual
  child's rotation *replaces* the authored rotation (this is how the plane
  rendered backwards). There is no way to compose "authored base × runtime
  cosmetic offset". Either document loudly or add an additive layer concept.
- **Objects returned from web `mapWorldEntityObject` get the entity transform
  applied over them** — any internally-rotated object must be wrapped in a
  `THREE.Group` (RippleWater knew this; OceanWater learned it the hard way —
  the ocean rendered vertically and was invisible edge-on). Make the mapper
  always wrap, or lint it.
- **The `projectile` mechanic block is scaffold-only.** It writes a
  `ProjectileLauncher` resource nothing consumes. Dynamic entity spawning from
  scripts doesn't exist; the workable pattern is a pre-authored entity pool
  recycled by index (see wing guns in `flight.ts`). Either implement the block
  for real or turn the pooled pattern into the documented mechanic.
- **Blender recipe contract:** source-mode recipes cannot add primitive parts
  (blocked the prop-blur disc from living in the model), max 10 animation
  clips forced deleting building-block clips, `tn asset generate` re-records
  the generator with `overwritePolicy: "manual"` (clobbering `replace` — use
  `tn generator run` for reruns), and regeneration *merges* stale clips into
  the assets doc and flips `initialState` (had to hand-repair twice).
- **Native water is a flat color plane.** `OceanWater` has real parity debt:
  web got the jbouny/three-examples reflective shader; native needs an
  animated WGSL material. Also the general portable-shader IR has no operator
  grammar, so no custom animated material is expressible portably.
- **Motion blur post-process smears the whole frame** under camera translation
  (vertical streaks) — unusable for the prop-blur use case it seems made for.

## DRY / abstraction ideas for the next aircraft (or vehicle) example

`src/scripts/flight.ts` is ~300 lines and almost all of it is reusable
behavior that the next flying/driving example would rewrite:

- **`FlightRig` in script-stdlib** (mirroring `CharacterRig`/`CameraRig`):
  throttle integration, elevator sign handling, coordinated banked turns (yaw
  torque + rotate velocity by actual yaw rate — the one trick that made turns
  survivable), cosmetic bank layer, stall/ditch state machine with retry, and
  telemetry emission. The example script should shrink to tuning constants.
- **`TracerPool` / `EffectPool` helper**: pool of authored entities + spawn
  (position, velocity, life, orientation-along-velocity) + per-tick advance +
  park. Used here for bullets; equally useful for shell casings, debris,
  splashes.
- **Prop/rotor visual convention**: RPM-follows-throttle clip speed + blur
  disc entity faded by throttle. Could be a tiny helper + a documented recipe
  pattern (the disc must be a scene entity because source-mode recipes can't
  add parts).
- **Audio edge-trigger helper**: "play cue on rising edge of boolean" and
  "rate-limited repeating cue" were both hand-rolled; tiny utilities would
  stop every game reimplementing them. The `tn audio generate-sfx` ElevenLabs
  flow itself was the smoothest surface in the whole session — keep it.
- **Aim reticle**: currently a hardcoded CSS offset matching one camera pitch.
  The overlay could receive camera FOV/pitch via the bridge and compute the
  boresight point, making it reusable across cockpit games.
- **Scenario templates**: `probe-long-cruise` (objective-duration hands-off),
  `probe-pitch-hold` / `probe-roll` (per-axis control sign + safety), and the
  1 s-step force-trace probe are generic flight diagnostics. Ship them with
  the plan when `tn game plan` detects a flight genre.

## Process notes

- Parallel subagents worked well once the file ownership was partitioned
  explicitly (audio agent owned `flight.ts` + audio docs; tracer agent owned
  recipe + scene). Saying "do NOT run tn iterate/build" in their prompts
  avoided artifact races; the parent doing one final verify is the right shape.
- Iterating visuals through `tn iterate` screenshots worked, but each cycle is
  ~60-90 s. For shader tuning specifically, a `tn screenshot --url` against a
  running dev server is much tighter; better yet would be a watch-mode shader
  preview.
- "Borrow the proven shader" beat "write a clever one". My two hand-rolled
  ocean shaders (graph-paper mosaic, then plastic-cyan blotches) lost to
  three-examples `Water` (jbouny lineage) the moment it was wrapped correctly.
  I initially rejected it for "composer streaks" that were actually my own
  vertical-plane bug — misattribution nearly cost the best option.
- ElevenLabs key handling: the engine's `.env` + provider-probe design meant
  the key never touched tracked files. Good contract, keep leaning on it.

## Evaluation: agent instructions & skills stack

What the instruction stack (CLAUDE.md → project skills → cookbook) got right
and where it actively cost tokens:

- **"Search the cookbook before inventing patterns" oversells the cookbook.**
  Queries for `water`, `ocean`, and `projectile` returned nothing usable; only
  `sound-cue` paid off (and paid off big — it revealed `tn audio generate-sfx`
  which I would not have guessed existed). The instruction is right *when
  coverage exists*; when it doesn't, the agent burns a search + fallback cycle
  per topic. Fix: either grow the cookbook from this session's patterns
  (pooled tracers, prop blur, OceanWater, coordinated turns, flight probes) or
  have `cookbook search` misses return "no entry — hand-author in
  content/src, these are the contracts" so the miss itself is guidance.
- **"Prefer `tn ... --json` over hand-editing JSON" doesn't match the command
  surface.** The bounded commands cover scaffold-era operations; almost
  everything this session needed (material fields, entities with arbitrary
  components, recipe animation tracks, audio-doc tweaks, input actions) had no
  command, so I hand-edited JSON dozens of times anyway — each time
  second-guessing whether I was violating the workflow. Either publish the
  rule as "hand-edit is fine; `tn authoring validate` is the contract" or
  invest in a generic `tn edit <doc> --set <path>=<value>` escape hatch.
- **The skills' verify ladder lacks an inner loop.** `tn iterate` (~60-90 s)
  is presented as *the* loop, but shader/visual tuning wanted a ~5 s loop
  (`tn screenshot --url` against a live server) and physics tuning wanted a
  single-scenario playtest. Both exist but nothing routes you to them. Add a
  "choose your loop" table to `threenative-verify`: full iterate for
  acceptance, screenshot for visuals, one playtest + runtime-trace for
  physics, typecheck-only for script edits.
- **Nothing in the stack teaches the failure smells that cost the most time**:
  identical trace output = your change didn't reach the runtime; "user sees
  something different from your screenshot" = stale server, check
  `/__threenative/dev-state.json` bundle hash first; "physically impossible
  behavior at any tuning" = suspect the model, not the config. These belong in
  `threenative-verify` as a short triage list.
- **Subagent partitioning instructions worked** (explicit file ownership, "no
  iterate/build", parent does final verify) and should be templated: a
  `content/`-owner agent and a `src/scripts/`-owner agent rarely conflict; the
  scene JSON is the contended file, so exactly one agent may own it.

## Evaluation: authoring process & token economics

Where the tokens actually went, in rough descending order, and the fix each
implies:

1. **Stale-runtime misattribution** (multiple full user feedback cycles +
   rebuilds): fixed in-engine now (strict ports, hot reload); process-side,
   *always verify the served bundle hash before debugging "it looks the
   same"*.
2. **Repeated 60-90 s iterate cycles for visual tuning** (~10 runs): use the
   screenshot inner loop; longer term, hot reload + watch makes this near
   free.
3. **Sign-convention flailing** (elevator, bank spring, roll axis — several
   rebuild+probe rounds each): conventions are now written down (memory + this
   doc): forward is -Z, positive elevator deflection = tail lift = nose down,
   torque about body-forward positive = right wing down, model assets face +Z
   and get a yaw-180 on the visual. A `docs/` conventions page would end this
   class of loop permanently.
4. **JSON output ceremony**: every `tn --json` result is a large single-line
   blob, so each check costs a python-parse heredoc. A `--summary` flag (or a
   compact `ok/code/top-3-diagnostics` first line) would cut hundreds of small
   tokens per invocation and make failures legible in raw logs.
5. **Generator/asset repair loops**: `tn asset generate` clobbering
   `overwritePolicy`, regen merging stale clips + flipping `initialState`,
   clip-budget errors surfacing only at run time. Each was two extra
   command+repair rounds. These are straight bugs/gaps to fix in the CLI.
6. **Capability discovery by grepping engine source**: "can scripts spawn
   entities?", "does MeshRenderer.mesh take a model asset id?", "what does the
   particle system trigger?" — each answered by reading runtime code. A
   `docs/capabilities-for-scripts.md` (the script facade + component contract
   in one page, including the *absences*: no spawn, no visibility patch, no
   sub-node access) would have saved every one of those excursions.

## How to fix the open items (concrete steps)

### Web ocean performance (the 10-20 FPS report)
1. Measure first: `node bin/tn performance proof --project . --target web
   --frames 120 --json` against the running preview — get fps/frame-ms before
   touching anything, then after each change. Suspects in cost order:
   - The **analytic shader** (`AnalyticGerstnerOceanWaterShader`, now replaced):
     96×96-segment plane + ~10 trig evaluations per fragment across most of
     the screen. The jbouny `Water` swap replaces it with a flat plane + one
     normal-map fetch + a 512² reflection pass; expect a large win.
   - If still slow with `Water`: drop `textureWidth/Height` 512 → 256, and cap
     the renderer's devicePixelRatio (a 4K/high-DPR canvas quadruples fragment
     cost; the web runtime currently uses the device value — expose
     `renderer.maxPixelRatio` in runtime config and clamp to 1.5).
   - Cinematic render profile stacks MSAA4 + bloom + tonemapping; try
     `renderLook.profile` "standard" as an A/B to isolate post-processing cost.
2. The reflection pass renders the scene twice. If it matters, `Water` accepts
   `clipBias`/smaller targets, or render the reflection at half resolution.

### Bevy/native ocean parity (currently a flat color plane)
1. `spawn_ocean_water` (runtime-bevy `map_world.rs`) currently spawns a
   `StandardMaterial` Rectangle. Implement `NativeOceanWaterMaterial` by
   copying the `NativePortableShaderMaterialPlugin` pattern exactly
   (`AsBindGroup` material + `load_internal_asset!` WGSL + `MaterialPlugin`):
   uniforms = water color, sun color, sun direction, wave scale, time.
2. WGSL fragment: port the analytic swell-normal function from this session's
   `AnalyticGerstnerOceanWaterShader` (it's in git history for
   `stylizedNature.ts`) — it was written to be portable math (sin/cos only),
   which is exactly what WGSL needs since planar reflections are not free on
   the Bevy side. Skip reflections; keep fresnel + sun glitter.
3. Time uniform: add a system like `advance_native_animation_playback_time`
   that writes `time += delta` into all ocean material instances each Update.
4. Prove parity the way RippleWater does: side-by-side web/native screenshots
   in the conformance evidence, and note "no planar reflection natively" as an
   explicit boundary in `docs/status/capabilities/rendering.md`.

### Prop blades still faintly visible through the disc
Real fix is model-side: extend the Blender recipe contract so source-mode
recipes accept `parts` (the validator forbids it at
`packages/authoring/src/operations/sharedA.ts` ~line 1220; the runner already
has `add_primitive`). Then the recipe can add the translucent disc *and* a
blade-hiding animation could scale blades to zero at high RPM via a scale
track (also currently forbidden — source animations are rotation-only).
Both are deliberate contract boundaries; loosening them needs validator +
runner + budget updates and a cookbook note.

### Vite serves the runtime from `dist/` and does not reliably invalidate it
The dev preview's `index.html` loads `/dist/browser/main.js` — compiled
output, not `src/`. After `pnpm build` in `packages/runtime-web-three`, the
running vite server kept serving the OLD transforms (verified: identical
screenshots across a real code change; `dist` on disk had the change).
Practical rule: **any runtime-web-three change requires restarting `tn dev`**
(hot reload only covers game content/scripts, which flow through the bundle).
Engine fix idea: point the preview at `src/` so vite's module graph and HMR
own the whole chain, or add a dist-watcher that triggers the same full-reload
broadcast the bundle watcher now uses.

### Ocean look: what finally matched the reference
The stock three-examples `Water` needs three surgical changes to read as
open ocean from altitude under a bright sky (all applied via fragment-shader
string patches in `createOceanWaterObject`):
1. `rf0` 0.3 → 0.05 (real water F0); otherwise the sea is a cloud mirror.
2. Sun specular moved OUT of the fresnel mix (`outgoingLight = albedo +
   sunColor * specularLight * k`), or a low F0 kills the glitter entirely.
3. Distance-based haze mix at the tail for atmospheric perspective.
Plus: mipmapped normal texture (else horizon static), `size` uniform ~14 for
fine ripple, a slow-scrolling procedural cloud-shadow overlay plane, and a
rich cobalt `waterColor` (#0a4a94). Sun direction must point INTO the view
(negative z here) or the glitter path is behind the camera.

### Scenario `holdFrames` semantics
Playtest press steps advance far more sim time than the label suggests (a
"holdFrames: 60" step spanned multiple sim-seconds; holds >100 frames hit the
6-minute command timeout). Before writing input-heavy scenarios, read
`nativeHarnessCommandStream`/web step drivers in
`packages/cli/src/commands/playtest.ts` and prefer several short press steps
over one long hold. Worth an engine fix: document/normalize `holdFrames` to
fixed ticks.

## The straight-line playbook for the next vehicle example

What this session should have looked like, condensed:

1. `tn game plan` → read plan → **write the energy/sign sanity probes first**
   (objective-duration hands-off cruise, per-axis control-sign probes) before
   any polish. They are cheap and catch the two failure classes that matter.
2. Author scene/physics; run the force-trace probe once; check lift≈weight and
   thrust>drag *numerically* before touching visuals.
3. Reuse the rigs: FlightRig-style control scheme (or copy `flight.ts` until
   the rig exists), TracerPool for effects, OceanWater for water, prop-blur
   convention, `tn audio generate-sfx` for sound.
4. Dev loop: `tn dev --target web --watch` (hot reload) stays up the whole
   session; visuals verified by screenshot against it; iterate only at
   milestone boundaries; desktop playtest once per milestone.
5. One subagent per non-conflicting domain (audio, assets) with explicit file
   ownership; parent owns scene JSON, scripts wiring, and all verification.
6. Record scope blockers immediately when the genre diverges from the generic
   gate expectations; keep `AGENT_GAME_PLAN.md` checklist current — it was the
   single best resume/handoff artifact all session.

---

# Addendum — mined from the 7/22 evening + 7/23 afternoon/evening sessions

Everything below comes from mining the parallel Codex and Claude sessions
that ran after the morning flight-slice session: the 7/22 advanced-physics
PRD execution/review, and the 7/23 visual-parity / gunfire / destroyer /
audio push. Only NEW learnings; the morning items above still stand.

## Materials, glTF, and PBR — the biggest new failure cluster

- **glTF `metallicFactor` defaults to 1.0.** A GLB material with no explicit
  metallic value renders as full metal — near-black under a weak environment,
  and it integrates the entire IBL. Both the "flat dark plane" and the
  "olive navy paint" bugs bottomed out here. Assume unset metallic = 1, and
  encode `metallicFactor: 0` on painted materials in the recipe.
- **The Blender runner's `roughness` override silently strips packed
  metallic-roughness textures.** Setting the `roughness` key in
  `override_source_material` replaces the node link with a constant, so the
  glTF exporter drops the whole MR texture (20/20 materials lost theirs →
  plasticky flat look, matte-black canopy). Leave the socket linked; never
  blanket-override.
- **Override PBR surgically, not globally.** The SBD-3 look is
  metalness-driven by design (canopy glass + navy panel sheen are metallic;
  only ~8 materials are true paint). Blanket `metallic:0` destroyed the
  canopy and the sheen. Sample the source channels first, then override only
  the genuinely-painted materials.
- **Environment-map ground tint bleeds into all metal.** The
  kloofendal-48d HDRI's lower hemisphere is green grassland; metallic navy
  paint integrated it and rendered olive (measured wing pixel (36,34,19) —
  green > blue, impossible for navy). `tn model-test` never shows this
  because its viewer uses a neutral studio env. Fix: replace the
  below-horizon hemisphere of the derived env map with a feathered
  ocean-blue gradient. Rule: validate HDRIs in the actual gameplay camera,
  not the catalog thumbnail or the model viewer.
- **Verify "Poly Haven" assets against the official API hashes.** Two
  pending panoramas claimed Poly Haven provenance but were synthetic
  (dimensions + MD5 disagreed). Check provider hash/author/license metadata
  before trusting an asset's claimed source.

## Blender/asset pipeline — new contract bugs and limits

- **Frame-0 NLA bake corrupted the bind pose (the real "stuck flaps" root
  cause).** The generator exported frame 0 with every authored NLA strip
  active, baking the first frame of `flaps-down`/`rudder-right` into the
  neutral node transforms — cruise could never return to neutral. Fixed at
  the owner: the runner now mutes overlapping strips and restores the
  authored pose before export (regression test in place). Related: a clip
  does not implicitly re-key surfaces a previous clip moved — `cruise` must
  explicitly key them back to neutral.
- **Import-to-animate rotation-mode trap.** The recipe contract was extended
  to import an existing GLB and animate its nodes (built for the SBD-3
  prop/flaps ask). First runs exported ZERO clips silently: imported glTF
  nodes keep quaternion rotation mode while the runner keyed Euler tracks;
  Blender warns and drops the channels. The runner must switch targeted
  nodes to XYZ Euler and key relative offsets. Any Blender rotation-track
  authoring on imported glTF must reconcile rotation mode or channels vanish.
- **`split-by-axis` is the right pattern for control surfaces packed into
  one mesh node.** The ailerons were two disconnected halves in a single
  node, so node rotation moved both together. A bounded split op (cut at
  x=0, ±18 degree opposite tracks, tri count unchanged) fixed it. Limit: it
  refuses to cut welded vertices, so the main wing stays one piece. Do NOT
  add duplicate overlay geometry — the user rejected that hard, twice.
- **`tn asset generate` resetting `initialState` is not just annoying — it
  cascades.** A regen silently flipped `flight.cruise` → `flaps.deploy`,
  destabilized flight, tripped the failure path that stops engine audio,
  and the user experienced it as two unrelated bugs ("engine cutting off",
  "you fucked up the plane movement"). After ANY regen: re-assert
  `initialState`, then re-playtest.
- Smaller contract edges: hinge pivots are only allowed on nodes from an
  imported source GLB (not newly-generated parts); source-backed recipes
  must name imported materials exactly; `tn model-test` refuses to render a
  GLB with duplicate node paths (blocked SBD-3 turntable evidence);
  `MeshRenderer` requires both mesh AND material to resolve even when the
  GLB carries its own materials; `doubleSided` is not an authored
  portable-material field; the GLB exporter flattens smoke alpha to opaque
  (reapply translucency as a scene material).

## Audio — loop mastering and runtime gaps

- **"Engine cutting off" inside a loop was phase cancellation, not
  loudness.** The 1 s equal-power crossfade over a tonal drone produced a
  ~3.5 dB / ~400 ms notch at every wrap even with a continuous seam sample.
  Fix: choose the loop body length by maximizing head/tail phase
  correlation (residual dip 0.5 dB). Companion failure: a body 9-10 dB
  louder than its head/tail reads as a pulse at every wrap — master to a
  target LUFS and verify the decoded wrap deltas fall within
  adjacent-sample variance.
- **Regenerate rather than rescue.** When mastering could not remove the
  source's objectionable character, one regeneration with a seam-oriented
  prompt ("steady cockpit rumble", not "harsh drone") beat every rescue
  attempt.
- **Engine gaps found:** the web runtime accepted an audio `pitch` option
  and silently ignored it (now mapped to `playbackRate`); scripts cannot
  modulate a playing sound's volume/pitch, so RPM-follows-throttle needs
  discrete bands with hysteresis (rig-helper candidate); browsers block
  autoplay until a user gesture, so the runtime needed an explicit
  gesture-unlock + queued-play path plus `.mp3`/`.m4a` MIME types in the
  dev server (`TN_AUDIO_PLAYBACK_REJECTED` is the new diagnostic).

## Visual debugging — new diagnostics that worked

- **"Blue airplane" = collider debug wireframe.** Saturated cyan bands on
  the fuselage were the physics-box debug wireframe drawn with
  `depthTest:false` while `?debugColliders=1` was set. The diagnostic that
  cracked it: the band geometry matched the collider dimensions exactly.
  When a color artifact aligns with a physics box, suspect debug rendering.
- **Perf complaints: profile before blaming the shader.** The reported
  "game perf issue" traced to the engine's own instrumentation — 58% of CPU
  in `runtimeWriteObservationSort` and ~18% in audit serialization;
  rendering and physics were each <0.1% self-time. Observation/audit
  recording is a first-class perf suspect during playtests/traces.
- **Diagnose color complaints with sampled pixels, not eyeballing.**
  Quantified deltas (reference (0,25,53) vs current (40,92,148)) turned
  "looks like SHIT" into closable numeric targets for subagents.
- **Sun glitter must be distance-gated** or it reads as single-pixel
  "sprinkles" (user reported it three times before the fix landed): no
  glitter within ~350 m, faded past ~1.4 km, glints softened.
- **`tn parity visual` viewport trap:** capture defaults to 1280x720;
  `tn compare-images` returns maximal difference for unequal dimensions, so
  parity silently scored ~0 until the harness captured at the reference
  image's size. Parity capture should adopt reference dimensions
  automatically.
- **OPEN BUG at session end: ocean recenter vs transform sync.** The
  camera-following "infinite ocean" recenter fights the engine's per-frame
  transform sync — position ping-pongs between camera-centered and authored
  values on alternate frames ("ocean is flashing fast", "reflections are
  crazy"). Concrete new manifestation of the missing additive-transform
  layer. Candidate fixes: win the write order, recenter an inner mesh, or
  let an entity opt out of transform sync.

## The prototype-scaffold trap (hit three times in Codex)

`tn game plan` → `tn authoring prototype --from-plan --run-proof` is
destructive on a project with existing custom work: it overwrote the
authored `arena.scene.json` with a generic wave-defense scaffold, and the
`--run-proof` subprocess kept running in the background and REGENERATED the
deleted files while the agent was restoring the scene (required a ps-hunt
and kill). The planner's instruction "run nextAuthoringCommand exactly, do
not inspect source first" walks a compliant agent straight into it.
Compounding bug: auto-discovery bundles any stray `prototype.*` structured
source into the real scene. Until fixed: never run the prototype command on
a project with authored content, and grep for leaked `prototype.*` docs
after any planner interaction.

## Staleness, round two — the fixes have their own edges

- **The strict-port fix itself shipped three regressions** (commit
  01a043db): it broke the `port: 0` ephemeral sentinel tests rely on, a
  failed `listen()` left Vite's watcher open so test processes hung, and
  `tn dev --watch` leaked its source watcher on failed startup. All fixed —
  lesson: strict ports need an ephemeral-sentinel carve-out plus
  failure-path cleanup, or you trade silent-wrong-port for silent-hang.
- **Bundle-hash equality is necessary but not sufficient.** The bundle
  manifest is content-stable, so it cannot catch "source edited, never
  rebuilt". The parity harness added a source-mtime-newer-than-manifest
  guard; use both checks.
- **Stale servers also pin deleted assets in memory:** after a rollback, an
  orphaned 5174 server still served the deleted aileron overlay model. The
  strict-port fix correctly refused to layer a new preview over it, but
  orphaned PIDs kept reappearing — check for them after any rollback.
- **Linked CLI vs repo CLI drift:** `pnpm exec tn` (linked) knew commands
  the source tree didn't and vice versa. When a `tn` subcommand "doesn't
  exist", suspect a stale link first; `pnpm tn -- ...` (build-backed) is
  authoritative. Same family: a project-local `tn` wrapper older than the
  repo CLI wrote provenance that looked wrong — rebuild, don't "repair"
  valid source.

## Gate-design flaws (from the 7/22 physics-PRD reviews)

The advanced-physics review sessions found a pattern worth engraving:
**a gate that feeds its expected value into the thing it checks proves
nothing.**

- The destruction gate passed `expected` outcomes INTO the web trace
  generator it later compared against, and both runtimes echoed
  harness-computed hashes — the provenance check could never fail.
- Drift protection exempted `stage:"contract"` descriptors, which was
  exactly the stage of every descriptor the PRD cited as PASS evidence.
- A negative-control loop in the drift test always `continue`d — dead code
  posing as coverage. A static-gate positive test hard-coded a hash that
  production derives — two-place updates, latent drift.
- The same PRD assertion used different per-adapter tolerance bands (web
  `<= 5000 N`, native `150-700 N` — and native failed its own band; brakes
  increased speed). Tolerances belong in one owned registry.
- Silent-fallback divergence: Bevy dropped a malformed fracture manifest
  with a bare `continue` (wall never fractures, no diagnostic); web threw.
  Debug primitives diverged four ways between runtimes (COM source, sensor
  pairs in contacts, bond representation, piece accounting) — telemetry
  needs the same conformance discipline as gameplay or it lies exactly
  where you point it.
- Runtime bugs found the same way: fracture pieces inherit a tick-0
  transform snapshot (moving destructibles shatter at their spawn pose);
  Bevy picks the lexicographically-first contact bond while web picks
  nearest (divergent piece-ID streams for any 2+ bond assembly).
- Also: importing through the `packages/ir` root barrel dragged Node-only
  code into the browser bundle — typecheck missed it, the playtest at the
  adapter boundary caught it. Import browser-safe submodules directly.

## Multi-agent / multi-session operations

- **Concurrent sessions on one worktree sabotage each other.** Repeated
  `exit 143` (SIGTERM) on iterate/proof runs traced to other concurrent
  ThreeNative browser runs slowing headless startup past the harness
  timeout; one session's dev/perf work killed another's browser phase. If
  parallel sessions are unavoidable, only one may run iterate/build/dev at
  a time — same rule as subagents, now proven at the session level.
- **Partial commits in a shared dirty tree are hazardous.** A
  `--no-verify` commit swept in unrelated already-staged work from another
  session; required reset-to-parent + restage + amend. Always restage
  explicitly from a clean index when the tree holds others' work.
- **Reviewing a live checkout gives snapshot findings.** A review agent
  watched a compile break appear and get fixed mid-review while another
  session mutated the tree. Re-verify findings on a quiescent tree before
  acting on them.
- **Idle is not done-and-reported.** One subagent landed its deliverable on
  disk but went idle without reporting; verify subagent output on disk, not
  from the report. And when the user accidentally stops agents, each task
  must be self-contained enough to resend with full context.
- Codex-specific observations: its reviewer FAIL'd a phase solely for one
  out-of-scope untracked file (stricter scope posture worth copying); it
  repeatedly refused to trust a green iterate summary and inspected focused
  evidence instead; but its default obedience to imperative planner output
  is what walked it into the prototype-scaffold trap. Instruction text that
  says "run this exactly, don't look first" is an anti-pattern for agent
  consumers.

## User-feedback patterns worth internalizing

The user's corrections this cycle were consistent: **the model already has
it — stop adding things.** "Flaps were already on the model, REMOVE THIS
GARBAGE" (overlay geometry), "it should be from the wings — check history"
(muzzle origins moved during unrelated work), "just rollback" (aileron
overlay). The recurring failure was agents reaching for additive
workarounds (new geometry, new assets) instead of inspecting and animating
what the model/git history already contained. Check history and the asset's
actual node/clip inventory before authoring anything new. When a regression
is reported, diff against the last user-approved state byte-for-byte rather
than re-deriving values.
