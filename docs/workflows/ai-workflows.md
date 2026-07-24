# AI Workflows

This document defines how AI agents should generate, validate, and repair ThreeNative projects. The goal is not to make prompts smarter. The goal is to expose stable tools, schemas, examples, and diagnostics so AI-generated code is constrained by the same system as human-authored code.

## Core Principle

AI agents should interact with ThreeNative through documented APIs and tools:

```txt
AI agent
  -> MCP tool or CLI command
  -> SDK/compiler/validator
  -> structured result
  -> source fix or build artifact
```

The SDK and validator enforce correctness. MCP helps the agent discover the correct API surface and execute the same workflow a developer would use.

## Authoring Contract

Agents author durable structured source in `content/**/*.json` and portable
behavior in `src/scripts/**/*.ts`. Prefer registry-backed `tn scene`, `tn ui`,
`tn material`, and related bounded commands. When no command covers the change,
direct editing of versioned durable JSON is supported, followed by
`tn authoring validate --project . --json`.

Portable scripts use `ScriptContext`, `defineBehavior`, declared component
access, and stable entity/resource IDs. They must not construct raw Three.js
scenes, call raw ECS `world.spawn`, import Bevy/Rust or DOM/Node APIs, or edit
generated bundles. Runtime entity lifecycle is available only through the
portable `context.commands.spawn`, `instantiate`, and `despawn` facade.

## AI-Safe Generation Loop

The standard AI workflow is:

```txt
1. Inspect docs, examples, and component schemas.
2. Generate or modify TypeScript source.
3. Run typecheck and ThreeNative validation.
4. Read structured diagnostics.
5. Apply focused fixes.
6. Run target preview or build.
7. Report changed files, validation status, and remaining risks.
```

For a fresh project, prefer the scaffold/doctor/help loop before generating
custom gameplay code:

```bash
tn init my-game --template structured-source-starter --json
cd my-game
pnpm install
pnpm run validate
pnpm run build
tn doctor --project . --json
tn help visual-qa --json
```

`tn init` and `tn create` share the same scaffold implementation. Their JSON
payload includes the canonical template, absolute path, exact next commands, and
reference docs. Agents should report those commands rather than inventing a
local setup sequence.

Use task help when diagnosing a visual problem:

- `tn help scaffold`: first project and template setup.
- `tn help assets`: model paths, texture dependencies, and visibility triage.
- `tn help camera`: camera framing, clipping, and black-canvas symptoms.
- `tn help transform`: transform patch and scale preservation risks.
- `tn help visual-qa`: proof workflow after preview readiness.
- `tn help screenshot`: current still-frame proof path through `tn verify`.
- `tn help record`: current motion proof path through multi-frame `tn verify`.

`tn doctor` checks local project setup, required package scripts, source
entrypoint, and bundle file presence. Use `tn screenshot`, `tn parity visual`,
`tn verify`, and `tn record` for current preview and visual/motion proof; use
their structured freshness diagnostics rather than assuming a served port owns
the intended project.

For local CLI usage:

```bash
tn typecheck
tn validate
tn dev --target web
tn dev --target desktop
tn build --target desktop
```

For mobile work:

```bash
tn validate
tn build --target android
tn profile --target android
```

Agents should prefer the smallest target that proves the change. For most source edits, validation plus web preview is the first check. Runtime adapter work requires desktop native checks. Mobile-specific work requires mobile build or profile checks.

## Focused Inner Loops

Choose the proof from the kind of change instead of running the full production
ladder after every edit.

| Change | Focused loop | Failure evidence |
| --- | --- | --- |
| Visual, material, lighting, camera, or UI | Keep `tn dev --target web` live and use `tn screenshot ... --url <preview-url>`; use `tn parity visual ... --url <preview-url> --reference <path>` for a fixed reference | Screenshot, parity score, and preview freshness diagnostic |
| Physics, collision, movement, or input | Run one committed `tn playtest --scenario playtests/<name>.playtest.json --stable-artifacts --json` | Compact observation first; runtime trace, contacts, or write audit only when referenced |
| Script/type contract | Run project typecheck or `tn authoring script check --project . --json`, then the one scenario that invokes the export | Compiler diagnostic and focused scenario |
| Integrated milestone | Run `tn iterate --project . --json` | Iterate report and its named follow-up |

Three failure smells should stop speculative edits:

- Identical before/after traces usually mean the input, script attachment,
  schedule, or observed owner never participated. Prove that causal path before
  changing assertions.
- A served/local source or bundle mismatch invalidates visual evidence. Confirm
  the project root, URL/port, mtimes, and bundle hash, restart the stale dev
  process, and capture again.
- Physically impossible tuning must be repaired in authored mass, gravity,
  thrust/force, drag/damping, collider, or spawn data. Do not widen tolerances
  or replace the mechanic with a scripted transform.

