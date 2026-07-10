# Lumen-lite Lighting Milestone (2026-07-09)

Goal: make ThreeNative's default lighting read like a modern "Lumen-class"
renderer — stable sun shadows, grounded objects, dynamic indirect light,
shadowed light shafts, and atmospheric depth — while keeping every knob
portable. Users author IR/TypeScript settings once; the web Three.js adapter
and the Bevy native adapter each map them adapter-privately.

This milestone is user-directed cross-runtime work. The 2026-07-07 native
parity freeze (`docs/runtime/native-path.md`) requires Bevy work to be
justified by an explicit request or focused proof gap; this request explicitly
names Bevy parity, and every PRD below defines its own focused parity gate
rather than reopening broad checklist promotion.

## Ground truth constraints

- The web runtime uses `THREE.WebGLRenderer`
  (`packages/runtime-web-three/src/render.ts`). WebGPU/TSL techniques
  (official `SSGINode`, `three-mesh-bvh` `BVHComputeData`) are future-tier
  references only; every promoted technique here must run on WebGL.
- Bevy is pinned to `=0.14.2`
  (`runtime-bevy/crates/threenative_runtime/Cargo.toml`). Bevy 0.14 natively
  ships cascaded shadow maps, SSAO, SSR (deferred), volumetric fog +
  volumetric ("god ray") directional lights, light probes, and irradiance
  volumes. It does not ship SSGI or contact shadows.
- Portable renderer feature fields already exist with the
  requested/applied/fallback conformance-report pattern
  (`packages/ir/src/runtimeConfig.ts`, `packages/ir/src/conformanceReport.ts`,
  `TN_RENDER_FEATURE_FALLBACK`). New lighting features must reuse that
  pattern, enroll in `packages/compiler/src/emit/capabilities.ts`, and gate
  through `tools/verify` fixtures — no new hand-maintained adapter lists.

## PRD index (implementation order)

| PRD | Feature | Web technique | Bevy technique |
|-----|---------|---------------|----------------|
| [PRD-001](../done/lumen-lite-lighting-2026-07-09/PRD-001-portable-cascaded-shadow-stability.md) | Cascaded sun-shadow stability (done) | `three-csm` split/frustum/texel-snap math, adapter-owned | `CascadeShadowConfigBuilder` mapping |
| [PRD-002](PRD-002-contact-shadows-grounding.md) | Contact shadows (object grounding) | Drei `ContactShadows` port | Ortho depth capture + separable blur + composite plane |
| [PRD-003](PRD-003-volumetric-godrays-height-fog.md) | Shadowed god rays + height fog | `three-good-godrays` + `three-volumetric-pass` ports | Native `VolumetricFogSettings` + `VolumetricLight` |
| [PRD-004](PRD-004-ssgi-promotion.md) | SSGI promotion (dynamic indirect diffuse) | `realism-effects` SSGI algorithms, adapter-owned WebGL pass | Bounded approximation (SSAO + calibrated ambient/irradiance term) with honest reporting |
| [PRD-005](PRD-005-scene-ray-query-and-baked-gi.md) | Scene ray queries + baked GI probes (off-screen light foundation) | `three-mesh-bvh` CPU queries; compiler-side baking | Irradiance volumes / light-probe consumption; parry ray queries |

## Rendering tiers this milestone targets

```text
Low (mobile-web)      shadow quality low, contact shadows off, fog only
Medium (default web)  CSM stabilized, contact shadows, height fog, AO
High (desktop targets) + god rays, SSGI (web) / SSGI approximation (native),
                        baked probes
Future (WebGPU tier)  official SSGINode, BVHComputeData GPU tracing,
                        surfel world-space cache (R&D only, see PRD-005
                        appendix)
```

## License ledger for harvested code

| Source | License | Usage rule |
|--------|---------|------------|
| `StrandedKitty/three-csm` | MIT | Port math only; never the global `ShaderChunk` mutation |
| Drei (`pmndrs/drei`) contact/accumulative shadows | MIT | Port technique; replace material-swap hack with scoped state |
| `Ameobea/three-good-godrays` | Custom permissive | Preserve notice, mark altered versions |
| `Ameobea/three-volumetric-pass` | Check at vendor time | Same author; verify before vendoring |
| `0beqz/realism-effects` | MIT | Borrow shaders/reprojection; rewrite pass lifecycle |
| `gkjohnson/three-mesh-bvh` | MIT | Wrap behind adapter-private interface; API marked unstable |
| `jure/webgiya` | MIT | Concepts/resolver weighting only; not its scene BVH |
| `CodyJasonBennett/three-rc` | All rights reserved | READ ONLY — never copy code |

Finished PRDs move to `docs/PRDs/done/` per repo rules. Each PRD's
acceptance criteria include the mandatory
`docs/status/capabilities/rendering.md`, `docs/STATUS.md`, and
`docs/bevy-feature-parity.md` updates.
