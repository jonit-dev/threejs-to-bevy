# Rendering Status

Rendering is driven by authored IR values and adapter-private mappings.
Visual parity work must fix mapping, color space, assets, shaders/materials,
camera, lighting, or test setup rather than hand-tuning adapters to screenshots.

Current support:

- Web material IR accepts `kind: "unlit"` with color and base-color texture
  mapping to `THREE.MeshBasicMaterial`. Native builds fail early with
  `TN_BEVY_MATERIAL_UNLIT_UNSUPPORTED` until the freeze-gated Bevy boundary is
  promoted.
- `tn iterate --json` reports the resolved `activeRenderProfile`. When material
  or texture source changed since the previous iterate and the profile is not
  `parity`, advisory diagnostic `TN_RENDER_PROFILE_GRADING_ACTIVE` names the
  profile and the command that restores parity grading.
- Mesh/material/light/camera/source document validation and compiler lowering.
- Procedural Geometry V2 expands static `MeshBuilder` authoring with torus,
  segmented plane, prism, rounded box, seeded coherent noise, weld, midpoint
  subdivision, mirror, and deterministic BSP union/subtract/intersect. The
  compiler still emits ordinary generated custom-mesh payloads, and optional
  box/mesh collider hints lower to existing Collider components without
  overriding explicit physics. Registry-derived conformance now covers pine,
  coherent-noise bush, and CSG arch payloads. Runtime CSG remains unsupported,
  and generated-mesh LOD selection remains deferred to
  `docs/PRDs/procedural-generated-mesh-lod-contract-2026-07-14.md`. The focused
  web/native gate promotes the compile-time CSG output with `0.9987` silhouette
  overlap and `0.0106` visible-surface color delta. Its structured physics
  traces also prove a capsule grounded on the CSG arch mesh collider and a
  dropped body resting on the bush's generated box collider in both adapters.
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
- `SHARED_RESIDUAL_CONTRACT_ROWS` owns promoted, diagnostic-only, and watchlist
  classifications for geometry, materials, rendering, and primary-window
  policy. Material and renderer validators resolve stable unsupported codes
  through that registry, and
  `pnpm verify:focused verify:rendering-residuals` records the classified rows
  with web/native residual evidence.
- The promoted `cinematic` render-look default now maps filmic tone/bloom,
  shadow quality, and a richer fallback sky in web and native runtimes when no
  authored atmosphere overrides it. `balanced` and `stylized` remain selectable
  promoted profiles.
- Portable shadow quality now resolves to the same bounded profile report in
  both adapters: low uses a 512 map/basic filter/one cascade, medium uses
  1024/PCF/two cascades, and high uses 2048/soft PCF/four cascades. Web applies
  the filter/map settings to shadow-casting lights, while Bevy applies the map
  resource and camera filtering method.
- Authored atmosphere shadows now add a portable cascade profile with bounded
  maximum distance, uniform/logarithmic/practical splits, practical-split
  lambda, overlap blending, and stabilization intent. Web owns adapter-private
  cascade lights, composes cascade selection into supported materials without
  global `ShaderChunk` mutation, and snaps full light transforms to shadow-map
  texels after camera updates. Bevy maps the same profile through
  `CascadeShadowConfigBuilder`; exact two-cascade and logarithmic layouts report
  `exact`, while Bevy 0.14's exponentially spaced intermediate bounds are
  reported as `first-split-exponential-approximation` when a larger
  uniform/practical layout cannot be represented exactly. The catalog-owned
  `pnpm verify:focused verify:shadow-cascade-stability` gate compares the shared
  requested/applied report and records real controller matrix plus paired
  web/native capture evidence.
