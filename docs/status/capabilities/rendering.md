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
- Reusable visual metric bundles now back the rendering-quality and
  rendering-lights fixture region checks. The focused reports still write
  compact metrics, diffs, and contact sheets, while region thresholds remain
  fixture-specific parity evidence rather than pixel-perfect release policy.
- The promoted `cinematic` render-look default now maps filmic tone/bloom,
  shadow quality, and a richer fallback sky in web and native runtimes when no
  authored atmosphere overrides it. `balanced` and `stylized` remain selectable
  promoted profiles.
- Runtime renderer config now accepts portable `ambientOcclusion`,
  `depthOfField`, `screenSpaceReflections`, `motionBlur`, and
  `screenSpaceGlobalIllumination` fields with bounded source/IR validation.
  Compiler manifests derive matching renderer capability requirements, and web
  and Bevy conformance reports preserve requested/applied feature state and emit
  `TN_RENDER_FEATURE_FALLBACK` rollout-gap diagnostics until each adapter has
  real rendered proof; these fields are not release support claims yet.
- The web Three.js adapter applies portable `renderer.ambientOcclusion` through
  the existing adapter-private SSAO composer path, and the Bevy adapter maps the
  same field to Bevy `ScreenSpaceAmbientOcclusionSettings` plus depth/normal
  prepass camera components. Both runtimes report AO as applied, but
  cross-runtime AO screenshot proof is isolated to the
  `photoreal-ao-corner-test` fixture before broader photoreal release claims.
- Portable `renderer.depthOfField` now maps to web Three.js `BokehPass` and
  Bevy `DepthOfFieldSettings`, and both runtimes report the feature through the
  shared requested/applied feature-report shape. Focused screenshot proof is
  covered by the `photoreal-dof-depth-test` fixture before broader photoreal
  release claims.
- Portable `renderer.motionBlur` maps to web Three.js temporal accumulation and
  Bevy's native `MotionBlurBundle` with depth and motion-vector prepasses. Both
  runtimes report the feature as `baseline` when enabled, and the
  `photoreal-motion-blur-moving-test` fixture captures a scripted moving marker
  with bounded web/Bevy screenshot regions before broader release claims.
- Portable `renderer.screenSpaceReflections` now maps to a web planar
  screen-space baseline pass and Bevy native screen-space reflections with
  deferred opaque rendering. Both runtimes report the feature as `baseline`
  when enabled, and the `photoreal-reflective-wet-floor` fixture captures a
  wet-floor reflection scene with bounded web/Bevy screenshot regions before
  broader SSR/SSGI release claims.
- `pnpm verify:rendering-photoreal` captures the
  `photoreal-lighting-units-probe`, `photoreal-ao-corner-test`, and
  `photoreal-bloom-emissive-test`, `photoreal-dof-depth-test`, and
  `photoreal-motion-blur-moving-test`, and
  `photoreal-reflective-wet-floor` web and Bevy screenshots, runtime feature
  reports, metrics, region comparisons, and contact sheet under
  `tools/verify/artifacts/rendering-photoreal/`.
- `tn runtime set-rendering`, MCP registry metadata, and editor inspector rows
  can mutate those portable renderer feature fields without hand-editing
  generated bundles.
- `pnpm verify:portable-shader-material` now records the portable shader
  fixture, web/native binding metadata, native `NativePortableShaderMaterial`
  assets for shader-material mesh entities, runtime web and Bevy PNG captures,
  a diff image, a contact sheet, and sample-region metrics for bounded color,
  texture, alpha, time/emissive, and vertex-displacement cases. This promotes
  portable shader material v1 only for the constrained `threenative-shader-v1`
  contract; raw GLSL/WGSL snippets, shader defs, storage buffers, bindless
  resources, custom render phases, backend handles, postprocess chains, and
  physically based custom-shader lighting parity remain explicit deferrals.
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
- `pnpm verify:portable-shader-material`
- `pnpm verify:rendering-photoreal`
- `pnpm verify:release`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
