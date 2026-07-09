# ThreeNative Status

This file is the current implementation front door. Keep it under 200 lines and
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

Native parity freeze policy: new Bevy/native promotions are frozen unless a
shipped-game need is documented with web evidence, native proof evidence, and a
focused gate. The current native path decision is recorded in
[docs/runtime/native-path.md](runtime/native-path.md).

Version labels such as `V7`, `V8`, and `V9` are legacy milestone names retained
in scripts, examples, and historical docs during a staged cleanup. See
[PRDs/archive/cleanup-versioned-debt.md](PRDs/archive/cleanup-versioned-debt.md).

## Capability Index

| Area | Status | Current claim | Detail |
| --- | --- | --- | --- |
| Authoring | Active | Structured source, schema-aware CLI/MCP/client operations, descriptor-backed adapter metadata for migrated operation hot spots, bounded actor archetypes, project type generation, cookbook, multi-scenario iterate, playtest schema/scaffold/setup, starter API cards, prescriptive diagnostics, and an experimental typed game-spec slice with component-write hardening are supported. | [authoring](status/capabilities/authoring.md) |
| Scripting | Active | Portable TypeScript scripts use typed/project-generated context APIs, `defineBehavior` metadata, convention-first helper aliases, supported runtime helper imports, derived literal resource access declarations, script audio play/stop/query, bounded particle commands, fixed-tick delayed command scheduling, script-visible retained UI actions, runtime resource observations, and prescriptive diagnostics. | [scripting](status/capabilities/scripting.md) |
| Rendering | Active | Authored rendering IR maps to web and native through adapter-private implementations, parity gates, promoted cinematic defaults, web/native-proved scaffold look presets, portable photoreal feature report contracts with rollout-gap diagnostics, and bounded native shader material assets plus IR-derived portable shader preview artifacts while runtime shader visual parity remains unpromoted. | [rendering](status/capabilities/rendering.md) |
| Physics | Active | Portable physics and character-control contracts exist for authored components, primitive contact filters, compiler-emitted heightfield descriptors, web terrain collision, Bevy Rapier heightfield collision, and playtest-proved behavior. | [physics](status/capabilities/physics.md) |
| UI | Active | Retained structured UI is the portable path; TSX authoring has typed text input/component wrappers, web overlay actions, live state, editor read-only UI preview, native binding-cache/font diagnostics, safe-area/context-menu/focus semantics are proved in bounded gates, conformance reports structural/behavioral/visual evidence, and native/UI parity claims are truth-graded against named proof. | [ui](status/capabilities/ui.md) |
| Assets | Active | Bundle-local assets, GLB/glTF, generated meshes, heightmaps, deterministic terrain-aware scatter, generated biome world source, materials, audio, and catalog sourcing are validated. | [assets](status/capabilities/assets.md) |
| Native parity | Frozen for promotion | Bevy consumes emitted IR; the native playtest P0 is closed, trace-only UI rows are not promoted, and new native promotions require shipped-game evidence, native proof, and the native path decision. | [native parity](status/capabilities/native-parity.md) |
| Game production | Active | Generated games target polished vertical slices with selectable L1 archetype scaffolds, reusable L2 actor archetypes, biome world source/proof, compositional mechanic blocks, runtime-traced Spawner/GameFlow/Sequence contracts, config-owned release proof enrollment, proof-family plan-apply scenarios, and equal-proof collector token evidence below vanilla. | [game production](status/capabilities/game-production.md) |
| Editor | In progress | Editor and MCP surfaces wrap authoring operations rather than owning a second source model; editor operation names, payload keys, and composite recipes now have metadata/drift coverage, and the viewport includes read-only retained UI source preview with deterministic binding placeholders/values. | [editor](status/capabilities/editor.md) |
| Tooling/proof | Active | Verification tools own docs checks, boundary fixture audits, adapter-surface drift gates, the typed top-level CLI command registry, descriptor-backed MCP argv checks for migrated operations, generated-game config enrollment diagnostics, agent IO/session-cost/retry-chain/churn budgets, runtime resource/state-stagnation diagnostics, secondary axis-delta playtest proof, web performance-proof emission/validation, desktop performance-proof unsupported diagnostics, QA performance-proof sidecars, efficient-scale texture delivery budgets, smoke/release gates, proof manifests, aggregate artifacts, and equal-proof benchmark token reporting. | [tooling/proof](status/capabilities/tooling-proof.md) |

## Current PRDs

- [Agent Ergonomics](PRDs/done/agent-ergonomics-2026-07-05/README.md): done
  execution bundle for measuring and improving agent game creation.
- [Proof-First Engine Loop](PRDs/proof-first-engine-loop-2026-07-05/): active
  runtime, native parity, gameplay, and proof-loop capability work.
- [UI System Remediation](PRDs/other/ui-system-remediation-2026-07-08/README.md):
  done execution bundle from the 2026-07-08 UI inspection covering web action
  delivery, parity truthing, authoring closure, behavioral conformance, editor
  preview, and native hygiene.
- [Adapter Surface Remediation](PRDs/other/adapter-surface-remediation-2026-07-08/README.md):
  active execution bundle from the 2026-07-08 adapter-surface diagnostic
  covering generated-game proof enrollment, adapter drift gates, CLI registry
  substrate, executable authoring descriptors, and editor operation recipes.
- [PRD index](PRDs/README.md): current and completed planning work.

## Current Gates

Use narrow proof first, then broaden:

```bash
pnpm check:docs
pnpm verify:smoke
pnpm verify:generated-games
pnpm verify:release
```

Focused capability gates include `pnpm verify:agent-io`, `pnpm verify:session-cost`, `pnpm verify:webview-package`, `pnpm verify:cookbook`,
`pnpm verify:template-production`, `pnpm verify:conformance`,
`pnpm verify:scripting-helpers-lifecycle`, `pnpm verify:particle-commands`,
`pnpm verify:efficient-scale`, and
`pnpm verify:parity:smoke`.

## Artifact Policy

- Example evidence: `examples/<name>/artifacts/<gate>/`.
- Aggregate reports: `tools/verify/artifacts/<gate>/`.
- Bevy-only evidence: `runtime-bevy/artifacts/<gate>/`.
- Generated bundles and `dist/**` are outputs, not durable source.

Update the relevant capability doc plus the one-line index entry here when a
capability or release gate changes.
