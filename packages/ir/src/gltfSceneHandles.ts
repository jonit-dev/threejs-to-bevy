import type { IGltfSceneMetadataIr, IGltfSceneNodeIr } from "./gltfScene.js";
import type { IMaterialsIr, ITransformComponent, SchemaVersion } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

export type GltfSceneHandlesSchema = "threenative.gltf-scene-handles";

export interface IGltfNodeHandleIr {
  assetId: string;
  id: string;
  instanceId: string;
  nodeName?: string;
  nodePath?: string;
}

export type IGltfNodeOperationIr =
  | { handle: string; kind: "extrasLookup" }
  | { handle: string; kind: "material"; material: string }
  | { handle: string; kind: "transform"; transform: ITransformComponent }
  | { handle: string; kind: "visibility"; visible: boolean };

export interface IGltfSceneHandlesIr {
  handles: readonly IGltfNodeHandleIr[];
  operations: readonly IGltfNodeOperationIr[];
  schema: GltfSceneHandlesSchema;
  version: SchemaVersion;
}

export function normalizeGltfSceneHandlesIr(value: IGltfSceneHandlesIr): IGltfSceneHandlesIr {
  return {
    ...value,
    handles: [...value.handles].sort((left, right) => left.id.localeCompare(right.id)),
    operations: [...value.operations].sort((left, right) => operationSortKey(left).localeCompare(operationSortKey(right))),
  };
}

export function validateGltfSceneHandlesIr(
  value: IGltfSceneHandlesIr,
  metadata: IGltfSceneMetadataIr | undefined,
  materials: IMaterialsIr | undefined,
  path = "gltf.handles.json",
): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  if (value.schema !== "threenative.gltf-scene-handles") {
    diagnostics.push({ code: "TN_IR_GLTF_HANDLES_SCHEMA_INVALID", message: "glTF scene handles schema must be threenative.gltf-scene-handles.", path: `${path}/schema`, severity: "error" });
  }
  if (value.version !== "0.1.0") {
    diagnostics.push({ code: "TN_IR_GLTF_HANDLES_VERSION_INVALID", message: "glTF scene handles version must be 0.1.0.", path: `${path}/version`, severity: "error" });
  }
  if (!Array.isArray(value.handles)) {
    diagnostics.push({ code: "TN_IR_GLTF_HANDLES_INVALID", message: "glTF scene handles must be an array.", path: `${path}/handles`, severity: "error" });
    return diagnostics;
  }
  if (!Array.isArray(value.operations)) {
    diagnostics.push({ code: "TN_IR_GLTF_OPERATIONS_INVALID", message: "glTF scene handle operations must be an array.", path: `${path}/operations`, severity: "error" });
    return diagnostics;
  }
  const handles = new Map<string, IGltfNodeHandleIr>();
  value.handles.forEach((handle, index) => {
    validateHandle(handle, metadata, `${path}/handles/${index}`, diagnostics);
    if (handles.has(handle.id)) {
      diagnostics.push({ code: "TN_IR_GLTF_HANDLE_DUPLICATE", message: `glTF scene handle '${handle.id}' is duplicated.`, path: `${path}/handles/${index}/id`, severity: "error" });
    }
    handles.set(handle.id, handle);
  });
  const materialIds = new Set((materials?.materials ?? []).map((material) => material.id));
  value.operations.forEach((operation, index) => validateOperation(operation, handles, materialIds, `${path}/operations/${index}`, diagnostics));
  return diagnostics;
}

