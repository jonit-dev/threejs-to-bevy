import type { IGltfSceneMetadataIr } from "./gltfScene.js";
import type { IAssetsManifest, IBundleManifest, IMaterialsIr, IWorldIr, SchemaVersion } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

export type SceneInspectionSchema = "threenative.scene-inspection";

export interface ISceneInspectionDocuments {
  assets: IAssetsManifest;
  diagnostics?: readonly IIrDiagnostic[];
  gltfScene?: IGltfSceneMetadataIr;
  manifest: IBundleManifest;
  materials: IMaterialsIr;
  world: IWorldIr;
}

export interface ISceneInspectionReport {
  assetGroups: readonly {
    failurePolicy?: string;
    id: string;
    optional: readonly string[];
    required: readonly string[];
    timeoutMs?: number;
  }[];
  assets: readonly {
    format: string;
    groups: readonly string[];
    id: string;
    kind: string;
    path?: string;
    sourceMode: string;
  }[];
  bundle: {
    documents: readonly string[];
    name: string;
  };
  diagnostics: readonly IIrDiagnostic[];
  entities: readonly {
    components: readonly string[];
    id: string;
  }[];
  gltfAssets: readonly {
    assetId: string;
    customAttributes: readonly unknown[];
    nodes: readonly unknown[];
  }[];
  schema: SceneInspectionSchema;
  updateHandles: readonly unknown[];
  version: SchemaVersion;
}

export function buildSceneInspectionReport(documents: ISceneInspectionDocuments): ISceneInspectionReport {
  return {
    assetGroups: assetGroups(documents.assets),
    assets: inspectAssets(documents.assets),
    bundle: {
      documents: collectBundleDocuments(documents.manifest),
      name: documents.manifest.name,
    },
    diagnostics: [...(documents.diagnostics ?? [])].sort((left, right) => diagnosticSortKey(left).localeCompare(diagnosticSortKey(right))),
    entities: documents.world.entities
      .map((entity) => ({
        components: Object.keys(entity.components).sort((left, right) => left.localeCompare(right)),
        id: entity.id,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    gltfAssets: (documents.gltfScene?.assets ?? [])
      .map((asset) => ({
        assetId: asset.assetId,
        customAttributes: [...asset.customAttributes].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
        nodes: [...asset.nodes].sort((left, right) => left.path.localeCompare(right.path)),
      }))
      .sort((left, right) => left.assetId.localeCompare(right.assetId)),
    schema: "threenative.scene-inspection",
    updateHandles: [],
    version: "0.1.0",
  };
}

function inspectAssets(manifest: IAssetsManifest): ISceneInspectionReport["assets"] {
  const groupsByAsset = new Map<string, string[]>();
  for (const group of manifest.groups ?? []) {
    for (const assetId of [...group.required, ...(group.optional ?? [])]) {
      const groups = groupsByAsset.get(assetId) ?? [];
      groups.push(group.id);
      groupsByAsset.set(assetId, groups);
    }
  }
  return manifest.assets
    .map((asset) => {
      const raw = asset as unknown as Record<string, unknown>;
      return {
        format: asset.format,
        groups: [...(groupsByAsset.get(asset.id) ?? [])].sort((left, right) => left.localeCompare(right)),
        id: asset.id,
        kind: asset.kind,
        ...(typeof raw.path === "string" ? { path: raw.path } : {}),
        sourceMode: typeof raw.sourceMode === "string" ? raw.sourceMode : typeof raw.path === "string" ? "bundle" : "generated",
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function assetGroups(manifest: IAssetsManifest): ISceneInspectionReport["assetGroups"] {
  return (manifest.groups ?? [])
    .map((group) => ({
      ...(group.failurePolicy === undefined ? {} : { failurePolicy: group.failurePolicy }),
      id: group.id,
      optional: [...(group.optional ?? [])].sort((left, right) => left.localeCompare(right)),
      required: [...group.required].sort((left, right) => left.localeCompare(right)),
      ...(group.timeoutMs === undefined ? {} : { timeoutMs: group.timeoutMs }),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function collectBundleDocuments(manifest: IBundleManifest): string[] {
  const documents = new Set(["manifest.json"]);
  Object.values(manifest.entry).forEach((value) => {
    if (typeof value === "string" && value.endsWith(".json")) {
      documents.add(value);
    }
  });
  Object.values(manifest.files).forEach((value) => {
    if (typeof value === "string" && value.endsWith(".json")) {
      documents.add(value);
    }
  });
  return [...documents].sort((left, right) => left.localeCompare(right));
}

function diagnosticSortKey(diagnostic: IIrDiagnostic): string {
  return `${diagnostic.path}:${diagnostic.code}:${diagnostic.message}`;
}
