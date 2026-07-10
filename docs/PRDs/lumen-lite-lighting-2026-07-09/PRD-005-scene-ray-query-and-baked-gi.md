# PRD: Scene Ray Queries And Baked GI Probes (Off-Screen Light Foundation)

`Planning Mode: Principal Architect`
`Complexity: 8 -> HIGH mode`
Score basis: +2 (10+ files) +2 (multi-package: sdk/ir/compiler/cli/web/bevy)
+2 (new system: build-time bake pipeline) +2 (new internal service surface).

## 1. Context

**Problem:** Every screen-space technique (PRD-004 SSGI, GTAO, SSR) is blind
to off-screen geometry and emitters — the fundamental gap between
"screen-space effects" and a Lumen-class result. The engine also has no
shared way to answer "what does this ray hit?" outside physics colliders,
which blocks GI baking, audio occlusion, and richer playtest assertions.

**Goal (two coupled deliverables):**

1. **SceneRayQuery**: an engine-internal, adapter-private ray-query service
   over rendered scene geometry — web via `three-mesh-bvh` (MIT, CPU
   `MeshBVH`), native via parry/Rapier trimesh queries the physics stack
   already links. Internal-only in v1: consumed by the bake pipeline,
   audio occlusion, and playtest visibility assertions — not exposed as a
   user scripting API yet.
2. **Baked GI probes**: a compiler/CLI-side bake step (`tn bake gi`) that
   ray-traces the authored scene once at build time and writes irradiance
   data into the already-portable `ILightProbeIr` entries. Baking is the one
   GI approach that is *inherently* cross-runtime: the expensive tracing
   happens in TypeScript tooling, and both adapters merely consume probe
   data they already model (web: probe-blended ambient/irradiance; Bevy
   0.14: light probes / irradiance volumes).

This turns "off-screen GI" from a per-adapter renderer feature into portable
content — the strongest parity move available under the current WebGL + Bevy
0.14 constraints.

**Non-goals:** Runtime GPU BVH tracing (`BVHComputeData` is WebGPU/TSL —
future tier), surfel caches at runtime (appendix), lightmap texel baking
(probes only in v1), path-traced reference imagery (`three-gpu-pathtracer`
noted as a future baking upgrade).

**Files Analyzed:**

- `packages/ir/src/types.ts` - `ILightProbeIr { bounds, influenceRadius,
  source, intent }` exists with conformance gaps on Bevy.
- `packages/compiler/` - emit pipeline where a bake step can attach.
- `packages/cli/src/commands/` - command registry (registry-first rule for
  the new `tn bake` command).
- `packages/runtime-web-three/src/mapWorld.ts` - probe application path.
- `runtime-bevy/crates/threenative_runtime/src/map_world/rendering.rs` -
  probe/environment application; Bevy 0.14 `LightProbe` +
  `EnvironmentMapLight` / `IrradianceVolume` support.
- `gkjohnson/three-mesh-bvh` - `MeshBVH`, `StaticGeometryGenerator`,
  raycast/closest-point queries.

**Current Behavior:**

- Light probes are IR-defined but effectively inert (`source` has no baked
  payload contract); no bake tooling exists.
- Audio occlusion and visibility queries have no shared substrate.
- Physics raycasts exist but only against authored colliders, not render
  geometry.

## 2. Solution

### SceneRayQuery service

One narrow interface, two adapter-private implementations plus one tooling
implementation:

```ts
export interface SceneRayQuery {
  raycast(origin: Vec3, dir: Vec3, maxDistance: number): RayHit | null;
  // RayHit: { distance, point, normal, entityId }
  occluded(from: Vec3, to: Vec3): boolean;
}
```

- Tooling/web implementation: `three-mesh-bvh`. Build one `MeshBVH` per mesh
  geometry (shared across instances), traverse instances with object-local
  ray transforms — NOT webgiya's approach of cloning/merging the whole scene
  into one baked geometry (unmaintainable for dynamic scenes, and it touches
  `MeshBVH._roots` privates). Wrap the dependency completely: its API is
  marked unstable upstream.
