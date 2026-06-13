# ThreeNative Documentation

This directory contains the initial design documentation for a Three.js-like
TypeScript game SDK that compiles to a stable ECS/scene IR and runs through
native and web runtime adapters.

The source concept is [concept.md](concept.md). The rest of the documents turn
that concept into implementation contracts.

## Core Documents

- [Architecture](architecture.md): system boundaries, package layout, runtime
  split, and early technical decisions.
- [SDK](sdk.md): public TypeScript authoring surface, supported Three.js-like
  subset, object lifecycle, and scripting model.
- [ECS](ecs.md): component model, entities, systems, queries, prefabs, and
  gameplay runtime expectations.
- [Scripting](scripting.md): TypeScript gameplay systems, native script hosting,
  command buffers, patch application, and the Rust/Bevy boundary.
- [UI](ui.md): React-style game UI authoring, `ui.ir.json`, bindings, events,
  and native UI recreation.
- [IR](ir.md): intermediate representation contract shared by the compiler,
  validators, and runtimes.
- [Runtime Adapters](runtime-adapters.md): responsibilities for Bevy, Three.js
  web, and future custom Rust/wgpu targets.
- [Tech Stack](tech-stack.md): planned implementation stack for TypeScript,
  compiler, CLI, native runtime, web runtime, assets, physics, testing, and CI.
- [Developer Workflow](developer-workflow.md): CLI, local dev loop, validation,
  build, test, and packaging expectations.
- [AI Workflows](ai-workflows.md): how AI agents should generate, validate,
  repair, and profile games through docs, schemas, CLI, and future MCP tools.
- [Roadmap](roadmap.md): implementation phases, MVP boundaries, risks, and
  success criteria.
- [References](references.md): external Bevy, Three.js, and related AI-tooling
  references used to shape the initial docs.

## Design Principles

1. Keep the public API familiar to Three.js and TypeScript developers.
2. Do not promise arbitrary Three.js compatibility.
3. Treat the IR as the stable platform contract.
4. Hide Bevy and other runtime-specific APIs behind adapters.
5. Use validation, schemas, and tooling to make AI-generated code reliable.
6. Prove the product with a small playable game before building editor tooling.

## Recommended Reading Order

1. Start with [concept.md](concept.md) for the product thesis.
2. Read [architecture.md](architecture.md) to understand the system shape.
3. Read [sdk.md](sdk.md), [ecs.md](ecs.md), [scripting.md](scripting.md),
   [ui.md](ui.md), and [ir.md](ir.md) together because they define the authoring
   and compilation contract.
4. Read [runtime-adapters.md](runtime-adapters.md) before implementing native or
   web targets.
5. Use [developer-workflow.md](developer-workflow.md), [ai-workflows.md](ai-workflows.md),
   and [roadmap.md](roadmap.md) to sequence implementation work.
