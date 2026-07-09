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
- Portable UI rendering semantics are intentionally bounded:

  | Feature | Contract state |
  | --- | --- |
  | Gradients and shadows | Web DOM overlay renders CSS gradients/shadows. Native preserves metadata/components and exposes visual traces only; native pixel rendering is not promoted. |
  | Effect presets | Metadata/diagnostic boundary with web/native strategy traces; not promoted as rendered effect parity. |
  | Atlas and nine-slice image metadata | Web exposes atlas/nine-slice metadata for overlay/debug proof and applies scale/flip/tile CSS where possible. Native preserves image metadata and traces it; native atlas/nine-slice pixel rendering is not promoted. |
  | Safe area | Web overlay applies `safe-area-inset-*` padding for avoided edges. Native preserves safe-area metadata in navigation traces. |
  | Context menus | Web context menus clamp to the viewport. Native context-menu behavior remains metadata/trace-only. |
  | Focus navigation | Web and native navigation traces skip disabled nodes for sequential and explicit navigation. Geometric spatial fallback remains partial. |
  | DPI/scale | Native UI currently treats authored pixel values as absolute Bevy UI pixels and reports `TN_BEVY_UI_ABSOLUTE_PIXEL_SCALE_BOUNDARY`. DPI-aware scaling is an unsupported boundary, not promoted parity. |
  | Text input | Web text input dispatches deterministic value actions. Native text input preserves metadata/value observations but does not promote caret, editing, virtual keyboard, or IME behavior. |

- UI parity claims are truth-graded in
  [bevy-feature-parity.md](../../bevy-feature-parity.md): promoted rows name a
  proof gate or artifact, while trace-only native shadows/gradients, effect
  presets, world-attached projection, editable text input, nested/axis scroll,
  spatial fallback navigation, focus narration, and runtime disabled-state
  updates remain partial/diagnostic until behavior-level proof exists.
- `pnpm verify:conformance` now emits explicit UI evidence categories:
  structural retained-UI reports, behavioral runtime traces for focus/action
  delivery plus input/UI polish, and a visual/style contact sheet for the
  input-UI polish fixture. The input/UI polish probe covers disabled-state
  reconciliation, nested and axis-specific scroll reports, spatial navigation
  traces, and focus narration as deterministic evidence rather than parity
  promotion.
- Unsupported UI boundaries remain explicit for virtual keyboard behavior,
  arbitrary grid named areas/dense packing, render-to-texture/world transforms,
  UI viewport nodes, drag/drop UI nodes, and custom UI material/shader
  declarations.
- UI source operations are available through CLI, MCP, and authoring-client
  wrappers.
- Editor preview renders retained UI source documents as a read-only viewport
  overlay. It is an authoring feedback surface; durable UI edits remain
  source-backed operations and preview interaction is not promoted as runtime
  play mode.
- Native retained UI caches binding targets after spawn so scripted text sync
  does not re-walk the retained tree per bound text node. Native fallback font
  discovery is bounded to platform default font paths and reports
  `TN_BEVY_UI_FONT_FALLBACK_MISSING` when none can be loaded.

Verification:

- `pnpm --filter @threenative/ir test -- --run ui`
- `pnpm --filter @threenative/authoring test -- --run ui`
- `cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime native_ui`
- `pnpm verify:conformance`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
