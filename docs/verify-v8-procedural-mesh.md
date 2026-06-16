# V8 Procedural Mesh Verification

Run the focused V8 procedural mesh gate from the repo root:

```bash
node scripts/verify-v8-procedural-mesh.mjs --json
```

The script builds the CLI, builds `examples/v8-procedural-mesh`, validates the
emitted bundle, captures the same active-camera view in the web Three.js
runtime and native Bevy runtime, and compares the images.

Artifacts are written to:

- `artifacts/v8/procedural-mesh/web.png`
- `artifacts/v8/procedural-mesh/bevy.png`
- `artifacts/v8/procedural-mesh/contact-sheet.png`
- `artifacts/v8/procedural-mesh/diff.png`
- `artifacts/v8/procedural-mesh/procedural-mesh-report.json`
- `artifacts/v8/procedural-mesh/verification-report.json`

The current fixture is a single generated pine tree authored with `pineTree()`.
It is one static custom mesh with vertex colors for the brown trunk and green
foliage tiers, emitted as bundle-local binary mesh payloads.

The verifier fails when:

- either screenshot is blank or near blank
- silhouette overlap is below `0.98`
- visible-surface average color delta is above `0.03`

`procedural-mesh-report.json` records the renderer paths, bundle hash, mesh
hash, mesh ID, vertex count, index count, bounds, topology, material color, and
image metrics. This gate proves static mesh asset parity for the authored prop;
it does not promote runtime deformation, CSG, chunk streaming, or shader-driven
procedural geometry.
