# Systems Code Quality Remediation (2026-07-14)

This active bundle converts five lower-scoring rows in
`docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` into bounded implementation work.
Each row retains a separate owner because the runtime, public typing, UI, and
asset-proof boundaries have different verification paths. The PRDs are batched
here so shared conformance and status work happens once and execution order is
explicit.

## Execution Order

1. [Interaction Fixed-Tick Executor Parity](../../done/other/systems-code-quality-remediation-2026-07-14/PRD-001-interaction-fixed-tick-executor-parity.md) — complete
2. [Durable Persistence, Settings, and Local Data](../../done/other/systems-code-quality-remediation-2026-07-14/PRD-002-durable-persistence-settings-local-data.md) — complete
3. [Script Context Type Contract Closure](../../done/other/systems-code-quality-remediation-2026-07-14/PRD-003-script-context-type-contract-closure.md) — complete
4. [UI, Text, Widget, and Accessibility Proof Closure](PRD-004-ui-text-widget-accessibility-proof-closure.md)
5. [Portable Model-Test Projects and Authored Material Evidence](../../done/other/systems-code-quality-remediation-2026-07-14/PRD-005-portable-model-test-material-evidence.md) — complete

PRD-003 precedes PRD-004 because UI, persistence, and settings proof scripts
should compile against the public `ScriptContext`, not adapter-private types.
PRD-005 is independent and may run in parallel with PRD-002 through PRD-004.

## Source Evidence

- Status owner: `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`
- UI capability truth: `docs/status/capabilities/ui.md`
- Scripting capability truth: `docs/status/capabilities/scripting.md`
- Asset capability truth: `docs/status/capabilities/assets.md`
- Cross-runtime parity truth: `docs/bevy-feature-parity.md`
- Model-test audit: `docs/audits/blender-headless-cli-spike-2026-07-13.md`

## Bundle Guardrails

- Fix the owning registry, typed IR, or runtime seam; do not add a second
  hand-maintained list.
- No score or capability promotion is earned by trace-only evidence where the
  report calls for live behavior, durable storage, rendered pixels, or a cold
  restart.
- Unsupported screen-reader, IME, virtual-keyboard, cloud-save, or platform
  storage behavior stays explicit and diagnostic until separately proved.
- Generated model-test projects must be relocatable and must not encode the
  developer's checkout path.
- Every runtime-contract phase runs its narrow tests before
  `pnpm verify:conformance`.

## Bundle Acceptance

- [ ] The four confirmed interaction divergences have paired positive and
      negative cross-runtime evidence.
- [x] A native save and setting survive a real process restart using a bounded
      target-profile storage location.
- [x] The public `ScriptContext` contains every promoted runtime service and a
      drift test rejects untyped additions without a migration allowlist.
- [ ] UI claims distinguish rendered, behavioral, accessibility-metadata, and
      unsupported evidence; promoted rows have the required proof type.
- [x] `tn model-test` emits relocatable projects and proves imported authored
      material rather than a white primitive fallback.
- [ ] Matching status/capability/parity docs are updated only after evidence
      passes.
- [ ] The final implementation checkpoint runs `pnpm verify:conformance` plus
      each PRD's focused commands.

## Checkpoint Protocol

After each implementation phase, run the phase commands and request an
independent `prd-work-reviewer` checkpoint against that PRD. Continue only on
PASS. Phases with screenshots, assistive-technology runs, or restart proof also
require the manual evidence named in the PRD.
