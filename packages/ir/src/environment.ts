import type { IAssetsManifest, IEnvironmentSceneIr, Vec3 } from "./types.js";
import type { IInputIr } from "./input.js";
import type { IIrDiagnostic } from "./validate.js";
import { validateAtmosphereProfile } from "./rendering.js";

export function validateEnvironmentSceneIr(
  scene: IEnvironmentSceneIr,
  assets: IAssetsManifest | undefined,
  path: string,
  input?: IInputIr,
): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  if (scene.schema !== "threenative.environment-scene" || scene.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_SCENE_VERSION_UNSUPPORTED",
      message: "Environment scene IR must use threenative.environment-scene version 0.1.0.",
      path,
    });
  }
  validateUniqueIds(scene.sourceAssets, `${path}/sourceAssets`, "TN_IR_ENVIRONMENT_SOURCE_ASSET_DUPLICATE", diagnostics);
  validateUniqueIds(scene.instances, `${path}/instances`, "TN_IR_ENVIRONMENT_INSTANCE_DUPLICATE", diagnostics);
  validateUniqueIds(scene.scatter ?? [], `${path}/scatter`, "TN_IR_ENVIRONMENT_SCATTER_DUPLICATE", diagnostics);
  validateUniqueIds(scene.exclusionZones ?? [], `${path}/exclusionZones`, "TN_IR_ENVIRONMENT_EXCLUSION_DUPLICATE", diagnostics);
  validateUniqueIds(scene.bookmarks ?? [], `${path}/bookmarks`, "TN_IR_ENVIRONMENT_BOOKMARK_DUPLICATE", diagnostics);

  const modelAssets = new Set((assets?.assets ?? []).filter((asset) => asset.kind === "model").map((asset) => asset.id));
  const textureAssets = new Set((assets?.assets ?? []).filter((asset) => asset.kind === "texture").map((asset) => asset.id));
  if (scene.referenceImage !== undefined && !textureAssets.has(scene.referenceImage)) {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_REFERENCE_IMAGE_MISSING",
      message: `Environment scene references unknown texture asset '${scene.referenceImage}'.`,
      path: `${path}/referenceImage`,
    });
  }
  scene.sourceAssets.forEach((sourceAsset, index) => {
    if (!modelAssets.has(sourceAsset.asset)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_ASSET_MISSING",
        message: `Environment source asset '${sourceAsset.id}' references unknown model asset '${sourceAsset.asset}'.`,
        path: `${path}/sourceAssets/${index}/asset`,
      });
    }
  });

  const sourceAssetIds = new Set(scene.sourceAssets.map((sourceAsset) => sourceAsset.id));
  scene.instances.forEach((instance, index) => {
    if (!sourceAssetIds.has(instance.sourceAsset)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_SOURCE_ASSET_MISSING",
        message: `Environment instance '${instance.id}' references unknown source asset '${instance.sourceAsset}'.`,
        path: `${path}/instances/${index}/sourceAsset`,
      });
    }
    validateVec3(instance.position, `${path}/instances/${index}/position`, diagnostics);
    if (instance.scale !== undefined) {
      validateVec3(instance.scale, `${path}/instances/${index}/scale`, diagnostics);
    }
  });

  validateTerrainAndPath(scene, path, diagnostics);
  diagnostics.push(...validateAtmosphereProfile(scene.atmosphere, `${path}/atmosphere`));
  validateFirstPersonController(scene, input, path, diagnostics);
  validateScatter(scene, path, sourceAssetIds, diagnostics);
  (scene.bookmarks ?? []).forEach((bookmark, index) => {
    validateVec3(bookmark.position, `${path}/bookmarks/${index}/position`, diagnostics);
    validateFiniteNumber(bookmark.pitch, `${path}/bookmarks/${index}/pitch`, "TN_IR_ENVIRONMENT_BOOKMARK_PITCH_INVALID", diagnostics);
    validateFiniteNumber(bookmark.yaw, `${path}/bookmarks/${index}/yaw`, "TN_IR_ENVIRONMENT_BOOKMARK_YAW_INVALID", diagnostics);
  });

  return diagnostics;
}

