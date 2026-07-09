# Rendering Status

Rendering is driven by authored IR values and adapter-private mappings.
Visual parity work must fix mapping, color space, assets, shaders/materials,
camera, lighting, or test setup rather than hand-tuning adapters to screenshots.

Current support:

- Mesh/material/light/camera/source document validation and compiler lowering.
- Render-look profiles, screenshot proof, color parity, lighting tone, and
  visual performance gates.
- `tn look list` and `tn look apply <profile>` expose five curated scaffold
  look presets that write only portable `balanced` render-look overrides and
  material source mutations.
- Visual-quality analysis now scores color bucket diversity and local contrast
  so flat one-color primitive captures are distinguishable from styled
  scaffold captures in focused tests.
- The promoted `cinematic` render-look default now maps filmic tone/bloom,
  shadow quality, and a richer fallback sky in web and native runtimes when no
  authored atmosphere overrides it. `balanced` and `stylized` remain selectable
  promoted profiles.
- `pnpm verify:portable-shader-material` records the portable shader fixture,
  web/native binding metadata, native `NativePortableShaderMaterial` assets
  for shader-material mesh entities, deterministic preview PNGs, a contact
  sheet, sample-region metrics, and bundle-local shader texture file checks.
  This is bounded native material mapping plus IR-derived preview evidence;
  full runtime web/Bevy shader screenshots and pixel-region parity remain
  unpromoted.

- PRD-007 committed visual evidence is indexed at
  [prd-007-beautiful-scaffolds](../../pr-evidence/prd-007-beautiful-scaffolds/README.md),
  with raw generated report references under
  `tools/verify/artifacts/render-look/`.
- Web Three.js is the primary runtime adapter; Bevy native parity is tracked
  separately.

Verification:

- `node --test packages/cli/dist/commands/look.test.js packages/cli/dist/verify/renderingQuality.test.js`
- `pnpm verify:parity:smoke`
- `pnpm verify:conformance`
- `pnpm verify:default-look`
- `pnpm verify:release`
- `pnpm verify:portable-shader-material`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
