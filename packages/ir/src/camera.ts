import type { IAssetsManifest, ICameraComponent, IMaterialsIr, IWorldIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

export function validateCameraViews(
  world: IWorldIr,
  materials: IMaterialsIr | undefined,
  assets: IAssetsManifest | undefined,
  worldPath: string,
  diagnostics: IIrDiagnostic[],
): void {
  const entityIds = new Set(world.entities.map((entity) => entity.id));
  const assetIds = new Set((assets?.assets ?? []).map((asset) => asset.id));
  const renderTargets = new Map(
    (assets?.assets ?? [])
      .filter((asset): asset is Extract<typeof asset, { kind: "render-target" }> => asset.kind === "render-target")
      .map((asset) => [asset.id, asset]),
  );
  const materialTextureRefs = collectMaterialTextureRefs(materials);
  const activeCameras = readActiveCameras(world, entityIds, `${worldPath}/resources`, diagnostics);

  for (const [entityId, camera, path] of listCameras(world, worldPath)) {
    validateCameraComponent(camera, entityId, path, entityIds, assetIds, renderTargets, materialTextureRefs, diagnostics);
  }

  validateActiveCameras(activeCameras, world, worldPath, diagnostics);
  validateRenderTargetCycles(world, worldPath, renderTargets, materials, diagnostics);
}

function listCameras(
  world: IWorldIr,
  worldPath: string,
): Array<[string, ICameraComponent, string]> {
  return world.entities.flatMap((entity, index) => {
    const camera = entity.components.Camera;
    if (camera === undefined) {
      return [];
    }
    return [[entity.id, camera, `${worldPath}/entities/${index}`] as const];
  });
}

function validateCameraComponent(
  camera: ICameraComponent,
  entityId: string,
  path: string,
  entityIds: ReadonlySet<string>,
  assetIds: ReadonlySet<string>,
  renderTargets: ReadonlyMap<string, Extract<IAssetsManifest["assets"][number], { kind: "render-target" }>>,
  materialTextureRefs: ReadonlyMap<string, string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (camera.viewport !== undefined) {
    if (camera.viewport.length !== 4) {
      diagnostics.push({
        code: "TN_IR_CAMERA_VIEWPORT_INVALID",
        message: `Camera '${entityId}' viewport must contain four normalized values.`,
        path: `${path}/components/Camera/viewport`,
      });
    } else {
      for (const [index, value] of camera.viewport.entries()) {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
          diagnostics.push({
            code: "TN_IR_CAMERA_VIEWPORT_INVALID",
            message: `Camera '${entityId}' viewport values must be finite numbers within [0, 1].`,
            path: `${path}/components/Camera/viewport/${index}`,
          });
        }
      }
    }
  }

  if (camera.layers !== undefined) {
    if (camera.layers.length === 0) {
      diagnostics.push({
        code: "TN_IR_CAMERA_LAYERS_INVALID",
        message: `Camera '${entityId}' must include at least one render layer.`,
        path: `${path}/components/Camera/layers`,
      });
    }
    for (const [index, layer] of camera.layers.entries()) {
      if (typeof layer !== "string" || layer.trim().length === 0) {
        diagnostics.push({
          code: "TN_IR_CAMERA_LAYERS_INVALID",
          message: `Camera '${entityId}' render layer names must be non-empty strings.`,
          path: `${path}/components/Camera/layers/${index}`,
        });
      }
    }
  }

  if (camera.follow !== undefined && !entityIds.has(camera.follow.target)) {
    diagnostics.push({
      code: "TN_IR_CAMERA_HELPER_TARGET_MISSING",
      message: `Camera '${entityId}' follow helper references missing entity '${camera.follow.target}'.`,
      path: `${path}/components/Camera/follow/target`,
    });
  }
  if (camera.orbit !== undefined && !entityIds.has(camera.orbit.target)) {
    diagnostics.push({
      code: "TN_IR_CAMERA_HELPER_TARGET_MISSING",
      message: `Camera '${entityId}' orbit helper references missing entity '${camera.orbit.target}'.`,
      path: `${path}/components/Camera/orbit/target`,
    });
  }

  if (camera.projection !== undefined) {
    if (camera.projection.kind === "backend") {
      diagnostics.push({
        code: "TN_IR_CAMERA_CUSTOM_PROJECTION_UNSUPPORTED",
        message: `Camera '${entityId}' uses a non-portable backend projection payload.`,
        path: `${path}/components/Camera/projection`,
        suggestion: "Use a portable matrix projection declaration or omit custom projection metadata.",
      });
    } else if (camera.projection.matrix.length !== 16) {
      diagnostics.push({
        code: "TN_IR_CAMERA_CUSTOM_PROJECTION_INVALID",
        message: `Camera '${entityId}' matrix projection must contain 16 finite values.`,
        path: `${path}/components/Camera/projection/matrix`,
      });
    } else {
      for (const [index, value] of camera.projection.matrix.entries()) {
        if (!Number.isFinite(value)) {
          diagnostics.push({
            code: "TN_IR_CAMERA_CUSTOM_PROJECTION_INVALID",
            message: `Camera '${entityId}' matrix projection contains a non-finite value.`,
            path: `${path}/components/Camera/projection/matrix/${index}`,
          });
        }
      }
    }
  }

  if (camera.target === undefined) {
    return;
  }

  if (camera.target.kind === "backbuffer") {
    return;
  }

  const assetId = camera.target.asset;
  if (!assetIds.has(assetId)) {
    diagnostics.push({
      code: "TN_IR_CAMERA_TARGET_MISSING",
      message: `Camera '${entityId}' references missing render target asset '${assetId}'.`,
      path: `${path}/components/Camera/target/asset`,
    });
    return;
  }

  const targetAsset = renderTargets.get(assetId);
  if (targetAsset === undefined) {
    diagnostics.push({
      code: "TN_IR_CAMERA_TARGET_INVALID",
      message: `Camera '${entityId}' target '${assetId}' must reference a render-target asset.`,
      path: `${path}/components/Camera/target/asset`,
    });
    return;
  }

  if (camera.target.kind === "depth") {
    if (targetAsset.usage !== "depth") {
      diagnostics.push({
        code: "TN_IR_CAMERA_TARGET_INVALID",
        message: `Camera '${entityId}' depth target '${assetId}' must use depth render-target usage.`,
        path: `${path}/components/Camera/target/asset`,
      });
    }
    if (camera.target.sample === true || materialTextureRefs.has(assetId)) {
      diagnostics.push({
        code: "TN_IR_CAMERA_DEPTH_TARGET_SAMPLING_UNSUPPORTED",
        message: `Camera '${entityId}' depth target '${assetId}' cannot be sampled by materials in this release.`,
        path: `${path}/components/Camera/target`,
        suggestion: "Use a color render target for material sampling or keep depth targets write-only.",
      });
    }
  }

  if (camera.target.kind === "texture" && targetAsset.usage !== "color") {
    diagnostics.push({
      code: "TN_IR_CAMERA_TARGET_INVALID",
      message: `Camera '${entityId}' texture target '${assetId}' must use color render-target usage.`,
      path: `${path}/components/Camera/target/asset`,
    });
  }
}

