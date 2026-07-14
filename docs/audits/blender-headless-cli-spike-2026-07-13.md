# Blender Headless CLI And MCP Spike

Date: 2026-07-13

## Verdict

There is product value in Blender as an **optional, pinned authoring toolchain**
for deterministic, on-demand GLB generation. It should not ship inside the
ThreeNative CLI package, and the third-party BlenderMCP project should not be
the execution engine.

The useful architecture is:

```txt
agent, human, or thin MCP tool
  -> versioned bounded object recipe
  -> tn generator/asset command
  -> explicitly installed, checksum-verified Blender cache
  -> blender --background --factory-startup --python bundled_runner.py
  -> GLB + provenance
  -> existing tn asset inspect/add/build/model-test paths
```

BlenderMCP remains useful as interface research: its scene inspection,
object/material operations, screenshot feedback, and asset-provider tools show
which verbs agents find valuable. Its current implementation is not suitable
for ThreeNative headless execution because it explicitly refuses to start its
socket server when `bpy.app.background` is true, depends on GUI event-loop
timers, and exposes arbitrary Python execution.

The full proposal is
[Optional Headless Blender Asset Generation](../PRDs/other/optional-headless-blender-asset-generation.md).

## Questions Tested

1. Can an official Blender build run without a display and execute Python?
2. Can ThreeNative download Blender only after explicit opt-in, validate it,
   cache it outside the CLI package, and reuse it?
3. Can a bounded structured recipe produce a valid GLB that the existing asset
   pipeline accepts?
4. Does the popular BlenderMCP implementation work in true background mode?
5. Which BlenderMCP ideas are worth preserving without adopting its runtime?

## Primary-Source Findings

- Blender documents `--background`, `--python`, `--python-exit-code`,
  `--disable-autoexec`, and `--` argument separation as supported command-line
  behavior: https://docs.blender.org/manual/en/4.5/advanced/command_line/arguments.html
- Blender's glTF exporter supports binary `.glb`, selected-object export, and
  Y-up conversion:
  https://docs.blender.org/manual/en/4.5/addons/import_export/scene_gltf2.html
- Blender is GPL-licensed. Downloading it on demand rather than redistributing
  it inside the npm package keeps the product boundary clear, but the install
  surface must still disclose source, version, license, URL, size, and hash:
  https://developer.blender.org/docs/license
- BlenderMCP describes a Blender add-on socket server plus a separate MCP
  server, with scene/object/material operations and arbitrary Python execution:
  https://github.com/ahujasid/blender-mcp
- At inspected commit `6e99eb5a442b83766a5796975ec7bb5bfc791341`,
  `BlenderMCPServer.start()` checks `bpy.app.background`, prints that background
  mode cannot execute commands, and returns. It recommends GUI Blender or
  `xvfb-run`: https://github.com/ahujasid/blender-mcp/blob/6e99eb5a442b83766a5796975ec7bb5bfc791341/addon.py#L112-L117
- The same project documents its `execute_blender_code` capability as
  arbitrary Python and warns that it is dangerous in production:
  https://github.com/ahujasid/blender-mcp#limitations--security-considerations

## Executed Proof

The repo-local spike lives under `tools/spikes/blender-headless/` and is
intentionally not wired into the published `tn` surface.

### Runtime acquisition

- Host: Linux x64.
- Blender: 4.5.11 LTS, official Linux x64 archive.
- Archive size: 360.3 MB.
- Expected and observed SHA-256:
  `05ed7bd41bf3e61ae4f4a7cdc364c43088bf8b3fed702c2269c018fdf63a2188`.
- Cache used for the clean proof: `/tmp/tn-blender-tool-cache`.
- A missing `status` check exited non-zero and did not install anything.
- `install` downloaded, verified, extracted to staging, and atomically renamed
  the runtime into the cache.

### Object generation

The example recipe composes three beveled cubes and two PBR materials. The
runner invoked Blender with `--background`, `--factory-startup`,
`--python-exit-code 1`, and a bundled Python entry point. It emitted:

- `/tmp/tn-blender-proof/crate.glb`
- 30,708 bytes
- 3 meshes
- 3 nodes
- 2 materials
- no external texture or buffer dependencies

`tn asset inspect /tmp/tn-blender-proof/crate.glb --json` returned
`TN_ASSET_INSPECT_OK` with no diagnostics. It measured a 2.16 m cube, reported
valid camera/collider calibration, and extracted all three named nodes.

The follow-up turntable build returned `TN_MODEL_TEST_OK`, produced nonblank
captures, and loaded seven visible meshes with no build diagnostics. It also
exposed a separate existing proof limitation: the generated model-test prefab
declares a white fallback color, so its screenshot did not demonstrate the
GLB's authored blue/metal PBR factors even though those factors are present in
the GLB JSON. Full implementation must add an authored-material preservation
assertion before treating model-test screenshots as material evidence.

## Value For ThreeNative

### High-value use cases

- Generate coherent stylized props such as crates, barriers, pickups, signs,
  modular track pieces, rocks, simple buildings, and collision proxies from
  exact recipes instead of settling for unstyled primitives.
- Apply offline modeling steps that are awkward in runtime IR: bevels,
  booleans, array/mirror operations, UV generation, normals, mesh joining, LOD
  variants, and GLB optimization.
- Re-run assets deterministically from durable generator provenance and expose
  input/output hashes through the existing generator workflow.
- Let agents request a bounded `asset.generate` MCP tool and receive the same
  CLI diagnostics, output paths, asset registration, and inspection report.
- Reuse current `tn model-test`, `tn asset inspect`, build, and web/native GLB
  paths rather than adding a Blender-specific runtime contract.

### What Blender does not provide

Blender alone does not turn natural-language prompts into good models. An
agent or future model provider must translate intent into a bounded recipe.
The first product slice should therefore optimize reliable procedural props,
not claim unrestricted text-to-3D generation or artist-quality characters.

## BlenderMCP Assessment

| Question | Finding | Product implication |
| --- | --- | --- |
| True `--background` support | Explicitly rejected by current add-on | Do not adopt as the headless worker |
| Unattended GUI support | Possible with Xvfb | Too heavy and fragile for the default CLI path |
| Agent-oriented verbs | Strong scene/object/material/inspection vocabulary | Reuse the concepts in bounded descriptors |
| Transport | stdio MCP -> TCP -> Blender add-on | Avoid the extra long-lived bridge for one-shot jobs |
| Code execution | Arbitrary Python in Blender | Do not expose in ThreeNative MCP or CLI |
| External assets/providers | Poly Haven, Sketchfab, and model APIs | Existing catalog/provider boundaries should own these |
| Screenshots | Useful iterative feedback | Reuse `tn model-test` and proof tooling after GLB emit |

The useful MCP design is a thin ThreeNative adapter over registry-backed CLI
operations. It should submit structured recipes and inspect results. It should
not install Blender, open ports, start a persistent add-on, or accept Python.

## Fork Decision

Do not fork BlenderMCP as the implementation base for the ThreeNative CLI.

A production fork would inherit and then need to replace the parts least useful
to ThreeNative: GUI registration/panels, timer-driven socket execution, a
long-lived TCP bridge, telemetry, provider credentials, and arbitrary Python.
The inspected add-on is about 2,800 lines and its background-mode guard is a
consequence of its event-loop architecture, not an isolated compatibility
check. Removing that guard would not make its command scheduling correct in a
one-shot background process.

Instead, adopt functionality through ThreeNative-owned descriptors and a small
owned runner:

| BlenderMCP capability | ThreeNative decision |
| --- | --- |
| Scene/object inspection | Reimplement as bounded structured inspection |
| Create/transform/delete/duplicate/join objects | Reimplement in recipe operations |
| PBR material creation | Reimplement and verify through exported GLB |
| Common modifiers | Reimplement an explicit allowlist with budgets |
| Viewport screenshots | Use existing `tn model-test`/proof flow after export |
| Poly Haven/Sketchfab lookup | Keep in the existing catalog/provider boundary |
| Third-party text-to-3D providers | Defer to provider-specific PRDs and credentials |
| MCP transport | Derive a thin adapter from the `tn` command descriptor |
| TCP socket/GUI add-on | Do not adopt for headless generation |
| Arbitrary Python execution | Explicitly prohibit |
| Telemetry | Do not adopt |

