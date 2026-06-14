# V5-00 Scope and Contract Alignment

Complexity: 5 -> MEDIUM mode

## Context

**Problem:** V5 scope exists in roadmap and status docs, but there was no V5 PRD
front door. Without an explicit ticket set, V5 can drift into editor, online,
networking, plugin, or broad renderer work.

**Files Analyzed:** `docs/ROADMAP.md`, `docs/STATUS.md`,
`docs/bevy-feature-parity.md`, `docs/feature-maturity.md`,
`docs/diagnostics.md`, `docs/scripting-api.md`, prior PRD indexes.

## Solution

Create the V5 PRD index and align front-door docs around one claim:
maintainability plus selected 3D visual quality and additive game-authoring
ergonomics, backed by shared fixtures, conformance, Rust tests, diagnostics,
and a release gate.

**Key Decisions:**

- [x] Treat V5 as hardening, visual-quality proof, and additive authoring
  ergonomics, not a new product surface.
- [x] Keep editor, online, networking, replication, public plugins, and custom
  renderer work as V6 or later.
- [x] Require Rust test evidence for any native support claim.
- [x] Require `docs/STATUS.md` and `docs/bevy-feature-parity.md` updates as
  part of version-scoped V5 work.

## Execution Phases

#### Phase 1: V5 Front Door

**Files:**

- `docs/PRDs/v5/README.md`
- `docs/STATUS.md`
- `docs/bevy-feature-parity.md`
- `docs/feature-maturity.md`

**Implementation:**

- [x] Add the V5 ticket order and acceptance criteria.
- [x] Link the V5 PRD index from current truth sources.
- [x] State explicit exclusions in the index and status docs.
- [x] Keep unsupported features documented as future scope.

#### Phase 2: Scope Drift Guardrails

**Files:**

- `docs/PRDs/v5/README.md`
- future `scripts/check-docs-v5.mjs`

**Implementation:**

- [x] Define terms the docs gate must require: `verify:v5`, conformance,
  Rust tests, diagnostics, visual-quality scene, `assets-source/environment`.
- [x] Define terms the docs gate must reject as V5 acceptance scope: online,
  networking, replication, editor, collaboration, public plugin API, custom
  renderer.

## Verification Strategy

- `pnpm check:docs:v5` once V5-10 lands
- `pnpm test`
- Manual review against `docs/ROADMAP.md`

## Acceptance Criteria

- [x] V5 PRDs are discoverable from `docs/PRDs/v5/README.md`.
- [x] Status and parity docs agree that V5 is hardening plus selected visual
  quality and additive game-authoring ergonomics.
- [x] V5 exclusions are explicit and machine-checkable.
- [x] No V5 doc claims editor, online, networking, replication, public plugin,
  or custom renderer support.
