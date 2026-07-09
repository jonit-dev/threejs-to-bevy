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
proof evidence, and a focused gate. PRD-018 and PRD-019 are therefore
freeze-gated, and the native/desktop halves of PRD-002, PRD-020, and PRD-021
are deferred unless that shipped-game need is recorded. Web scenario evidence
may still proceed.

## Ordered PRDs

1. [PRD-001 Agent Proof Loop Scenario Ratchet](../done/PRD-001-agent-proof-loop-scenario-ratchet.md) - done
2. [PRD-002 Humanoid Course Stair Traversal Proof](../done/PRD-002-humanoid-course-stair-traversal-proof.md) - done; native proof deferred by freeze
3. [PRD-003 External Services, Media, And Non-Portable Boundaries](../done/PRD-003-external-services-media-boundaries.md) - done
4. [PRD-004 Contract De-Sprawl Through Authoring Modules And Runtime Trace Contracts](PRD-004-contract-de-sprawl-authoring-runtime-traces.md)
5. [PRD-005 Cinematic Default Look](PRD-005-cinematic-default-look.md)
6. [PRD-006 Believable Worlds: Heightfield Terrain And Biome Dressing](../done/proof-first-engine-loop-2026-07-05/PRD-006-believable-world-terrain-and-biome-dressing.md) - done
7. [PRD-007 Runtime-Proven Efficient Scale](../done/proof-first-engine-loop-2026-07-05/PRD-007-runtime-proven-efficient-scale.md) - done
8. [PRD-008 Declarative Gameplay Flow](PRD-008-declarative-gameplay-flow-spawners-sequencer.md)
9. [PRD-009 Actor Archetypes And Typed Scripting](../done/proof-first-engine-loop-2026-07-05/PRD-009-actor-archetypes-and-typed-scripting.md) - done
10. [PRD-010 Portable Scripting Audio Facade](../done/proof-first-engine-loop-2026-07-05/PRD-010-portable-scripting-audio-facade.md) - done
11. [PRD-011 Portable Scripting Delayed Commands And Bounded Scheduling](../done/PRD-011-portable-scripting-delayed-commands-scheduling.md) - done
12. [PRD-012 Portable Scripting Particle Commands](../done/PRD-012-portable-scripting-particle-commands.md) - done
13. [PRD-013 Portable Scripting Character And Physics Contacts](../done/PRD-013-portable-scripting-character-physics-contacts.md) - done
14. [PRD-014 Portable Shader Material Parity](../done/proof-first-engine-loop-2026-07-05/PRD-014-portable-shader-material-parity.md) - done
15. [PRD-015 Portable Photoreal Rendering And Post-Processing](PRD-015-portable-photoreal-rendering-and-postprocessing.md)
16. [PRD-016 Advanced Animation And Physics Depth](PRD-016-advanced-animation-physics-depth.md)
17. [PRD-017 Signed Installers And Store Packaging](PRD-017-signed-installers-store-packaging.md)
18. [PRD-018 Native Parity Closure And Proof Loop](PRD-018-native-parity-closure-and-proof-loop.md) - freeze-gated
19. [PRD-019 Native Render Parity And Performance](PRD-019-native-render-parity-and-performance.md) - freeze-gated
20. [PRD-020 Humanoid Course Ramp Slope Proof](../done/PRD-020-humanoid-course-ramp-slope-proof.md) - done
21. [PRD-021 Humanoid Course Character-Pushed Ball](../done/PRD-021-humanoid-course-character-pushed-ball.md) - done

## Boundary

Docs-only cleanup, editor work, plugins, optional app-shell work, and other
non-roadmap backlog stay in `docs/PRDs/other/`.
