export type AuthoringSourceSupportStatus = "supported" | "partial" | "missing" | "non-goal";

export type AuthoringOwnershipBoundary = "durable-source" | "script-source" | "generator-source" | "generated-artifact" | "runtime-only";

export interface IAuthoringSourceCategory {
  id: string;
  label: string;
  durable: boolean;
  boundary: AuthoringOwnershipBoundary;
  description: string;
}

export interface IAuthoringSourceMatrixEntry {
  id: string;
  categoryId: AuthoringSourceCategoryId;
  capability: string;
  sourceDocuments: readonly string[];
  structuredSourceSupport: AuthoringSourceSupportStatus;
  cliOperationSupport: AuthoringSourceSupportStatus;
  typescriptRole: "none" | "script-ref" | "generator" | "script-ref-or-generator" | "non-durable-output";
  editorRoundTrip: "required" | "script-reference-only" | "one-way-generator-output" | "not-source";
  notes: string;
}

export const authoringSourceCategories = [
  {
    id: "project-metadata",
    label: "Project metadata",
    durable: true,
    boundary: "durable-source",
    description: "Project identity, authoring version, source roots, and build target declarations.",
  },
  {
    id: "lifecycle-scenes",
    label: "Lifecycle scenes",
    durable: true,
    boundary: "durable-source",
    description: "Scene list, startup scene, activation policy, and scene transitions owned by authoring tools.",
  },
  {
    id: "visual-scene-graph",
    label: "Visual scenes, entities, components, transforms, and hierarchy",
    durable: true,
    boundary: "durable-source",
    description: "Editor-owned map membership, entity placement, component data, transforms, and parent-child hierarchy.",
  },
  {
    id: "prefabs-instances",
    label: "Prefabs and instances",
    durable: true,
    boundary: "durable-source",
    description: "Reusable entity templates and scene instances with stable authored IDs.",
  },
  {
    id: "component-resource-schemas",
    label: "Component schemas, resources, and resource defaults",
    durable: true,
    boundary: "durable-source",
    description: "Source-owned data schemas, resource declarations, and default resource values.",
  },
  {
    id: "input-maps",
    label: "Input maps, actions, and axes",
    durable: true,
    boundary: "durable-source",
    description: "Portable input actions, axes, bindings, and remapping defaults.",
  },
  {
    id: "retained-ui",
    label: "Retained UI tree, layout, style, bindings, minimap, bar, image, text, and button",
    durable: true,
    boundary: "durable-source",
    description: "Editor-owned retained UI documents for layout, style, widgets, and resource bindings.",
  },
  {
    id: "assets-import-settings",
    label: "Assets and import settings",
    durable: true,
    boundary: "durable-source",
    description: "Asset catalog entries, import options, dependency copy policy, and source asset references.",
  },
  {
    id: "materials-textures",
    label: "Materials and textures",
    durable: true,
    boundary: "durable-source",
    description: "Material declarations, texture slots, scalar factors, and authored material references.",
  },
  {
    id: "meshes",
    label: "Primitive, custom, and generated meshes",
    durable: true,
    boundary: "durable-source",
    description: "Primitive mesh declarations, custom mesh descriptors, and generated mesh provenance.",
  },
  {
    id: "audio-declarations",
    label: "Audio declarations",
    durable: true,
    boundary: "durable-source",
    description: "Authored audio catalog entries, playback defaults, and portable audio references.",
  },
  {
    id: "systems-metadata",
    label: "Systems metadata, queries, reads, writes, commands, and schedule",
    durable: true,
    boundary: "durable-source",
    description: "Portable system declarations and effect metadata separate from implementation bodies.",
  },
  {
    id: "typescript-script-refs",
    label: "TypeScript script references",
    durable: true,
    boundary: "script-source",
    description: "Stable references to TypeScript behavior modules and named exports.",
  },
  {
    id: "generators-provenance",
    label: "Optional generators and generator provenance",
    durable: true,
    boundary: "generator-source",
    description: "One-way generators that write structured source documents with provenance and overwrite policy.",
  },
  {
    id: "runtime-target-profile",
    label: "Runtime config and target profile where editor-owned",
    durable: true,
    boundary: "durable-source",
    description: "Editor-owned runtime configuration, target profile, and platform defaults.",
  },
  {
    id: "generated-bundle-files",
    label: "Generated bundle files",
    durable: false,
    boundary: "generated-artifact",
    description: "Disposable compiler output consumed by runtimes, never round-trippable authoring source.",
  },
] as const satisfies readonly IAuthoringSourceCategory[];

