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

- [ ] Add builders for minimal world bundles, materials, assets, schemas,
  systems, environment scenes, and rejected variants.
- [ ] Refactor duplicated setup in focused tests.
- [ ] Keep deterministic JSON assertions where those assertions protect the
  public contract.

#### Phase 2: Native Shared Fixture Loader

**Files:**

- `runtime-bevy/crates/threenative_runtime/tests/*`
- helper module under `runtime-bevy/crates/threenative_runtime/tests/`
- `packages/ir/fixtures/conformance/*`

**Implementation:**

- [ ] Load shared conformance fixtures by name from Rust tests.
- [ ] Report fixture name and bundle path on failure.
- [ ] Use the same fixture in at least one TypeScript conformance test and one
  Rust test.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/compiler test`
- `pnpm verify:conformance`
- `cd runtime-bevy && cargo test -p threenative_runtime --test conformance`

## Acceptance Criteria

- [ ] Duplicated fixture construction is reduced without changing behavior.
- [ ] Shared fixture helpers do not hide bundle fields from assertions that need
  exact shape checks.
- [ ] Rust tests can consume shared conformance fixtures.

