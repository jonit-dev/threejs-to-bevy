import type { IIrDiagnostic } from "./validate.js";
import type { GltfSceneSchema, Quat, SchemaVersion, Vec3 } from "./types.js";

export const MAX_GLTF_EXTRAS_BYTES = 4096;
export const MAX_GLTF_EXTRAS_DEPTH = 8;

export interface IGltfNodeTransformIr {
  rotation?: Quat;
  scale?: Vec3;
  translation?: Vec3;
}

export interface IGltfSceneNodeIr {
  extras?: unknown;
  materials?: readonly string[];
  mesh?: string;
  name?: string;
  parentPath?: string;
  path: string;
  spawnedHandleEligible: boolean;
  transform?: IGltfNodeTransformIr;
}

export interface IGltfCustomAttributeIr {
  componentType: string;
  itemSize: number;
  name: string;
  normalized?: boolean;
  shaderConsumption: "inspectionOnly" | "unsupported";
  targetMesh: string;
}

export interface IGltfMaterialExtensionIr {
  extension: string;
  path: string;
  properties: readonly string[];
  status: "inspectionOnly" | "promoted" | "unsupported";
}

export interface IGltfTextureTransformIr {
  extension: "KHR_texture_transform";
  offset?: readonly [number, number];
  path: string;
  rotation?: number;
  scale?: readonly [number, number];
  texCoord?: number;
  textureSlot: string;
}

export interface IGltfMaterialMetadataIr {
  extensions: readonly IGltfMaterialExtensionIr[];
  extras?: unknown;
  material: string;
  name?: string;
  textureTransforms: readonly IGltfTextureTransformIr[];
}

export interface IGltfMorphTargetIr {
  defaultWeight?: number;
  mesh: string;
  path: string;
  source: "mesh.extras.targetNames" | "mesh.primitives.targets";
  target: string;
}

export interface IGltfSceneAssetIr {
  assetId: string;
  customAttributes: readonly IGltfCustomAttributeIr[];
  materials: readonly IGltfMaterialMetadataIr[];
  morphTargets: readonly IGltfMorphTargetIr[];
  nodes: readonly IGltfSceneNodeIr[];
}

export interface IGltfSceneMetadataIr {
  assets: readonly IGltfSceneAssetIr[];
  schema: GltfSceneSchema;
  version: SchemaVersion;
}

export function validateGltfSceneMetadata(value: IGltfSceneMetadataIr, path = "gltf.scene.json"): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  if (value.schema !== "threenative.gltf-scene") {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_SCHEMA_INVALID",
      message: "glTF scene metadata schema must be threenative.gltf-scene.",
      path: `${path}/schema`,
      severity: "error",
    });
  }
  if (value.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_VERSION_INVALID",
      message: "glTF scene metadata version must be 0.1.0.",
      path: `${path}/version`,
      severity: "error",
    });
  }
  if (!Array.isArray(value.assets)) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_ASSETS_INVALID",
      message: "glTF scene metadata assets must be an array.",
      path: `${path}/assets`,
      severity: "error",
    });
    return diagnostics;
  }
  value.assets.forEach((asset, index) => validateGltfSceneAsset(asset, `${path}/assets/${index}`, diagnostics));
  return diagnostics;
}

