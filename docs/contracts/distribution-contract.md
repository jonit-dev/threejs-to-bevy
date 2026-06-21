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
| `@threenative/ir` | `dist`, `schemas` | `.`, `./bundlePaths`, `./conformance`, `./input`, `./reflection`, `./runtimeDiagnostics`, `./schemas/*` |
| `@threenative/authoring` | `dist` | `.` |
| `@threenative/ui` | `dist` | `.`, `./jsx-runtime` |
| `@threenative/r3f` | `dist` | `.`, `./jsx-runtime` |
| `@threenative/compiler` | `dist` | `.` |
| `@threenative/runtime-web-three` | `dist`, `index.html` | `.` |
| `@threenative/cli` | `dist`, `templates` | `.` plus `tn` bin |

## Repo-Level Artifacts

Repo-level AI documentation belongs in the docs site and release verification
surface, not inside every package:

- `llms.txt` and `llms-full.txt` will be the compact and expanded AI entry
  points.
- `docs/ai/README.md` will describe package roles, authoring flow, supported
  boundaries, schemas, diagnostics, and examples.
- `examples/ai-reference/` will hold canonical copy-paste examples that can run
  from a clean installed project.

## Future Package Metadata

Later phases of the PRD will promote additional package-local artifacts:

- `@threenative/ir/capabilities/*` for a versioned feature manifest.
- `@threenative/ir/diagnostics/*` for stable diagnostic code metadata.
- Canonical AI examples included in the distribution surface where the release
  verifier proves they can build without repository-only paths.

Until those files exist, `scripts/check-distribution-contract.mjs` enforces the
current Phase 1 contract: declarations, declaration maps, `files` entries, and
type-aware public exports. The checker has negative coverage for the planned
capability, diagnostics, and examples exports so future phases can promote those
requirements without changing diagnostic shape.

## Verification

Use these checks when package metadata changes:

```bash
node --test scripts/check-distribution-contract.test.mjs
node scripts/check-distribution-contract.mjs
pnpm verify:distribution
```

`pnpm verify:distribution` runs the contract checker before packing tarballs, so
missing public type metadata fails before the slower clean-consumer proof.
