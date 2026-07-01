# AI-Consumable Distribution Contract

ThreeNative packages must be understandable from their published npm contents,
without requiring repository source. The distribution contract defines what each
package must ship for human users, TypeScript tooling, and AI coding agents.

## Package Artifacts

All public packages with `publishConfig.access: "public"` must ship:

- `types: "./dist/index.d.ts"` in `package.json`.
- `dist` in the package `files` list.
- TypeScript declaration output and declaration maps through the shared
  `tsconfig.base.json` policy.
- An `exports` map for every JavaScript public entrypoint.
- A `types` condition for every JavaScript public export and a `default`
  condition pointing at the built JavaScript file.

Current package-specific requirements:

| Package | Required files | Required exports |
| --- | --- | --- |
| `@threenative/sdk` | `dist` | `.` |
| `@threenative/ir` | `capabilities`, `diagnostics`, `dist`, `schemas` | `.`, `./bundlePaths`, `./conformance`, `./input`, `./reflection`, `./runtimeDiagnostics`, `./capabilities/*`, `./diagnostics/*`, `./schemas/*` |
| `@threenative/authoring` | `dist` | `.` |
| `@threenative/ui` | `dist` | `.`, `./jsx-runtime` |
| `@threenative/r3f` | `dist` | `.`, `./jsx-runtime` |
| `@threenative/compiler` | `dist` | `.` |
| `@threenative/runtime-web-three` | `dist`, `index.html` | `.` |
| `@threenative/cli` | `dist`, `templates` | `.` plus `tn` bin |

## Repo-Level Artifacts

Repo-level AI documentation belongs in the docs site and release verification
surface, not inside every package:

- `llms.txt` and `llms-full.txt` are the compact and expanded AI entry
  points.
- `docs/workflows/ai-distribution.md` describes package roles, authoring flow,
  supported boundaries, schemas, diagnostics, and examples.
- `examples/ai-reference/` holds canonical copy-paste examples that can run
  from a clean installed project.

## Future Package Metadata

Promoted package-local artifacts:

- `@threenative/ir/capabilities/*` for a versioned feature manifest.
- `@threenative/ir/diagnostics/*` for stable diagnostic code metadata.
- Canonical AI examples will be included in the distribution surface where the
  release verifier proves they can build without repository-only paths.
- `@threenative/cli` copies the repo-level AI docs into `dist/ai/` during
  package build so installed consumers can read the same front door without
  repository source.
- Generated starter templates that are meant for agent-assisted authoring must
  include local `AGENTS.md` and `CLAUDE.md` files that point agents at
  `tn ... --json` and durable source documents instead of generated bundles.

`scripts/check-distribution-contract.mjs` enforces declarations, declaration
maps, `files` entries, type-aware public exports, and the promoted IR
capability/diagnostics metadata exports. The checker keeps negative coverage
for planned examples exports so later phases can promote those requirements
without changing diagnostic shape.

## Verification

Use these checks when package metadata changes:

```bash
node --test scripts/check-distribution-contract.test.mjs
node scripts/check-distribution-contract.mjs
pnpm verify:distribution
```

`pnpm verify:distribution` runs the contract checker before packing tarballs, so
missing public type metadata fails before the slower clean-consumer proof.
It also installs the packed CLI package and confirms the copied `dist/ai`
front-door docs mention the SDK, IR capabilities, diagnostics, unsupported
raw Bevy authoring, and generated-bundle boundary.