function readActiveCameras(
  world: IWorldIr,
  entityIds: ReadonlySet<string>,
  resourcesPath: string,
  diagnostics: IIrDiagnostic[],
): Array<{ entity: string; order?: number }> {
  const activeCamerasResource = world.resources?.ActiveCameras as { cameras?: unknown } | undefined;
  if (activeCamerasResource?.cameras !== undefined) {
    if (!Array.isArray(activeCamerasResource.cameras)) {
      diagnostics.push({
        code: "TN_IR_ACTIVE_CAMERAS_INVALID",
        message: "ActiveCameras resource must contain a cameras array.",
        path: `${resourcesPath}/ActiveCameras/cameras`,
      });
      return [];
    }
    return activeCamerasResource.cameras.flatMap((entry, index) => {
      if (typeof entry === "string") {
        if (!entityIds.has(entry)) {
          diagnostics.push({
            code: "TN_IR_ACTIVE_CAMERAS_INVALID",
            message: `ActiveCameras references missing entity '${entry}'.`,
            path: `${resourcesPath}/ActiveCameras/cameras/${index}`,
          });
          return [];
        }
        return [{ entity: entry }];
      }
      if (!isRecord(entry) || typeof entry.entity !== "string") {
        diagnostics.push({
          code: "TN_IR_ACTIVE_CAMERAS_INVALID",
          message: "ActiveCameras entries must include an entity id.",
          path: `${resourcesPath}/ActiveCameras/cameras/${index}`,
        });
        return [];
      }
      if (!entityIds.has(entry.entity)) {
        diagnostics.push({
          code: "TN_IR_ACTIVE_CAMERAS_INVALID",
          message: `ActiveCameras references missing entity '${entry.entity}'.`,
          path: `${resourcesPath}/ActiveCameras/cameras/${index}/entity`,
        });
        return [];
      }
      if (entry.order !== undefined && (!Number.isFinite(entry.order))) {
        diagnostics.push({
          code: "TN_IR_ACTIVE_CAMERAS_INVALID",
          message: `ActiveCameras order for '${entry.entity}' must be a finite number.`,
          path: `${resourcesPath}/ActiveCameras/cameras/${index}/order`,
        });
      }
      return [{ entity: entry.entity, order: typeof entry.order === "number" ? entry.order : undefined }];
    });
  }

  const activeCamera = world.resources?.ActiveCamera as { entity?: string } | undefined;
  if (activeCamera?.entity !== undefined) {
    if (!entityIds.has(activeCamera.entity)) {
      diagnostics.push({
        code: "TN_IR_ACTIVE_CAMERA_INVALID",
        message: `ActiveCamera references missing entity '${activeCamera.entity}'.`,
        path: `${resourcesPath}/ActiveCamera/entity`,
      });
      return [];
    }
    return [{ entity: activeCamera.entity }];
  }

  return [];
}

