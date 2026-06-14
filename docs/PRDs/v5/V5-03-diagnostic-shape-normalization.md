# V5-03 Diagnostic Shape Normalization

Complexity: 7 -> HIGH mode

## Context

**Problem:** Diagnostics are mixed across IR validation, compiler validation,
CLI commands, release gates, docs checks, and native runtime tests. V5 needs
stable, actionable failure output without mass-renaming existing codes.

## Solution

Normalize diagnostic shape around `code`, `severity`, `message`, file/path
context, and suggested fixes where the local diagnostic model supports them.

## Execution Phases

#### Phase 1: IR and Compiler Diagnostics

**Files:**

- `packages/ir/src/validate.ts`
- `packages/compiler/src/validate/index.ts`
- `packages/compiler/src/diagnostics.ts`
- `packages/compiler/src/validate/*.test.ts`

**Implementation:**

- [ ] Preserve stable codes or introduce explicit mapping tables.
- [ ] Replace generic suggestions on V3/V4/V5 paths with domain-specific fixes.
- [ ] Cover missing files, invalid asset refs, missing material/mesh refs,
  texture-slot refs, invalid visibility, and script/system mismatches.

#### Phase 2: CLI, Verifier, Docs, and Native Diagnostics

**Files:**

- `packages/cli/src/diagnostics.ts`
- `packages/cli/src/verify/diagnostics.ts`
- `scripts/check-docs-v5.mjs`
- `scripts/verify-v5.mjs`
- `runtime-bevy/crates/threenative_runtime/src/*`
- `docs/diagnostics.md`

**Implementation:**

- [ ] Ensure CLI JSON output uses the normalized shape.
- [ ] Add stable verifier codes for V5 docs, conformance, visual, and Rust test
  failures.
- [ ] Add native diagnostic coverage for missing assets, unsupported material or
  rendering fields, undeclared script effects, and malformed environment data.

## Verification Strategy

- `pnpm --filter @threenative/ir test`
- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/cli test`
- `cd runtime-bevy && cargo test`
- `pnpm check:docs:v5`

## Acceptance Criteria

- [ ] High-volume failures expose stable codes, severity, path context, and
  actionable messages.
- [ ] Existing emitted codes are not casually renamed.
- [ ] Tests cover accepted and rejected inputs for promoted V5 validation rules.
- [ ] `docs/diagnostics.md` documents V5 verifier and native diagnostic ranges.

