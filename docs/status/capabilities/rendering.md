# Rendering Status

Rendering is driven by authored IR values and adapter-private mappings.
Visual parity work must fix mapping, color space, assets, shaders/materials,
camera, lighting, or test setup rather than hand-tuning adapters to screenshots.

Current support:

- Mesh/material/light/camera/source document validation and compiler lowering.
- Render-look profiles, screenshot proof, color parity, lighting tone, and
  visual performance gates.
- Web Three.js is the primary runtime adapter; Bevy native parity is tracked
  separately.

Verification:

- `pnpm verify:parity:smoke`
- `pnpm verify:conformance`
- `pnpm verify:release`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