For concurrent agent work, inspect source owners first. Assign one owner per
scene JSON. Independent content, material, UI, input, and script files may be
worked in parallel only after their stable-ID contract is agreed. A single
agent owns the long-lived preview; never run build, dev, and iterate
concurrently in the same project because they share generated output, ports,
and freshness state.

## MCP Role

MCP is an optional AI control plane, not the engine and not a replacement for
the CLI. The canonical automation surface remains `tn ... --json`; MCP tools
must delegate to the same CLI/core behavior and return the same diagnostic
shape where practical.

The first implemented authoring wrapper lives in `@threenative/mcp-server` and
exposes bounded source-authoring and project tools:

```txt
scene.inspect(sceneId)
scene.validate(sceneId?)
scene.add_entity(sceneId, entityId, prefabId?)
scene.set_transform(sceneId, entityId, transform)
scene.set_camera(sceneId, cameraId, mode, targetId)
scene.attach_script(sceneId, systemId, modulePath, exportName)
scene.bind_ui(sceneId, uiNodeId, resourcePath)
ui.set_layout(uiDocId, nodeId, layout)
ui.bind(uiDocId, nodeId, resourcePath)
bundle.import(bundleDir, dryRun?)
material.set(materialId, color?, roughness?)
system.attach_script(systemId, modulePath, exportName)
project.build()
project.screenshot(url, out)
project.verify(options?)
```

Use the CLI directly for scripts, CI, reproducible debugging, and commands not
covered by the wrapper. Use MCP when an interactive agent benefits from a
narrow tool schema and project-root allowlist. MCP must not expose arbitrary
shell access, generated bundle editing, or runtime handles as source edits.
For bundle recovery, MCP may call `tn bundle import ... --mode source --json`,
but generated bundle files and `scripts.bundle.js` remain non-source. The
durable behavior source is the referenced TypeScript module/export, not the
generated script bundle body.

## TypeScript Facade Role

`@threenative/authoring-client` is available when a script or agent needs
TypeScript composition without making TypeScript scene files the source of
truth. The facade queues the same registry-backed operations used by CLI,
editor, MCP, and chat workflows, then writes structured source on `commit()`.

```ts
import { openProject } from "@threenative/authoring-client";

const result = await openProject(".")
  .scene("arena")
  .addPrefab("prefab.crate", { primitive: "box", color: "#8f5a2a" })
  .addEntity("crate.001", { prefabId: "prefab.crate" })
  .transform("crate.001", { position: [2, 1, -3] })
  .rigidBody("crate.001", { kind: "dynamic" })
  .collider("crate.001", { kind: "box", size: [1, 1, 1] })
  .commit();
```

Agents should inspect `result.operations`, `result.diagnostics`, and
`result.filesWritten` the same way they inspect CLI `--json` output. Use
`dryRun()` to check registry operation shapes and traces without writing source.
Do not persist scene/map data in facade scripts; the durable output remains
`content/**/*.json`.

One-way project generators may use the same facade when registered by
`tn generator record` and run with `tn generator run <generator-id> --json`.
Generator modules must live under `src/generators/**` and return the facade
commit result so provenance can capture the operation trace, files written,
diagnostics, and input/output hashes. If a generated output was manually edited,
the runner reports a conflict instead of silently overwriting it unless the
generator provenance explicitly uses a replace policy.

Future MCP resources may include:

```txt
threenative://docs
threenative://components
threenative://examples
threenative://schemas/world-ir
threenative://schemas/ui-ir
threenative://schemas/material-ir
threenative://schemas/assets-manifest
threenative://schemas/systems-ir
threenative://mobile-performance-rules
threenative://bevy-runtime-adapter
```

MCP tools should call CLI and compiler APIs. They should not contain a separate
implementation of build, validation, conversion, or structured source mutation
behavior. See
[Authoring MCP and Editor Adapter](../contracts/authoring-mcp.md) for the
shared adapter result contract that future editor tooling must also use.

## Project Context For Agents

AI tools for Bevy projects often track project metadata, generated files,
dependencies, templates, build output, and conversation history. ThreeNative
should adopt the useful parts of that pattern without making AI-generated Bevy
Rust the product surface.

Each project should eventually have a machine-readable project context file,
for example `threenative.project.json`, containing:

- project name and SDK version
- selected template
- enabled targets
- known source entry points
- generated bundle path
- declared dependencies and capabilities
- recent validation/build diagnostics
- AI-generated files when the user opts into tracking

Agents should use this context to avoid rediscovering project shape on every
turn. The context file must not replace source code, schemas, or validation.

## Validation Requirements

Validation must produce output that an AI can act on without guessing.

Each diagnostic should include:

- stable diagnostic code
- severity
- source file and range when available
- related IR path when available
- human-readable message
- suggested fix when possible
- target affected, such as `web`, `desktop`, `android`, or `ios`

Example shape:

