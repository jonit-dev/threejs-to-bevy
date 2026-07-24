# Session Learnings Remediation (2026-07-23)

This bundle converts the still-open findings in
[`SESSION-LEARNINGS.md`](../../../SESSION-LEARNINGS.md) into implementation
work. Every finding was checked against the current source, tests, status
documents, completed PRDs, and active PRDs before inclusion.

## Audit disposition

### Included: verified open and not completely planned elsewhere

| PRD | Durable owner | Open findings |
| --- | --- | --- |
| [PRD-001](../done/session-learnings-remediation-2026-07-23/PRD-001-flight-viability-and-realistic-proof.md) | Aerodynamic validation and plan-derived proof contracts | Complete: measured flight viability, focus-realistic input, and plan-derived objective-duration/diagnostic scenarios |
| [PRD-002](PRD-002-runtime-transform-and-temporal-ownership.md) | Runtime transform composition and camera-history policy | Authored/runtime cosmetic transform composition, ocean recenter ownership, camera-safe motion blur |
| [PRD-003](../done/session-learnings-remediation-2026-07-23/PRD-003-executable-projectiles-and-flight-kit.md) | Mechanic descriptors and script stdlib | Complete: executable projectile block and reusable flight rig/audio-edge/propeller/reticle conventions |
| [PRD-004](../done/session-learnings-remediation-2026-07-23/PRD-004-generator-regeneration-integrity.md) | Generator provenance and generated-asset reconciliation | Complete: overwrite-policy preservation, exact animation reconciliation, stable initial state, and duplicate-path repair |
| [PRD-005](../done/session-learnings-remediation-2026-07-23/PRD-005-safe-prototypes-and-agent-authoring-contract.md) | Plan-derived authoring transaction and generated agent guidance | Complete: non-destructive prototypes, process cleanup, capability/direct-edit truth, focused inner loops, compact CLI summaries |
| [PRD-006](PRD-006-runtime-proof-cost-and-preview-freshness.md) | Runtime observation modes and preview module graph | Write-audit overhead, runtime-dist invalidation, freshness proof |
| [PRD-007](PRD-007-portable-shader-expression-grammar-v2.md) | Versioned portable shader IR | Missing arithmetic/vector/operator grammar for portable animated materials |
| [PRD-008](PRD-008-runtime-audio-playback-control.md) | Portable audio service contract | Runtime volume/pitch modulation with web/native conformance |

## Excluded: already fixed

- Aerodynamic angle-of-attack physical-direction regression.
- Native animation readiness evidence and prefab-wrapper animation metadata.
- Pointer-overlay keyboard forwarding.
- Strict dev ports, native binary reuse, and animation evidence.
- Exact fixed-tick playtest input (`holdTicks`/`waitTicks`).
- Blender source animation scale tracks, 16-clip budget, imported-node
  rotation-mode handling, and bind-pose restoration.
- Scripted runtime spawn/despawn support.
- Visual parity reference-dimension capture, bundle hash, and source-mtime
  freshness checks.
- The reviewed advanced-physics circular-oracle, provenance, fallback,
  tolerance ownership, moving-fracture, and bond-selection defects.

## Excluded: already owned by active PRDs

The following remain open but already have an explicit implementation owner in
[`visual-parity-pacific-mastery-2026-07-23.md`](../visual-parity-pacific-mastery-2026-07-23.md):

- Source-backed Blender recipes adding primitive parts.
- Universal grouping of special Three.js mapped objects.
- Animated native `OceanWater`.
- Measured Pacific ocean/render performance work.

The active Pacific PRD must be corrected before execution: scale tracks and a
clip-budget increase are no longer work, and the current renderer does not use
device pixel ratio, so a `maxPixelRatio` field is not justified until profiling
shows a render-scale requirement.

## Execution order

1. PRD-005 is complete and prevents authoring commands from destroying existing
   work.
2. PRD-001 is complete and makes vehicle configurations and their proof trustworthy.
3. PRD-003 is complete: the advertised projectile block is executable and the
   promoted flight abstractions have two consumers.
4. PRD-004 is complete: generator reruns preserve intent and reconcile owned
   output exactly.
5. PRD-006 removes proof-mode overhead and stale runtime feedback.
6. PRD-002 establishes transform/history ownership before more camera-relative
   rendering behaviors are added.
7. PRD-008 adds cross-runtime live audio control.
8. PRD-007 proceeds only when a second shipped material besides water requires
   portable expression composition.

Each phase uses the automated `prd-work-reviewer` checkpoint required by the
PRD standard. High-complexity visual phases additionally require manual
evidence review.
