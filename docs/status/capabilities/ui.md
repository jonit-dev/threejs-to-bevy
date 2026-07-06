# UI Status

Portable UI uses retained structured source and IR. Web overlays remain a
separate bounded capability, not the default portable game UI model.

Current support:

- Retained UI documents, bindings, formatted resource values, components,
  themes, screen/focus metadata, responsive fit, and accessibility validation.
- UI source operations are available through CLI, MCP, and authoring-client
  wrappers.

Verification:

- `pnpm --filter @threenative/ir test -- --run ui`
- `pnpm --filter @threenative/authoring test -- --run ui`
- `pnpm verify:conformance`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