function validateFirstPersonController(
  scene: IEnvironmentSceneIr,
  input: IInputIr | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const controller = scene.controller;
  if (controller === undefined) {
    return;
  }
  validatePositiveFinite(controller.height, `${path}/controller/height`, "TN_IR_FIRST_PERSON_HEIGHT_INVALID", diagnostics);
  validatePositiveFinite(controller.maxSpeed, `${path}/controller/maxSpeed`, "TN_IR_FIRST_PERSON_SPEED_INVALID", diagnostics);
  validatePositiveFinite(controller.acceleration, `${path}/controller/acceleration`, "TN_IR_FIRST_PERSON_ACCELERATION_INVALID", diagnostics);
  validatePositiveFinite(controller.sensitivity, `${path}/controller/sensitivity`, "TN_IR_FIRST_PERSON_SENSITIVITY_INVALID", diagnostics);
  if (!Number.isFinite(controller.pitch.min) || !Number.isFinite(controller.pitch.max) || controller.pitch.min >= controller.pitch.max) {
    diagnostics.push({
      code: "TN_IR_FIRST_PERSON_PITCH_CLAMP_INVALID",
      message: `First-person controller for camera '${controller.camera}' must use an ordered pitch clamp.`,
      path: `${path}/controller/pitch`,
    });
  }
  if (input !== undefined) {
    const actions = new Set(input.actions.map((action) => action.id));
    const axes = new Set(input.axes.map((axis) => axis.id));
    const requiredActions = [
      ["forward", controller.input.forward],
      ["backward", controller.input.backward],
      ["left", controller.input.left],
      ["right", controller.input.right],
      ...(controller.input.sprint === undefined ? [] : [["sprint", controller.input.sprint] as const]),
    ] as const;
    for (const [field, action] of requiredActions) {
      if (!actions.has(action)) {
        diagnostics.push({
          code: "TN_IR_FIRST_PERSON_INPUT_ACTION_MISSING",
          message: `First-person controller references missing input action '${action}'.`,
          path: `${path}/controller/input/${field}`,
        });
      }
    }
    for (const [field, axis] of [["lookX", controller.input.lookX], ["lookY", controller.input.lookY]] as const) {
      if (!axes.has(axis)) {
        diagnostics.push({
          code: "TN_IR_FIRST_PERSON_INPUT_AXIS_MISSING",
          message: `First-person controller references missing input axis '${axis}'.`,
          path: `${path}/controller/input/${field}`,
        });
      }
    }
  }
}

function validateTerrainAndPath(scene: IEnvironmentSceneIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (scene.terrain !== undefined) {
    validateVec3(scene.terrain.bounds.min, `${path}/terrain/bounds/min`, diagnostics);
    validateVec3(scene.terrain.bounds.max, `${path}/terrain/bounds/max`, diagnostics);
    if (!boundsAreOrdered(scene.terrain.bounds.min, scene.terrain.bounds.max)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_TERRAIN_BOUNDS_INVALID",
        message: `Environment terrain '${scene.terrain.id}' must use ordered min/max bounds.`,
        path: `${path}/terrain/bounds`,
      });
    }
  }
  if (scene.path.points.length < 2) {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_PATH_TOO_SHORT",
      message: `Environment path '${scene.path.id}' must include at least two points.`,
      path: `${path}/path/points`,
    });
  }
  validatePositiveFinite(scene.path.width, `${path}/path/width`, "TN_IR_ENVIRONMENT_PATH_WIDTH_INVALID", diagnostics);
  if (scene.path.edgeFalloff !== undefined) {
    validatePositiveFinite(scene.path.edgeFalloff, `${path}/path/edgeFalloff`, "TN_IR_ENVIRONMENT_PATH_FALLOFF_INVALID", diagnostics);
  }
  if (scene.path.clearingRadius !== undefined) {
    validatePositiveFinite(scene.path.clearingRadius, `${path}/path/clearingRadius`, "TN_IR_ENVIRONMENT_PATH_CLEARING_INVALID", diagnostics);
  }
  scene.path.points.forEach((point, index) => {
    validateVec3(point, `${path}/path/points/${index}`, diagnostics);
    if (scene.terrain !== undefined && !pointInsideBounds(point, scene.terrain.bounds.min, scene.terrain.bounds.max)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_PATH_POINT_OUT_OF_BOUNDS",
        message: `Environment path '${scene.path.id}' point ${index} is outside terrain '${scene.terrain.id}'.`,
        path: `${path}/path/points/${index}`,
      });
    }
  });
}

