# UI System Remediation PRDs

This bundle slices
[`docs/audits/ui-system-inspection.md`](../../../audits/ui-system-inspection.md) into ordered,
verifiable work. The inspection found one P0 web/runtime correctness bug,
several stale or overstrong Bevy parity claims, authoring/IR drift, weak
behavioral proof, and smaller editor/runtime hygiene gaps.

The goal is not broad new UI ambition. The goal is to make the existing
retained UI contract honest, script-observable, authorable, and proved at the
behavior level where support is claimed.

## Ordered PRDs

1. [PRD-001 Web UI Action Delivery and Live State](../../done/other/ui-system-remediation-2026-07-08/PRD-001-web-ui-action-delivery-live-state.md) - done
2. [PRD-002 UI Parity Claim Truthing](../../done/other/ui-system-remediation-2026-07-08/PRD-002-ui-parity-claim-truthing.md) - done
3. [PRD-003 UI Authoring API and Type Closure](../../done/other/ui-system-remediation-2026-07-08/PRD-003-ui-authoring-api-type-closure.md) - done
4. [PRD-004 Portable UI Rendering Semantics Decision](../../done/other/ui-system-remediation-2026-07-08/PRD-004-portable-ui-rendering-semantics-decision.md) - done
5. [PRD-005 Behavioral UI Conformance Probes](../../done/other/ui-system-remediation-2026-07-08/PRD-005-behavioral-ui-conformance-probes.md) - done
6. [PRD-006 Editor Runtime UI Preview](../../done/other/ui-system-remediation-2026-07-08/PRD-006-editor-runtime-ui-preview.md) - done
7. [PRD-007 Native UI Runtime Hygiene](../../done/other/ui-system-remediation-2026-07-08/PRD-007-native-ui-runtime-hygiene.md) - done

## Dependency Shape

- PRD-001 is first. Web action delivery is a confirmed correctness bug and is
  prerequisite evidence for later behavior probes.
- PRD-002 can run in parallel with PRD-001 because it is a docs/status truthing
  slice, but it must land before any UI/native parity promotion.
- PRD-003 is authoring-facing and can proceed after PRD-002's documented
  boundaries are settled.
- PRD-004 decides whether presentation features become rendered behavior or
  explicit diagnostics before PRD-005 tries to prove them.
- PRD-005 follows PRD-001 and PRD-004 because it needs stable runtime behavior
  to assert.
- PRD-006 is independent after PRD-001 if previewed UI interactions are expected
  to reflect script behavior.
- PRD-007 is independent hygiene work; it should not promote new parity claims
  without PRD-002/PRD-005 evidence.

## Inspection Coverage Map

| Inspection item | Owning PRD |
| --- | --- |
| Web UI actions queued but not delivered to scripts | PRD-001 |
| `context.ui` detached from the live overlay | PRD-001 |
| Bevy parity rows overclaim traced/unproved behavior | PRD-002 |
| Capability docs and `STATUS.md` need honest UI/native claims | PRD-002 |
| JSX cannot author `textInput` or component instances | PRD-003 |
| Widget props are too permissive | PRD-003 |
| Missing TSX capture-to-bundle test | PRD-003 |
| Component cycle/provenance diagnostics and theme alias cycles | PRD-003 |
| Gradients, shadows, effects, atlas/nine-slice, safe area, and native `textInput` semantics | PRD-004 |
| Conformance is structural rather than behavioral/pixel-aware | PRD-005 |
| Interaction, focus walk, disabled toggle, nested scroll, and screenshot probes | PRD-005 |
| Editor cannot preview authored runtime UI overlay | PRD-006 |
| Native per-frame binding lookup, font fallback, DPI/scale, and trace boilerplate | PRD-007 |
| Web context-menu clamp and disabled-node focus residuals | PRD-004 and PRD-005 |

## Source Evidence

- `docs/audits/ui-system-inspection.md`
- `packages/ui/src/`
- `packages/ir/src/uiTypes.ts`
- `packages/ir/src/uiValidation.ts`
- `packages/compiler/src/emit/ui.ts`
- `packages/runtime-web-three/src/ui/`
- `packages/runtime-web-three/src/systems/contextUi.ts`
- `runtime-bevy/crates/threenative_runtime/src/ui*.rs`
- `runtime-bevy/crates/threenative_runtime/src/input_ui_polish.rs`
- `packages/editor/src/`
- `docs/bevy-feature-parity.md`
- `docs/status/capabilities/ui.md`
- `docs/status/capabilities/native-parity.md`
