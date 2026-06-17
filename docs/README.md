# ThreeNative Documentation

This directory contains the initial design documentation for a Three.js-like
TypeScript game SDK that compiles to a stable ECS/scene IR and runs through
native and web runtime adapters.

The source concept is [concept.md](concept.md). The rest of the documents turn
that concept into implementation contracts.

For current implementation status, read [STATUS.md](STATUS.md) before the
conceptual docs.

Version labels such as `V7` or `verify:v9` are **legacy milestone names** kept
during a staged cleanup. See the
[cleanup PRD](PRDs/cleanup-versioned-debt.md) for the capability naming plan,
canonical command targets, and the retained-reference allowlist enforced by
`pnpm check:names`.

## Core Documents

- [Status](STATUS.md): current active gate, proof scope, non-goals, and
  implementation truth sources.
- [Architecture](architecture.md): system boundaries, package layout, runtime
  split, and early technical decisions.
- [Goals](goals.md): product goals, experience goals, performance target,
  non-goals, and proof criteria.
- [SDK](sdk.md): public TypeScript authoring surface, supported Three.js-like
  subset, object lifecycle, and scripting model.
- [ECS](ecs.md): component model, entities, systems, queries, prefabs, and
  gameplay runtime expectations.
- [Scripting](scripting.md): TypeScript gameplay systems, native script hosting,
  command buffers, patch application, and the Rust/Bevy boundary.
- [Portable Scripting APIs](scripting-api.md): TypeScript context APIs for
  animation, physics, events, commands, and native QuickJS hosting.
- [UI](ui.md): React-style game UI authoring, `ui.ir.json`, bindings, events,
  and native UI recreation.
- [IR](ir.md): intermediate representation contract shared by the compiler,
  validators, and runtimes.
- [Runtime Adapters](runtime-adapters.md): responsibilities for Bevy, Three.js
  web, and future custom Rust/wgpu targets.
- [Bevy Feature Parity](bevy-feature-parity.md): current Bevy comparison
  checklist for roadmap prioritization.
- [Feature Maturity Matrix](feature-maturity.md): separates supported,
  partial, schema-only, experimental, and future features.
- [Advanced Features Roadmap](advanced-features-roadmap.md): planning track for
  procedural worlds, GPU pipelines, custom rendering, and LAAS-class scenes.
- [Conventions](conventions.md): coordinate, unit, rotation, imported scale, and
  color-space decisions.
- [verify:v3](verify-v3.md): release-gate command, checks, artifacts, and
  pass/fail semantics.
- [verify:v5](verify-v5.md): current V5 visual-quality scene gate, artifacts,
  and scope limits.
- [Diagnostics](diagnostics.md): diagnostic shape, namespaces, and V3 priority
  domains.
- [Tech Stack](tech-stack.md): planned implementation stack for TypeScript,
  compiler, CLI, native runtime, web runtime, assets, physics, testing, and CI.
- [Developer Workflow](developer-workflow.md): CLI, local dev loop, validation,
  build, test, and packaging expectations.
- [AI Workflows](ai-workflows.md): how AI agents should generate, validate,
  repair, and profile games through docs, schemas, CLI, and future MCP tools.
- [Roadmap](ROADMAP.md): V1/V2/V3 goals, scaffold and verification loops,
  boundaries, risks, and success criteria.
- [V3 Completion Checklist](releases/v3-completion.md): operational release
  checklist for finishing V3.
- [V3 Environment Scene IR](environment-scene-ir.md): V3-specific rich scene
  composition contract.
- [V3 Asset Pipeline](asset-pipeline.md): supported asset inputs, bundle
  behavior, texture policy, and budgets.
- [V3 Visual Parity Policy](visual-parity-policy.md): what V3 does and does
  not require from Three.js/Bevy screenshots.
- [V1 PRDs](PRDs/v1/README.md): implementation tickets for the V1 end-to-end
  proof, sliced from the roadmap and aligned with the architecture docs.
- [V4 PRDs](PRDs/v4/README.md): implementation tickets for the native QuickJS
  scripting proof and primitive scripting demo.
- [References](references.md): external Bevy, Three.js, and related AI-tooling
  references used to shape the initial docs.

## Current Status

The active release and evidence gates are tracked in [STATUS.md](STATUS.md).
Read that file for the authoritative supported surface grouped by product
capability rather than milestone numbering.

Current contributor checks:

```bash
pnpm check:names
pnpm verify
pnpm verify:conformance
```

Legacy milestone script names such as `verify:v7` and `verify:v9` remain as
compatibility aliases during the cleanup described in
[PRDs/cleanup-versioned-debt.md](PRDs/cleanup-versioned-debt.md).

Historical milestone docs remain linked below for archive context. They are not
the current product front door.

The current truth for implementation status is:

- [STATUS.md](STATUS.md)
- [bevy-feature-parity.md](bevy-feature-parity.md)
- [PRDs/cleanup-versioned-debt.md](PRDs/cleanup-versioned-debt.md)

## Design Principles

1. Keep the public API familiar to Three.js and TypeScript developers.
2. Do not promise arbitrary Three.js compatibility.
3. Treat the IR as the stable platform contract.
4. Hide Bevy and other runtime-specific APIs behind adapters.
5. Use validation, schemas, and tooling to make AI-generated code reliable.
6. Prove the product with a small playable game before building editor tooling.

## Recommended Reading Order

1. Start with [STATUS.md](STATUS.md) for current implementation status.
2. Read [concept.md](concept.md) for the product thesis.
3. Read [goals.md](goals.md) and [architecture.md](architecture.md) to
   understand the product target and system shape.
4. Read [sdk.md](sdk.md), [ecs.md](ecs.md), [scripting.md](scripting.md),
   [scripting-api.md](scripting-api.md), [ui.md](ui.md), and [ir.md](ir.md)
   together because they define the authoring and compilation contract.
5. Read [runtime-adapters.md](runtime-adapters.md) before implementing native or
   web targets.
6. Use [developer-workflow.md](developer-workflow.md), [ai-workflows.md](ai-workflows.md),
   and [ROADMAP.md](ROADMAP.md) to sequence implementation work.
