# AI Distribution Workflow

This workflow is for AI agents and humans working from installed ThreeNative
packages without repository source.

## Read Order

1. `llms.txt` for the compact package and boundary map.
2. `llms-full.txt` for commands, package entrypoints, and examples.
3. `@threenative/ir/capabilities/threenative.capabilities.json` before
   generating advanced features.
4. `@threenative/ir/diagnostics/diagnostics.catalog.json` when a command
   returns a `TN_IR_*` validation failure.
5. `examples/ai-reference/README.md` for copy-paste workflows.

## Generate A Project

```bash
tn create simple-game --template starter
cd simple-game
pnpm install
pnpm run build
pnpm run verify
```

Use `tn verify --json` when an agent needs machine-readable screenshot and
runtime readiness proof.

## Repair A Failure

1. Keep the original diagnostic `code`, `path`, `severity`, `message`, and
   `suggestion`.
2. Look up the code or family in
   `@threenative/ir/diagnostics/diagnostics.catalog.json`.
3. Validate the affected JSON against `@threenative/ir/schemas/*`.
4. Patch durable source files or TypeScript SDK declarations.
5. Re-run the narrow command that failed, then `tn build` or `tn verify`.

Do not patch generated bundle files as the fix unless a command explicitly says
the file is source-persistable.

## Boundaries

Author game data through the SDK, structured source documents, or bounded CLI
operations. Do not author raw Bevy code, durable raw Three.js scenes, browser
DOM APIs, filesystem access, workers, timers, renderer plugin handles, or native
runtime handles unless a package capability says the surface is supported.