- Native implementation: parry `TriMesh` queries built from the same IR mesh
  data (the physics crates already depend on parry via Rapier).
- Determinism note: bake results must be reproducible — seed all sampling,
  no wall-clock, so bakes are diffable artifacts.

### Bake pipeline (`tn bake gi`)

```text
tn bake gi --project . --json
  -> load IR bundle (structured parsing, per repo rule)
  -> build SceneRayQuery over static, shadow-casting meshes + material albedo
  -> for each authored LightProbe: trace N cosine-weighted hemisphere rays
     per SH band sample from the probe center(s); direct sun/sky from
     atmosphere; one bounce of albedo-weighted indirect
  -> write 2nd-order spherical harmonics (9 RGB coefficients) into
     content/lighting/<scene>.probes.json (durable data lives in content/)
  -> bundle emit embeds baked payloads into ILightProbeIr.source
```

Probe payload contract (the portable core of this PRD):

```ts
export interface IBakedProbePayloadIr {
  format: "sh2";            // 9 coefficients, RGB
  coefficients: number[];   // 27 floats
  bakeVersion: 1;
  sceneContentHash: string; // staleness detection -> TN diagnostic when stale
}
```

- Web consumption: probe-weighted SH irradiance added to ambient/light-probe
  application in `mapWorld.ts` (Three.js has `LightProbe` with SH natively).
- Bevy consumption: spawn `bevy::pbr::LightProbe` +
  environment/irradiance data from the same SH payload within probe bounds.
  A Phase 5 spike decides between per-probe `EnvironmentMapLight`
  (SH -> tiny cubemap) and `IrradianceVolume` (SH -> single-voxel volume
  texture); both exist in 0.14. Ambient-blend fallback with an honest
  `approximation` report is acceptable for v1 if the spike finds blockers.

**Key Decisions:**

- [ ] Baked data is durable content (`content/lighting/`), regenerated by an
      explicit command; the build fails soft (diagnostic, not error) when
      probes are stale.
- [ ] `tn bake gi` enrolls in the CLI command registry first; help/dispatch
      derive from it (repo registry-first rule).
- [ ] SceneRayQuery is internal; scripting exposure is a separate future PRD
      with capability gating (users must not get free filesystem-adjacent
      power through it).
- [ ] SH2 chosen over cubemaps for the payload: 27 floats, trivially
      portable, both runtimes can consume; cubemap conversion is
      adapter-private.

**Data Changes:** `ILightProbeIr.source` gains the baked payload contract +
validators (`TN_IR_LIGHT_PROBE_BAKE_*`); compiler capability
`("rendering", "baked-gi-probes")`; new content file family
`content/lighting/*.probes.json`.

## 3. Integration Points

- Entry point: `tn game plan` guidance + `tn bake gi --json`; probes authored
  via existing SDK/scene JSON.
- Caller files: CLI command registry, compiler emit (payload embedding), both
  adapters' probe application paths, audio occlusion + playtest assertion
  consumers (Phase 6, thin).
- User-facing: yes — `tn bake gi` command, visible probe lighting; probe
  staleness diagnostic surfaces in build output.

## 4. Execution Phases

#### Phase 1: SceneRayQuery in tooling - Rays hit authored scenes deterministically.

**Files (max 5):** `packages/compiler/src/bake/sceneRayQuery.ts` (+ test),
`package.json` (add `three-mesh-bvh`), shared types module.

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `sceneRayQuery.test.ts` | should hit a unit cube from known origin | distance/normal/entityId exact |
| `sceneRayQuery.test.ts` | should respect instance transforms without merging geometry | two instances of one mesh both hit |

#### Phase 2: Probe payload contract - Baked SH validates, embeds, round-trips.

**Files (max 5):** `packages/ir/src/types.ts`,
`packages/ir/src/rendering.ts` (+ tests),
`packages/compiler/src/emit/capabilities.ts`.

#### Phase 3: tn bake gi command - One command produces committed probe data.

**Files (max 5):** CLI command registry entry,
`packages/cli/src/commands/bakeGi.ts` (+ test),
`packages/compiler/src/bake/probeBaker.ts` (+ test).

