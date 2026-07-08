# Proof-First Engine Loop PRDs

This folder is the ordered execution bundle for the 2026-07-05 proof-first
engine roadmap. It keeps the roadmap-critical engine/product PRDs together and
ordered by dependency and importance.

## 2026-07-07 Refresh

Recent agent-ergonomics work changed the baseline for this bundle:
`tn game plan --apply --json`, compact API cards in starters, typed script
context helpers, Unity-style input/time aliases, compact playtest reports, and
agent IO budget gates now exist. PRDs in this bundle should build on those
surfaces instead of adding bespoke project-specific APIs, verbose proof output,
or duplicate script scaffolding. For future engine surfaces, prefer shared
abstractions that do the heavy lifting and familiar Unity-like naming where the
semantics genuinely match.

Native parity freeze: `docs/runtime/native-path.md` freezes new Bevy/native
parity promotions until a shipped-game need documents web evidence, native
proof evidence, and a focused gate. PRD-002 and PRD-018 are therefore
freeze-gated, and the native/desktop halves of PRD-019 through PRD-021 are
deferred unless that shipped-game need is recorded. Web scenario evidence may
still proceed.

## Ordered PRDs

1. [PRD-001 Agent Proof Loop Scenario Ratchet](../done/PRD-001-agent-proof-loop-scenario-ratchet.md) - done
2. [PRD-002 Native Parity Closure And Proof Loop](PRD-002-native-parity-closure-and-proof-loop.md) - freeze-gated
3. [PRD-003 Contract De-Sprawl Through Authoring Modules And Runtime Trace Contracts](PRD-003-contract-de-sprawl-authoring-runtime-traces.md)
4. [PRD-004 Cinematic Default Look](PRD-004-cinematic-default-look.md)
5. [PRD-005 Believable Worlds: Heightfield Terrain And Biome Dressing](PRD-005-believable-world-terrain-and-biome-dressing.md)
6. [PRD-006 Runtime-Proven Efficient Scale](PRD-006-runtime-proven-efficient-scale.md)
7. [PRD-007 Declarative Gameplay Flow](PRD-007-declarative-gameplay-flow-spawners-sequencer.md)
8. [PRD-008 Actor Archetypes And Typed Scripting](PRD-008-actor-archetypes-and-typed-scripting.md)
9. [PRD-009 Portable Scripting Character And Physics Contacts](PRD-009-portable-scripting-character-physics-contacts.md)
10. [PRD-010 Portable Scripting Delayed Commands And Bounded Scheduling](PRD-010-portable-scripting-delayed-commands-scheduling.md)
11. [PRD-011 Portable Scripting Audio Facade](PRD-011-portable-scripting-audio-facade.md)
12. [PRD-012 Portable Scripting Particle Commands](PRD-012-portable-scripting-particle-commands.md)
13. [PRD-013 Portable Shader Material Parity](PRD-013-portable-shader-material-parity.md)
14. [PRD-014 Portable Photoreal Rendering And Post-Processing](PRD-014-portable-photoreal-rendering-and-postprocessing.md)
15. [PRD-015 Advanced Animation And Physics Depth](PRD-015-advanced-animation-physics-depth.md)
16. [PRD-016 External Services, Media, And Non-Portable Boundaries](PRD-016-external-services-media-boundaries.md)
17. [PRD-017 Signed Installers And Store Packaging](PRD-017-signed-installers-store-packaging.md)
18. [PRD-018 Native Render Parity And Performance](PRD-018-native-render-parity-and-performance.md) - freeze-gated
19. [PRD-019 Humanoid Course Stair Traversal Proof](PRD-019-humanoid-course-stair-traversal-proof.md) - web-first; native deferred
20. [PRD-020 Humanoid Course Ramp Slope Proof](PRD-020-humanoid-course-ramp-slope-proof.md) - web-first; native deferred
21. [PRD-021 Humanoid Course Character-Pushed Ball](PRD-021-humanoid-course-character-pushed-ball.md) - web-first; native deferred

## Boundary

Docs-only cleanup, editor work, plugins, optional app-shell work, and other
non-roadmap backlog stay in `docs/PRDs/other/`.
