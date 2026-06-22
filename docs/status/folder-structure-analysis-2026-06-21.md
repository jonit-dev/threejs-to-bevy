# Folder Structure Analysis

Date: 2026-06-21

## Scope

This review inspected the repository layout, root scripts, workspace config,
runtime boundaries, examples/templates, and verification/test organization. It
did not evaluate implementation correctness inside feature modules.

Inputs inspected:

- `AGENTS.md`
- `package.json`
- `pnpm-workspace.yaml`
- `docs/workflows/developer-workflow.md`
- `docs/status/verification-script-classification.md`
- `packages/*/package.json`
- `tools/verify/src/*`
- `runtime-bevy/Cargo.toml`
- `scripts/*.mjs`
- top-level source and asset roots, excluding generated `dist`, `target`, and
  `node_modules` trees for counts

## Overall Assessment

Structure score: 6.5/10.

The product boundaries are mostly sound: TypeScript authoring packages,
published web runtime package, separate Rust native runtime, examples,
templates, docs, and verification tooling all have a defensible reason to
exist. The pain is not that the major folders are wrong. The pain is that
several historical/milestone layers still coexist, so contributors see multiple
ways to prove, scaffold, and demonstrate the same thing.

Scorecard:

| Area | Score | Rationale |
| --- | ---: | --- |
| Runtime/package boundaries | 8 | `runtime-bevy/` being root-level is intentional and matches the documented target layout. |
| Examples/templates clarity | 5 | Both are legitimate, but current versioned duplication makes their roles feel redundant. |
| Test and verification clarity | 5 | Ordinary tests exist, but root scripts and `tools/verify` gates blur the difference between tests, E2E proofs, and release evidence. |
| Workspace hygiene | 6 | `pnpm-workspace.yaml` includes `packages/*` and `tools/*`, while examples/templates are intentionally external projects. Generated and copied outputs are still noisy in local tree scans. |
| Artifact/source ownership | 6 | The repo has a policy, but top-level `assets-source/` and many historical verifier artifacts make ownership harder to see. |

## Recommendations

### 1. Keep `runtime-bevy/` At The Root

Decision: do not move it now.

Evidence:

- `docs/workflows/developer-workflow.md` defines the target layout with
  `runtime-bevy/` as a top-level Rust workspace alongside `packages/`,
  `examples/`, and `docs/`.
- `runtime-bevy/Cargo.toml` is its own Cargo workspace with `members =
  ["crates/*"]`.
- `pnpm-workspace.yaml` only includes `packages/*` and `tools/*`, so
  `runtime-bevy/` is intentionally outside the Node package workspace.
- The repo guidance says Bevy is an internal native runtime adapter, not a
  user-facing authoring package.

Why it is reasonable:

`packages/runtime-web-three` is a publishable TypeScript package. `runtime-bevy`
is a Rust workspace and native adapter source that is distributed through CLI
packaging. Putting it under `packages/` would make it look like a pnpm package
and create a false symmetry with the web runtime.

What to improve:

- Add a short root `runtime-bevy/README.md` that explains why it is root-level,
  how it is packaged, and which commands own it.
- Keep Bevy-only artifacts under `runtime-bevy/artifacts/<gate>/` and
  cross-runtime evidence under `tools/verify/artifacts/<gate>/`.
- If the repo ever does a broad layout migration, consider `runtimes/bevy/` and
  `runtimes/web-three/` together. Do not move only Bevy; that would increase
  confusion.

Risk: low if documenting only; high if moving now because many scripts,
package-copy paths, and docs reference `runtime-bevy/`.

### 2. Keep Both `examples/` And `templates/`, But Stop Treating Versioned Copies As Permanent

Decision: keep both folders, reduce duplication.

The folders have different jobs:

- `examples/` should be runnable evidence and regression targets. They prove
  feature behavior and cross-runtime parity.
- `templates/` should be scaffold inputs used by `tn create`/`tn init`.

The current issue is that some examples and templates are near-copies:

- `examples/v2-arena` and `templates/v2-arena`
- `examples/v3-environment` and `templates/v3-environment`
- `examples/v4-scripting` and `templates/v4-scripting`
- later functional/starter variants such as `examples/v7-functional` and
  `templates/starter-functional`

Recommendation:

- Define one owner for each starter. Prefer `templates/<name>` as the source of
  scaffoldable starter code.
- For every scaffoldable starter, generate or smoke-test an example from the
  template instead of maintaining a permanent manual copy.
- Keep feature proof scenes that are not intended as user starters only under
  `examples/`.
- Add a small manifest, for example `templates/templates.json`, listing
  supported public templates, status, and the example/gate that proves each one.
- Start retiring milestone-versioned template names from the public front door.
  Keep compatibility aliases only where needed.

Risk: medium. Template/example consolidation can break docs, CLI copy behavior,
and release gates if done as a broad rename. Do it one template pair at a time.

### 3. Keep `tools/verify/`, But Narrow Its Meaning

Decision: keep `tools/verify` as the gate orchestrator, not as a dumping ground
for tests.

The existing policy is mostly correct:

- ordinary package tests are `test`
- cross-package, cross-runtime, visual, durable-artifact, conformance, and
  release proofs are gates
- new verification gate implementation belongs under `tools/verify/src`
- compatibility wrappers may remain under `scripts/`

The actual repo still feels noisy because all three layers are visible:

- root scripts such as `verify:v8:*`, `verify:v9:*`, and `verify:v10:*`
- typed `tools/verify/src` gate modules
- package-local `*.test.ts` files

