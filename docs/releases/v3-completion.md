# V3 Completion Checklist

V3 is complete only when the forest environment proof is honest, reproducible,
and release-gated by `pnpm verify:v3`.

## Required Before V3 Is Done

- [ ] Web scene renders a dense forest from real bundled assets.
- [ ] Bevy loads the same bundle-local glTF scene instances.
- [ ] Bookmarked web screenshots are nonblank and compositionally valid.
- [ ] Bookmarked Bevy screenshots are captured.
- [ ] Lighting, atmosphere, camera, scale, and rotation differences are
  documented.
- [ ] Real instancing or batching replaces placeholder-only groups where V3
  budgets require it.
- [ ] Performance report includes draw, instance, triangle, load, and frame
  metrics.
- [ ] First-person web walkthrough passes.
- [ ] Native first-person smoke behavior is documented honestly.
- [ ] Walkability and blocking probes pass.
- [ ] Coordinate, color, rotation, handedness, and imported scale conventions
  are documented.

## Explicitly Not Required For V3

- gameplay ECS host
- native QuickJS script execution
- portable UI runtime
- mobile packaging
- general physics engine
- custom shaders
- editor tooling
- full Three.js, R3F, or Drei compatibility
- pixel-perfect Three.js/Bevy rendering parity

## Required Evidence

- `artifacts/v3/verification-report.json`
- `artifacts/v3/v3-environment-report.json`
- `artifacts/v3/v3-scene-report.json`
- `artifacts/v3/v3-atmosphere-report.json`
- `artifacts/v3/v3-first-person-report.json`
- `artifacts/v3/v3-walkability-report.json`
- `artifacts/v3/screenshots/threejs-bevy-side-by-side.png`
