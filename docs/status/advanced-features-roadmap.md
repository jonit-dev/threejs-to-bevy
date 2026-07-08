# Advanced Features Roadmap

This roadmap tracks renderer and procedural-world capabilities that are beyond
the current promoted ThreeNative surface. It is a planning document, not an
implementation status page. Current support remains defined by
[STATUS.md](STATUS.md), [bevy-feature-parity.md](bevy-feature-parity.md), and
[feature-maturity.md](feature-maturity.md).

## Reference Target

The motivating reference is
[Braffolk/fable5-world-demo](https://github.com/Braffolk/fable5-world-demo), a
procedural open-world demo built on Three.js WebGPU, TSL node materials, custom
compute passes, GPU-driven vegetation, volumetric atmosphere, water, particles,
and a custom post-processing stack.

The goal is not to clone that codebase or promise arbitrary Three.js/WebGPU
compatibility. The goal is to identify which portable ThreeNative contracts
would be needed to recreate scenes in that class while still respecting the
SDK -> IR bundle -> web Three.js runtime -> native Bevy runtime boundary.

## Capability Tiers

### Tier 0: Current Portable Foundation

Use the existing promoted ThreeNative surface:

- TypeScript scene/game authoring.
- ECS declarations and portable scripts.
- Standard transforms, cameras, lights, generated meshes, glTF assets, material
  texture slots, runtime config, UI, input, audio, and bounded physics traces.
- Web Three.js and native Bevy runtime observations where support is claimed.

This tier can produce small game scenes and simple stylized environments. It
cannot faithfully recreate a LAAS-class procedural renderer.

### Tier 1: Procedural Scene Approximation

Support a recognizable approximation without custom GPU pipelines:

- CPU-authored or compile-time generated heightfield meshes.
- Static procedural props through `MeshBuilder`.
- Repeated vegetation using runtime instancing where available.
- Authored terrain, water, and vegetation materials using promoted standard
  material fields.
- First-person/fly camera helpers and bookmarks.
- Fog, sky color, bloom, shadows, and fixed performance budgets.

Promotion rule: features in this tier should stay portable and should fail with
diagnostics when the authored content exceeds current runtime limits.

### Tier 2: Credible Open-World Runtime

Add engine features needed for large, explorable worlds without exposing raw
renderer internals:

- Heightfield asset and terrain-tile IR.
- Terrain LOD or chunk streaming with deterministic runtime selection traces.
- Terrain CPU sampling for camera grounding, spawn placement, and physics
  probes.
- Vegetation scatter maps, placement seeds, LOD groups, impostor metadata, and
  crossfade ranges.
- Renderer-level web/native instancing and batching parity.
- Wind fields for vegetation and particles.
- Water-surface primitives with depth/wet-margin metadata.
- Better native visual parity for fog, sky, shadows, bloom, and color.
- Profiling reports for terrain tiles, visible instances, draw calls,
  triangles, GPU/CPU frame cost, and bundle size.

Promotion rule: each capability needs SDK/IR validation, web runtime behavior,
Bevy runtime behavior or explicit unsupported diagnostics, conformance evidence,
and visual/performance artifacts.

### Tier 3: Advanced Renderer And GPU Pipeline

Expose a constrained advanced-rendering contract for LAAS-class scenes:

- Portable GPU compute declarations.
- Storage buffers, storage textures, uniforms, dispatch ordering, and readback
  rules.
- Custom material/shader modules with validated inputs and declared backend
  capabilities.
- Custom render graph or post-processing pass declarations.
- Multiple render targets for depth, normal, velocity, color, and effect
  buffers.
- GPU culling, compaction, indirect draws, and per-camera/per-shadow-pass
  visibility lists.
- Volumetric atmosphere, clouds, froxel fog, and aerial perspective.
- Terrain-relative GI, probes, environment maps, cloud shadows, and advanced
  shadow filtering.
- Screen-space effects such as GTAO, temporal antialiasing, reflections,
  auto-exposure, color grading, and custom bloom chains.
- GPU-simulated particles with renderer-visible simulation buffers.

Promotion rule: this tier should start experimental and capability-gated. A
feature should not become portable until both web and Bevy adapters can execute
the same IR-level contract or produce stable, actionable diagnostics.

## Feature Tracks

### Terrain And Heightfields

- Define a heightfield asset contract with resolution, world scale, bounds,
  sampling mode, and optional CPU mirror. Initial structured JSON heightmap
  asset, terrain heightmap reference, splat-layer, and target cell-budget
  validation is in place; chunk emission and runtime sampling are still open.
- Add terrain tile/chunk metadata for LOD, skirts, morph bands, and far shells.
- Add deterministic terrain generation metadata for seeds, noise parameters,
  erosion passes, hydrology, biome maps, and snow/rock/vegetation masks.
- Keep generated terrain artifacts structured and inspectable in emitted
  bundles.

### GPU Compute And Storage Resources

- Add IR for buffers, textures, compute kernels, dispatch sizes, resource
  bindings, and pass dependencies.
- Require explicit limits and diagnostics for backend capability mismatches.
- Support readback only where declared, bounded, and deterministic enough for
  tests and gameplay probes.
- Keep renderer-private implementation details out of authoring code.

### Custom Materials And Shaders

- Start with constrained extension points before broad shader graphs.
- Declare material inputs, texture slots, vertex attributes, uniform blocks,
  generated code targets, and fallback policy.
- Separate portable shader modules from adapter-specific shader modules.
- Reject unsupported shader features before runtime.

### Render Graph And Post-Processing

- Define passes in terms of named inputs, outputs, formats, resolution scale,
  clear/load behavior, camera binding, and ordering.
- Promote narrow effects first: depth/normal prepass, SSAO/GTAO, TAA, bloom
  variants, exposure, color grading, and depth-based fog.
- Keep screenshots, pass timings, and nonblank output checks in the release
  evidence loop.

### GPU-Driven Instances And LOD

- Promote real renderer instancing across web and Bevy.
- Add LOD group semantics for distance bands, hysteresis, dithering, and
  impostor fallback.
- Add GPU culling and indirect draw support only after the non-GPU LOD contract
  is stable.
- Report visible instance counts, culled counts, active LOD rings, and draw
  groups.

### Atmosphere, Clouds, Water, And Particles

- Treat each as a first-class feature track instead of ad hoc shader code.
- Start with authored metadata and runtime observations.
- Promote visual behavior only when web/native output can be compared.
- Keep expensive effects tied to quality presets and performance budgets.

### Tooling And Verification

- Add capability reports for renderer limits and unsupported advanced features.
- Add visual verification scenes for each promoted slice.
- Track CPU/GPU timing, draw counts, triangle counts, instance counts, texture
  memory, and package size.
- Preserve fail-loud diagnostics for unsupported advanced features.

## Bevy Feasibility

Bevy is a plausible native substrate for most of this roadmap because it sits on
`wgpu` and supports custom render pipelines, WGSL shaders, render graph work,
compute-style GPU workloads, PBR materials, shadows, cameras, post-processing
features, ECS scheduling, and asset integration.

The constraint is not whether Bevy can host advanced rendering code. The
constraint is whether ThreeNative can expose a stable TypeScript and IR contract
that maps cleanly to both Three.js/WebGPU and Bevy/WGPU.

High-risk portability areas:

- Three.js TSL/WebGPU and Bevy WGSL are different authoring surfaces.
- Render graph and post-processing APIs differ significantly between adapters.
- GPU resource lifetime, binding layout, dispatch ordering, and readback rules
  need a shared model.
- GPU culling, indirect draws, and custom shadow-pass visibility require deeper
  native renderer integration than current ThreeNative instancing observations.
- Volumetrics, water, GI, and advanced screen-space effects are custom renderer
  systems, not simple built-in Bevy toggles.

The practical policy is: Bevy can support these features as the native backend,
but ThreeNative should claim them only after they are expressed as validated
portable contracts with web and native evidence.

## Non-Goals

- Arbitrary Three.js compatibility.
- Direct Bevy authoring as a public user workflow.
- Raw renderer access from portable gameplay scripts.
- Backend-specific shader snippets silently ignored by the other adapter.
- Open-ended plugin/native extension APIs before the core portable contract is
  stable.

## Suggested Sequencing

1. Promote terrain/heightfield assets and CPU sampling.
2. Promote renderer-level instancing and LOD groups.
3. Add terrain chunk/LOD runtime behavior and dense-world performance reports.
4. Add constrained custom material extension points.
5. Add narrow post-processing graph support.
6. Add portable GPU compute resources.
7. Add GPU culling, indirect draws, and advanced vegetation.
8. Add atmosphere/cloud/water/particle systems as separate gated tracks.
9. Promote GI, advanced shadows, temporal effects, and renderer-specific
   optimizations only after the lower-level contracts are stable.
