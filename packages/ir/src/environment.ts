import type { IAssetsManifest, IEnvironmentSceneIr, Vec3 } from "./types.js";
import type { IInputIr } from "./input.js";
import type { IIrDiagnostic } from "./validate.js";
import { validateAtmosphereProfile, validateEnvironmentLighting } from "./rendering.js";

export function validateEnvironmentSceneIr(
  scene: IEnvironmentSceneIr,
  assets: IAssetsManifest | undefined,
  path: string,
  input?: IInputIr,
): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  validateUnsupportedFields(
    scene,
    [
      "atmosphere",
      "bookmarks",
      "controller",
      "environmentMap",
      "exclusionZones",
      "instances",
      "lightProbes",
      "path",
      "referenceImage",
      "scatter",
      "schema",
      "skybox",
      "sourceAssets",
      "terrain",
      "version",
      "walkability",
    ],
    path,
    "Environment scene",
    diagnostics,
  );
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
    validateUnsupportedFields(
      sourceAsset,
      ["asset", "category", "id", "lod"],
      `${path}/sourceAssets/${index}`,
      `Environment source asset '${sourceAsset.id}'`,
      diagnostics,
    );
    if (!modelAssets.has(sourceAsset.asset)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_ASSET_MISSING",
        message: `Environment source asset '${sourceAsset.id}' references unknown model asset '${sourceAsset.asset}'.`,
        path: `${path}/sourceAssets/${index}/asset`,
      });
    }
    validateSourceAssetLod(sourceAsset, index, modelAssets, `${path}/sourceAssets/${index}`, diagnostics);
  });

  const sourceAssetIds = new Set(scene.sourceAssets.map((sourceAsset) => sourceAsset.id));
  scene.instances.forEach((instance, index) => {
    validateUnsupportedFields(
      instance,
      ["collisionMode", "id", "kind", "position", "renderGroup", "rotation", "scale", "scatterExclusionRadius", "scatterSource", "sourceAsset", "tags"],
      `${path}/instances/${index}`,
      `Environment instance '${instance.id}'`,
      diagnostics,
    );
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
  diagnostics.push(...validateEnvironmentLighting(scene, assets, path));
  validateFirstPersonController(scene, input, path, diagnostics);
  validateWalkability(scene, path, diagnostics);
  validateScatter(scene, path, sourceAssetIds, diagnostics);
  (scene.bookmarks ?? []).forEach((bookmark, index) => {
    validateVec3(bookmark.position, `${path}/bookmarks/${index}/position`, diagnostics);
    validateFiniteNumber(bookmark.pitch, `${path}/bookmarks/${index}/pitch`, "TN_IR_ENVIRONMENT_BOOKMARK_PITCH_INVALID", diagnostics);
    validateFiniteNumber(bookmark.yaw, `${path}/bookmarks/${index}/yaw`, "TN_IR_ENVIRONMENT_BOOKMARK_YAW_INVALID", diagnostics);
  });

  return diagnostics;
}

function validateUnsupportedFields(
  value: unknown,
  supportedKeys: readonly string[],
  path: string,
  label: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return;
  }
  const supported = new Set(supportedKeys);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (supported.has(key)) {
      continue;
    }
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_FIELD_UNSUPPORTED",
      message: `${label} uses unsupported field '${key}'.`,
      path: `${path}/${key}`,
      severity: "error",
      suggestion: "Remove backend-specific renderer/content metadata or model it with promoted portable environment fields.",
    });
  }
}