- Authored scene entities can carry portable `ContactShadows` settings for
  planar object grounding: bounded size, capture height, resolution, softness,
  opacity, and static/dynamic update mode. Web owns an isolated depth-capture,
  separable-blur, and alpha-composite pipeline without mutating user materials;
  Bevy owns adapter-private orthographic capture proxies, render targets, blur
  passes, and a composite plane. Static regions settle to zero steady-state
  capture work, dynamic low-tier regions clamp to 256 pixels, and adapter-owned
  cameras, proxies, materials, meshes, and textures are excluded from authored
  scene identity and released on rebuild. The catalog-owned
  `pnpm verify:focused verify:contact-shadows` gate checks portable report
  parity, monotonic localized darkening, bounded static cost, and paired
  nonblank web/native screenshots. The 2026-07-11 hero-room recompare kept
  the four portable contact-shadow reports aligned; the aggregate fixture still
  exposes the pre-existing ACES ground-luminance calibration drift separately
  from its normalized local shadow response.
- `pnpm verify:focused verify:feature-parity-visual-polish` composes calibrated
  lighting, material, and dense-content web/Bevy screenshots with paired
  shadow and promoted specular-material conformance reports. It also writes a
  measured impostor texture-variant report under
  `tools/verify/artifacts/feature-parity-visual-polish/`. Custom GPU
  attributes, advanced blends beyond the promoted material contract, and
  arbitrary custom render paths remain diagnostic-only;
  bounded SSR support is described below.
- `atmosphere.volumetrics` promotes bounded height fog and directional god
  rays. Web uses a full-resolution depth prepass with half-resolution analytic
  height integration, depth-weighted composite, and a 16/32/64-step
  cascade-aware shadow-map raymarch before bloom and fitted ACES output. The
  web raymarch uses a fixed `g=0.75` Henyey-Greenstein forward-scattering phase
  and couples shaft radiance to the directional sun color/intensity. Native
  keeps Bevy 0.14 `VolumetricFogSettings` and `VolumetricLight` for the
  directional cascade-shadow raymarch, but maps height fog to an independent
  adapter-private HDR post pass using the same exponential base-height and
  falloff integration as web. Native reports that path as
  `analytic-height-post-pass`; the two authored controls no longer thicken one
  shared medium. The catalog-owned
  `pnpm verify:focused verify:volumetrics` gate records requested/applied modes,
  paired screenshots, a tall-column fog gradient, and a lit-shaft versus
  shadow-neighbor region. Web god-ray source retains the upstream notice and is
  plainly marked as an altered adapter-private rewrite.
- The composed `verify:lighting-showcase` gate additionally measures rendered
  shaft/neighbor contrast, floor-adjacent versus ceiling haze, window-halo
  luminance, and bounded cross-target deltas. A feature report alone therefore
  cannot promote an invisible volumetric path. The stricter hero-room gate is
  backed by paired captures. Native shaft radiance compensates for Bevy's
  normalized phase-function convention with one adapter calibration constant;
  no scene-specific target fork is used. The current hero calibration uses
  native base scattering `0.0`, phase asymmetry `0.5`, and a bounded shaft
  light scale of `5.4`; its fresh capture measures a height-haze delta of about
  `1.28` and a shaft-ratio delta of about `0.25`, with the gate ratcheted to a
  `1.35` haze-delta ceiling.
- Runtime renderer config now accepts portable `ambientOcclusion`,
  `depthOfField`, `screenSpaceReflections`, `motionBlur`, and
  `screenSpaceGlobalIllumination` fields with bounded source/IR validation.
  Compiler manifests derive matching renderer capability requirements, and web
  and Bevy conformance reports preserve requested/applied feature state and emit
  `TN_RENDER_FEATURE_FALLBACK` rollout-gap diagnostics until each adapter has
  real rendered proof. AO, depth of field, temporal motion blur, the bounded
  SSR subset below, and SSGI now have focused proof.
