# ThreeNative Status

This file is the current implementation front door. Keep it under 250 lines and
link to capability docs for detail. Historical evidence from the prior long
status page is preserved in
[docs/status/capabilities/full-status-archive.md](status/capabilities/full-status-archive.md).

## Product Goal

ThreeNative aims to reach practical game-engine feature parity between Bevy and
the Three.js-based game engine SDK/runtime we are building. Bevy is the
reference for common game-engine capabilities; Three.js is the web rendering
runtime those capabilities run on. Features should be promoted only when the
portable SDK/IR contract works across the web Three.js runtime and the native
Bevy runtime where support is claimed.

Version labels such as `V7`, `V8`, and `V9` are legacy milestone names retained
in scripts, examples, and historical docs during a staged cleanup. See
[PRDs/archive/cleanup-versioned-debt.md](PRDs/archive/cleanup-versioned-debt.md).

## Capability Index

| Area | Status | Current claim | Detail |
| --- | --- | --- | --- |
| Authoring | Active | Structured source, schema-aware CLI/MCP/client operations, cookbook, iterate, starter API cards, and prescriptive diagnostics are supported. | [authoring](status/capabilities/authoring.md) |
| Scripting | Active | Portable TypeScript scripts use typed context APIs, convention-first helper aliases, supported helper imports, and prescriptive compiler diagnostics. | [scripting](status/capabilities/scripting.md) |
| Rendering | Active | Authored rendering IR maps to web and native through adapter-private implementations, parity gates, and portable scaffold look presets. | [rendering](status/capabilities/rendering.md) |
| Physics | Active | Portable physics and character-control contracts exist for authored components and playtest-proved behavior. | [physics](status/capabilities/physics.md) |
| UI | Active | Retained structured UI is the portable path; overlays are bounded and separate. | [ui](status/capabilities/ui.md) |
| Assets | Active | Bundle-local assets, GLB/glTF, generated meshes, materials, audio, and catalog sourcing are validated. | [assets](status/capabilities/assets.md) |
| Native parity | Active | Bevy consumes emitted IR and claims require native proof harness or desktop playtest evidence. | [native parity](status/capabilities/native-parity.md) |
| Game production | Active | Generated games target polished vertical slices with selectable L1 archetype scaffolds and compositional mechanic blocks; recipe-matched scaffold-first benchmarks pass, but the 2026-07-07 off-recipe authoring round fails the <=2x token gate. | [game production](status/capabilities/game-production.md) |
| Editor | In progress | Editor and MCP surfaces must wrap authoring operations rather than owning a second source model. | [editor](status/capabilities/editor.md) |
| Tooling/proof | Active | Verification tools own docs checks, agent IO budgets, smoke/release gates, proof manifests, and aggregate artifacts. | [tooling/proof](status/capabilities/tooling-proof.md) |

## Current PRDs

- [Agent Ergonomics](PRDs/done/agent-ergonomics-2026-07-05/README.md): done
  execution bundle for measuring and improving agent game creation.
- [Proof-First Engine Loop](PRDs/proof-first-engine-loop-2026-07-05/): active
  runtime, native parity, gameplay, and proof-loop capability work.
- [PRD index](PRDs/README.md): current and completed planning work.

## Current Gates

Use narrow proof first, then broaden:

```bash
pnpm check:docs
pnpm verify:smoke
pnpm verify:generated-games
pnpm verify:release
```

Focused capability gates include `pnpm verify:agent-io`, `pnpm verify:cookbook`,
`pnpm verify:template-production`, `pnpm verify:conformance`,
`pnpm verify:scripting-helpers-lifecycle`, and `pnpm verify:parity:smoke`.

## Artifact Policy

- Example evidence: `examples/<name>/artifacts/<gate>/`.
- Aggregate reports: `tools/verify/artifacts/<gate>/`.
- Bevy-only evidence: `runtime-bevy/artifacts/<gate>/`.
- Generated bundles and `dist/**` are outputs, not durable source.

Update the relevant capability doc plus the one-line index entry here when a
capability or release gate changes.
