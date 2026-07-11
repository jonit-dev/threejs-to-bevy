# PRD: Contact Shadows For Object Grounding

`Planning Mode: Principal Architect`
`Complexity: 6 -> MEDIUM mode`
Score basis: +2 (6-10 files) +2 (multi-package) +2 (new render-to-texture
subsystem in the Bevy adapter).

## 1. Context

**Problem:** Objects and characters float visually: cascaded shadow maps at
gameplay resolutions cannot produce the soft, tight darkening where an object
meets the ground. This grounding cue is the highest visual return per line of
code in the whole Lumen-lite plan.

**Goal:** A portable `ContactShadows` scene component (an authored entity
placed at a ground region) that renders soft blurred top-down shadows in both
adapters, with `updateMode` control so static scenes pay once.

**Non-goals:** Accumulative/area-light shadows (see appendix), per-light
contact hardening (screen-space contact shadows), dynamic ground meshes
(non-planar receivers).

**Files Analyzed:**

- `packages/ir/src/types.ts` - scene entity component schema home.
- `packages/sdk/src/scene/Light.ts` - SDK component authoring pattern.
- `packages/runtime-web-three/src/mapWorld.ts` - component -> Three.js
  reconciliation.
- `runtime-bevy/crates/threenative_loader` + `map_world/entities.rs` -
  component -> Bevy entity spawning.
- Drei `ContactShadows` implementation (MIT) - the reference pipeline.

**Current Behavior:**

- Web has a GTAO composer path (AO promoted) — AO darkens creases but does
  not ground objects against floors at contact scale.
- Neither adapter has any contact-shadow notion.

## 2. Solution

**Approach:** Both adapters implement the same four-step pipeline, which is
renderer-agnostic:

```text
Orthographic camera looking straight down at the authored region
  -> depth-only render of shadow-casting entities above the plane
  -> horizontal blur -> vertical blur (separable)
  -> composite as a transparent darkening plane at the authored transform
```

- Web: port Drei's `ContactShadows` (plain Three.js under the React wrapper):
  custom `MeshDepthMaterial` with alpha-from-depth, two ping-pong render
  targets, `HorizontalBlurShader`/`VerticalBlurShader`. Replace Drei's
  temporary scene-material swap with a dedicated render layer so user
  materials are never mutated.
- Bevy: a second `Camera3d` with orthographic projection rendering a
  `RenderLayers`-filtered depth view into an `Image` render target, a blur
  applied via a fullscreen material pass (two passes, separable), and a
  `Mesh3d` quad with an alpha-blended `StandardMaterial` (unlit, black,
  alpha = blurred occupancy) at the component transform. All adapter-private.
- `updateMode: "static" | "dynamic"`: static renders once at spawn (and on
  explicit invalidation when entities in the region move via the existing
  reconciliation path); dynamic renders every frame at a bounded resolution.

**Portable component (IR + SDK):**

```ts
export interface IContactShadowsIr {
  size: [number, number];      // world-space plane extent, 0.1..500
  height: number;              // capture volume above plane, 0.1..50
  resolution: 128 | 256 | 512 | 1024;
  softness: number;            // blur radius scalar, 0..10
  opacity: number;             // 0..1
  updateMode: "static" | "dynamic";
}
```

Authored as a component on a scene entity; the entity transform provides
placement/rotation. SDK surface mirrors existing component classes:

```ts
scene.entity("arena.floor.shadows").addComponent(ContactShadows, {
  size: [20, 20], height: 5, resolution: 512,
  softness: 1.5, opacity: 0.6, updateMode: "static",
});
```

**Key Decisions:**

- [ ] Component-on-entity (not a renderer flag) because placement is spatial
      authoring, matching lights/probes.
- [ ] Both adapters exclude the composite plane and capture camera from
      screenshots-entity counts, picking, and physics (adapter-private
      children).
- [ ] `dynamic` mode at low tier clamps resolution to 256 via the render-look
      target overrides — derived from the existing quality ladder, not a new
      list.

**Data Changes:** New IR component `ContactShadows` + validation
(`TN_IR_CONTACT_SHADOWS_*`), compiler capability
`("rendering", "contact-shadows")`.

## 3. Integration Points

- Entry point: SDK component / scene JSON; `tn` authoring commands pick it up
  through the existing component registry (registry-first rule: add the
  component descriptor to the owning component registry so CLI/editor/MCP
  surfaces derive it).