### Source-Level MCP Tool Inventory

The inspected MCP server at commit
`6e99eb5a442b83766a5796975ec7bb5bfc791341` exposes 22 `@mcp.tool()`
functions. The inventory below is based on
`src/blender_mcp/server.py` and the corresponding handlers in `addon.py`, not
only on README examples.

Coverage means equivalent user outcome through ThreeNative's CLI/core/MCP
architecture. It does not mean retaining the upstream function name, wire
format, Blender add-on, or implementation.

| # | Upstream tool | Actual behavior | Value | ThreeNative disposition |
| --- | --- | --- | --- | --- |
| 1 | `get_scene_info` | Scene name, counts, first objects, transforms, bounds | High | Phase 4 structured scene/GLB inspection |
| 2 | `get_object_info` | Named object transform, mesh data, materials, bounds | High | Phase 4 structured node/object inspection |
| 3 | `get_viewport_screenshot` | GUI viewport capture returned as MCP image | High | Equivalent through headless render/model-test evidence |
| 4 | `execute_blender_code` | Unrestricted Python `exec` inside Blender | High utility, unacceptable risk | Replace common outcomes with bounded recipe operations; never expose code execution |
| 5 | `get_polyhaven_categories` | Query categories/counts for HDRIs, textures, models | Medium | Phase 5 catalog/provider categories |
| 6 | `search_polyhaven_assets` | Search/filter and rank Poly Haven assets | High | Phase 5 source-catalog/provider search |
| 7 | `download_polyhaven_asset` | Download/import model, texture set, or HDRI | High | Phase 5 provenance-first asset import; no Blender-side network |
| 8 | `set_texture` | Apply downloaded PBR maps to named Blender object | High | Phase 5 texture-set material operation/recipe reference |
| 9 | `get_polyhaven_status` | Report integration availability | Medium | Descriptor-derived provider status |
| 10 | `get_hyper3d_status` | Report Rodin credential/mode readiness | Medium | Phase 7 provider status |
| 11 | `get_sketchfab_status` | Validate API key and report account readiness | Medium | Phase 6 credential-safe provider status |
| 12 | `search_sketchfab_models` | Search downloadable models with author/license/faces | High | Phase 6 search with provenance/license metadata |
| 13 | `get_sketchfab_model_preview` | Return selected model thumbnail as MCP image | High | Phase 6 bounded preview artifact/MCP image |
| 14 | `download_sketchfab_model` | Download/import model and normalize largest dimension | High | Phase 6 import through existing GLB pipeline and scale calibration |
| 15 | `generate_hyper3d_model_via_text` | Submit Rodin text-to-3D job with optional bbox ratio | High but paid/external | Phase 7 optional model-provider job |
| 16 | `generate_hyper3d_model_via_images` | Submit image-to-3D job from paths/URLs | High but paid/external | Phase 7 project-local image inputs; remote URLs rejected or separately sourced |
| 17 | `poll_rodin_job_status` | Poll main-site or fal.ai queue status | Medium | Phase 7 normalized job status |
| 18 | `import_generated_asset` | Download generated GLB, clean hierarchy, name, inspect bounds | High | Phase 7 staged download, inspect, register, provenance |
| 19 | `get_hunyuan3d_status` | Report official/local Hunyuan configuration | Low until adapter selected | Generic provider status reports unsupported/unconfigured truthfully |
| 20 | `generate_hunyuan3d_model` | Submit text/image Hunyuan job or call local API | Duplicates Phase 7 outcome with more credential modes | Deferred provider adapter |
| 21 | `poll_hunyuan_job_status` | Poll Tencent job | Low incremental value | Deferred provider adapter |
| 22 | `import_generated_asset_hunyuan` | Download ZIP, extract OBJ/materials, import | Medium but distinct archive/security work | Deferred provider adapter |