- Portable `renderer.screenSpaceGlobalIllumination` accepts low/medium/high
  quality, bounded intensity, and bounded world-space radius through structured
  source, `tn runtime set-rendering`, and editor inspector operations. Web
  applies adapter-owned depth reconstruction, cosine-weighted hemisphere ray
  marching, binary hit refinement, bilateral upsampling, and history-clamped
  temporal reprojection before bloom and tone mapping. Bevy 0.14 now runs an
  adapter-private full-resolution spatial neighborhood gather after SSR and
  before volumetrics, with depth weighting, saturation-preserving colored
  bounce, bounded radiance, a stable per-pixel footprint rotation, and no
  temporal resolve; it reports `appliedMode:
  spatial-neighborhood-no-temporal`. When SSGI is enabled, shadowless
  ceiling- and floor-bounce fills are also applied as bounded native
  approximations for the deferred SH-L0 path's missing hemisphere contribution.
  The catalog-owned
  `pnpm verify:focused verify:ssgi` gate proves monotonic indirect-region lift
  in both adapters, cross-adapter red color bleed, bounded spatial noise,
  requested/applied reports, and paired nonblank screenshots.
  The shared render-look target ladder clamps authored `high` SSGI to the
  half-resolution `medium` tier on `mobile-web`; desktop web retains the
  full-resolution high tier. Temporal SSGI keeps otherwise-static scenes on a
  render schedule so history actually converges, and the focused gate records
  a three-pose camera orbit with bounded displacement, ghosting, boiling, and
  static high-frequency energy rather than relying on a settled still alone.
  Native SSGI-enabled scenes use a calibrated flat-ambient multiplier of
  `0.15`. Its spatial post-pass uses a smooth authored-intensity gain from
  `0.4` to `0.6`, capped at `0.8`, so the low-intensity hero remains subtle
  while the shared medium/high SSGI proof stays monotonic. The native gather
  caps sampled radiance at `0.35` and rotates its fixed twelve-tap footprint
  per pixel to prevent coherent window ghosts. The deferred hero fallback
  uses a calibrated atmosphere L0 baseline of `4.2` per peak coefficient unit,
  a `0.6` ceiling-bounce illuminance approximation, and a lower `0.25`
  floor-bounce approximation. An SSGI-off
  hero control changed surface-detail energy on both adapters but preserved
  the roughly `0.35` native/web ratio, so the remaining web high-frequency
  response is not treated as portable detail or as SSGI noise; the showcase
  gate tightens only its upper detail-ratio bound to `2.0`.
- Portable baked GI probes now carry deterministic SH2 payloads (nine RGB
  coefficients), bake version, and canonical scene-content hash in durable
  `content/lighting/*.probes.json`. `tn bake gi` uses an internal
  `three-mesh-bvh` scene-ray wrapper over static shadow-casting generated mesh
  geometry, traces seeded sky/sun plus one albedo bounce, writes the payload,
  and rebuilds to embed it. Geometry, materials, world, atmosphere, and probe
  metadata participate in stale detection; mismatched document/payload hashes
  emit `TN_IR_LIGHT_PROBE_BAKE_STALE`. Web blends bounded SH2 probes by camera
  position through Three.js `LightProbe` and reports `camera-weighted-sh2`.
  Native forward rendering evaluates those coefficients into filterable,
  bounded Bevy ambient-cube textures and reports `irradiance-volume-sh2`.
  Bevy 0.14's deferred lighting specialization enables the irradiance call
  without defining its shader function, so SSR/deferred scenes avoid that
  broken backend path and honestly report
  `deferred-sh-l0-plus-screen-space-gi`: the calibrated atmosphere L0 floor
  composes with the native spatial SSGI pass. The catalog-owned
  `pnpm verify:focused verify:baked-gi` gate compares disabled/authored alcove
  captures, requires warm lift in both adapters, rejects broad clipping and
  excessive native lift, checks the honest modes, and proves the stale
  diagnostic. Native startup now neutralizes Bevy's implicit ambient-light
  default before applying authored contributions; the forward volume intensity
  and deferred atmosphere baseline are adapter calibration constants rather
  than per-scene forks. The deferred hero fallback uses a calibrated atmosphere
  L0 baseline of `4.2` per peak coefficient unit.
- The promoted visual-calibration matrix defines authored bloom intensity 1.0
  as a real-runtime emissive anchor with core, inner-halo, and outer-halo
  luminance/falloff regions. Its color fixture samples a neutral
  black-to-mid-gray-to-white ramp through both output chains. Native and web
  now share the 1.2 fitted-ACES exposure anchor; these focused fixtures guard
  the bloom and tone-chain calibration independently of the hero scene.
