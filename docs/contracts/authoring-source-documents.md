# Authoring Source Documents

This contract defines the source boundary for editor-owned ThreeNative game
data. Structured authoring source documents are the durable source of truth for
map/editor content. Generated bundle IR remains disposable compiler output.

## Source Families

First-class structured source document families:

- `content/project.authoring.json` or `threenative.authoring.json`: project
  metadata, source roots, build targets, and authoring version.
- `content/scenes/*.scene.json`: lifecycle scenes, scene membership, entities,
  components, transforms, hierarchy, and scene-local references.
- `content/prefabs/*.prefab.json`: reusable authored entity templates and
  instance defaults.
- `content/resources/*.resources.json` and `content/schemas/*.schema.json`:
  component/resource schemas, resource declarations, and resource defaults.
- `content/input/*.input.json`: input maps, actions, axes, and portable default
  bindings.
- `content/ui/*.ui.json`: retained UI tree, layout, style, bindings, minimap,
  bar, image, text, and button nodes. Normal builds lower these documents into
  runtime `ui.ir.json`, including mobile-safe full-width HUD layout
  normalization for starter-style 1280px rows.
- `content/assets/*.assets.json`: asset catalog entries, import settings, and
  dependency copy policy.
- `content/materials/*.materials.json`: material declarations, texture slots,
  and authored material properties.
- `content/meshes/*.meshes.json`: primitive, custom, and generated mesh
  declarations with provenance where applicable.
- `content/audio/*.audio.json`: audio declarations and portable playback
  defaults.
- `content/systems/*.systems.json`: system schedule, queries, reads, writes,
  commands, resources, and script references.
- `content/proofs/*.proof.json`: tooling-only proof recipes for inputs,
  expected artifacts, and required validation/build/playtest/screenshot
  commands. These documents guide CLI/editor proof workflows and are not
  runtime gameplay data.
- `content/runtime/*.runtime.json` and `content/targets/*.target.json`:
  runtime config and target profile data when those settings are editor-owned.

TypeScript files under `src/scripts/**/*.ts` are durable source for gameplay
behavior modules. TypeScript files under `src/generators/**/*.ts` may be
durable source for optional one-way generators that emit structured documents.

Recipe operations are bounded source mutations. `tn recipe <recipe-id>` and
`tn recipe apply <recipe-id>` may write only declared `content/**/*.json` source
documents and `src/scripts/**/*.ts` scaffolds through the shared authoring
operation registry. Recipes must preflight required source documents, report
stable diagnostics before partial mutation, and must not persist changes to
`dist/**`, emitted IR JSON, `scripts.bundle.js`, runtime handles, or other
generated artifacts.

## Journaled Publication

Related authoring writes publish through one project-scoped transaction. A
plan records the exact SHA-256 hash of every existing touched source file and
uses `null` for an absent file. Immediately before publication, while holding
the project authoring lock, the publisher compares every current base hash to
the planned value. A mismatch fails with `TN_AUTHORING_BATCH_CONFLICT`, reports
the path plus expected and actual hashes, and promotes no files.

Transaction stages, backups, the journal, and lock metadata live under
`.tn/authoring-transactions/**` and `.tn/authoring.lock`, outside durable
`content/**` and `src/scripts/**` source. Staged files are created on the same
filesystem as the project. The journal records each target's old and new hash
and the corresponding stage and backup paths before any target rename occurs.
Project source discovery must ignore these transaction artifacts.

The lock covers recovery, base-hash verification, and publication; planning
does not hold it. Lock acquisition is bounded. A lock is eligible for stale
recovery only after its age threshold and when its recorded process is no
longer alive. A live lock is never silently broken.

An ordinary process error before the committed journal marker restores the
complete old file set before returning a failure. A process interruption may
leave a prepared or publishing journal; the next authoring mutation must
recover that journal under the same lock before checking or publishing new
work. Recovery rolls a prepared or publishing transaction back to the old
state. A committed marker is the publication boundary: recovery preserves the
complete new state and only removes transaction artifacts. Cleanup failure
after that marker must never roll durable source back. A missing, corrupt, or
unsupported journal fails recovery closed with
`TN_AUTHORING_TRANSACTION_RECOVERY_FAILED` and leaves its artifacts available
for inspection.

This is journaled crash recovery, not a claim that multiple filesystem renames
are physically atomic. At API boundaries, a failed precondition or handled
publish error exposes no partial durable change; after interruption, recovery
converges to one complete old or complete new state before another mutation is
accepted.

## Compact Scene Instances

Scene documents may use `instances` to keep repeated prefab-backed entities out
of large `entities` arrays. An instance has a stable emitted entity `id`, a
`prefab` reference, and optional `transform` and `components` overrides:

```json
{
  "schema": "threenative.scene",
  "version": "0.1.0",
  "id": "lane",
  "instances": [
    {
      "id": "pin.01",
      "prefab": "prefab.pin",
      "transform": { "position": [0, 0.6, 0] },
      "components": { "Pin": { "home": [0, 0.6, 0] } }
    }
  ]
}
```

`prefab` may reference either a scene-local visual prefab in `prefabs` or a
standalone `content/prefabs/*.prefab.json` document. During compiler lowering,
the first entity in the prefab document provides default `transform` and
`components`; the scene instance deep-merges overrides over those defaults and
emits a normal deterministic world entity with the instance ID. Raw
`entities` remain supported and unchanged.

Validation rejects non-array `instances`, duplicate expanded IDs across
`entities` and `instances`, missing prefab references, invalid transform
vectors, malformed component overrides, and ambiguous material/entity
references before build. `tn scene inspect <scene-id> --json` reports
`sourceLineCount`, `expandedEntityCount`, `instances`, `repeatedBlocks`, and
`suggestedRefactors` so agents can identify ten-pin-style repeated component
blocks before hand-editing large JSON files.

Agents should prefer bounded commands over direct JSON edits for common compact
layouts:

- `tn prefab set-defaults <prefab-id> <component> --value <json-object> --json`
  writes reusable component defaults to `content/prefabs/*.prefab.json`.
- `tn scene add-prefab-instance <scene-id> <instance-id> --prefab <prefab-id>
  --position x,y,z --components <json-object> --json` writes one compact
  instance override.
- `tn scene layout ten-pin <scene-id> --prefab <prefab-id> --json` writes ten
  stable compact instances with `pin.01` through `pin.10` IDs and `Pin.home`
  overrides matching the authored transform positions.

Layout commands reject replacing existing compact instance IDs unless
`--replace` is supplied.

## Boundaries

Structured source documents are the persistence layer for editor-owned data.
The CLI, MCP wrapper, and future map editor must mutate these documents through
the same `@threenative/authoring` operations. The adapter rules for MCP and
future editors are defined in
[Authoring MCP and Editor Adapter](authoring-mcp.md).

Generated bundle files are runtime/compiler artifacts, not durable source:

- `world.ir.json`
- `ui.ir.json`
- `systems.ir.json`
- `scripts.bundle.js`
- `materials.ir.json`
- `assets.manifest.json`
- `prefabs.ir.json`
- `runtime.config.json`
- `target.profile.json`
- `manifest.json`

Generated artifacts may be inspected or imported into structured source when
enough recoverable information exists. They must not become the edited file of
record, and unsupported recoveries must produce diagnostics instead of inferred
source.

The IR editor patch contract treats structured documents under
`content/**/*.scene.json`, `content/**/*.ui.json`,
`content/**/*.materials.json`, `content/**/*.meshes.json`,
`content/**/*.input.json`, `content/**/*.systems.json`,
`content/**/*.prefab.json`, `content/**/*.audio.json`,
`content/**/*.proof.json`,
`content/**/*.runtime.json`, and `threenative.authoring.json` as
source-persistable. Generated bundle/cache
paths such as `dist/**`, `game.bundle/**`, `scripts.bundle.js`, generated IR
documents, and runtime handles remain rejected as source patch targets.

`tn bundle import <bundle-dir> --project <path> --mode source --json` is a
recovery operation, not a round-trip guarantee. The first supported import
writes normalized source documents under `content/**/imported.*.json`:

- `world.ir.json` -> `content/scenes/imported.scene.json`;
- `materials.ir.json` -> `content/materials/imported.materials.json`;
- `assets.manifest.json` -> `content/assets/imported.assets.json`;
- `ui.ir.json` -> `content/ui/imported.ui.json`;
- `input.ir.json` -> `content/input/imported.input.json`;
- `systems.ir.json` -> `content/systems/imported.systems.json`;
- `audio.ir.json` -> `content/audio/imported.audio.json` when present.

The importer normalizes bundle catalogs into the current minimal source
schemas and records root `provenance` pointing at the generated artifact. It
does not copy generated bundle files directly into source, and it does not
persist `scripts.bundle.js` as TypeScript. If only generated script code is
available, the report includes
`TN_AUTHORING_IMPORT_UNRECOVERABLE_SCRIPT_BODY`; script references are imported
only when source-safe module/export provenance is available. Runtime config
source documents are now first-class for new authoring operations, but bundle
import still skips generated `runtime.config.json` and `target.profile.json`
until recovery semantics for those artifacts are defined.

Runtime state is also not durable source unless it is explicitly represented in
an editor-owned runtime or target profile source document. Runtime adapters load
generated bundles; they do not generate project source.