function validateGltfSceneAsset(asset: IGltfSceneAssetIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof asset.assetId !== "string" || asset.assetId.trim() === "") {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_ASSET_ID_INVALID",
      message: "glTF scene metadata assetId must be a non-empty string.",
      path: `${path}/assetId`,
      severity: "error",
    });
  }
  if (!Array.isArray(asset.nodes)) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_NODES_INVALID",
      message: "glTF scene metadata nodes must be an array.",
      path: `${path}/nodes`,
      severity: "error",
    });
  } else {
    const spawnedPaths = new Map<string, number>();
    asset.nodes.forEach((node, index) => {
      validateGltfSceneNode(asset.assetId, node, `${path}/nodes/${index}`, diagnostics);
      if (node.spawnedHandleEligible === true) {
        const previous = spawnedPaths.get(node.path);
        if (previous !== undefined) {
          diagnostics.push({
            code: "TN_IR_GLTF_SCENE_HANDLE_PATH_DUPLICATE",
            message: `glTF asset '${asset.assetId}' has duplicate spawned handle path '${node.path}'.`,
            path: `${path}/nodes/${index}/path`,
            severity: "error",
            suggestion: "Rename duplicate nodes or use unique full node paths for spawned handles.",
          });
          diagnostics.push({
            code: "TN_IR_GLTF_SCENE_HANDLE_PATH_DUPLICATE",
            message: `glTF asset '${asset.assetId}' has duplicate spawned handle path '${node.path}'.`,
            path: `${path}/nodes/${previous}/path`,
            severity: "error",
            suggestion: "Rename duplicate nodes or use unique full node paths for spawned handles.",
          });
        }
        spawnedPaths.set(node.path, index);
      }
    });
  }
  if (!Array.isArray(asset.customAttributes)) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_ATTRIBUTES_INVALID",
      message: "glTF scene metadata customAttributes must be an array.",
      path: `${path}/customAttributes`,
      severity: "error",
    });
  } else {
    asset.customAttributes.forEach((attribute, index) => validateGltfCustomAttribute(attribute, `${path}/customAttributes/${index}`, diagnostics));
  }
  if (!Array.isArray(asset.materials)) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_MATERIALS_INVALID",
      message: "glTF scene metadata materials must be an array.",
      path: `${path}/materials`,
      severity: "error",
    });
  } else {
    asset.materials.forEach((material, index) => validateGltfMaterialMetadata(asset.assetId, material, `${path}/materials/${index}`, diagnostics));
  }
  if (!Array.isArray(asset.morphTargets)) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_MORPH_TARGETS_INVALID",
      message: "glTF scene metadata morphTargets must be an array.",
      path: `${path}/morphTargets`,
      severity: "error",
    });
  } else {
    asset.morphTargets.forEach((target, index) => validateGltfMorphTarget(target, `${path}/morphTargets/${index}`, diagnostics));
  }
}

function validateGltfSceneNode(assetId: string, node: IGltfSceneNodeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof node.path !== "string" || !node.path.startsWith("/")) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_NODE_PATH_INVALID",
      message: "glTF node path must be an absolute metadata path.",
      path: `${path}/path`,
      severity: "error",
    });
  }
  if (node.parentPath !== undefined && (typeof node.parentPath !== "string" || !node.parentPath.startsWith("/"))) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_NODE_PARENT_INVALID",
      message: "glTF node parentPath must be an absolute metadata path when provided.",
      path: `${path}/parentPath`,
      severity: "error",
    });
  }
  if (node.name !== undefined && (typeof node.name !== "string" || node.name.trim() === "")) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_NODE_NAME_INVALID", message: "glTF node name must be non-empty when provided.", path: `${path}/name`, severity: "error" });
  }
  if (node.spawnedHandleEligible !== true && node.spawnedHandleEligible !== false) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_HANDLE_ELIGIBLE_INVALID", message: "glTF node spawnedHandleEligible must be boolean.", path: `${path}/spawnedHandleEligible`, severity: "error" });
  }
  if (node.extras !== undefined) {
    validateExtras(assetId, node.path, node.extras, `${path}/extras`, diagnostics);
  }
}

function validateGltfCustomAttribute(attribute: IGltfCustomAttributeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof attribute.name !== "string" || !attribute.name.startsWith("_")) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_ATTRIBUTE_NAME_INVALID",
      message: "glTF custom attribute names must be extension-style attributes that start with '_'.",
      path: `${path}/name`,
      severity: "error",
    });
  }
  if (!Number.isInteger(attribute.itemSize) || attribute.itemSize < 1 || attribute.itemSize > 4) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_ATTRIBUTE_ITEM_SIZE_INVALID",
      message: "glTF custom attribute itemSize must be an integer from 1 through 4.",
      path: `${path}/itemSize`,
      severity: "error",
    });
  }
  if (typeof attribute.componentType !== "string" || attribute.componentType.trim() === "") {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_ATTRIBUTE_COMPONENT_TYPE_INVALID", message: "glTF custom attribute componentType must be a non-empty string.", path: `${path}/componentType`, severity: "error" });
  }
  if (typeof attribute.targetMesh !== "string" || attribute.targetMesh.trim() === "") {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_ATTRIBUTE_TARGET_INVALID", message: "glTF custom attribute targetMesh must be a non-empty string.", path: `${path}/targetMesh`, severity: "error" });
  }
  if (attribute.shaderConsumption !== "inspectionOnly" && attribute.shaderConsumption !== "unsupported") {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_ATTRIBUTE_SHADER_CONSUMPTION_INVALID",
      message: "glTF custom attribute shaderConsumption must be inspectionOnly or unsupported.",
      path: `${path}/shaderConsumption`,
      severity: "error",
    });
  }
}

