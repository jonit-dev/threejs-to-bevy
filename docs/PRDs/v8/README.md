# V8 PRDs

V8 introduces local editor and inspector foundations after V7 deep parity work.
The editor is an offline structured authoring surface over the same SDK/ECS/IR
project data that the compiler, CLI, web runtime, and Bevy adapter already
consume. It is not a second source of truth and must not bypass validation.

## Scope Rules

- V8 editor saves use structured project data that can round-trip into the
  existing portable bundle pipeline.
- Local save/load, structured diffs, entity/asset inspection, and bundle preview
  evidence are V8-promoted.
- Diagnostics must reject invalid editor data before runtime and should point to
  the same entity, asset, component, system, or bundle paths used by CLI flows.
- Offline SDK and CLI workflows must keep working without editor state.
- V8 does not claim online services, hosted workflows, networking, replication,
  collaboration, presence, conflict resolution, public plugin APIs, raw
  Three.js authoring, or direct Bevy authoring.

## Tickets

| Order | PRD | Depends On | Outcome |
| --- | --- | --- | --- |
| 0 | [V8-00 Local Editor Scope and Contract](./V8-00-local-editor-scope-and-contract.md) | V7 | V8 starts with local/offline editor boundaries, structured SDK/ECS/IR project data, save/load, structured diffs, diagnostics, and preview evidence requirements. |
| 1 | [V8-01 Editor Project Snapshot and Structured Diffs](./V8-01-editor-project-snapshot-and-structured-diffs.md) | V8-00 | IR helpers validate local editor project snapshots and produce deterministic structured diffs over bundle-relative JSON documents. |
| 4 | [V8-04 Portable Procedural Mesh Authoring](./V8-04-portable-procedural-mesh-authoring.md) | V8-00, V7 renderer parity | MeshBuilder, generated mesh asset payloads, organic prop helpers, compiler-only BufferGeometry snapshot import, and web/Bevy screenshot parity evidence for one authored procedural prop. |
| 5 | [V8-05 Optional React Webview Overlay](./V8-05-optional-react-webview-overlay.md) | V6 retained UI, V7 rich UI, V8-00 | Projects can opt into a capability-gated React/CSS webview overlay for rich desktop/editor-like surfaces while retained UI remains the portable game UI contract. |

## Release Gate

V8 is not complete until an aggregate gate proves local editor workflows through
structured data fixtures, save/load round trips, structured diffs, bundle
preview artifacts, diagnostics, and docs consistency.

Initial docs guard:

```bash
pnpm check:docs:v8
```