## TypeScript Role

TypeScript remains supported for gameplay scripts, helper code used by those
scripts, optional generators/importers, and thin project composition that points
at structured documents. TypeScript must not be the required round-trippable
persistence target for map edits, entity placement, transform changes, material
or UI style tweaks, asset catalog edits, generated bundle diffs, or editor
move/rotate/scale operations.

`@threenative/authoring-client` is the supported TypeScript convenience layer
for batching or fluently composing source edits. It is a client over
`@threenative/authoring` operation names such as `scene.add_prefab`,
`scene.add_entity`, and `scene.set_transform`; it writes the same structured
source documents as CLI/editor/MCP operations and returns an operation trace.
It is not a TypeScript scene persistence format, and editor tools must not
reverse-patch facade scripts to save map changes.

When TypeScript acts as a generator, the output must be structured source
documents with explicit provenance such as generator ID, input hash, output
hash, and overwrite policy. Once an editor changes generated source, the system
does not assume it can reverse-patch arbitrary generator code.
`tn generator run <generator-id> --json` executes only project-local generator
modules under `src/generators/**`, passes the same authoring-client facade used
by normal TypeScript composition, and records `lastRun` operation trace,
diagnostics, files, timing, and hashes back to the generator provenance
document. A generator must return the facade commit result so the operation
trace remains inspectable.

## Map Editor Round Trip

A map editor must be able to load structured documents, mutate editor-owned
data, save, close, reopen, and rebuild without reconstructing arbitrary
TypeScript or patching generated bundle files. That requirement implies:

- every editor-owned source category has a structured document family;
- all edits preserve stable IDs and structured references;
- generated IR paths are rejected as source paths;
- script bodies are referenced by module/export metadata, not embedded in map
  documents;
- generator provenance is tracked separately from editor-owned output;
- bundle import is a recovery path, not the normal persistence path.

The testable inventory in `packages/authoring/src/sourceKinds.ts` records the
current support status for each source family and the explicit non-source
classification for generated bundle artifacts.

## Authoring Provenance Report

Normal project builds may write `dist/game.bundle/authoring.provenance.json` as
a compiler/debug sidecar. The runtime manifest does not reference this file,
and runtimes must not require it. The sidecar is for CLI/editor/MCP tooling that
needs to classify whether an emitted bundle patch can be persisted back to
structured source.

Current report shape:

```json
{
  "schema": "threenative.authoring-provenance",
  "version": "0.1.0",
  "entryPath": "content/scenes/level.scene.json",
  "modules": [],
  "declarations": [],
  "diagnostics": [],
  "ownership": [
    {
      "ownership": "source-persistable",
      "source": {
        "path": "content/scenes/level.scene.json",
        "pointer": "/entities/0/components/MeshRenderer",
        "kind": "component",
        "category": "scene"
      },
      "emitted": {
        "path": "world.ir.json",
        "artifactKind": "component",
        "id": "player.MeshRenderer",
        "pointer": "/entities/player/components/MeshRenderer"
      }
    }
  ]
}
```

The report preserves the legacy compiler authoring graph fields
`declarations`, `modules`, and `diagnostics`, then adds `ownership` entries.
Each ownership entry contains:

- `source.path`: project-relative structured source document path when known.
- `source.pointer`: JSON Pointer into the source document.
- `source.kind`: source declaration kind such as `entity`, `component`,
  `material`, `ui`, or `system`.
- `source.category`: source document family such as `scene`, `material`, `ui`,
  or `systems`.
- `source.modulePath` and `source.exportName`: TypeScript module/export
  metadata when the source pointer is a script reference.
- `emitted.path`: generated bundle artifact path.
- `emitted.artifactKind`: emitted artifact category.
- `emitted.id` and `emitted.pointer`: stable emitted ID/path where available.
- `ownership`: patch classification.

Patch classifications:

- `source-persistable`: the emitted entry traces to a structured source
  document pointer. Editors may patch the source document through
  `@threenative/authoring`, then rebuild.
- `generator-owned`: reserved for one-way generator outputs that carry
  generator provenance. Reverse patches to the generator remain unsupported.
- `full-reload-required`: generated bundle/catalog file output that can be
  reloaded after source changes but is not itself a durable source target.
- `runtime-only`: runtime state with no durable source mapping.
- `rejected/not-source`: direct persistence must be rejected. Generated
  `scripts.bundle.js` is always classified this way; script source is the
  referenced TypeScript module/export, not the generated bundle body.