function validateActiveCameras(
  activeCameras: readonly { entity: string; order?: number }[],
  world: IWorldIr,
  worldPath: string,
  diagnostics: IIrDiagnostic[],
): void {
  const seen = new Set<string>();
  for (const [index, camera] of activeCameras.entries()) {
    if (seen.has(camera.entity)) {
      diagnostics.push({
        code: "TN_IR_ACTIVE_CAMERAS_DUPLICATE",
        message: `ActiveCameras contains duplicate camera entity '${camera.entity}'.`,
        path: `${worldPath}/resources/ActiveCameras/cameras/${index}`,
      });
    }
    seen.add(camera.entity);
    const entity = world.entities.find((item) => item.id === camera.entity);
    if (entity?.components.Camera === undefined) {
      diagnostics.push({
        code: "TN_IR_ACTIVE_CAMERAS_INVALID",
        message: `ActiveCameras entity '${camera.entity}' must include a Camera component.`,
        path: `${worldPath}/resources/ActiveCameras/cameras/${index}/entity`,
      });
    }
  }
}

function validateRenderTargetCycles(
  world: IWorldIr,
  worldPath: string,
  renderTargets: ReadonlyMap<string, Extract<IAssetsManifest["assets"][number], { kind: "render-target" }>>,
  materials: IMaterialsIr | undefined,
  diagnostics: IIrDiagnostic[],
): void {
  const materialUsers = new Map<string, Array<{ entityId: string; layers: readonly string[] }>>();
  for (const entity of world.entities) {
    const materialId = entity.components.MeshRenderer?.material;
    if (materialId === undefined) {
      continue;
    }
    const material = materials?.materials.find((entry) => entry.id === materialId);
    if (material === undefined) {
      continue;
    }
    for (const slot of [
      "baseColorTexture",
      "normalTexture",
      "metallicRoughnessTexture",
      "emissiveTexture",
      "occlusionTexture",
      "clearcoatTexture",
      "clearcoatRoughnessTexture",
      "transmissionTexture",
    ] as const) {
      const textureId = (material as unknown as Record<string, unknown>)[slot];
      if (typeof textureId === "string") {
        const users = materialUsers.get(textureId) ?? [];
        users.push({
          entityId: entity.id,
          layers: entity.components.RenderLayers?.layers ?? ["default"],
        });
        materialUsers.set(textureId, users);
      }
    }
  }

  for (const [entityId, camera, path] of listCameras(world, worldPath)) {
    if (camera.target?.kind !== "texture") {
      continue;
    }
    const assetId = camera.target.asset;
    if (!renderTargets.has(assetId)) {
      continue;
    }
    const cameraLayers = camera.layers ?? ["default"];
    const cyclicUser = (materialUsers.get(assetId) ?? []).find((user) => intersects(cameraLayers, user.layers));
    if (cyclicUser !== undefined) {
      diagnostics.push({
        code: "TN_IR_CAMERA_RENDER_TARGET_CYCLE",
        message: `Camera '${entityId}' targets render texture '${assetId}' that is sampled by visible entity '${cyclicUser.entityId}'.`,
        path: `${path}/components/Camera/target`,
      });
    }
  }
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function collectMaterialTextureRefs(materials: IMaterialsIr | undefined): ReadonlyMap<string, string> {
  const refs = new Map<string, string>();
  for (const material of materials?.materials ?? []) {
    for (const slot of [
      "baseColorTexture",
      "normalTexture",
      "metallicRoughnessTexture",
      "emissiveTexture",
      "occlusionTexture",
      "clearcoatTexture",
      "clearcoatRoughnessTexture",
      "transmissionTexture",
    ] as const) {
      const textureId = (material as unknown as Record<string, unknown>)[slot];
      if (typeof textureId === "string") {
        refs.set(textureId, `materials.ir.json/materials/${material.id}/${slot}`);
      }
    }
  }
  return refs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
