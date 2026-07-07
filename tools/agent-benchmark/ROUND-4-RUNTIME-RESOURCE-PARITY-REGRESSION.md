# Round 4 Runtime Resource Parity Regression

Date: 2026-07-07

## Failure Class

Round 4 produced repeated zero-displacement playtest failures after a declared
resource value was accepted by build-time validation. The failing reports did
not show whether the runtime loaded, read, or wrote the declared resource, so
agents retried the same assertion without new information.

## Fix

- Web runtime system contexts now record declared resource loads plus
  `context.resources.*` and `context.state(...)` read/write observations.
- Native QuickJS system hosting records the same resource observation shape and
  publishes compact declared/observed resource data through proof-harness
  readiness samples.
- `tn playtest` normalizes web and native runtime resource observations and
  emits `TN_RESOURCE_DECLARED_NOT_OBSERVED` when movement/input assertions fail
  while a declared resource was never read or written.
- Stable playtest artifact summaries detect repeated identical failed
  assertions with `TN_PLAYTEST_REPEATED_ASSERTION`.

## Proof

- `packages/runtime-web-three/src/systems/runner.test.ts`
  - `should pass declared resource values into script context`
  - `should report resource read observations`
- `runtime-bevy/crates/threenative_runtime/tests/systems_host.rs`
  - `systems_host_should_apply_declared_resource_write`
- `packages/cli/src/commands/playtest.test.ts`
  - `resourceObservationDiagnostics should report declared resources not observed after movement failure`
- `packages/cli/src/commands/playtestArtifacts.test.ts`
  - `writePlaytestArtifactBundle should flag repeated identical failed assertions`

## Verification Commands

```bash
pnpm --filter @threenative/runtime-web-three test
pnpm --filter @threenative/cli test
cargo test -p threenative_runtime systems_host_should_apply_declared_resource_write
```