Recommendation:

- Keep `tools/verify/src/cli/run.ts` as the focused gate dispatcher.
- Move remaining root `scripts/verify-*.mjs` implementations into typed modules
  under `tools/verify/src`, leaving `scripts/` only for compatibility wrappers
  and simple repo maintenance.
- Add a hard rule: if a check does not need multiple packages, Bevy, browser
  capture, durable artifacts, packaging, or release aggregation, it belongs in
  the owning package as a test, not in `tools/verify`.
- Rename root command families by purpose over time:
  - `pnpm test` for package-local correctness
  - `pnpm verify:focused <gate>` for one durable proof
  - `pnpm verify:conformance` for shared IR runtime conformance
  - `pnpm verify:release` for release evidence
- Keep historical `verify:v*` commands only as aliases with deprecation output.

Risk: low to medium. The direction is already documented, but migration touches
release scripts and docs.

### 4. Do Not Wholesale Rename Tests To `.spec.*`; Add An E2E Convention Instead

Decision: keep `*.test.*` for ordinary tests; introduce an explicit E2E suffix
for true end-to-end tests.

Current scan result, excluding generated output and dependency folders:

- total test-like files: 293
- `*.test.*`: 293
- `*.spec.*`: 0
- `*.e2e.*`: 0

This is consistent, even if it is not the convention you prefer. Renaming all
package tests to `.spec.ts` would create churn without improving ownership.

The real missing convention is E2E classification. Browser/native/runtime tests
and package unit tests are not visually distinct enough.

Recommendation:

- Keep package unit/integration tests as `*.test.ts`.
- Use `*.e2e.test.ts` or `*.e2e.mjs` for tests that launch a real CLI,
  browser, generated project, package install, or native runtime.
- Use `*.visual.test.ts` only for deterministic visual analysis helpers, not for
  full release evidence.
- Keep `tools/verify` gates named by capability, not by test suffix, because
  they produce durable reports and artifacts.
- Document this in `docs/workflows/conventions.md` or
  `docs/workflows/developer-workflow.md`.

Risk: low. This can be introduced only for new tests and applied opportunistically
when touching existing E2E-like tests.

### 5. Re-home Or Document Top-Level `assets-source/`

Decision: top-level `assets-source/` needs an explicit owner.

The folder is large and sits outside the documented canonical roots. Existing
status docs mention `assets-source/environment` as V5 source material, but the
developer workflow policy says example assets should live inside the owning
example or emitted bundle when possible.

Recommendation:

- If these are shared raw source assets, move them under
  `examples/_shared/assets-source/` or `tools/assets-source/` and document the
  pipeline that consumes them.
- If they only support one or two examples, move the needed subset into those
  examples.
- If they are historical source material, archive externally or document why the
  repo needs to keep them checked in.

Risk: medium. Asset path changes can break examples and verification scripts.
Do not move this without first searching references and adding a narrow asset
path compatibility plan.

### 6. Clean Up Generated Output Visibility

Decision: tighten local tree hygiene, but do not mix this with structural moves.

Local scans show many `dist`, `target`, `node_modules`, artifacts, and copied
template files. These may be ignored, but they make folder analysis and agent
navigation noisy.

Recommendation:

- Audit `.gitignore` and `check:names` coverage for generated outputs.
- Keep generated examples/template output out of tracked source unless a PRD
  explicitly promotes it as evidence.
- Consider adding a `pnpm clean` command that removes common generated trees:
  package `dist`, example `dist`, template `dist`, `runtime-bevy/target`, and
  transient verifier artifacts.

Risk: low if implemented as an opt-in clean command.

## Suggested Target Layout

No immediate broad move is recommended. The target should be a clarified version
of the existing layout:

```txt
packages/
  sdk/
  authoring/
  ir/
  compiler/
  cli/
  runtime-web-three/
  ui/
  r3f/
  editor/
  mcp-server/
runtime-bevy/
  README.md
  Cargo.toml
  crates/
examples/
  <feature-or-canonical-proof>/
templates/
  templates.json
  <public-starter>/
tools/
  verify/
    src/
    artifacts/
scripts/
  <compatibility-wrappers-and-maintenance-only>
docs/
  architecture/
  contracts/
  runtime/
  workflows/
  status/
  PRDs/
```

## Migration Plan

1. Add `runtime-bevy/README.md` documenting why it is root-level.
2. Add or update workflow docs with the test naming policy:
   `*.test.ts` for package tests and `*.e2e.test.ts` for true E2E.
3. Create `templates/templates.json` and mark which templates are public,
   compatibility-only, or internal.
4. Pick one duplicated example/template pair and make one side generated or
   smoke-tested from the other.
5. Move one root `scripts/verify-*.mjs` implementation into `tools/verify/src`
   as a pilot, leaving a wrapper behind.
6. Decide ownership for `assets-source/` before moving files.
7. Add `pnpm clean` after confirming ignored generated paths.

## What Should Not Change Right Now

- Do not move `runtime-bevy/` under `packages/`.
- Do not rename all tests from `.test.ts` to `.spec.ts`.
- Do not delete `tools/verify/`; it has a real role for cross-runtime and
  release evidence.
- Do not collapse `examples/` and `templates/` into one folder. Their jobs are
  different.

## Verification

Commands run for this audit were read-only layout and text scans using `find`,
`rg`, `sed`, `nl`, and package metadata inspection. No build or test command was
run because this change only adds an analysis report.

## Files Modified

- Added `docs/status/folder-structure-analysis-2026-06-21.md`
