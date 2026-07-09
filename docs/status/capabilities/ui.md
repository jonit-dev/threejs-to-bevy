# UI Status

Portable UI uses retained structured source and IR. Web overlays remain a
separate bounded capability, not the default portable game UI model.

Current support:

- Retained UI documents, bindings, formatted resource values, components,
  themes, screen/focus metadata, responsive fit, and accessibility validation.
- Web retained UI overlay button, touch, text input, slider, and scrollbar
  actions drain into portable script-observable UI/input state; script
  `setDisabled`, `setValue`, and `activate` calls update the live rendered
  overlay state.
- The `@threenative/ui` TSX authoring surface exposes typed wrappers for
  text input and reusable component instances. Button-like and value-changing
  widgets require portable `action` props where TypeScript can enforce them,
  and range/text input widgets expose kind-specific value fields.
- UI component cycles and theme token alias cycles report stable diagnostics
  with the detected cycle path and suggested fixes.
- UI parity claims are truth-graded in
  [bevy-feature-parity.md](../../bevy-feature-parity.md): promoted rows name a
  proof gate or artifact, while trace-only native shadows/gradients, effect
  presets, world-attached projection, editable text input, nested/axis scroll,
  spatial fallback navigation, focus narration, and runtime disabled-state
  updates remain partial/diagnostic until behavior-level proof exists.
- Unsupported UI boundaries remain explicit for virtual keyboard behavior,
  arbitrary grid named areas/dense packing, render-to-texture/world transforms,
  UI viewport nodes, drag/drop UI nodes, and custom UI material/shader
  declarations.
- UI source operations are available through CLI, MCP, and authoring-client
  wrappers.

Verification:

- `pnpm --filter @threenative/ir test -- --run ui`
- `pnpm --filter @threenative/authoring test -- --run ui`
- `pnpm verify:conformance`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
