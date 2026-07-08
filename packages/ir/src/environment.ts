import type { IAssetsManifest, IEnvironmentSceneIr, ITargetProfile, Vec3 } from "./types.js";
import type { IInputIr } from "./input.js";
import type { IIrDiagnostic } from "./validate.js";
import { validateAtmosphereProfile, validateEnvironmentLighting } from "./rendering.js";

export function validateEnvironmentSceneIr(
  scene: IEnvironmentSceneIr,
  assets: IAssetsManifest | undefined,
  path: string,
  input?: IInputIr,
  options: { budgets?: ITargetProfile["budgets"] } = {},
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
  const heightmapAssets = new Map((assets?.assets ?? []).filter((asset) => asset.kind === "heightmap").map((asset) => [asset.id, asset]));
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
      ["asset", "category", "debug", "id", "lod", "visibility"],
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
    validateVisibilityRange(sourceAsset.visibility, `${path}/sourceAssets/${index}/visibility`, "source asset", diagnostics);
    validateDebugGizmo(sourceAsset.debug, `${path}/sourceAssets/${index}/debug`, diagnostics);
  });

  const sourceAssetIds = new Set(scene.sourceAssets.map((sourceAsset) => sourceAsset.id));
  scene.instances.forEach((instance, index) => {
    validateUnsupportedFields(
      instance,
      ["collisionMode", "debug", "id", "kind", "position", "renderGroup", "rotation", "scale", "scatterExclusionRadius", "scatterSource", "sourceAsset", "tags", "visibility"],
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
    validateVisibilityRange(instance.visibility, `${path}/instances/${index}/visibility`, "instance", diagnostics);
    validateDebugGizmo(instance.debug, `${path}/instances/${index}/debug`, diagnostics);
  });

  validateTerrainAndPath(scene, path, { budgets: options.budgets, heightmapAssets, textureAssets }, diagnostics);
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
    validateFadeBand(level.fade, `${levelPath}/fade`, diagnostics);
    validateLodImpostor(level.impostor, `${levelPath}/impostor`, diagnostics);
    previousMaxDistance = Math.max(previousMaxDistance, level.maxDistance);
  });
}