- Caller files: web `mapWorld.ts` reconciliation switch; Bevy loader
  component parsing + `map_world/entities.rs` spawn.
- User-facing: yes — visible grounding; editor inspector rows derive from the
  component registry.

## 4. Execution Phases

#### Phase 1: Portable component + SDK - Authored contact shadows validate and compile.

**Files (max 5):**

- `packages/ir/src/types.ts`, `packages/ir/src/rendering.ts` (validators)
- `packages/sdk/src/scene/ContactShadows.ts`
- component registry descriptor file (locate the owning registry; do not
  hand-add to per-surface lists)
- `packages/compiler/src/emit/capabilities.ts`

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `packages/ir/src/rendering.test.ts` | should reject resolution not in allowed set | diagnostic emitted |
| `packages/compiler/src/emit/capabilities.test.ts` | should enroll contact-shadows capability | manifest capability present |

#### Phase 2: Web implementation - Objects ground visibly in the web adapter.

**Files (max 5):**

- `packages/runtime-web-three/src/rendering/contactShadows.ts` - pipeline.
- `packages/runtime-web-three/src/mapWorld.ts` - reconcile component.
- `packages/runtime-web-three/src/rendering/contactShadows.test.ts`

**Implementation:**

- [ ] Port Drei pipeline (depth material, ping-pong blur targets, composite
      plane); render-layer isolation instead of material swapping; restore
      renderer state after capture; dispose targets on teardown (web teardown
      already owns render targets — enroll these).
- [ ] Static mode: render on spawn + on tracked-entity transform change.

**User Verification:** Fixture scene with a cube on a floor: soft dark pool
under the cube, fading with `height`; screenshot capture.

#### Phase 3: Bevy implementation - Same scene grounds identically on native.

**Files (max 5):**

- `runtime-bevy/crates/threenative_runtime/src/rendering/contact_shadows.rs`
- `runtime-bevy/crates/threenative_loader` - parse component.
- `runtime-bevy/crates/threenative_runtime/src/map_world/entities.rs` - spawn.
- `runtime-bevy/crates/threenative_runtime/tests/contact_shadows.rs`

**Implementation:**

- [ ] Ortho capture camera (`RenderLayers` filtered, `Image` target, render
      once for static via `Camera.is_active` toggling), separable blur
      material passes, unlit alpha composite quad.
- [ ] Bounded resolution/softness mapping mirrors web anchors.

**User Verification:** Native capture of the same fixture; pool visible.

#### Phase 4: Parity gate - One fixture proves both runtimes.

**Files (max 5):**

- Conformance fixture (`packages/ir/fixtures/conformance/` catalog entry) +
  `tools/verify` focused check `verify:contact-shadows` derived from the
  fixture catalog.

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| focused verify | contact pool darkens monotonically with opacity | region luminance ordering holds in BOTH adapters (AO-corner-test pattern) |
| focused verify | static mode does not re-render | frame-cost/report counter stable across frames |

## 5. Verification

```bash
pnpm build && pnpm typecheck && pnpm test
cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime contact_shadows
pnpm verify:conformance
pnpm verify:focused verify:contact-shadows
```

Checkpoints per phase (`prd-work-reviewer`); Phases 2-3 add manual visual
verification.

## 6. Acceptance Criteria

- [ ] `ContactShadows` component authored via SDK/JSON works in both
      adapters with matched bounded parameters.
- [ ] Static mode pays zero steady-state frame cost; dynamic mode respects
      tier resolution clamps.
- [ ] No user material is mutated on either adapter; teardown leaks nothing.
- [ ] Region-based parity gate passes; capability docs + parity table +
      STATUS index updated.

## Risks And Unknowns

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bevy 0.14 render-to-texture + blur ordering is fiddly | Medium | Reuse the motion-blur pass's persistent-texture ownership pattern already proven in the native adapter |
| Blur kernel differences make pools look different per adapter | Medium | Calibrate softness anchor via region metrics, not pixel diffs (established policy) |
| Static invalidation misses moving casters | Low | Document static as "author promises static region"; dynamic exists |

## Appendix: Accumulative soft shadows (deferred)

Drei's `AccumulativeShadows` (jittered light + ping-pong averaging) is an
excellent menu/photo-mode upgrade but requires many frames of convergence and
temporarily rewires scene lights. Defer until a shipped-game menu or photo
mode needs it; if adopted, implement with render layers and a scoped state
manager, never Drei's material/light swapping approach.