function validateGltfMaterialMetadata(assetId: string, material: IGltfMaterialMetadataIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof material.material !== "string" || !material.material.startsWith("material:")) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_MATERIAL_REF_INVALID",
      message: "glTF material metadata material must be a material: reference.",
      path: `${path}/material`,
      severity: "error",
    });
  }
  if (material.name !== undefined && (typeof material.name !== "string" || material.name.trim() === "")) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_MATERIAL_NAME_INVALID", message: "glTF material metadata name must be non-empty when provided.", path: `${path}/name`, severity: "error" });
  }
  if (material.extras !== undefined) {
    validateExtras(assetId, material.material, material.extras, `${path}/extras`, diagnostics);
  }
  if (!Array.isArray(material.extensions)) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_MATERIAL_EXTENSIONS_INVALID", message: "glTF material metadata extensions must be an array.", path: `${path}/extensions`, severity: "error" });
  } else {
    material.extensions.forEach((extension, index) => validateGltfMaterialExtension(extension, `${path}/extensions/${index}`, diagnostics));
  }
  if (!Array.isArray(material.textureTransforms)) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_TEXTURE_TRANSFORMS_INVALID", message: "glTF material metadata textureTransforms must be an array.", path: `${path}/textureTransforms`, severity: "error" });
  } else {
    material.textureTransforms.forEach((transform, index) => validateGltfTextureTransform(transform, `${path}/textureTransforms/${index}`, diagnostics));
  }
}

function validateGltfMaterialExtension(extension: IGltfMaterialExtensionIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof extension.extension !== "string" || extension.extension.trim() === "") {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_EXTENSION_ID_INVALID", message: "glTF material extension id must be non-empty.", path: `${path}/extension`, severity: "error" });
  }
  if (typeof extension.path !== "string" || extension.path.trim() === "") {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_EXTENSION_PATH_INVALID", message: "glTF material extension path must be non-empty.", path: `${path}/path`, severity: "error" });
  }
  if (!Array.isArray(extension.properties) || extension.properties.some((property) => typeof property !== "string" || property.trim() === "")) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_EXTENSION_PROPERTIES_INVALID", message: "glTF material extension properties must be non-empty strings.", path: `${path}/properties`, severity: "error" });
  }
  if (extension.status !== "inspectionOnly" && extension.status !== "promoted" && extension.status !== "unsupported") {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_EXTENSION_STATUS_INVALID", message: "glTF material extension status must be promoted, inspectionOnly, or unsupported.", path: `${path}/status`, severity: "error" });
  }
}

function validateGltfTextureTransform(transform: IGltfTextureTransformIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (transform.extension !== "KHR_texture_transform") {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_TEXTURE_TRANSFORM_EXTENSION_INVALID", message: "glTF texture transform extension must be KHR_texture_transform.", path: `${path}/extension`, severity: "error" });
  }
  if (typeof transform.path !== "string" || transform.path.trim() === "") {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_TEXTURE_TRANSFORM_PATH_INVALID", message: "glTF texture transform path must be non-empty.", path: `${path}/path`, severity: "error" });
  }
  if (typeof transform.textureSlot !== "string" || transform.textureSlot.trim() === "") {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_TEXTURE_TRANSFORM_SLOT_INVALID", message: "glTF texture transform textureSlot must be non-empty.", path: `${path}/textureSlot`, severity: "error" });
  }
  if (transform.offset !== undefined && !isPair(transform.offset)) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_TEXTURE_TRANSFORM_OFFSET_INVALID", message: "glTF texture transform offset must contain two finite numbers.", path: `${path}/offset`, severity: "error" });
  }
  if (transform.scale !== undefined && !isPair(transform.scale)) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_TEXTURE_TRANSFORM_SCALE_INVALID", message: "glTF texture transform scale must contain two finite numbers.", path: `${path}/scale`, severity: "error" });
  }
  if (transform.rotation !== undefined && !Number.isFinite(transform.rotation)) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_TEXTURE_TRANSFORM_ROTATION_INVALID", message: "glTF texture transform rotation must be a finite number.", path: `${path}/rotation`, severity: "error" });
  }
  if (transform.texCoord !== undefined && (!Number.isInteger(transform.texCoord) || transform.texCoord < 0)) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_TEXTURE_TRANSFORM_TEXCOORD_INVALID", message: "glTF texture transform texCoord must be a non-negative integer.", path: `${path}/texCoord`, severity: "error" });
  }
}