function validateSourceAssetLod(
  sourceAsset: IEnvironmentSceneIr["sourceAssets"][number],
  sourceAssetIndex: number,
  modelAssets: ReadonlySet<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (sourceAsset.lod === undefined) {
    return;
  }
  if (sourceAsset.lod.length === 0) {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_LOD_LEVELS_MISSING",
      message: `Environment source asset '${sourceAsset.id}' declares LOD metadata without levels.`,
      path: `${path}/lod`,
      severity: "error",
      suggestion: "Add at least one LOD level or remove the lod field.",
    });
    return;
  }
  let previousMaxDistance = -Infinity;
  sourceAsset.lod.forEach((level, levelIndex) => {
    const levelPath = `${path}/lod/${levelIndex}`;
    if (!modelAssets.has(level.asset)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_LOD_ASSET_MISSING",
        message: `Environment source asset '${sourceAsset.id}' LOD level ${levelIndex} references unknown model asset '${level.asset}'.`,
        path: `${levelPath}/asset`,
        severity: "error",
        suggestion: `Add model asset '${level.asset}' to assets.manifest.json or update sourceAssets/${sourceAssetIndex}/lod/${levelIndex}/asset.`,
      });
    }
    if (level.asset === sourceAsset.asset) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_LOD_CYCLE",
        message: `Environment source asset '${sourceAsset.id}' LOD level ${levelIndex} points back to its primary asset.`,
        path: `${levelPath}/asset`,
        severity: "error",
        suggestion: "Use a distinct simplified model asset for each LOD level.",
      });
    }
    if (
      !Number.isFinite(level.minDistance) ||
      !Number.isFinite(level.maxDistance) ||
      level.minDistance < 0 ||
      level.maxDistance <= level.minDistance
    ) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_LOD_DISTANCE_INVALID",
        message: `Environment source asset '${sourceAsset.id}' LOD level ${levelIndex} must use finite ordered non-negative distances.`,
        path: levelPath,
        severity: "error",
        suggestion: "Use minDistance >= 0 and maxDistance greater than minDistance.",
      });
    }
    if (level.minDistance < previousMaxDistance) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_LOD_THRESHOLDS_UNSORTED",
        message: `Environment source asset '${sourceAsset.id}' LOD level ${levelIndex} overlaps or sorts before the previous level.`,
        path: levelPath,
        severity: "error",
        suggestion: "Sort LOD levels by distance and make each minDistance greater than or equal to the previous maxDistance.",
      });
    }
    previousMaxDistance = Math.max(previousMaxDistance, level.maxDistance);
  });
}

function validateWalkability(scene: IEnvironmentSceneIr, path: string, diagnostics: IIrDiagnostic[]): void {
  const walkability = scene.walkability;
  if (walkability === undefined) {
    return;
  }
  validatePositiveFinite(walkability.movementProfile.radius, `${path}/walkability/movementProfile/radius`, "TN_IR_WALKABILITY_RADIUS_INVALID", diagnostics);
  validatePositiveFinite(walkability.movementProfile.height, `${path}/walkability/movementProfile/height`, "TN_IR_WALKABILITY_HEIGHT_INVALID", diagnostics);
  validatePositiveFinite(walkability.movementProfile.eyeHeight, `${path}/walkability/movementProfile/eyeHeight`, "TN_IR_WALKABILITY_EYE_HEIGHT_INVALID", diagnostics);
  const instanceIds = new Set(scene.instances.map((instance) => instance.id));
  walkability.blockers.forEach((blocker, index) => {
    if (!instanceIds.has(blocker.instance)) {
      diagnostics.push({
        code: "TN_IR_WALKABILITY_BLOCKER_INSTANCE_MISSING",
        message: `Walkability blocker '${blocker.id}' references missing instance '${blocker.instance}'.`,
        path: `${path}/walkability/blockers/${index}/instance`,
      });
    }
  });
  walkability.regions.forEach((region, index) => {
    if (region.points.length < 3) {
      diagnostics.push({
        code: "TN_IR_WALKABILITY_REGION_TOO_SMALL",
        message: `Walkable region '${region.id}' must include at least three points.`,
        path: `${path}/walkability/regions/${index}/points`,
      });
    }
    if (polygonSelfIntersects(region.points)) {
      diagnostics.push({
        code: "TN_IR_WALKABILITY_REGION_SELF_INTERSECTS",
        message: `Walkable region '${region.id}' must not self-intersect.`,
        path: `${path}/walkability/regions/${index}/points`,
      });
    }
  });
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

function polygonSelfIntersects(points: ReadonlyArray<readonly [number, number]>): boolean {
  for (let left = 0; left < points.length; left += 1) {
    const a = points[left];
    const b = points[(left + 1) % points.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    for (let right = left + 1; right < points.length; right += 1) {
      if (Math.abs(left - right) <= 1 || (left === 0 && right === points.length - 1)) {
        continue;
      }
      const c = points[right];
      const d = points[(right + 1) % points.length];
      if (c !== undefined && d !== undefined && segmentsIntersect(a, b, c, d)) {
        return true;
      }
    }
  }
  return false;
}

function segmentsIntersect(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
): boolean {
  const det = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (det === 0) {
    return false;
  }
  const lambda = ((d[1] - c[1]) * (d[0] - a[0]) + (c[0] - d[0]) * (d[1] - a[1])) / det;
  const gamma = ((a[1] - b[1]) * (d[0] - a[0]) + (b[0] - a[0]) * (d[1] - a[1])) / det;
  return lambda > 0 && lambda < 1 && gamma > 0 && gamma < 1;
}
