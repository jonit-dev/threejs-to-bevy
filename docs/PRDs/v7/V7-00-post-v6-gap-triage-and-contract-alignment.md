# V7-00 Post-V6 Gap Triage and Contract Alignment

Complexity: 6 -> MEDIUM mode

## Context

**Problem:** V7 must start from explicit post-V6 gaps so deeper parity work does
not become unbounded engine, editor, online, or renderer scope.

**Files Analyzed:** `docs/ROADMAP.md`, `docs/STATUS.md`,
`docs/bevy-feature-parity.md`, `docs/feature-maturity.md`,
`docs/runtime-adapters.md`, `docs/scripting.md`, `docs/scripting-api.md`,
`docs/ui.md`, `docs/ecs.md`.

## Integration Points

- Entry point: V7 PRD index, post-V6 gap triage, and future docs gate.
- Caller file: `scripts/check-docs-v7.mjs`.
- User-facing: no runtime UI; this ticket defines the implementation boundary.

## Solution

Create a post-V6 triage table and align docs around promoted, deferred, and
never-portable categories before V7 feature work starts.

## Execution Phases

#### Phase 1: Gap Triage - V7 work starts from explicit post-V6 status.

**Files (max 5):**

- `docs/PRDs/v7/README.md` - ticket order and scope.
- `docs/STATUS.md` - V7 planning pointer.
- `docs/bevy-feature-parity.md` - post-V6 drift table.
- `docs/feature-maturity.md` - maturity rows if needed.

**Implementation:**

- [ ] Add promoted/deferred/never-portable categories for V7 candidates.
- [ ] Require V6 baseline references for every V7 feature ticket.
- [ ] Require a maintained `examples/` proof, optional matching template where
  promoted, and matching `artifacts/v7` evidence for the final V7 release gate.
- [ ] Require rendered visual artifacts for promoted visible features where
  practical, using the repo visual verification workflow as guidance.
- [ ] State exclusions for editor, online, networking, collaboration, plugins,
  direct Bevy, raw Three.js, and broad shader graphs.

#### Phase 2: Docs Guardrails - V7 scope can be machine-checked.

**Files (max 5):**

- `scripts/check-docs-v7.mjs` - docs gate.
- `scripts/check-docs-v7.test.mjs` - guardrail tests.
- `package.json` - script registration.
- `docs/PRDs/v7/README.md` - required links.

**Implementation:**

- [ ] Require every V7 ticket to be linked from the index.
- [ ] Reject forbidden V7 completion claims.
- [ ] Require docs to say V7 examples/templates and artifacts follow existing
  folder patterns and prove runtime behavior, not just successful compilation.
- [ ] Require docs to reject "build passed" as sufficient proof for visible
  runtime features.
- [ ] Require explicit deferral or never-portable diagnostics for backend-only
  features.

## Verification Strategy

- `pnpm check:docs:v7`
- `node --test scripts/check-docs-v7.test.mjs`
- Manual review against V6 completion docs

## Acceptance Criteria

- [ ] V7 scope is discoverable, ordered, and tied to post-V6 gaps.
- [ ] Status, parity, and maturity docs agree before implementation starts.
- [ ] V7 instructions require an example under `examples/` and evidence under
  `artifacts/v7`.
- [ ] V7 instructions require real rendered artifacts for visible features where
  practical.
