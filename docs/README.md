# ThreeNative Documentation

This directory is the documentation front door for the TypeScript authoring
surface, portable IR contract, and web/native runtime adapters.

For current implementation status, start with [STATUS.md](STATUS.md). Version
labels such as `V7` or `verify:v9` are **legacy milestone names** kept during a
staged cleanup. See the [cleanup PRD](PRDs/archive/cleanup-versioned-debt.md)
and the [artifact layout PRD](PRDs/done/artifact-fixture-layout-reorg.md) for
the retained-reference policy enforced by `pnpm check:names`.

## Documentation Groups

- [Architecture](architecture/README.md): product concept, boundaries, goals,
  technical stack, and references.
- [Contracts](contracts/README.md): SDK, ECS, scripting, UI, IR, schema,
  environment scene, and diagnostics contracts.
- [Runtime](runtime/README.md): web Three.js and native Bevy adapter behavior.
- [Workflows](workflows/README.md): contributor workflow, AI workflow,
  conventions, asset pipeline, and artifact ownership.
- [Status](status/README.md): roadmap and maturity tracking.
- [PRDs](PRDs/README.md): current initiatives and historical planning archive.

## Current Checks

```bash
pnpm check:names
pnpm check:docs
pnpm verify:release
pnpm verify:conformance
```

`docs/STATUS.md` remains the stable status front door. Root-level docs other
than `README.md`, `STATUS.md`, and approved compatibility pages should move
into one of the contextual groups above.

## Layout Map

| Old flat path | Current grouped path |
| --- | --- |
| `docs/architecture.md`, `docs/concept.md`, `docs/goals.md`, `docs/tech-stack.md`, `docs/references.md` | `docs/architecture/` |
| `docs/sdk.md`, `docs/ir.md`, `docs/ecs.md`, `docs/ui.md`, `docs/scripting*.md`, `docs/environment-scene-ir.md`, `docs/diagnostics.md` | `docs/contracts/` |
| `docs/runtime-adapters.md`, `docs/runtime-backends.md` | `docs/runtime/` |
| `docs/developer-workflow.md`, `docs/ai-workflows.md`, `docs/conventions.md`, `docs/asset-pipeline.md` | `docs/workflows/` |
| `docs/ROADMAP.md`, `docs/advanced-features-roadmap.md`, `docs/feature-maturity.md` | `docs/status/` |

## Reading Order

1. [STATUS.md](STATUS.md)
2. [architecture/README.md](architecture/README.md)
3. [contracts/README.md](contracts/README.md)
4. [runtime/README.md](runtime/README.md)
5. [workflows/developer-workflow.md](workflows/developer-workflow.md)
6. [visual-parity-policy.md](visual-parity-policy.md)
