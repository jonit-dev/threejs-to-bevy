---
name: threenative-workflow
description: Use the generated ThreeNative project workflow from Codex. Applies when editing structured source, adding gameplay, inspecting scenes, or verifying a generated ThreeNative project.
---

# ThreeNative Generated Project Workflow

Use `AGENTS.md` as the authoritative local instructions.

Default loop:

```bash
pnpm tn -- game plan --goal "<game idea>" --project . --json
pnpm tn -- cookbook list --json
pnpm tn -- project map --project . --json
pnpm tn -- iterate --project . --json
```

Prefer bounded source operations:

- `pnpm tn -- scene inspect <scene-id> --node <id> --project . --json`
- `pnpm tn -- add <mechanic-block> ... --project . --json`
- `pnpm tn -- material ... --project . --json`
- `pnpm tn -- ui ... --project . --json`

Do not use standalone validate/build/playtest as the normal verification loop.
If `tn iterate` reports a playtest issue, use:

```bash
pnpm tn -- playtest report --latest --scenario <name> --json
```

Keep durable edits in `content/**/*.json` and `src/scripts/**/*.ts`; do not edit
`dist/**`, emitted bundle JSON, or `scripts.bundle.js`.

## Technical-debt guardrails

- Extend the owning source document, script, manifest, or shared contract; do
  not copy registry data, helpers, fallbacks, or proof logic into a second
  surface.
- Do not repair generated output, weaken assertions, disable scenarios, or
  silently accept unsupported behavior. Fix the durable owner and rerun the
  diagnostic.
- If a temporary bridge is unavoidable, record its owner, removal condition,
  and verification in the plan or issue.