function validateLodImpostor(
  impostor: { material: string; mode: "cameraFacingQuad" } | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (impostor === undefined) {
    return;
  }
  if (typeof impostor !== "object" || impostor === null || Array.isArray(impostor)) {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_LOD_IMPOSTOR_INVALID",
      message: "Environment LOD impostor metadata must be an object.",
      path,
      severity: "error",
      suggestion: "Use impostor: { mode: 'cameraFacingQuad', material: '<material-id>' }.",
    });
    return;
  }
  for (const key of Object.keys(impostor)) {
    if (key !== "material" && key !== "mode") {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_LOD_IMPOSTOR_FIELD_UNSUPPORTED",
        message: `Environment LOD impostor metadata uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Keep impostors as bounded camera-facing quad metadata.",
      });
    }
  }
  if (impostor.mode !== "cameraFacingQuad") {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_LOD_IMPOSTOR_MODE_UNSUPPORTED",
      message: "Environment LOD impostor mode must be cameraFacingQuad.",
      path: `${path}/mode`,
      severity: "error",
      suggestion: "Use a camera-facing quad impostor until other billboard policies are promoted.",
      value: typeof impostor.mode === "string" ? impostor.mode : undefined,
    });
  }
  if (typeof impostor.material !== "string" || impostor.material.trim() === "") {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_LOD_IMPOSTOR_MATERIAL_INVALID",
      message: "Environment LOD impostor material must be a non-empty material id.",
      path: `${path}/material`,
      severity: "error",
      suggestion: "Reference an authored material for the billboard quad impostor.",
    });
  }
}

function validateVisibilityRange(
  range: { fade?: { endDistance: number; startDistance: number }; maxDistance: number; minDistance: number } | undefined,
  path: string,
  label: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (range === undefined) {
    return;
  }
  if (!Number.isFinite(range.minDistance) || !Number.isFinite(range.maxDistance) || range.minDistance < 0 || range.maxDistance <= range.minDistance) {
    diagnostics.push({
      code: "TN_IR_RENDERER_VISIBILITY_RANGE_INVALID",
      message: `Environment ${label} visibility range must use finite ordered non-negative distances.`,
      path,
      severity: "error",
      suggestion: "Use minDistance >= 0 and maxDistance greater than minDistance.",
    });
  }
  validateFadeBand(range.fade, `${path}/fade`, diagnostics);
}

function validateFadeBand(
  fade: { endDistance: number; startDistance: number } | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (fade === undefined) {
    return;
  }
  if (!Number.isFinite(fade.startDistance) || !Number.isFinite(fade.endDistance) || fade.startDistance < 0 || fade.endDistance <= fade.startDistance) {
    diagnostics.push({
      code: "TN_IR_RENDERER_VISIBILITY_RANGE_INVALID",
      message: "Environment fade metadata must use finite ordered non-negative distances.",
      path,
      severity: "error",
      suggestion: "Use startDistance >= 0 and endDistance greater than startDistance.",
    });
  }
}

function validateDebugGizmo(debug: { gizmo?: boolean } | undefined, path: string, diagnostics: IIrDiagnostic[]): void {
  if (debug?.gizmo !== undefined && typeof debug.gizmo !== "boolean") {
    diagnostics.push({
      code: "TN_IR_RENDERER_DEBUG_GIZMO_INVALID",
      message: "Debug gizmo metadata must be a boolean when declared.",
      path: `${path}/gizmo`,
      severity: "error",
      suggestion: "Use debug: { gizmo: true } only for opt-in inspection helpers.",
    });
  }
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

function validateTerrainAndPath(
  scene: IEnvironmentSceneIr,
  path: string,
  context: {
    budgets?: ITargetProfile["budgets"];
    heightmapAssets: ReadonlyMap<string, Extract<IAssetsManifest["assets"][number], { kind: "heightmap" }>>;
    textureAssets: ReadonlySet<string>;
  },
  diagnostics: IIrDiagnostic[],
): void {
  if (scene.terrain !== undefined) {
    validateUnsupportedFields(
      scene.terrain,
      ["bounds", "chunks", "collider", "controlPoints", "heightmap", "heightMode", "id", "material", "skirt", "splatLayers"],
      `${path}/terrain`,
      `Environment terrain '${scene.terrain.id}'`,
      diagnostics,
    );
    validateVec3(scene.terrain.bounds.min, `${path}/terrain/bounds/min`, diagnostics);
    validateVec3(scene.terrain.bounds.max, `${path}/terrain/bounds/max`, diagnostics);
    if (!boundsAreOrdered(scene.terrain.bounds.min, scene.terrain.bounds.max)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_TERRAIN_BOUNDS_INVALID",
        message: `Environment terrain '${scene.terrain.id}' must use ordered min/max bounds.`,
        path: `${path}/terrain/bounds`,
      });
    }
    if (scene.terrain.heightMode === "heightmap") {
      validateHeightmapTerrain(scene.terrain, `${path}/terrain`, context, diagnostics);
    } else if (scene.terrain.heightmap !== undefined) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_TERRAIN_HEIGHTMAP_MODE_INVALID",
        message: `Environment terrain '${scene.terrain.id}' declares a heightmap but heightMode is '${scene.terrain.heightMode}'.`,
        path: `${path}/terrain/heightMode`,
        severity: "error",
        suggestion: "Set heightMode to 'heightmap' when referencing a heightmap asset.",
      });
    }
    validateTerrainSplatLayers(scene.terrain, `${path}/terrain`, context, diagnostics);
    validateTerrainChunks(scene.terrain, `${path}/terrain`, diagnostics);
    validateTerrainCollider(scene.terrain, `${path}/terrain`, context, diagnostics);
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

function validateHeightmapTerrain(
  terrain: NonNullable<IEnvironmentSceneIr["terrain"]>,
  path: string,
  context: {
    budgets?: ITargetProfile["budgets"];
    heightmapAssets: ReadonlyMap<string, Extract<IAssetsManifest["assets"][number], { kind: "heightmap" }>>;
  },
  diagnostics: IIrDiagnostic[],
): void {
  if (terrain.heightmap === undefined) {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_TERRAIN_HEIGHTMAP_MISSING",
      message: `Environment terrain '${terrain.id}' uses heightmap mode but does not reference a heightmap asset.`,
      path: `${path}/heightmap`,
      severity: "error",
      suggestion: "Add heightmap: { asset, cellSize, heightScale } referencing a heightmap asset.",
    });
    return;
  }
  validateUnsupportedFields(
    terrain.heightmap,
    ["asset", "cellSize", "heightScale", "origin"],
    `${path}/heightmap`,
    `Environment terrain '${terrain.id}' heightmap`,
    diagnostics,
  );
  const heightmap = context.heightmapAssets.get(terrain.heightmap.asset);
  if (heightmap === undefined) {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_TERRAIN_HEIGHTMAP_ASSET_MISSING",
      message: `Environment terrain '${terrain.id}' references unknown heightmap asset '${terrain.heightmap.asset}'.`,
      path: `${path}/heightmap/asset`,
      severity: "error",
      suggestion: "Add a heightmap asset to assets.manifest.json or update terrain.heightmap.asset.",
    });
  } else {
    const cells = heightmap.width * heightmap.height;
    const maxCells = context.budgets?.maxTerrainCells;
    if (maxCells !== undefined && cells > maxCells) {
      diagnostics.push({
        code: "TN_TERRAIN_BUDGET_EXCEEDED",
        limit: maxCells,
        message: `Environment terrain '${terrain.id}' heightmap has ${cells} cells, exceeding target profile budget ${maxCells}.`,
        path: `${path}/heightmap/asset`,
        severity: "error",
        suggestion: "Reduce heightmap dimensions, chunk the terrain into a smaller fixture, or raise targetProfile.budgets.maxTerrainCells.",
        value: cells,
      });
    }
  }
  validatePositiveFinite(terrain.heightmap.cellSize, `${path}/heightmap/cellSize`, "TN_IR_ENVIRONMENT_TERRAIN_HEIGHTMAP_CELL_SIZE_INVALID", diagnostics);
  validatePositiveFinite(terrain.heightmap.heightScale, `${path}/heightmap/heightScale`, "TN_IR_ENVIRONMENT_TERRAIN_HEIGHTMAP_SCALE_INVALID", diagnostics);
  if (terrain.heightmap.origin !== undefined) {
    validateVec3(terrain.heightmap.origin, `${path}/heightmap/origin`, diagnostics);
  }
}

function validateTerrainSplatLayers(
  terrain: NonNullable<IEnvironmentSceneIr["terrain"]>,
  path: string,
  context: {
    budgets?: ITargetProfile["budgets"];
    textureAssets: ReadonlySet<string>;
  },
  diagnostics: IIrDiagnostic[],
): void {
  const layers = terrain.splatLayers;
  if (layers === undefined) {
    return;
  }
  const maxLayers = context.budgets?.maxTerrainSplatLayers ?? 4;
  if (layers.length > maxLayers) {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_TERRAIN_SPLAT_LAYER_LIMIT_EXCEEDED",
      limit: maxLayers,
      message: `Environment terrain '${terrain.id}' declares ${layers.length} splat layers, exceeding the supported limit ${maxLayers}.`,
      path: `${path}/splatLayers`,
      severity: "error",
      suggestion: "Use at most four terrain splat layers for portable web/native rendering.",
      value: layers.length,
    });
  }
  layers.forEach((layer, index) => {
    const layerPath = `${path}/splatLayers/${index}`;
    validateUnsupportedFields(
      layer,
      ["maxHeight", "maxSlope", "minHeight", "minSlope", "texture", "weight"],
      layerPath,
      `Environment terrain '${terrain.id}' splat layer ${index}`,
      diagnostics,
    );
    if (!context.textureAssets.has(layer.texture)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_TERRAIN_SPLAT_TEXTURE_MISSING",
        message: `Environment terrain '${terrain.id}' splat layer ${index} references unknown texture asset '${layer.texture}'.`,
        path: `${layerPath}/texture`,
        severity: "error",
        suggestion: "Add the ground texture to assets.manifest.json or update the splat layer texture reference.",
      });
    }
    validateOptionalFiniteRange(layer.minSlope, layer.maxSlope, `${layerPath}/slope`, "TN_IR_ENVIRONMENT_TERRAIN_SPLAT_SLOPE_RANGE_INVALID", diagnostics);
    validateOptionalFiniteRange(layer.minHeight, layer.maxHeight, `${layerPath}/height`, "TN_IR_ENVIRONMENT_TERRAIN_SPLAT_HEIGHT_RANGE_INVALID", diagnostics);
    if (layer.weight !== undefined && (!Number.isFinite(layer.weight) || layer.weight < 0 || layer.weight > 1)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_TERRAIN_SPLAT_WEIGHT_INVALID",
        message: `Environment terrain '${terrain.id}' splat layer ${index} weight must be in the range 0..1.`,
        path: `${layerPath}/weight`,
        severity: "error",
        suggestion: "Use a normalized blend weight between 0 and 1.",
      });
    }
  });
}

function validateTerrainChunks(
  terrain: NonNullable<IEnvironmentSceneIr["terrain"]>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (terrain.chunks === undefined) {
    return;
  }
  terrain.chunks.forEach((chunk, index) => {
    const chunkPath = `${path}/chunks/${index}`;
    validateUnsupportedFields(
      chunk,
      ["bounds", "heightRange", "id", "mesh", "sampleRange"],
      chunkPath,
      `Environment terrain '${terrain.id}' chunk ${index}`,
      diagnostics,
    );
    validateVec3(chunk.bounds.min, `${chunkPath}/bounds/min`, diagnostics);
    validateVec3(chunk.bounds.max, `${chunkPath}/bounds/max`, diagnostics);
    if (!boundsAreOrdered(chunk.bounds.min, chunk.bounds.max)) {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_TERRAIN_CHUNK_BOUNDS_INVALID",
        message: `Environment terrain '${terrain.id}' chunk '${chunk.id}' must use ordered min/max bounds.`,
        path: `${chunkPath}/bounds`,
        severity: "error",
      });
    }
    if (typeof chunk.mesh !== "string" || chunk.mesh.trim() === "") {
      diagnostics.push({
        code: "TN_IR_ENVIRONMENT_TERRAIN_CHUNK_MESH_INVALID",
        message: `Environment terrain '${terrain.id}' chunk '${chunk.id}' must reference a generated mesh asset.`,
        path: `${chunkPath}/mesh`,
        severity: "error",
        suggestion: "Emit a generated terrain mesh asset and reference its id from terrain.chunks.",
      });
    }
    validateOptionalFiniteRange(chunk.heightRange.min, chunk.heightRange.max, `${chunkPath}/heightRange`, "TN_IR_ENVIRONMENT_TERRAIN_CHUNK_HEIGHT_RANGE_INVALID", diagnostics);
    validateIntegerRange(chunk.sampleRange.x, `${chunkPath}/sampleRange/x`, diagnostics);
    validateIntegerRange(chunk.sampleRange.z, `${chunkPath}/sampleRange/z`, diagnostics);
  });
}

function validateTerrainCollider(
  terrain: NonNullable<IEnvironmentSceneIr["terrain"]>,
  path: string,
  context: {
    heightmapAssets: ReadonlyMap<string, Extract<IAssetsManifest["assets"][number], { kind: "heightmap" }>>;
  },
  diagnostics: IIrDiagnostic[],
): void {
  if (terrain.collider === undefined) {
    return;
  }
  validateUnsupportedFields(
    terrain.collider,
    ["asset", "cellSize", "heightRange", "heightScale", "kind", "mesh", "origin", "sampleCount"],
    `${path}/collider`,
    `Environment terrain '${terrain.id}' collider`,
    diagnostics,
  );
  if (terrain.collider.kind !== "heightfield") {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_TERRAIN_COLLIDER_KIND_INVALID",
      message: `Environment terrain '${terrain.id}' collider must use heightfield kind.`,
      path: `${path}/collider/kind`,
      severity: "error",
      suggestion: "Use kind: 'heightfield' for compiler-emitted terrain colliders.",
    });
  }
  if (!context.heightmapAssets.has(terrain.collider.asset)) {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_TERRAIN_COLLIDER_ASSET_MISSING",
      message: `Environment terrain '${terrain.id}' collider references unknown heightmap asset '${terrain.collider.asset}'.`,
      path: `${path}/collider/asset`,
      severity: "error",
      suggestion: "Reference the same bundle-local heightmap asset used by terrain.heightmap.",
    });
  }
  if (typeof terrain.collider.mesh !== "string" || terrain.collider.mesh.trim() === "") {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_TERRAIN_COLLIDER_MESH_INVALID",
      message: `Environment terrain '${terrain.id}' collider must reference a generated terrain mesh asset.`,
      path: `${path}/collider/mesh`,
      severity: "error",
      suggestion: "Emit a generated terrain mesh asset and reference its id from terrain.collider.mesh.",
    });
  }
  validatePositiveFinite(terrain.collider.cellSize, `${path}/collider/cellSize`, "TN_IR_ENVIRONMENT_TERRAIN_HEIGHTMAP_CELL_SIZE_INVALID", diagnostics);
  validatePositiveFinite(terrain.collider.heightScale, `${path}/collider/heightScale`, "TN_IR_ENVIRONMENT_TERRAIN_HEIGHTMAP_SCALE_INVALID", diagnostics);
  validateVec3(terrain.collider.origin, `${path}/collider/origin`, diagnostics);
  validateOptionalFiniteRange(terrain.collider.heightRange.min, terrain.collider.heightRange.max, `${path}/collider/heightRange`, "TN_IR_ENVIRONMENT_TERRAIN_COLLIDER_HEIGHT_RANGE_INVALID", diagnostics);
  validateIntegerRange(terrain.collider.sampleCount, `${path}/collider/sampleCount`, diagnostics);
}

function validateOptionalFiniteRange(
  min: number | undefined,
  max: number | undefined,
  path: string,
  code: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (min === undefined && max === undefined) {
    return;
  }
  if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    diagnostics.push({
      code,
      message: "Terrain splat range must declare finite min and max values in ascending order.",
      path,
      severity: "error",
      suggestion: "Declare both min and max, with max greater than or equal to min.",
    });
  }
}

function validateIntegerRange(value: readonly number[], path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((item) => Number.isInteger(item)) || value[0]! < 0 || value[1]! < value[0]!) {
    diagnostics.push({
      code: "TN_IR_ENVIRONMENT_TERRAIN_RANGE_INVALID",
      message: "Terrain sample ranges must be non-negative integer [min, max] tuples in ascending order.",
      path,
      severity: "error",
      suggestion: "Emit integer inclusive sample ranges with max greater than or equal to min.",
    });
  }
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