- `examples/lumen-lite-showcase` composes the promoted lighting stack in one
  enclosed hero interior: framed windows, stabilized cascades, contact shadows,
  high-quality SSGI, baked warm bounce, bloom, height fog, god rays, rough
  materials, wet patches, doorway depth, and grounded props. The catalog-owned
  `pnpm verify:focused verify:lighting-showcase` gate builds the durable source,
  captures deterministic 1280x720 web/native frames, emits a contact sheet and
  adapter reports, rejects clipping/crushed blacks/exposure drift, and requires
  every composed feature to be applied or honestly approximation-reported.
  The gate captures the freshly built example bundle rather than a stale
  conformance copy; this prevents adapter-proof placeholder meshes from
  entering visual evidence. Its 2026-07-11 parity pass also bounds web SSR ray
  thickness for centimeter-scale wet patches, aligns native SSGI intensity and
  flat-ambient suppression, softens the authored native bloom threshold, and
  broadens native volumetric scattering. The showcase intentionally authors
  flat portable PBR materials on both adapters; the web-only 8x8 detail-texture
  path remains scoped to `StylizedNature` and is not claimed by this scene.
  The fresh 2026-07-11 evidence is a `1.02` mean-luminance ratio, `0.095`
  shadow-fraction delta, `0.11` height-haze gradient delta, `0.12`
  shaft-ratio delta, and `0.60` surface-detail ratio; floor-haze luminance is
  `0.097` native versus `0.098` web, the spatial ceiling ratio is `1.03`, and
  the right-room ratio is `1.42`. The gate now holds luminance to `0.80..1.25`,
  haze to `1.35`, detail to `0.3..2.0`, ceiling to `0.75..1.35`, and right-room
  to `0.65..1.45`.
- The internal `SceneRayQuery` boundary now has BVH-backed tooling queries and
  a native Rapier/parry `TriMesh` query built from the same rendered generated
  mesh data, independently of authored Collider components. Native playtest
  `assert.occluded` commands use this private service and record
  `render.sceneRayQuery` evidence; the scripting API remains unchanged.
- The web Three.js adapter applies portable `renderer.ambientOcclusion` through
  the adapter-private GTAO composer path with a visible monotonic intensity
  mapping. Bevy 0.14 exposes quality but no direct SSAO radius/intensity knobs,
  so the native adapter maps quality directly and applies a bounded ambient
  term approximation around the calibrated intensity anchor. The
  `photoreal-ao-corner-test` plus low/high AO sweep fixtures gate cross-adapter
  regions and require each adapter's contact corner to darken monotonically.
- Portable `renderer.depthOfField` now maps to web Three.js `BokehPass` and
  Bevy Bokeh-mode `DepthOfFieldSettings`, and both runtimes report the feature
  through the shared requested/applied feature-report shape. Focused screenshot
  proof includes the foreground highlight in `photoreal-dof-depth-test`.
- Composer output now uses the same fitted ACES transform as Bevy, applies
  authored exposure and saturation one-to-one, and performs the final sRGB
  transfer once. ACES- and exposure-only configurations also select this output
  pass, so authored camera clear colors follow the same tonemapping path instead
  of bypassing grading on direct-render configurations.
- Contact-shadow exposure calibration now selects the native EV mapping from
  the resolved tone-mapping mode and gates shadow contrast relative to ground
  luminance. The final milestone-wide color pass keeps the default native
  camera at neutral EV100, maps authored ACES and linear exposure with fitted
  scales of `1.7` and `1.0`, applies a `1.08` native saturation fit and a `1.3`
  HDR contrast conversion, and maps portable bloom intensity by `0.1`. The full
  `pnpm verify:rendering-photoreal` matrix is green with those renderer-level
  mappings. Contact-shadow opacity remains independently owned and unchanged.
- Web bloom uses a calibrated wide mip radius and soft threshold. When bloom is
  enabled, adapter-private weak point-light proxies are derived from strong
  `emissiveBloom` materials to approximate the local spill Bevy's bloom path
  produces; callers can disable this fallback through render options. Pedestal
  and wall-gradient regions bound that behavior in the bloom fixture.