export type AuthoringSourceCategoryId = (typeof authoringSourceCategories)[number]["id"];

export const firstClassAuthoringSourceCategoryIds = authoringSourceCategories
  .filter((category) => category.durable)
  .map((category) => category.id) as AuthoringSourceCategoryId[];

export const generatedBundleArtifactFiles = [
  "world.ir.json",
  "ui.ir.json",
  "systems.ir.json",
  "scripts.bundle.js",
  "materials.ir.json",
  "assets.manifest.json",
  "manifest.json",
] as const;

export const authoringSourceMatrix = [
  {
    id: "project-authoring-document",
    categoryId: "project-metadata",
    capability: "Project metadata and source roots",
    sourceDocuments: ["content/project.authoring.json", "threenative.authoring.json"],
    structuredSourceSupport: "missing",
    cliOperationSupport: "missing",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Project-level structured source is identified but not yet implemented beyond scene discovery.",
  },
  {
    id: "lifecycle-scene-document",
    categoryId: "lifecycle-scenes",
    capability: "Lifecycle scenes and activation policy",
    sourceDocuments: ["content/scenes/*.scene.json", "content/project.authoring.json"],
    structuredSourceSupport: "partial",
    cliOperationSupport: "partial",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Scene documents now carry kind, activation, and initial metadata through CLI/editor operations; transition graphs and project-level scene ordering remain open.",
  },
  {
    id: "visual-scene-document",
    categoryId: "visual-scene-graph",
    capability: "Visual scene membership, entities, components, transforms, and hierarchy",
    sourceDocuments: ["content/scenes/*.scene.json", "content/entities/*.entities.json"],
    structuredSourceSupport: "partial",
    cliOperationSupport: "partial",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Current scene source covers core ECS mutations plus typed camera/light/mesh-renderer/rigid-body/collider/character-controller component operations; full visual scene and hierarchy coverage is incomplete.",
  },
  {
    id: "prefab-document",
    categoryId: "prefabs-instances",
    capability: "Prefabs and scene instances",
    sourceDocuments: ["content/prefabs/*.prefab.json", "content/scenes/*.scene.json"],
    structuredSourceSupport: "partial",
    cliOperationSupport: "partial",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Scene-local prefab declarations plus standalone prefab create/add-component CLI operations exist; instance override operations remain later work.",
  },
  {
    id: "resources-document",
    categoryId: "component-resource-schemas",
    capability: "Component schemas, resources, and resource defaults",
    sourceDocuments: ["content/resources/*.resources.json", "content/schemas/*.schema.json"],
    structuredSourceSupport: "partial",
    cliOperationSupport: "partial",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Scene-local resources exist; reusable schemas and resource default documents are not complete.",
  },
  {
    id: "input-document",
    categoryId: "input-maps",
    capability: "Input maps, actions, and axes",
    sourceDocuments: ["content/input/*.input.json"],
    structuredSourceSupport: "partial",
    cliOperationSupport: "partial",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Input source documents and add-action/add-axis CLI/editor operations exist; richer controls-settings and rebinding metadata remain later work.",
  },
  {
    id: "ui-document",
    categoryId: "retained-ui",
    capability: "Retained UI tree, layout, style, bindings, minimap, bar, image, text, and button nodes",
    sourceDocuments: ["content/ui/*.ui.json"],
    structuredSourceSupport: "partial",
    cliOperationSupport: "partial",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Scene-local UI plus standalone UI create/add-text/add-node/set-layout/set-style/bind CLI/editor operations exist; advanced widgets, rich layout, input, and runtime UI behaviors remain later work.",
  },
  {
    id: "asset-document",
    categoryId: "assets-import-settings",
    capability: "Assets, import settings, and dependency copy policy",
    sourceDocuments: ["content/assets/*.assets.json"],
    structuredSourceSupport: "partial",
    cliOperationSupport: "partial",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Asset source documents and initial add CLI/registry operations exist; import settings and dependency copy policy remain later work.",
  },
  {
    id: "material-document",
    categoryId: "materials-textures",
    capability: "Materials and textures",
    sourceDocuments: ["content/materials/*.materials.json"],
    structuredSourceSupport: "partial",
    cliOperationSupport: "partial",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Material source documents and create/set CLI/editor operations cover color, roughness, metalness, emissive, alpha, promoted texture slots, clearcoat, and transmission fields; sampler/import policy remains later work.",
  },
  {
    id: "mesh-document",
    categoryId: "meshes",
    capability: "Primitive, custom, and generated mesh declarations",
    sourceDocuments: ["content/meshes/*.meshes.json"],
    structuredSourceSupport: "partial",
    cliOperationSupport: "partial",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Mesh source documents and initial primitive CLI operations exist; custom/generated mesh declarations and provenance remain later work.",
  },
  {
    id: "audio-document",
    categoryId: "audio-declarations",
    capability: "Audio declarations",
    sourceDocuments: ["content/audio/*.audio.json"],
    structuredSourceSupport: "partial",
    cliOperationSupport: "partial",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Audio source documents and initial create/add-sound CLI/registry operations exist; richer playback defaults remain later work.",
  },
  {
    id: "systems-document",
    categoryId: "systems-metadata",
    capability: "Systems metadata, queries, reads, writes, commands, and schedule",
    sourceDocuments: ["content/systems/*.systems.json"],
    structuredSourceSupport: "partial",
    cliOperationSupport: "partial",
    typescriptRole: "script-ref",
    editorRoundTrip: "required",
    notes: "Standalone system documents and initial create/attach-script CLI operations exist; complete query/effect metadata remains later work.",
  },
  {
    id: "typescript-script-reference",
    categoryId: "typescript-script-refs",
    capability: "TypeScript gameplay script modules referenced by stable module/export metadata",
    sourceDocuments: ["src/scripts/**/*.ts"],
    structuredSourceSupport: "supported",
    cliOperationSupport: "partial",
    typescriptRole: "script-ref",
    editorRoundTrip: "script-reference-only",
    notes: "TypeScript is durable for behavior modules, not for map/editor-owned scene persistence.",
  },
  {
    id: "generator-provenance-document",
    categoryId: "generators-provenance",
    capability: "Optional one-way generators and output provenance",
    sourceDocuments: ["content/**", "src/generators/**/*.ts"],
    structuredSourceSupport: "missing",
    cliOperationSupport: "missing",
    typescriptRole: "generator",
    editorRoundTrip: "one-way-generator-output",
    notes: "Generators may write structured source but do not receive automatic reverse patches from editor changes.",
  },
  {
    id: "runtime-target-profile-document",
    categoryId: "runtime-target-profile",
    capability: "Runtime config and target profile where editor-owned",
    sourceDocuments: ["content/runtime/*.runtime.json", "content/targets/*.target.json"],
    structuredSourceSupport: "missing",
    cliOperationSupport: "missing",
    typescriptRole: "none",
    editorRoundTrip: "required",
    notes: "Editor-owned runtime defaults need source documents; runtime-only process state remains outside source.",
  },
  {
    id: "generated-bundle-artifacts",
    categoryId: "generated-bundle-files",
    capability: "Generated bundle IR and runtime catalogs",
    sourceDocuments: generatedBundleArtifactFiles,
    structuredSourceSupport: "non-goal",
    cliOperationSupport: "non-goal",
    typescriptRole: "non-durable-output",
    editorRoundTrip: "not-source",
    notes: "Bundle output is disposable and may be imported only into structured source when recoverable.",
  },
] as const satisfies readonly IAuthoringSourceMatrixEntry[];

export function getAuthoringSourceCategory(categoryId: AuthoringSourceCategoryId): IAuthoringSourceCategory {
  return authoringSourceCategories.find((category) => category.id === categoryId)!;
}

export function isDurableAuthoringSourceKind(pathOrKind: string): boolean {
  return (
    !isGeneratedBundleArtifactFile(pathOrKind) &&
    authoringSourceMatrix.some((entry) => entry.sourceDocuments.some((sourceDocument) => sourceDocument === pathOrKind))
  );
}

export function isGeneratedBundleArtifactFile(pathOrKind: string): boolean {
  const normalized = pathOrKind.split("\\").pop() ?? pathOrKind;
  return generatedBundleArtifactFiles.includes(normalized as (typeof generatedBundleArtifactFiles)[number]);
}
