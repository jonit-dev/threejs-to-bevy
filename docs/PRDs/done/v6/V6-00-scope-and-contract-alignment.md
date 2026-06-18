# V6-00 Scope and Contract Alignment

Complexity: 5 -> MEDIUM mode

## Context

**Problem:** V6 needs a precise planning front door so common game-engine
parity work does not drift into V7, editor, online, or renderer scope.

**Files Analyzed:** `docs/ROADMAP.md`, `docs/STATUS.md`,
`docs/bevy-feature-parity.md`, `docs/PRDs/v5/README.md`,
`docs/diagnostics.md`, `docs/ecs.md`, `docs/ui.md`, `docs/scripting-api.md`.

## Integration Points

- Entry point: documentation and future `pnpm check:docs:v6`.
- Caller file: future version-gate scripts and version PRD readers.
- User-facing: no runtime UI; this is the implementation front door.

## Solution

Create the V6 PRD index and align status/parity docs around one claim: common
small-game feature parity across SDK, IR, validation, web, Bevy where claimed,
conformance, docs, examples, and release gates.

## Execution Phases

#### Phase 1: V6 Front Door - Agents can find the ordered V6 ticket set.

**Files (max 5):**

- `docs/PRDs/v6/README.md` - ticket order, scope, acceptance, release gate.
- `docs/STATUS.md` - current V6 planning pointer.
- `docs/bevy-feature-parity.md` - V6 drift expectations.
- `docs/feature-maturity.md` - V6 maturity rows if needed.

**Implementation:**

- [ ] Add the V6 ticket order and release-gate expectations.
- [ ] Link V6 PRDs from current truth sources.
- [ ] State explicit V6 exclusions and V7 deferrals.
- [ ] Require a maintained `examples/` proof and matching `tools/verify/artifacts/milestones/v6`
  evidence for the final V6 release gate.
- [ ] Require rendered visual artifacts for promoted visible features where
  practical, using the repo visual verification workflow as guidance.
- [ ] Require status/parity updates for every version-scoped V6 completion.

**Tests Required:**

| Test File | Test Name | Assertion |
| --- | --- | --- |
| `scripts/check-docs-v6.test.mjs` | `should require every V6 PRD link from the index` | Missing V6 ticket links fail the docs gate. |

**User Verification:**

- Action: Open `docs/PRDs/v6/README.md`.
- Expected: The full V6 order, exclusions, and gate are discoverable.

#### Phase 2: Scope Guardrails - V6 cannot silently claim V7 or product-surface work.

**Files (max 5):**

- `scripts/check-docs-v6.mjs` - future docs gate.
- `scripts/check-docs-v6.test.mjs` - guardrail tests.
- `package.json` - script registration.
- `docs/PRDs/v6/README.md` - required phrases.

**Implementation:**

- [ ] Require V6 docs to mention gameplay, physics, animation, UI, audio,
  conformance, Rust evidence, and functional scene evidence.
- [ ] Reject V6 completion claims for editor, online, networking, replication,
  collaboration, public plugins, custom renderer replacement, raw Three.js, and
  direct Bevy authoring.
- [ ] Require V7 deferral language for deeper physics, animation graphs, richer
  UI/audio, packaging, and broad performance work.
- [ ] Require docs to say V6 examples and artifacts follow existing folder
  patterns and prove runtime behavior, not just successful compilation.
- [ ] Require docs to reject "build passed" as sufficient proof for visible
  runtime features.

## Verification Strategy

- `pnpm check:docs:v6`
- `node --test scripts/check-docs-v6.test.mjs`
- Manual review against `docs/ROADMAP.md`

## Acceptance Criteria

- [ ] V6 PRDs are discoverable from `docs/PRDs/v6/README.md`.
- [ ] Status and parity docs agree on V6 scope and exclusions.
- [ ] Docs checks can catch missing V6 PRD links and forbidden scope claims.
- [ ] V6 instructions require an example under `examples/` and evidence under
  `tools/verify/artifacts/milestones/v6`.
- [ ] V6 instructions require real rendered artifacts for visible features where
  practical.
