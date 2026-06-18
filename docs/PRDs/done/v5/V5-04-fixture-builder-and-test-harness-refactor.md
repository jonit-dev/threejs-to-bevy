# V5-04 Fixture Builder and Test Harness Refactor

Complexity: 6 -> MEDIUM mode

## Context

**Problem:** IR, compiler, conformance, and native tests hand-write similar
bundle objects and temp files. This increases drift and makes V5 fixture
expansion expensive.

## Solution

Introduce package-local fixture builders and shared loader helpers while keeping
all behavior unchanged.

## Execution Phases

#### Phase 1: TypeScript Fixture Builders

**Files:**

- `packages/ir/src/*test.ts`
- `packages/compiler/src/*test.ts`
- package-local test helper files

**Implementation:**

- [x] Add builders for minimal world bundles, materials, assets, schemas,
  systems, environment scenes, and rejected variants.
- [x] Refactor duplicated setup in focused tests.
- [x] Keep deterministic JSON assertions where those assertions protect the
  public contract.

#### Phase 2: Native Shared Fixture Loader

**Files:**

- `runtime-bevy/crates/threenative_runtime/tests/*`
- helper module under `runtime-bevy/crates/threenative_runtime/tests/`
- `packages/ir/fixtures/conformance/*`

**Implementation:**

- [x] Load shared conformance fixtures by name from Rust tests.
- [x] Report fixture name and bundle path on failure.
- [x] Use the same fixture in at least one TypeScript conformance test and one
  Rust test.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/compiler test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test -p threenative_runtime --test conformance`

## Acceptance Criteria

- [x] Duplicated fixture construction is reduced without changing behavior.
- [x] Shared fixture helpers do not hide bundle fields from assertions that need
  exact shape checks.
- [x] Rust tests can consume shared conformance fixtures.

## Implementation Evidence

- `packages/ir/src/testFixtures.ts` provides package-local helpers for minimal
  bundle manifests plus world, assets, materials, and target-profile JSON.
- Focused IR validation tests now share the minimal bundle builder while still
  writing rejected audio, UI, physics, input, asset, material, and budget
  variants explicitly in each test.
- `packages/compiler/src/testFixtures.ts` provides a compiler-local fixture copy
  helper for bundle validation tests.
- `runtime-bevy/crates/threenative_runtime/tests/support/mod.rs` loads shared
  conformance fixtures by name and includes fixture name plus bundle path in
  failure messages.
- The TypeScript conformance test catalog and the Rust conformance test both
  consume `packages/ir/fixtures/conformance/basic-scene/game.bundle`.
