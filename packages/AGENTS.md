# AGENTS.md

Guidance for TypeScript packages.

- Keep package dependencies aligned with the product flow: `sdk` authoring data,
  `ir` contracts and validators, `compiler` emit/diagnostics, `cli`
  orchestration, runtimes consuming bundles.
- Do not make one package reach through another package's internals.
- Preserve deterministic output for generated IR and bundle files.
- Prefer precise types over casts. Follow existing ESM `NodeNext` patterns.
- Runtime packages should consume IR schemas and bundles; they should not invent
  parallel source formats for game state.
