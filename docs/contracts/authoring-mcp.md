# Authoring MCP and Editor Adapter Contract

MCP is an optional adapter over structured authoring operations. It is not a
source of truth and must not own a separate game authoring model.

Canonical behavior remains in `@threenative/authoring` and the CLI JSON
surface. MCP tools and future editor adapters must call those same operations
or `tn ... --json` equivalents, then return the same operation result shape as
closely as their transport allows:

- `ok`: whether the operation can be accepted.
- `changed`: whether durable source changed when the underlying operation
  reports it.
- `filesWritten`: project-relative structured source documents written.
- `diagnostics`: stable authoring diagnostics with code, severity, file/path,
  value, related references, suggestion, and optional structured `fix` when
  available.

Diagnostic `fix` payloads are additive and optional. When present, adapters
must preserve them unchanged:

```ts
{
  instruction: string;
  snippet?: string;
  allowed?: string[];
  cookbook?: string;
  docs?: string;
}
```

`instruction` is the machine-readable repair step. `snippet` is an example that
must pass the relevant validator in tests when the repair is code-shaped.
`allowed` lists valid package names or values for allowlist diagnostics.
`cookbook` names a matching executable cookbook entry when one exists, and
`docs` points at the durable contract or workflow that owns the rule.

MCP results may include transport metadata such as the delegated CLI argv and
exit code, but that metadata is not an authoring contract. The wrapped
authoring result is the contract.

## Wrapper Rules

MCP tools must be thin wrappers:

- translate tool arguments to an existing authoring core operation or
  `tn ... --json` command;
- preserve CLI/core diagnostics, including `fix`, and result fields;
- keep project-root allowlists and path guardrails;
- reject traversal paths and generated output paths when a tool argument is a
  source path;
- avoid direct JSON mutation logic that duplicates `@threenative/authoring`;
- avoid writing generated bundle artifacts as source.

Representative MCP tools may expose only a subset of the CLI surface. Missing
tool coverage is a feature gap, not permission to implement parallel mutation
rules in MCP.

## Source Boundary

Durable editor-owned source lives in structured documents under `content/**`
and gameplay script modules under `src/scripts/**/*.ts`. Generated bundle
artifacts are compiler/runtime output:

- `world.ir.json`
- `ui.ir.json`
- `systems.ir.json`
- `materials.ir.json`
- `assets.manifest.json`
- `scripts.bundle.js`
- `manifest.json`

MCP and editor adapters may inspect generated bundle artifacts and may call
`tn bundle import <bundle-dir> --mode source --json` for recoverable catalog
import. They must not persist generated bundle files directly as source.
`scripts.bundle.js` is unrecoverable generated script body; the durable source
for behavior is the referenced TypeScript module/export when provenance exists.

## Future Editor Adapter

A visual editor should use the same operation result contract as MCP and CLI.
The expected write path is:

```txt
editor command
  -> @threenative/authoring operation
  -> structured source document write
  -> validation diagnostics
  -> rebuild/proof when needed
```

The editor may stage optimistic UI state locally, but persistence is accepted
only after the authoring operation returns `ok: true`. If diagnostics include
errors, the editor must keep the source file unchanged or roll back any staged
view state to match disk.

Patch policy:

- source-persistable provenance may be written through authoring operations;
- generator-owned output is not reverse-patched into generator code;
- full-reload-required artifacts require a rebuild from source;
- runtime-only state is not durable source;
- rejected/not-source artifacts, including `scripts.bundle.js`, must not be
  saved as source.

This keeps CLI, MCP, and future editor behavior aligned around one mutation and
validation core.
