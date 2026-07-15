export const IR_VERSION = "0.1.0" as const;

export const IR_SCHEMA_IDS = {
  animations: "threenative.animations",
  assets: "threenative.assets",
  audio: "threenative.audio",
  bundle: "threenative.bundle",
  componentSchemas: "threenative.component-schemas",
  distribution: "threenative.distribution",
  environmentScene: "threenative.environment-scene",
  eventSchemas: "threenative.event-schemas",
  gameFlow: "threenative.game-flow",
  gltfScene: "threenative.gltf-scene",
  input: "threenative.input",
  interactions: "threenative.interactions",
  localData: "threenative.local-data",
  materials: "threenative.materials",
  overlays: "threenative.overlays",
  prefabs: "threenative.prefabs",
  resourceSchemas: "threenative.resource-schemas",
  runtimeConfig: "threenative.runtime-config",
  scenes: "threenative.scenes",
  sequences: "threenative.sequences",
  systems: "threenative.systems",
  targetProfile: "threenative.target-profile",
  ui: "threenative.ui",
  world: "threenative.world",
} as const;

export type IrManifestSection = "entry" | "files";

export interface IrManifestLocation {
  key: string;
  section: IrManifestSection;
}

export interface IrDocumentDriftMetadata {
  enums?: readonly IrEnumDriftMetadata[];
  rust?: {
    structName: string;
  };
  typescript?: {
    interfaceName: string;
    source: string;
  };
}

export interface IrEnumDriftMetadata {
  path: readonly string[];
  rust?: {
    allowStringCatchAll?: string;
    fieldName: string;
    structName: string;
  };
  typescript?: {
    typeName: string;
  };
}

export interface IrDocumentMetadata {
  drift?: IrDocumentDriftMetadata;
  fileName: string;
  manifestKey?: string;
  manifestLocations?: readonly IrManifestLocation[];
  manifestSection?: IrManifestSection;
  required?: boolean;
  schema?: (typeof IR_SCHEMA_IDS)[keyof typeof IR_SCHEMA_IDS];
  schemaFile?: string | null;
  supportedVersions?: readonly string[];
  version?: string;
}