The current compiler slice emits source ownership for structured scene
entities and components, scene `MeshRenderer.material` references resolved to
material source documents, standalone UI nodes, scene/system script references
with module/export metadata, and generated bundle artifact classifications.
If two different structured source pointers claim the same emitted artifact ID,
the report includes `TN_AUTHORING_DUPLICATE_EMITTED_OWNER` so editor patching
can fail before writing an ambiguous source change.

## Structured Source Template

`tn create <name> --template structured-source-starter` scaffolds the first
source-document-first starter. Its project entry is
`content/scenes/arena.scene.json`; editor-owned project metadata, scene, UI,
material, asset, input, system, mesh, and prefab declarations live under
`content/`, while gameplay behavior lives in `src/scripts/player.ts`.

Agents and editor tools should patch `content/**/*.json` through `tn authoring`
validation and the focused operation groups such as `tn ui set-layout`,
`tn material set`, `tn input add-action`, `tn project init-source`, and
`tn system attach-script`.
Generated bundle files under `dist/` and generated script bundles remain
non-source. TypeScript under `src/scripts/` is for behavior bodies only, not
scene/map persistence.

Promoted editor-safe operation metadata lives in
`@threenative/authoring`'s operation registry. CLI, MCP, and editor adapters
should use registry names such as `scene.set_transform`, `ui.set_layout`,
`material.set`, and `system.attach_script` instead of maintaining independent
mutation catalogs.

## Current Authoring Package Coverage

`@threenative/authoring` currently discovers and validates the first stable
source-document families for scenes, UI, materials, meshes, assets, input,
systems, prefabs, resources, and audio. The non-scene families intentionally use minimal
schema-versioned contracts in this phase:

- `threenative.ui`: `id`, `nodes`, `bindings`, and optional `provenance`;
- `threenative.materials`: `id`, `materials`, authored `color`,
  `roughness`, and optional `provenance`;
- `threenative.meshes`: `id`, primitive/custom `meshes`, and optional
  `provenance`;
- `threenative.assets`: `id`, `assets`, promoted model animation/particle
  metadata, and optional `provenance`;
- `threenative.input`: `id`, `actions`, and optional `provenance`;
- `threenative.ui`: `id`, retained `nodes`, bindings, promoted layout/style
  fields, and optional `provenance`;
- `threenative.systems`: `id`, `systems`, and optional `provenance`;
- `threenative.prefab`: `id`, `entities`, and optional `provenance`;
- `threenative.resources`: `id`, reusable `resources`, and optional
  `provenance`;
- `threenative.audio`: `id`, `sounds`, and optional `provenance`.

Validation rejects malformed schemas, unknown fields, duplicate IDs within each
document, generated bundle paths used as source paths, inline script strings,
and missing system script modules/exports where script references are declared.
The first cross-document reference check is scene `MeshRenderer.material`
against material source document IDs. Standalone UI resource binding is emitted
to runtime UI IR when authored, while broader runtime graph reference validation
remains later structured-authoring work rather than implicit inference in this
minimal source package slice.

## Initial CLI Operation Conventions

The first full-source CLI operation slice writes deterministic source documents
under conventional paths:

- `tn ui create <ui-doc-id>` writes `content/ui/<ui-doc-id>.ui.json`;
- `tn material create <material-id>` writes
  `content/materials/<material-id>.materials.json`;
- `tn mesh primitive <mesh-id>` writes
  `content/meshes/<mesh-id>.meshes.json`;
- `tn mesh custom <mesh-id> --attributes '<json-array>' [--indices '<json-array>'] [--storage binary]`
  writes `content/meshes/<mesh-id>.meshes.json`;
- `tn prefab create <prefab-id>` writes
  `content/prefabs/<prefab-id>.prefab.json`;
- `tn input add-action <input-doc-id> ...` writes or updates
  `content/input/<input-doc-id>.input.json`;
- `tn system create <system-id>` writes
  `content/systems/<system-id>.systems.json`.

Scene component commands such as `tn scene add-component ... render-layers`,
`tn scene add-component ... visibility`, `tn physics add-rigid-body`,
`tn physics add-collider`, and `tn nav add-agent` mutate existing
`content/scenes/*.scene.json` documents through the same typed source
validators as `tn scene add-component`.
Model metadata commands such as `tn animation add-clip`, `tn animation graph
add-state`, and `tn particle add-emitter` mutate existing
`content/assets/*.assets.json` model declarations and lower into
`assets.manifest.json`.

Every operation supports `--json` and returns the shared
`ok`/`changed`/`filesWritten`/`diagnostics` operation shape. Invalid CLI JSON,
unknown primitive kinds, missing source documents, missing system script
modules/exports, and validation failures exit non-zero before writing the
target document. Script commands store module/export references only; they do
not generate TypeScript script source. Audio source documents are validated, but
audio mutation commands remain a documented gap after this initial slice.
