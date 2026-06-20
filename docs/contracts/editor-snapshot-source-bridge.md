# Editor Snapshot Source Bridge

Editor snapshots classify documents as `source`, `generated`, `runtime`, or
`derived`.

- `source`: durable authoring documents under source-owned paths such as
  `src/` or `scenes/`; edits may become validated source patches.
- `generated`: emitted bundle documents such as `world.ir.json`; inspectable,
  but not persisted directly.
- `runtime`: live preview/session state; hot-previewable when safe, never
  persisted directly.
- `derived`: computed views such as provenance or verification reports; not
  editable.

Preview edits are classified as:

- `sourcePersistable`: a source document or provenance-mapped generated entity
  can produce a validated source patch.
- `runtimeOnly`: live session state may update the preview without persistence.
- `fullReloadRequired`: generated bundle edits need source regeneration before
  persistence.
- `rejected`: runtime handles, generated cache paths, computed transforms,
  generated script code, and derived documents are not valid edit targets.

When `authoring.provenance.json` is available, generated/runtime entity IDs can
map back to a source module path and declaration ID. Without that provenance,
generated document edits remain inspection-only or full-reload preview work.
