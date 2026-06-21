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
  bar, image, text, and button nodes.
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
- `content/runtime/*.runtime.json` and `content/targets/*.target.json`:
  runtime config and target profile data when those settings are editor-owned.

TypeScript files under `src/scripts/**/*.ts` are durable source for gameplay
behavior modules. TypeScript files under `src/generators/**/*.ts` may be
durable source for optional one-way generators that emit structured documents.

## Boundaries

Structured source documents are the persistence layer for editor-owned data.
The CLI, MCP wrapper, and future map editor must mutate these documents through
the same `@threenative/authoring` operations.

Generated bundle files are runtime/compiler artifacts, not durable source:

- `world.ir.json`
- `ui.ir.json`
- `systems.ir.json`
- `scripts.bundle.js`
- `materials.ir.json`
- `assets.manifest.json`
- `manifest.json`

Generated artifacts may be inspected or imported into structured source when
enough recoverable information exists. They must not become the edited file of
record, and unsupported recoveries must produce diagnostics instead of inferred
source.

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

When TypeScript acts as a generator, the output must be structured source
documents with explicit provenance such as generator ID, input hash, output
hash, and overwrite policy. Once an editor changes generated source, the system
does not assume it can reverse-patch arbitrary generator code.

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

## Current Authoring Package Coverage

`@threenative/authoring` currently discovers and validates the first stable
source-document families for scenes, UI, materials, assets, input, systems,
prefabs, and audio. The non-scene families intentionally use minimal
schema-versioned contracts in this phase:

- `threenative.ui`: `id`, `nodes`, and `bindings`;
- `threenative.materials`: `id` and `materials`;
- `threenative.assets`: `id` and `assets`;
- `threenative.input`: `id` and `actions`;
- `threenative.systems`: `id` and `systems`;
- `threenative.prefab`: `id` and `entities`;
- `threenative.audio`: `id` and `sounds`.

Validation rejects malformed schemas, unknown fields, duplicate IDs within each
document, generated bundle paths used as source paths, inline script strings,
and missing system script modules/exports where script references are declared.
The first cross-document reference check is scene `MeshRenderer.material`
against material source document IDs. Standalone UI resource binding and broader
runtime graph reference validation remain later structured-authoring work rather
than implicit inference in this minimal source package slice.
