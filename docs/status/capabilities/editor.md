# Editor Status

Editor-facing work must preserve the same durable source boundary as CLI and
MCP workflows.

Current support:

- Editor snapshot/source bridge contracts, operation metadata, safe source
  patching, and script body code-mode boundaries.
- Enabled inspector/modal operations are checked against the authoring
  operation registry, and representative editor payload builders are tested so
  emitted argument keys stay within registry descriptor arguments except for
  documented composite recipes.
- The editor viewport includes a read-only retained UI preview derived from
  source UI documents. Binding values resolve deterministically from authored
  scene resources when present and otherwise render stable `{resource}`
  placeholders. UI edits still route through existing `@threenative/authoring`
  operations, then refresh the preview from the project payload.
- Future visual editor persistence routes through `@threenative/authoring`
  operations and validated source documents.

Verification:

- `pnpm --filter @threenative/editor test`
- `pnpm --filter @threenative/mcp-server test`
- `pnpm verify:editor-required-operations`
- `pnpm check:docs`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