function validateHandle(
  handle: IGltfNodeHandleIr,
  metadata: IGltfSceneMetadataIr | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (typeof handle.id !== "string" || handle.id.trim() === "") {
    diagnostics.push({ code: "TN_IR_GLTF_HANDLE_ID_INVALID", message: "glTF scene handle id must be non-empty.", path: `${path}/id`, severity: "error" });
  }
  if (typeof handle.assetId !== "string" || handle.assetId.trim() === "") {
    diagnostics.push({ code: "TN_IR_GLTF_HANDLE_ASSET_INVALID", message: "glTF scene handle assetId must be non-empty.", path: `${path}/assetId`, severity: "error" });
  }
  if (typeof handle.instanceId !== "string" || handle.instanceId.trim() === "") {
    diagnostics.push({ code: "TN_IR_GLTF_HANDLE_INSTANCE_INVALID", message: "glTF scene handle instanceId must be non-empty.", path: `${path}/instanceId`, severity: "error" });
  }
  if ((handle.nodePath === undefined || handle.nodePath.trim() === "") && (handle.nodeName === undefined || handle.nodeName.trim() === "")) {
    diagnostics.push({ code: "TN_IR_GLTF_HANDLE_NODE_REF_INVALID", message: "glTF scene handle must declare nodePath or nodeName.", path, severity: "error" });
    return;
  }
  const matches = findMatchingNodes(handle, metadata);
  if (metadata !== undefined && matches.length === 0) {
    diagnostics.push({
      code: "TN_IR_GLTF_HANDLE_NODE_MISSING",
      message: `glTF scene handle '${handle.id}' references a missing node.`,
      path: `${path}/nodePath`,
      severity: "error",
      suggestion: "Check glTF metadata or update the handle to an existing full node path.",
    });
  }
  if (matches.length > 1) {
    diagnostics.push({
      code: "TN_IR_GLTF_HANDLE_AMBIGUOUS",
      message: `glTF scene handle '${handle.id}' matches ${matches.length} nodes named '${handle.nodeName}'.`,
      path: `${path}/nodeName`,
      severity: "error",
      suggestion: "Use the full glTF node path in nodePath to disambiguate the handle.",
    });
  }
}

function validateOperation(
  operation: IGltfNodeOperationIr,
  handles: ReadonlyMap<string, IGltfNodeHandleIr>,
  materialIds: ReadonlySet<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (!handles.has(operation.handle)) {
    diagnostics.push({ code: "TN_IR_GLTF_OPERATION_HANDLE_MISSING", message: `glTF node operation references unknown handle '${operation.handle}'.`, path: `${path}/handle`, severity: "error" });
  }
  if (operation.kind === "visibility") {
    if (typeof operation.visible !== "boolean") {
      diagnostics.push({ code: "TN_IR_GLTF_OPERATION_VISIBILITY_INVALID", message: "glTF visibility operation must declare visible boolean.", path: `${path}/visible`, severity: "error" });
    }
    return;
  }
  if (operation.kind === "transform") {
    if (typeof operation.transform !== "object" || operation.transform === null) {
      diagnostics.push({ code: "TN_IR_GLTF_OPERATION_TRANSFORM_INVALID", message: "glTF transform operation must declare a transform object.", path: `${path}/transform`, severity: "error" });
    }
    return;
  }
  if (operation.kind === "material") {
    if (typeof operation.material !== "string" || operation.material.trim() === "") {
      diagnostics.push({ code: "TN_IR_GLTF_OPERATION_MATERIAL_INVALID", message: "glTF material operation must declare a material id.", path: `${path}/material`, severity: "error" });
    } else if (materialIds.size > 0 && !materialIds.has(operation.material)) {
      diagnostics.push({
        code: "TN_IR_GLTF_OPERATION_MATERIAL_MISSING",
        message: `glTF material operation references unknown portable material '${operation.material}'.`,
        path: `${path}/material`,
        severity: "error",
        suggestion: "Reference a material id from materials.ir.json.",
      });
    }
    return;
  }
  if (operation.kind !== "extrasLookup") {
    diagnostics.push({ code: "TN_IR_GLTF_OPERATION_KIND_INVALID", message: "glTF node operation kind must be transform, visibility, material, or extrasLookup.", path: `${path}/kind`, severity: "error" });
  }
}

function findMatchingNodes(handle: IGltfNodeHandleIr, metadata: IGltfSceneMetadataIr | undefined): IGltfSceneNodeIr[] {
  const asset = metadata?.assets.find((item) => item.assetId === handle.assetId);
  if (asset === undefined) {
    return [];
  }
  if (handle.nodePath !== undefined) {
    return asset.nodes.filter((node) => node.path === handle.nodePath);
  }
  return asset.nodes.filter((node) => node.name === handle.nodeName);
}

function operationSortKey(operation: IGltfNodeOperationIr): string {
  return `${operation.handle}:${operation.kind}`;
}