export const IR_DOCUMENTS = {
  manifest: {
    drift: {
      rust: { structName: "BundleManifest" },
      typescript: { interfaceName: "IBundleManifest", source: "src/types.ts" },
    },
    fileName: "manifest.json",
    schema: IR_SCHEMA_IDS.bundle,
    schemaFile: "manifest.schema.json",
  },
  distribution: {
    drift: {
      typescript: { interfaceName: "IDistributionSource", source: "src/distribution.ts" },
    },
    fileName: "distribution.ir.json",
    manifestKey: "distribution",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.distribution,
    schemaFile: "distribution.schema.json",
  },
  animations: {
    fileName: "animations.ir.json",
    manifestLocations: [
      { key: "animations", section: "entry" },
      { key: "animations", section: "files" },
    ],
    schema: IR_SCHEMA_IDS.animations,
    schemaFile: null,
  },
  assets: {
    drift: {
      rust: { structName: "AssetsManifest" },
      typescript: { interfaceName: "IAssetsManifest", source: "src/types.ts" },
    },
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
    schemaFile: null,
  },
  componentSchemas: {
    fileName: "schemas/components.schema.json",
    manifestKey: "componentSchemas",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.componentSchemas,
    schemaFile: null,
  },
  environmentScene: {
    fileName: "environment.scene.json",
    manifestKey: "environmentScene",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.environmentScene,
    schemaFile: null,
  },
  gameFlow: {
    drift: {
      typescript: { interfaceName: "IGameFlowIr", source: "src/types.ts" },
    },
    fileName: "game-flow.ir.json",
    manifestKey: "gameFlow",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.gameFlow,
    schemaFile: "game-flow.schema.json",
  },
  eventSchemas: {
    fileName: "schemas/events.schema.json",
    manifestKey: "eventSchemas",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.eventSchemas,
    schemaFile: null,
  },
  gltfScene: {
    fileName: "gltf.scene.json",
    manifestKey: "gltfScene",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.gltfScene,
    schemaFile: null,
  },
  input: {
    drift: {
      rust: { structName: "InputIr" },
      typescript: { interfaceName: "IInputIr", source: "src/input.ts" },
    },
    fileName: "input.ir.json",
    manifestKey: "input",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.input,
    schemaFile: "input.schema.json",
  },
  interactions: {
    drift: {
      typescript: { interfaceName: "IInteractionsIr", source: "src/interactions.ts" },
    },
    fileName: "interactions.ir.json",
    manifestKey: "interactions",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.interactions,
    schemaFile: null,
  },
  localData: {
    fileName: "local-data.ir.json",
    manifestLocations: [
      { key: "localData", section: "entry" },
      { key: "localData", section: "files" },
    ],
    schema: IR_SCHEMA_IDS.localData,
    schemaFile: null,
    supportedVersions: ["0.1.0", "0.2.0"],
  },
  materials: {
    drift: {
      rust: { structName: "MaterialsIr" },
      typescript: { interfaceName: "IMaterialsIr", source: "src/types.ts" },
    },
    fileName: "materials.ir.json",
    manifestKey: "materials",
    manifestSection: "files",
    required: true,
    schema: IR_SCHEMA_IDS.materials,
    schemaFile: "materials.schema.json",
  },
  overlays: {
    drift: {
      rust: { structName: "OverlaysIr" },
      typescript: { interfaceName: "IOverlaysIr", source: "src/overlays.ts" },
    },
    fileName: "overlays.ir.json",
    manifestKey: "overlays",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.overlays,
    schemaFile: "overlays.schema.json",
    version: "0.2.0",
  },
  prefabs: {
    drift: {
      typescript: { interfaceName: "IPrefabsIr", source: "src/prefabTypes.ts" },
    },
    fileName: "prefabs.ir.json",
    manifestLocations: [
      { key: "prefabs", section: "entry" },
      { key: "prefabs", section: "files" },
    ],
    schema: IR_SCHEMA_IDS.prefabs,
    schemaFile: "prefabs.schema.json",
  },
  resourceSchemas: {
    fileName: "schemas/resources.schema.json",
    manifestKey: "resourceSchemas",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.resourceSchemas,
    schemaFile: null,
  },
  runtimeConfig: {
    drift: {
      enums: [
        {
          path: ["renderer", "antialias"],
          rust: {
            allowStringCatchAll: "The native loader keeps runtime renderer values open while IR validation owns the closed portable enum.",
            fieldName: "antialias",
            structName: "RuntimeRendererConfig",
          },
          typescript: { typeName: "RendererAntialiasMode" },
        },
        {
          path: ["renderer", "renderLook", "profile"],
          rust: {
            allowStringCatchAll: "The native loader keeps render look values open while IR validation owns the closed portable enum.",
            fieldName: "profile",
            structName: "RuntimeRenderLookProfileConfig",
          },
          typescript: { typeName: "RenderLookProfileName" },
        },
        {
          path: ["renderer", "renderLook", "overrides", "shadowQuality"],
          rust: {
            allowStringCatchAll: "The native loader keeps render look override values open while IR validation owns the closed portable enum.",
            fieldName: "shadow_quality",
            structName: "RuntimeRenderLookOverridesConfig",
          },
          typescript: { typeName: "RenderLookShadowQuality" },
        },
      ],
      rust: { structName: "RuntimeConfigIr" },
      typescript: { interfaceName: "IRuntimeConfigIr", source: "src/runtimeConfig.ts" },
    },
    fileName: "runtime.config.json",
    manifestKey: "runtimeConfig",
    manifestSection: "files",
    schema: IR_SCHEMA_IDS.runtimeConfig,
    schemaFile: "runtime-config.schema.json",
  },
  scenes: {
    drift: {
      rust: { structName: "ScenesIr" },
      typescript: { interfaceName: "IScenesIr", source: "src/types.ts" },
    },
    fileName: "scenes.ir.json",
    manifestKey: "scenes",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.scenes,
    schemaFile: "scenes.schema.json",
  },
  sequences: {
    fileName: "sequences.ir.json",
    manifestKey: "sequences",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.sequences,
    schemaFile: null,
  },
  scripts: {
    fileName: "scripts.bundle.js",
    manifestLocations: [
      { key: "scripts", section: "entry" },
      { key: "scripts", section: "files" },
    ],
    schemaFile: null,
  },
  systems: {
    drift: {
      typescript: { interfaceName: "ISystemsIr", source: "src/systems.ts" },
    },
    fileName: "systems.ir.json",
    manifestKey: "systems",
    manifestSection: "entry",
    schema: IR_SCHEMA_IDS.systems,
    schemaFile: "systems.schema.json",
  },
  targetProfile: {
    drift: {
      rust: { structName: "TargetProfile" },
      typescript: { interfaceName: "ITargetProfile", source: "src/types.ts" },
    },
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
    schemaFile: null,
  },
  world: {
    drift: {
      rust: { structName: "WorldIr" },
      typescript: { interfaceName: "IWorldIr", source: "src/types.ts" },
    },
    fileName: "world.ir.json",
    manifestKey: "world",
    manifestSection: "entry",
    required: true,
    schema: IR_SCHEMA_IDS.world,
    schemaFile: "world.schema.json",
  },
} as const satisfies Record<string, IrDocumentMetadata>;

export function irDocumentVersions(metadata: IrDocumentMetadata): readonly string[] {
  return metadata.supportedVersions ?? [metadata.version ?? IR_VERSION];
}

export type IrDocumentName = keyof typeof IR_DOCUMENTS;
export type SchemaBackedIrDocumentName = {
  [Name in IrDocumentName]: (typeof IR_DOCUMENTS)[Name] extends { schemaFile: string } ? Name : never;
}[IrDocumentName];
export type UnschemedIrDocumentName = {
  [Name in IrDocumentName]: (typeof IR_DOCUMENTS)[Name] extends { schemaFile: null } ? Name : never;
}[IrDocumentName];

export function schemaBackedDocuments(): Array<[SchemaBackedIrDocumentName, (typeof IR_DOCUMENTS)[SchemaBackedIrDocumentName]]> {
  return Object.entries(IR_DOCUMENTS).filter((entry): entry is [SchemaBackedIrDocumentName, (typeof IR_DOCUMENTS)[SchemaBackedIrDocumentName]] => {
    return typeof entry[1].schemaFile === "string";
  });
}

export function unschemedDocuments(): Array<[UnschemedIrDocumentName, (typeof IR_DOCUMENTS)[UnschemedIrDocumentName]]> {
  return Object.entries(IR_DOCUMENTS).filter((entry): entry is [UnschemedIrDocumentName, (typeof IR_DOCUMENTS)[UnschemedIrDocumentName]] => {
    return entry[1].schemaFile === null;
  });
}