- Portable `renderer.motionBlur` maps to short-history temporal accumulation in
  both adapters with the same `clamp(shutterAngle * 0.3, 0, 0.25)` previous-frame
  weight. The native pass owns two persistent GPU history textures per active
  view, swaps them once per rendered frame, resets on first use or resize, and
  releases histories for inactive views. Both runtimes report the feature as
  `baseline` with applied mode `temporal-accumulation`, and the
  `photoreal-motion-blur-moving-test` fixture captures a continuously moving,
  high-contrast patterned marker against a deterministic fixed-step native
  capture clock. Durable web/native traces prove aligned frames 118-120 and a
  nonzero frame-120 transform delta. Paired exterior strips require a visible
  trailing-versus-leading luminance difference, so a sharp silhouette fails
  even when broad cross-runtime regions still match.
- Portable `renderer.screenSpaceReflections` now maps to Three.js's depth- and
  normal-aware `SSRPass`, with reflective-object selection derived from the
  authored roughness limit, while Bevy uses native screen-space reflections
  with deferred opaque rendering and a native thin-surface depth thickness of
  `0.02`, matching the web calibration for centimeter-scale wet patches. Bevy
  0.14 requires the global deferred
  material fallback for SSR; a forward-path isolation capture showed that the
  gross wet-scene luminance drift instead came from Bevy's implicit dielectric
  ambient response rather than reflection opacity or the deferred path alone.
  The isolation does not distinguish ambient diffuse from ambient specular; its
  diagnostic captures and linear means are recorded
  under `tools/verify/artifacts/rendering-photoreal/diagnostics/`. The native
  material mapping keeps the standard 4% implicit dielectric F0, converts
  explicit `specularIntensity` into Bevy's squared-reflectance parameter, and
  suppresses the implicit term for SSR-enabled smooth dielectrics. When the
  deferred irradiance limitation prevents a native SSR-selected thin wet patch
  from receiving the web reflection, this mapping is the documented native-only
  dark-damp-patch approximation rather than an exact SSR claim. The motion
  fixture authors its wall response explicitly instead of changing unrelated
  implicit materials. Web SSR opacity is calibrated against the cyan reflection
  region. The fixture also gates cube-face and bare-floor luminance.
- `pnpm verify:rendering-photoreal` captures the
  `photoreal-lighting-units-probe`, `photoreal-ao-corner-test`, low/high AO
  sweep, `photoreal-bloom-emissive-test`, `photoreal-dof-depth-test`,
  `photoreal-motion-blur-moving-test`, and
  `photoreal-reflective-wet-floor` web and Bevy screenshots, runtime feature
  reports, metrics, region comparisons, AO monotonicity, aligned motion traces,
  exterior-trail asymmetry, local effect-variation assertions, and a contact
  sheet under `tools/verify/artifacts/rendering-photoreal/`.
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
- Runtime renderable spawn/despawn and engine-facing component changes now
  reconcile into both live adapters. Web cubemaps resolve all six ordered
  faces, runtime visibility restores in both directions, render layers share a
  validated 32-layer portable limit, and web teardown owns audio, overlays,
  post-processing, render targets, and scene GPU resources.
- Bounded `WorldText` maps to renderer-owned billboards on web and native,
  follows target transforms, supports finite float/fade lifetimes, and remains
  separate from retained accessible UI. Portable camera shake composes after
  camera follow/interpolation and is driven by real elapsed delta.

Verification:

- `node --test packages/cli/dist/commands/look.test.js packages/cli/dist/verify/renderingQuality.test.js`
- `pnpm verify:parity:smoke`
- `pnpm verify:conformance`
- `pnpm verify:default-look`
- `pnpm verify:portable-shader-material`
- `pnpm verify:focused verify:portable-feedback`
- `pnpm verify:rendering-photoreal`
- `pnpm verify:focused verify:rendering-residuals`
- `pnpm verify:focused verify:contact-shadows`
- `pnpm verify:focused verify:feature-parity-visual-polish`
- `pnpm verify:release`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
