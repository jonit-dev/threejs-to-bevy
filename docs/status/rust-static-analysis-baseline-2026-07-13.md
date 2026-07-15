# Rust Static Analysis Baseline (2026-07-13)

Status: COMPLETE — the captured debt reached zero and the temporary ratchet
data was removed.

## Reproduction

Run from `runtime-bevy` on stable Rust:

```bash
cargo test -p threenative_runtime --test overlay_host
cargo metadata --no-deps --format-version 1
cargo clippy --workspace --all-targets --message-format=json
```

The focused overlay test passed all 8 tests. No overlay source or test change was
needed. The successful post-policy Clippy capture ended with
`build-finished.success: true`, so all declared workspace targets were
analyzable.

## Phase 2 normalized baseline

Cargo emitted 349 warning diagnostics in the successful capture. Cargo replays
the same library diagnostic for multiple compilation profiles and targets, so
raw message count is not the ratchet budget. Diagnostics were deduplicated by
the exact identity:

```text
package, target, kind, lint, path, line, column, message
```

That normalization produced **201 distinct findings**: **189 Clippy findings**
and **12 rustc `dead_code` findings**, grouped into **128 exact
`(lint, path)` pairs**. Policy paths are repository-relative and therefore
begin with `runtime-bevy/`; Cargo's workspace-relative spans are promoted to
that canonical form before comparison.

Cargo metadata declares **88 targets**: 1 for `threenative_components`, 2 for
`threenative_loader`, and 85 for `threenative_runtime`. The checker derives
this inventory directly from metadata on every run. It is independent of
whether a target currently emits a warning, so a silently omitted clean target
still fails analysis completeness without creating a second maintained list.

## Lint totals

| Lint | Distinct findings | Removal phase |
| --- | ---: | --- |
| `clippy::collapsible_if` | 41 | Phase 5 |
| `clippy::too_many_lines` | 39 | Phase 6 |
| `clippy::excessive_nesting` | 26 | Phase 6 |
| `clippy::too_many_arguments` | 12 | Phase 6 |
| `clippy::type_complexity` | 7 | Phase 6 |
| `clippy::bool_assert_comparison` | 11 | Phase 5 |
| `clippy::clone_on_copy` | 7 | Phase 5 |
| `clippy::ptr_arg` | 7 | Phase 5 |
| `clippy::manual_contains` | 4 | Phase 5 |
| `clippy::needless_update` | 4 | Phase 5 |
| `clippy::unnecessary_sort_by` | 4 | Phase 5 |
| `clippy::drop_non_drop` | 3 | Phase 5 |
| `clippy::unnecessary_unwrap` | 3 | Phase 5 |
| Other Clippy lints | 20 | Phase 5 |
| rustc `dead_code` | 12 | Phase 5 |
| **Total** | **201** | |

The four maintainability lints account for 84 findings. The remaining 117
correctness, performance, style, readability, and test-support findings are
scheduled for Phase 5.

## Classification

| Class | Lints | Baseline interpretation |
| --- | --- | --- |
| Correctness / suspiciousness | `drop_non_drop`, `if_same_then_else`, `needless_update`, `unnecessary_mut_passed`, `unnecessary_unwrap` | Remediate first and prove behavior where control flow or ownership changes. |
| Performance | `clone_on_copy`, `iter_cloned_collect`, `manual_contains`, `manual_repeat_n`, `unnecessary_sort_by` | Remove redundant copies, allocations, and searches without changing ordering. |
| Maintainability | `too_many_arguments`, `type_complexity`, `too_many_lines`, `excessive_nesting` | Use stable responsibility boundaries and durable parameter/type abstractions during Phase 6. |
| Style / readability | Remaining Clippy lints | Apply safe, focused cleanups after higher-signal debt. |
| Rust compiler | `dead_code` in test support | Test-only fixture fields remain ordinary warnings and must reach zero before `-D warnings`. |

## Final zero-debt evidence

The temporary exact lint/path policy was reduced from 201 findings across 128
pairs to zero, then deleted. `pnpm check:rust` now owns the production command
and invokes Clippy as:

```text
cargo clippy --workspace --all-targets --message-format=json -- -D warnings
```

The checker still derives expected targets from Cargo metadata, normalizes and
deduplicates Cargo JSON diagnostics, rejects compiler errors and incomplete
analysis, runs rustfmt first, and emits stable structured diagnostics and
artifacts. Final real-command evidence reported zero findings and zero errors;
the direct all-target command also completed with warnings denied.
