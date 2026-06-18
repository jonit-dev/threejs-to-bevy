export const IR_VERSION = "0.1.0" as const;

export const IR_SCHEMA_IDS = {
  animations: "threenative.animations",
  assets: "threenative.assets",
  audio: "threenative.audio",
  bundle: "threenative.bundle",
  componentSchemas: "threenative.component-schemas",
  environmentScene: "threenative.environment-scene",
  eventSchemas: "threenative.event-schemas",
  gltfScene: "threenative.gltf-scene",
  input: "threenative.input",
  localData: "threenative.local-data",
  materials: "threenative.materials",
  overlays: "threenative.overlays",
  resourceSchemas: "threenative.resource-schemas",
  runtimeConfig: "threenative.runtime-config",
  systems: "threenative.systems",
  targetProfile: "threenative.target-profile",
  ui: "threenative.ui",
  world: "threenative.world",
} as const;

export const IR_DOCUMENTS = {
  manifest: {
    fileName: "manifest.json",
    schema: IR_SCHEMA_IDS.bundle,
    schemaFile: "manifest.schema.json",
  },
  animations: {
    fileName: "animations.ir.json",
    manifestLocations: [
      { key: "animations", section: "entry" },
      { key: "animations", section: "files" },
    ],
    schema: IR_SCHEMA_IDS.animations,
  },
  assets: {
    fileName: "assets.manifest.json",
    manifestKey: "assets",
    manifestSection: "files",
    required: true,
    schema: IR_SCHEMA_IDS.assets,
    schemaFile: "assets.schema.json",
  },
  audio: {
    fileName: "audio.ir.json",
    manifestKey: "audio",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.audio,
  },
  componentSchemas: {
    fileName: "schemas/components.schema.json",
    manifestKey: "componentSchemas",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.componentSchemas,
  },
  environmentScene: {
    fileName: "environment.scene.json",
    manifestKey: "environmentScene",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.environmentScene,
  },
  eventSchemas: {
    fileName: "schemas/events.schema.json",
    manifestKey: "eventSchemas",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.eventSchemas,
  },
  gltfScene: {
    fileName: "gltf.scene.json",
    manifestKey: "gltfScene",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.gltfScene,
  },
  input: {
    fileName: "input.ir.json",
    manifestKey: "input",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.input,
    schemaFile: "input.schema.json",
  },
  localData: {
    fileName: "local-data.ir.json",
    manifestLocations: [
      { key: "localData", section: "entry" },
      { key: "localData", section: "files" },
    ],
    schema: IR_SCHEMA_IDS.localData,
  },
  materials: {
    fileName: "materials.ir.json",
    manifestKey: "materials",
    manifestSection: "files",
    required: true,
    schema: IR_SCHEMA_IDS.materials,
    schemaFile: "materials.schema.json",
  },
  overlays: {
    fileName: "overlays.ir.json",
    manifestKey: "overlays",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.overlays,
    schemaFile: "overlays.schema.json",
  },
  resourceSchemas: {
    fileName: "schemas/resources.schema.json",
    manifestKey: "resourceSchemas",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.resourceSchemas,
  },
  runtimeConfig: {
    fileName: "runtime.config.json",
    manifestKey: "runtimeConfig",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.runtimeConfig,
    schemaFile: "runtime-config.schema.json",
  },
  scripts: {
    fileName: "scripts.bundle.js",
    manifestLocations: [
      { key: "scripts", section: "entry" },
      { key: "scripts", section: "files" },
    ],
  },
  systems: {
    fileName: "systems.ir.json",
    manifestKey: "systems",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.systems,
  },
  targetProfile: {
    fileName: "target.profile.json",
    manifestKey: "targetProfile",
    manifestSection: "files",
    required: true,
    schema: IR_SCHEMA_IDS.targetProfile,
    schemaFile: "target-profile.schema.json",
  },
  ui: {
    fileName: "ui.ir.json",
    manifestKey: "ui",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.ui,
  },
  world: {
    fileName: "world.ir.json",
    manifestKey: "world",
    manifestSection: "entry",
    required: true,
    schema: IR_SCHEMA_IDS.world,
    schemaFile: "world.schema.json",
  },
} as const;

export type IrDocumentName = keyof typeof IR_DOCUMENTS;
export type SchemaBackedIrDocumentName = {
  [Name in IrDocumentName]: (typeof IR_DOCUMENTS)[Name] extends { schemaFile: string } ? Name : never;
}[IrDocumentName];

export function schemaBackedDocuments(): Array<[SchemaBackedIrDocumentName, (typeof IR_DOCUMENTS)[SchemaBackedIrDocumentName]]> {
  return Object.entries(IR_DOCUMENTS).filter((entry): entry is [SchemaBackedIrDocumentName, (typeof IR_DOCUMENTS)[SchemaBackedIrDocumentName]] => {
    return "schemaFile" in entry[1];
  });
}