- [ ] Seeded hemisphere sampling, sun/sky direct + one albedo bounce, SH
      projection; `--json` report with ray counts, timings, content hash.
- [ ] Staleness: content-hash mismatch at build -> diagnostic naming the
      rebake command.

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `probeBaker.test.ts` | should produce warm SH facing a lit red wall | dominant coefficient sign/hue matches analytic expectation |
| `probeBaker.test.ts` | should be deterministic across runs | identical output for identical input |

#### Phase 4: Web probe consumption - Baked probes visibly light web scenes.

**Files (max 5):** `packages/runtime-web-three/src/mapWorld.ts`, probe
application module (+ test), conformance report plumbing.

**User Verification:** Fixture: object inside a red-walled alcove, sun
outside. With baked probes the object picks up warm bounce even though the
wall is off-screen — the exact failure case of PRD-004 SSGI.

#### Phase 5: Bevy probe consumption - Same payload lights native scenes.

**Files (max 5):**
`runtime-bevy/crates/threenative_runtime/src/map_world/rendering.rs`
(+ test), loader parsing, conformance report plumbing.

- [ ] Opens with the SH->EnvironmentMapLight vs IrradianceVolume spike;
      records the decision in this PRD before implementation.

#### Phase 6: Parity gate + first internal consumers - Off-screen bounce proven cross-runtime.

**Files (max 5):** fixture catalog entry (`baked-probe-alcove-test`),
`tools/verify` focused check `verify:baked-gi`, one thin consumer wiring
(audio occlusion OR playtest `occluded` assertion — pick one, keep thin).

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| focused verify | alcove object lifts + warms with probes | both adapters, region hue/luminance |
| focused verify | stale probes emit diagnostic | hash-mismatch bundle reports `TN_IR_LIGHT_PROBE_BAKE_STALE` |

## 5. Verification

```bash
pnpm build && pnpm typecheck && pnpm test
tn bake gi --project <fixture> --json
cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime probes
pnpm verify:conformance
pnpm verify:focused verify:baked-gi
pnpm verify:smoke
```

HIGH mode: `prd-work-reviewer` after every phase; manual visual checkpoints
after Phases 4 and 5.

## 6. Acceptance Criteria

- [ ] `tn bake gi` produces deterministic, committed SH probe payloads from
      authored scenes; command derives from the CLI registry.
- [ ] Both adapters light the alcove fixture from the same payload (native
      may report a documented approximation mode, never silence).
- [ ] Staleness is detected and diagnosed, not silently wrong.
- [ ] `three-mesh-bvh` is fully wrapped; no upstream type leaks into public
      surfaces; no scene-merge/private-API usage.
- [ ] rendering.md, STATUS.md, bevy-feature-parity.md updated; PRD moves to
      done when complete.

## Risks And Unknowns

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bevy 0.14 irradiance-volume/probe mapping fights the SH payload | High | Phase 5 spike first; ambient-blend approximation fallback with honest report |
| Bake times balloon on dense scenes | Medium | Ray budgets in the bake report; per-probe budget flag; static-mesh filter |
| Probe staleness annoys iteration loops | Medium | `tn iterate` hint in the diagnostic; hash only over static inputs |
| CPU BVH memory on huge scenes (tooling) | Low | Shared BVH per geometry, lazy build, tooling-only |

## Appendix: Surfel world-space cache (R&D only — do not schedule)

`jure/webgiya` (MIT) proves a Lumen-style surfel pipeline is possible in
Three.js: G-buffer surfel spawning, cascaded spatial hash, BVH integration,
age/confidence, radial-depth leak suppression. If ThreeNative ever pursues
runtime world-space GI, harvest the *resolve weighting* ideas
(`surfelGIResolvePass.ts`: normal agreement, spatial distance,
distance-along-normal, age, confidence, radial-depth visibility) and the
pool/hash structure — but never its scene BVH (clones + merges the scene,
touches `MeshBVH._roots`). Precondition: WebGPU web tier + a Bevy version
with a real GI story, otherwise it is web-only divergence, which this
milestone exists to avoid. Track as a Future/Ultra tier note in
`docs/bevy-feature-parity.md`, not as scheduled work.