Planned v1 coverage is 19 of 22 upstream tools (86%). Three Hunyuan-specific
job operations are deferred because they duplicate the generic text/image job
workflow while adding Tencent signing, local-server configuration, remote ZIP
and OBJ ingestion, and another credential/legal surface. The generic status
tool still reports the adapter as unavailable instead of hiding it.

The 19 covered rows include a deliberately non-equivalent replacement for
`execute_blender_code`: a descriptor-owned operation registry must cover the
common modeling outcomes, but arbitrary Python remains prohibited. Coverage
gates must report this row as `safe-replacement`, never `full`.

### Useful Behavior Hidden Behind Arbitrary Python

BlenderMCP has no first-class MCP tools for ordinary create/delete/transform,
material editing, modifiers, camera aiming, or lighting setup. Its examples
achieve those behaviors through `execute_blender_code`. ThreeNative therefore
needs explicit bounded verbs beyond the 22-tool surface:

- create/delete/duplicate/rename/join objects;
- position/rotation/scale and parent relationships;
- primitive composition and finite mesh parameters;
- PBR material create/assign/update;
- bevel, mirror, array, boolean, solidify, and smooth/flat shading;
- camera pose/target and bounded studio lighting for proof;
- normalize origin, pivot, size, and grounded placement;
- import/export GLB and inspect nodes/materials/bounds/counts.

These operations are the safe functional replacement for the upstream tool's
most powerful feature and must be registry-owned so CLI, MCP schemas, runner
dispatch, help, and coverage tests cannot drift.

BlenderMCP is MIT-licensed, so a small algorithm may be ported when it is
materially better than a clean implementation, provided attribution and license
notices are retained. Default to documented Blender APIs and original bounded
code so ThreeNative does not acquire an unnecessary upstream merge burden.

A fork can be reconsidered only for a separately scoped, optional interactive
Blender GUI integration after a shipped workflow proves that live session
editing is valuable. It must not become the CLI's headless worker.

## Recommended Product Boundary

- Add `tn tool status|install|remove blender`; installation requires explicit
  acknowledgement and is never triggered by status/build/generation.
- Prefer an explicit `THREENATIVE_BLENDER_PATH` override, then the managed
  cache. Record the resolved path and version in JSON output.
- Pin official platform artifacts and SHA-256 values in one owning manifest.
- Extend existing generator provenance with a provider/recipe union rather
  than inventing a parallel provenance document.
- Run only a repository-owned Blender Python entry point against validated JSON.
- Reject arbitrary Python, add-ons, `.blend` auto-execution, remote recipe
  URLs, traversal paths, unbounded mesh counts, and unbounded execution time.
- Emit normal project-local GLB assets and register them through the current
  asset authoring operation.
- Run `tn asset inspect` automatically and fail generation when the output is
  invalid or exceeds declared budgets.
- Expose generation through MCP only after the CLI/core operation exists.

## Spike Limitations

- The executable prototype proves Linux x64 only. The official 4.5.11 checksum
  manifest also lists macOS arm64/x64 DMGs and Windows x64/arm64 archives, but
  extraction and execution must be proven on each supported host.
- The prototype uses system `tar` and lacks a cross-process install lock,
  resumable download, proxy policy, timeout, and disk-space preflight.
- Its recipe is intentionally narrow and has not yet been promoted to the
  authoring package's validator/provenance contract.
- Rendering/thumbnail generation, textures, animations, rigs, and arbitrary
  imported `.blend` files were not tested.
- No claim is made that output is byte-for-byte deterministic across Blender
  versions or operating systems. The provider version is part of provenance.

## Recommendation

Proceed with the PRD's first three phases. The go/no-go criterion after those
phases is practical: an agent must be able to create at least three visibly
distinct, game-usable props from bounded recipes, rerun them without drift,
and pass existing asset inspection/model-test evidence on Linux, macOS, and
Windows. Keep BlenderMCP as a vocabulary/reference source, not a dependency.