function validateScatter(
  scene: IEnvironmentSceneIr,
  path: string,
  sourceAssetIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  (scene.scatter ?? []).forEach((scatter, index) => {
    if (!Number.isInteger(scatter.seed)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_SCATTER_SEED_INVALID",
        message: `Environment scatter '${scatter.id}' must use an integer seed.`,
        path: `${path}/scatter/${index}/seed`,
      });
    }
    validateVec3(scatter.bounds.min, `${path}/scatter/${index}/bounds/min`, diagnostics);
    validateVec3(scatter.bounds.max, `${path}/scatter/${index}/bounds/max`, diagnostics);
    if (!boundsAreOrdered(scatter.bounds.min, scatter.bounds.max)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_SCATTER_BOUNDS_INVALID",
        message: `Environment scatter '${scatter.id}' must use ordered min/max bounds.`,
        path: `${path}/scatter/${index}/bounds`,
      });
    }
    if (scatter.count !== undefined && (!Number.isInteger(scatter.count) || scatter.count < 0 || scatter.count > 2000)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_SCATTER_COUNT_INVALID",
        message: `Environment scatter '${scatter.id}' count must be an integer from 0 to 2000.`,
        path: `${path}/scatter/${index}/count`,
      });
    }
    if (scatter.density !== undefined && (!Number.isFinite(scatter.density) || scatter.density < 0 || scatter.density > 100)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_SCATTER_DENSITY_INVALID",
        message: `Environment scatter '${scatter.id}' density must be finite and at most 100.`,
        path: `${path}/scatter/${index}/density`,
      });
    }
    validatePositiveFinite(scatter.minScale, `${path}/scatter/${index}/minScale`, "TN_IR_ENVIRONMENT_SCATTER_SCALE_INVALID", diagnostics);
    validatePositiveFinite(scatter.maxScale, `${path}/scatter/${index}/maxScale`, "TN_IR_ENVIRONMENT_SCATTER_SCALE_INVALID", diagnostics);
    if (scatter.minScale > scatter.maxScale) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_SCATTER_SCALE_INVALID",
        message: `Environment scatter '${scatter.id}' minScale must be at or below maxScale.`,
        path: `${path}/scatter/${index}/minScale`,
      });
    }
    scatter.assetIds.forEach((assetId, assetIndex) => {
      if (!sourceAssetIds.has(assetId)) {
        diagnostics.push({
          code: "TN_IR_ENVIRONMENT_SCATTER_ASSET_MISSING",
          message: `Environment scatter '${scatter.id}' references unknown source asset '${assetId}'.`,
          path: `${path}/scatter/${index}/assetIds/${assetIndex}`,
        });
      }
    });
  });
}

function validateUniqueIds(items: readonly { id: string }[], path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    if (ids.has(item.id)) {
      diagnostics.push({
        code,
        message: `Duplicate id '${item.id}'.`,
        path: `${path}/${index}/id`,
      });
    }
    ids.add(item.id);
  });
}

function validateVec3(value: readonly number[], path: string, diagnostics: IIrDiagnostic[]): void {
  if (value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    diagnostics.push({
      code: "TN_IR_VEC3_INVALID",
      message: "Expected a finite vec3 value.",
      path,
    });
  }
}

function validatePositiveFinite(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    diagnostics.push({
      code,
      message: "Expected a positive finite number.",
      path,
    });
  }
}

function validateFiniteNumber(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    diagnostics.push({
      code,
      message: "Expected a finite number.",
      path,
    });
  }
}

function boundsAreOrdered(min: Vec3, max: Vec3): boolean {
  return min[0] < max[0] && min[1] <= max[1] && min[2] < max[2];
}

function pointInsideBounds(point: Vec3, min: Vec3, max: Vec3): boolean {
  return point[0] >= min[0] && point[0] <= max[0] && point[2] >= min[2] && point[2] <= max[2];
}