```json
{
  "code": "TN_MATERIAL_UNSUPPORTED_PARAM",
  "severity": "error",
  "file": "src/scripts/materials.ts",
  "range": { "line": 12, "column": 5 },
  "irPath": "/entities/3/components/Material",
  "target": "android",
  "message": "MeshStandardMaterial parameter 'onBeforeCompile' is not supported.",
  "suggestion": "Use supported material properties or move shader customization out of the MVP scope."
}
```

Diagnostics should reject unsupported behavior early. Silent fallback is harmful because agents will learn the wrong API surface.

## Conversion Workflow

`tn convert` and `convert_threejs_snippet` should handle small snippets, not arbitrary Three.js projects.

Supported early conversion inputs:

- scene creation
- mesh creation
- basic transforms
- box, sphere, and plane geometry
- standard materials
- camera and light setup

Unsupported conversion inputs should return partial conversion plus diagnostics:

- raw WebGL access
- renderer internals
- DOM integration
- browser event wiring
- custom shader hooks
- arbitrary postprocessing
- monkey-patched Three.js classes
- dynamic imports with side effects

The converter should never claim full compatibility. It should produce supported ThreeNative code where possible and a clear list of manual follow-up items.

## Build And Repair Workflow

When a build fails, agents should repair in this order:

1. TypeScript errors.
2. SDK API errors.
3. IR extraction errors.
4. IR schema errors.
5. Asset manifest errors.
6. Runtime adapter errors.
7. Target packaging errors.
8. Performance warnings.

The order matters because later stages may be noisy when earlier stages are invalid.

For each repair pass, the agent should:

- read the exact diagnostic
- locate the smallest source area responsible
- change only relevant files
- rerun the narrowest failing command
- stop once validation and requested target checks pass

Fast checks should be cheap enough to run often. The CLI should provide concise
failure output suitable for agents, similar in spirit to quick compile and lint
loops used in Bevy development:

```bash
tn typecheck --summary
tn validate --summary
tn build --target desktop --check
```

Native runtime work may also run wrapped Rust checks under the hood, but normal
game authors and agents should not need to know Bevy crate layout.

## Hot Reload Workflow

In development, AI agents should expect:

```bash
tn dev --target web
tn dev --target desktop
```

The dev process should:

- watch TypeScript source
- rebuild the IR bundle
- validate before sending updates to a runtime
- reload assets when the manifest changes
- preserve runtime state only when identity and component shape allow it
- request full restart when a change cannot be hot-reloaded safely

Agents should not edit runtime-generated bundle files directly. Source TypeScript and assets are the owned inputs; IR output is generated.

## Mobile Optimization Workflow

Mobile performance should be encoded as validation and profiling rules.

Agents should use:

```bash
tn validate --target android
tn profile --target android
tn validate --target ios
tn profile --target ios
```

Early mobile rules should flag:

- too many dynamic lights
- unsupported texture formats
- oversized textures
- missing LOD or mesh simplification where relevant
- unbounded entity spawning
- excessive material variants
- expensive per-frame allocations in systems
- missing pause/resume handling
- unsafe-area issues for touch controls
- absent resolution scale or FPS cap settings

AI-generated fixes should prefer target-profile changes and asset optimization before changing gameplay behavior.

## Example Expectations

Examples are part of the AI interface. Each maintained example should include:

- a short README describing the supported feature surface
- source code using current SDK APIs
- expected validation command
- expected preview command
- generated IR snapshot or schema test where useful
- known target support

The first examples should be small and testable:

- cube scene
- input movement
- camera follow
- glTF model loading
- simple arena gameplay

Do not add examples that rely on unsupported APIs only to make demos look more complete.

## Prompt Guidance For Agents

AI-facing docs should present exact imports, component names, command names, and examples. They should not rely on prose-only descriptions.

Good AI instructions:

```txt
Use MeshRenderer.box({ size: [1, 1, 1] }) for primitive box meshes.
Run tn validate after editing game source.
If TN_API_UNSUPPORTED is returned, replace the unsupported API instead of adding a runtime workaround.
```

Poor AI instructions:

```txt
Make it like Three.js.
Use whatever rendering feature seems best.
Fix validation with a workaround.
```

The project should optimize docs and examples for repeatable generation, not for broad aspirational descriptions.

## Security And Trust Boundaries

Generated code should be treated as untrusted until validated.

Initial safeguards:

- no arbitrary browser APIs in portable game code
- no raw filesystem access from game scripts
- no network access from game scripts unless explicitly modeled
- no runtime plugin loading in the MVP
- no arbitrary native code generated by AI
- no Bevy Rust generated as part of normal gameplay authoring

Future scripting for mods or UGC should use a sandboxed language such as Luau or Lua, but that is outside the v1 authoring path.

## Success Criteria

The AI workflow is successful when an agent can:

- create a small game from a template
- add entities and simple systems using supported APIs
- validate the project
- preview it on web
- build it for desktop native
- identify unsupported Three.js APIs during conversion
- make a mobile performance improvement from profiling output
- report exact remaining limitations without guessing

The MVP is not successful if it only works through hand-written prompts or undocumented internal commands.
