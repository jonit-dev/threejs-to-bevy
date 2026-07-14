# Agent Engine Wishlist Delivery Roadmap (2026-07-11)

Status: complete. All four delivery PRDs are promoted; remaining example
adoption is ordinary follow-up work.

Source: [`WISHLIST-2026-07-11.md`](WISHLIST-2026-07-11.md)

This folder batches the wishlist by owning runtime contract and delivery path.
It deliberately does not create one PRD per wishlist item: related primitives
share IR, host, conformance, and documentation work, so implementing them as a
batch avoids repeated service plumbing and duplicate registries.

## Delivery order

| Order | PRD | Wishlist items | Why this boundary |
| --- | --- | --- | --- |
| 1 | [PRD-001 Runtime State Integrity And Write Audit](PRD-001-runtime-state-integrity-and-write-audit.md) | 2, 4 | Sensor phase memory and write provenance share per-tick runtime state, trace artifacts, and playtest diagnostics. |
| 2 | [PRD-002 Project-Local Script Modules](PRD-002-project-local-script-modules.md) | 1 | Module graph resolution is compiler-owned and should land before later examples are split into reusable scripts. |
| 3 | [PRD-003 Runtime-Owned Gameplay Primitives](PRD-003-runtime-owned-gameplay-primitives.md) | 5, 6, 7 residual, 8 | Patrol, entity FSMs, tagged lifecycle queries, and countdowns share component/resource ticking and gameplay proof. |
| 4 | [PRD-004 Portable Feedback And World Presentation](PRD-004-portable-feedback-and-world-presentation.md) | 3, 9, 10, 11 | Tweening, shake, effect presets, and world text are bounded presentation commands with common lifetime/cancellation rules. |

The order is intentional. PRD-001 makes failures diagnosable; PRD-002 makes
the scripts used by later fixtures maintainable; PRD-003 removes recurring
gameplay plumbing; PRD-004 raises the quality ceiling after the underlying
loop is trustworthy.

## Current-state reconciliation

The wishlist was compared with the current tree before slicing. The following
items are already promoted and must not be reimplemented:

| Wishlist item | Current evidence | Roadmap treatment |
| --- | --- | --- |
| 7 native reconciliation | `docs/PRDs/done/other/system-code-quality-remediation-2026-07-08/PRD-001-native-scripted-spawn-despawn-live-reconciliation.md` | PRD-003 covers only tags, queries, lifecycle observations, and proof assertions. |
| 12 persistence | `ctx.persistence.*` in `docs/contracts/scripting-host-matrix.md`; persistence/reload conformance evidence | No new PRD. The existing declared save-slot contract is the bounded equivalent of key-value storage. |
| 13 seeded RNG | `ctx.random.float/range/int/bool/pick` in `docs/contracts/scripting-api.md` | No new PRD. Presets in PRD-004 reuse this service. |
| 14 interpolated update poses | `docs/contracts/runtime-frame-input.md` and the web/native game-loop contract tests | No new PRD. Camera feedback must consume the existing interpolated snapshot. |
| 15 screen/scene queries | `ctx.picking.pointerRay`, `ctx.picking.mesh`, and `ctx.physics.raycast` in `docs/contracts/scripting-host-matrix.md` | No new PRD. Exact-triangle precision may be tightened later only if a game or conformance fixture proves the existing mesh-picking approximation insufficient. |

Other partial foundations are reused rather than replaced:

- Runtime resource observation diagnostics already exist; PRD-001 adds
  general component/resource write provenance and conflict classification.
- Native scripted spawn/despawn already reconciles the live world; PRD-003
  builds tag queries and lifecycle observations on that reconciled state.
- Bounded particle and script-audio commands already exist; PRD-004 adds a
  registry-owned preset layer rather than a second effects engine.
- Delayed commands and fixed-tick scheduling already establish bounded effect
  lifetime and cancellation conventions; tweening follows those conventions.

## Shared release rules

- Web-first is allowed for new capability breadth under the parity freeze.
  Cross-runtime correctness changes in PRD-001 remain web/native together.
- Every new service ID is added to the owning scripting-host registry first;
  SDK types, validation, both hosts, docs, and tests derive from or are guarded
  against that registry.
- Every new structured component/resource shape uses the owning IR/schema
  definition and bounded authoring operation. No second hand-maintained list.
- Each phase is a user-testable vertical slice touching at most five files or
  explicit file families, followed by an automated PRD checkpoint review.
- Capability promotion updates `docs/status/capabilities/scripting.md` (and
  rendering/audio capability pages when applicable), the one-line entry in
  `docs/STATUS.md`, and `docs/bevy-feature-parity.md` only when parity claims or
  evidence actually change.
- Reusable script/CLI patterns update `docs/cookbook` and run
  `pnpm verify:cookbook`.

## Roadmap acceptance criteria

- [ ] All four PRDs meet their individual acceptance criteria.
- [ ] No completed wishlist capability is duplicated under a new API name.
- [ ] Coin-patrol or another off-recipe game is refactored to consume project
      modules, one runtime-owned gameplay primitive, and one presentation
      preset with less authored script code than its baseline.
- [ ] Web playtests report stable state transitions and write conflicts without
      engine-source forensics.
- [ ] Required cross-runtime correctness fixtures pass
      `pnpm verify:conformance` and desktop playtest proof.
