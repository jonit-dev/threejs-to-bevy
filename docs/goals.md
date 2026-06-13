# Goals

ThreeNative exists to answer one product question:

```txt
Can an AI agent or TypeScript developer build a small playable 3D game faster
here than with raw Three.js, R3F, Godot, Unity, or Bevy?
```

The answer should become yes because the SDK gives authors familiar
TypeScript-first APIs, ECS-compatible game abstractions, strict validation, and
runtime adapters that keep native-like performance in reach.

## Primary Goal

Make 3D game development fast for AI agents and TypeScript developers without
requiring them to write Bevy, Rust, engine glue, or low-level renderer code.

The public API should feel close enough to Three.js and R3F that existing
developer intuition and AI training data transfer well, while the internal model
stays explicit enough to compile, validate, and run across web and native
runtimes.

## Product Goals

- Let users describe scenes, entities, components, systems, input, UI, assets,
  and gameplay behavior in TypeScript.
- Provide ECS-compatible abstractions that make common 3D game patterns quick:
  entities, components, transforms, hierarchy, resources, systems, queries,
  events, prefabs, and command buffers.
- Compile authoring code into a stable, versioned ECS/game IR instead of
  depending on arbitrary JavaScript behavior at runtime.
- Run the same game bundle through a Three.js web runtime and a native Bevy
  runtime.
- Preserve a path to native-like performance by mapping portable ECS/game data
  into native runtime primitives instead of using a WebView as the native
  strategy.
- Make unsupported APIs fail early with explicit diagnostics.
- Give AI agents enough validation, visual feedback, and structured errors to
  generate, test, and repair games without constant human inspection.
- Prove the platform with a small playable game before expanding into editor
  tooling, mobile packaging, MCP control planes, or advanced rendering.

## Experience Goals

A successful ThreeNative workflow should feel like this:

```txt
create project
  -> write TypeScript scene and gameplay code
  -> validate supported SDK usage
  -> build a portable game bundle
  -> preview on web
  -> run natively
  -> inspect diagnostics or screenshots
  -> iterate quickly
```

The user should not need to understand Bevy internals, renderer setup, asset
pipeline details, or runtime adapter code to build a small game.

## Performance Goal

ThreeNative should not promise that every TypeScript game automatically becomes
as fast as a hand-written native engine.

The goal is narrower and more useful: portable authoring should lower into data
and systems that native runtimes can execute efficiently. The SDK, IR, and
validators should steer users toward patterns that can be batched, scheduled,
profiled, and mapped cleanly to Bevy or a future custom Rust/wgpu runtime.

## Non-Goals

- Compile arbitrary Three.js applications to native Rust.
- Support every Three.js, R3F, browser, DOM, WebGL, or shader escape hatch.
- Expose Bevy as the public authoring API.
- Replace Unity, Godot, or Bevy for every class of game.
- Build a visual editor before the SDK, compiler, validator, CLI, and runtimes
  prove the core loop.
- Add broad engine features before they fit the portable IR and cross-runtime
  validation model.

## Proof Criteria

The project is working when:

- A developer or AI agent can build a small playable 3D game from a template.
- The game uses ECS-compatible abstractions for gameplay instead of ad hoc
  runtime-specific glue.
- The same source produces a validated bundle that runs in web and native
  runtimes.
- Diagnostics explain unsupported patterns before runtime failure.
- The iteration loop is faster and easier than starting from raw Three.js, R3F,
  Godot, Unity, or Bevy for the same small-game target.
- The runtime path keeps native-like performance reachable as game complexity
  grows.
