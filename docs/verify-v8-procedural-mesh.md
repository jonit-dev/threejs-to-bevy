# V8 Procedural Mesh Verification

Run the focused V8 procedural mesh gate from the repo root:

```bash
node scripts/verify-v8-procedural-mesh.mjs --json
```

The script builds the CLI, uses the shared procedural mesh conformance fixture,
captures the same active-camera view in the web Three.js runtime and native
Bevy runtime, compares the images, and runs matching structured physics traces
for the fixture's derived colliders.

Artifacts are written to:

- `tools/verify/artifacts/procedural-mesh/web.png`
- `tools/verify/artifacts/procedural-mesh/bevy.png`
- `tools/verify/artifacts/procedural-mesh/contact-sheet.png`
- `tools/verify/artifacts/procedural-mesh/diff.png`
- `tools/verify/artifacts/procedural-mesh/procedural-mesh-report.json`
- `tools/verify/artifacts/procedural-mesh/physics-web.json`
- `tools/verify/artifacts/procedural-mesh/physics-native-rigid.json`
- `tools/verify/artifacts/procedural-mesh/physics-native-character.json`
- `tools/verify/artifacts/procedural-mesh/physics-report.json`
- `tools/verify/artifacts/procedural-mesh/verification-report.json`

The fixture is generated from the SDK helper registry's visual enrollments:
`pineTree`, the coherent-noise `bush`, and the author-time CSG `arch`. All three
are static custom meshes emitted as bundle-local binary payloads. The bush and
arch additionally carry compiler-owned derived collider components; collider
hints remain SDK authoring metadata and are not copied into asset IR.
Invisible proof actors exercise those colliders: a capsule must remain grounded
on the CSG arch and a dynamic box must contact and settle on the bush in both
runtime traces.

The verifier fails when:

- either screenshot is blank or near blank
- silhouette overlap is below `0.98`
- visible-surface average color delta is above `0.03`
- a registry-enrolled visual helper is absent from the fixture

`procedural-mesh-report.json` records the renderer paths, bundle hash, mesh
hash, every enrolled helper and mesh ID, binary-aware vertex/index counts,
bounds, topology, material colors, and image metrics. This gate proves static
output parity for author-time CSG and noise operations; it does not promote
runtime CSG, runtime deformation, generated-mesh LOD integration, chunk
streaming, or shader-driven procedural geometry. Generated-mesh LOD remains
tracked by [the completed follow-up contract PRD](PRDs/done/procedural-generated-mesh-lod-contract-2026-07-14.md).

No fresh web/native capture is implied by fixture or unit-test updates alone;
run the focused command above before making a current visual-parity claim.