function validateGltfMorphTarget(target: IGltfMorphTargetIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof target.mesh !== "string" || !target.mesh.startsWith("mesh:")) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_MORPH_TARGET_MESH_INVALID", message: "glTF morph target mesh must be a mesh: reference.", path: `${path}/mesh`, severity: "error" });
  }
  if (typeof target.target !== "string" || target.target.trim() === "") {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_MORPH_TARGET_NAME_INVALID", message: "glTF morph target name must be non-empty.", path: `${path}/target`, severity: "error" });
  }
  if (typeof target.path !== "string" || target.path.trim() === "") {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_MORPH_TARGET_PATH_INVALID", message: "glTF morph target path must be non-empty.", path: `${path}/path`, severity: "error" });
  }
  if (target.source !== "mesh.extras.targetNames" && target.source !== "mesh.primitives.targets") {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_MORPH_TARGET_SOURCE_INVALID", message: "glTF morph target source must name the metadata source.", path: `${path}/source`, severity: "error" });
  }
  if (target.defaultWeight !== undefined && (!Number.isFinite(target.defaultWeight) || target.defaultWeight < 0 || target.defaultWeight > 1)) {
    diagnostics.push({ code: "TN_IR_GLTF_SCENE_MORPH_TARGET_WEIGHT_INVALID", message: "glTF morph target defaultWeight must be between 0 and 1.", path: `${path}/defaultWeight`, severity: "error" });
  }
}

function isPair(value: readonly number[]): value is readonly [number, number] {
  return value.length === 2 && value.every((item) => Number.isFinite(item));
}

function validateExtras(assetId: string, nodePath: string, value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  const serialized = safeJson(value);
  if (serialized === undefined) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_EXTRAS_UNSUPPORTED",
      message: `glTF extras for asset '${assetId}' node '${nodePath}' must be JSON-serializable.`,
      path,
      severity: "error",
      suggestion: "Use JSON object, array, string, number, boolean, or null values for extras.",
    });
    return;
  }
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > MAX_GLTF_EXTRAS_BYTES) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_EXTRAS_TOO_LARGE",
      limit: MAX_GLTF_EXTRAS_BYTES,
      message: `glTF extras for asset '${assetId}' node '${nodePath}' use ${bytes} bytes, exceeding limit ${MAX_GLTF_EXTRAS_BYTES}.`,
      path,
      severity: "error",
      suggestion: "Move large metadata out of glTF extras or keep only compact gameplay tags.",
      value: bytes,
    });
  }
  if (jsonDepth(value) > MAX_GLTF_EXTRAS_DEPTH) {
    diagnostics.push({
      code: "TN_IR_GLTF_SCENE_EXTRAS_TOO_DEEP",
      limit: MAX_GLTF_EXTRAS_DEPTH,
      message: `glTF extras for asset '${assetId}' node '${nodePath}' exceed depth limit ${MAX_GLTF_EXTRAS_DEPTH}.`,
      path,
      severity: "error",
      suggestion: "Flatten nested glTF extras before emitting metadata.",
    });
  }
}

function safeJson(value: unknown): string | undefined {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? undefined : json;
  } catch {
    return undefined;
  }
}

function jsonDepth(value: unknown): number {
  if (value === null || typeof value !== "object") {
    return 0;
  }
  if (Array.isArray(value)) {
    return 1 + Math.max(0, ...value.map((item) => jsonDepth(item)));
  }
  return 1 + Math.max(0, ...Object.values(value).map((item) => jsonDepth(item)));
}
