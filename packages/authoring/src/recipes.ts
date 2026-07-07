import { authoringDiagnostic, type IAuthoringDiagnostic } from "./diagnostics.js";
import {
  dispatchAuthoringOperation,
  getAuthoringOperationDescriptor,
  type AuthoringOperationName,
} from "./operationRegistry.js";
import { type IAuthoringOperationResult } from "./operations.js";

export type AuthoringRecipeId =
  | "collectible"
  | "dressed-environment-kit"
  | "health-bar"
  | "kinematic-character"
  | "lane-runner"
  | "obstacle-avoider"
  | "physics-target"
  | "third-person-controller"
  | "top-down-collector"
  | "trigger-zone"
  | "vehicle-checkpoint";

export interface IAuthoringRecipeOperation {
  args: Record<string, unknown>;
  name: AuthoringOperationName | string;
}

export interface IAuthoringRecipePlanOptions {
  args: Record<string, unknown>;
  projectPath?: string;
  recipeId: AuthoringRecipeId | string;
}

export interface IAuthoringRecipePlanResult {
  diagnostics: IAuthoringDiagnostic[];
  gameplayBlocks: string[];
  generatedIds: Record<string, string[]>;
  ok: boolean;
  operations: IAuthoringRecipeOperation[];
  proofCommands: string[];
  proofHints: string[];
  projectPath?: string;
  recipeId: string;
  scriptResponsibilities: string[];
  sourceOwners: Record<string, string[]>;
}

export interface IApplyAuthoringRecipeOptions extends IAuthoringRecipePlanOptions {
  stopOnError?: boolean;
}

export interface IAuthoringRecipeOperationResult {
  result: IAuthoringOperationResult;
  trace: IAuthoringRecipeOperation & { index: number };
}

export interface IAuthoringRecipeApplyResult extends IAuthoringRecipePlanResult {
  changed: boolean;
  filesWritten: string[];
  operationResults: IAuthoringRecipeOperationResult[];
  stoppedAt?: number;
}

const authoringRecipeIds: AuthoringRecipeId[] = [
  "third-person-controller",
  "collectible",
  "trigger-zone",
  "kinematic-character",
  "health-bar",
  "top-down-collector",
  "lane-runner",
  "vehicle-checkpoint",
  "obstacle-avoider",
  "physics-target",
  "dressed-environment-kit",
];

export function listAuthoringRecipeIds(): AuthoringRecipeId[] {
  return [...authoringRecipeIds];
}

export function planAuthoringRecipe(options: IAuthoringRecipePlanOptions): IAuthoringRecipePlanResult {
  const recipe = recipePlanners[options.recipeId as AuthoringRecipeId];
  if (recipe === undefined) {
    return {
      diagnostics: [
        authoringDiagnostic({
          code: "TN_AUTHORING_RECIPE_UNSUPPORTED",
          message: `Authoring recipe '${options.recipeId}' is not registered.`,
          path: "/recipe",
          suggestion: `Use one of: ${authoringRecipeIds.join(", ")}.`,
          value: options.recipeId,
        }),
      ],
      gameplayBlocks: [],
      generatedIds: {},
      ok: false,
      operations: [],
      proofCommands: [],
      proofHints: [],
      projectPath: options.projectPath,
      recipeId: options.recipeId,
      scriptResponsibilities: [],
      sourceOwners: {},
    };
  }

  const diagnostics = requiredRecipeArgs(options.recipeId, options.args, recipe.required);
  const operations = diagnostics.length === 0 ? recipe.plan(options.args) : [];
  diagnostics.push(...operations.flatMap((operation, index) => operationDiagnostics(options.recipeId, operation, index)));
  const metadata = diagnostics.length === 0 ? recipeMetadata(options.recipeId as AuthoringRecipeId, recipe, options.args, operations) : emptyRecipeMetadata();

  return {
    diagnostics,
    gameplayBlocks: metadata.gameplayBlocks,
    generatedIds: metadata.generatedIds,
    ok: diagnostics.length === 0,
    operations,
    proofCommands: metadata.proofCommands,
    proofHints: metadata.proofHints,
    projectPath: options.projectPath,
    recipeId: options.recipeId,
    scriptResponsibilities: metadata.scriptResponsibilities,
    sourceOwners: metadata.sourceOwners,
  };
}

export async function applyAuthoringRecipe(options: IApplyAuthoringRecipeOptions): Promise<IAuthoringRecipeApplyResult> {
  const plan = planAuthoringRecipe(options);
  const operationResults: IAuthoringRecipeOperationResult[] = [];
  const diagnostics = [...plan.diagnostics];
  const filesWritten = new Set<string>();
  let changed = false;
  let stoppedAt: number | undefined;

  if (!plan.ok || options.projectPath === undefined) {
    if (options.projectPath === undefined) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_RECIPE_PROJECT_MISSING",
          message: "Applying an authoring recipe requires projectPath.",
          path: "/projectPath",
        }),
      );
    }
    return {
      ...plan,
      changed,
      diagnostics,
      filesWritten: [],
      ok: false,
      operationResults,
    };
  }

  const stopOnError = options.stopOnError ?? true;
  for (const [index, operation] of plan.operations.entries()) {
    const result = await dispatchAuthoringOperation({
      args: operation.args,
      name: operation.name,
      projectPath: options.projectPath,
    });
    operationResults.push({ result, trace: { ...operation, index } });
    diagnostics.push(...result.diagnostics);
    for (const file of result.filesWritten) {
      filesWritten.add(file);
    }
    changed = changed || result.changed;
    if (!result.ok && stopOnError) {
      stoppedAt = index;
      break;
    }
  }

  const ok = plan.ok && operationResults.length === plan.operations.length && operationResults.every((entry) => entry.result.ok);
  return {
    ...plan,
    changed,
    diagnostics,
    filesWritten: [...filesWritten].sort(),
    ok,
    operationResults,
    ...(stoppedAt === undefined ? {} : { stoppedAt }),
  };
}

interface IRecipePlanner {
  metadata?(args: Record<string, unknown>, operations: readonly IAuthoringRecipeOperation[]): IRecipeMetadata;
  plan(args: Record<string, unknown>): IAuthoringRecipeOperation[];
  required: readonly string[];
}

interface IRecipeMetadata {
  gameplayBlocks: string[];
  generatedIds: Record<string, string[]>;
  proofCommands: string[];
  proofHints: string[];
  scriptResponsibilities: string[];
  sourceOwners: Record<string, string[]>;
}

const recipePlanners: Record<AuthoringRecipeId, IRecipePlanner> = {
  "third-person-controller": {
    required: ["sceneId", "entityId", "cameraId"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const entityId = requiredStringValue(args, "entityId");
      const cameraId = requiredStringValue(args, "cameraId");
      const height = optionalNumberValue(args, "height") ?? 1.8;
      const radius = optionalNumberValue(args, "radius") ?? 0.35;
      return [
        operation("scene.add_entity", { sceneId, entityId, prefabId: optionalStringValue(args, "prefabId") }),
        operation("scene.set_rigid_body", { sceneId, entityId, kind: "kinematic" }),
        operation("scene.set_collider", { sceneId, entityId, kind: "capsule", center: [0, height / 2, 0], height, radius }),
        operation("scene.set_character_controller", { sceneId, entityId, grounding: "raycast", moveXAxis: optionalStringValue(args, "moveXAxis") ?? "MoveX", moveZAxis: optionalStringValue(args, "moveZAxis") ?? "MoveZ", speed: optionalNumberValue(args, "speed") ?? 6 }),
        operation("scene.set_camera_component", { sceneId, entityId: cameraId, mode: "third-person-follow", targetId: entityId }),
      ];
    },
  },
  collectible: {
    required: ["sceneId", "entityId"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const entityId = requiredStringValue(args, "entityId");
      const prefabId = optionalStringValue(args, "prefabId") ?? `${entityId}.prefab`;
      const resourceId = optionalStringValue(args, "resourceId") ?? `${entityId}.collected`;
      const resourcePath = optionalStringValue(args, "resourcePath") ?? `collectibles.${entityId}.collected`;
      const systemId = optionalStringValue(args, "systemId") ?? `${entityId}.collect`;
      const uiNodeId = optionalStringValue(args, "uiNodeId") ?? `${entityId}.prompt`;
      return [
        operation("scene.add_prefab", { sceneId, prefabId, primitive: optionalStringValue(args, "primitive") ?? "sphere", color: optionalStringValue(args, "color") ?? "#ffd166" }),
        operation("scene.add_entity", { sceneId, entityId, prefabId }),
        operation("scene.set_transform", { sceneId, entityId, position: optionalVector3Value(args, "position") ?? [0, 1, 0] }),
        operation("scene.set_collider", { sceneId, entityId, kind: "sphere", radius: optionalNumberValue(args, "radius") ?? 0.5, trigger: true }),
        operation("scene.attach_script", { sceneId, systemId, modulePath: optionalStringValue(args, "modulePath") ?? "src/scripts/collectible.ts", exportName: optionalStringValue(args, "exportName") ?? "collectible" }),
        operation("scene.add_resource", { sceneId, resourceId, path: resourcePath, value: false }),
        operation("scene.add_ui_node", { sceneId, uiNodeId }),
        operation("scene.bind_ui", { sceneId, uiNodeId, resourcePath: resourceId }),
      ];
    },
  },
  "trigger-zone": {
    required: ["sceneId", "entityId", "modulePath", "exportName"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const entityId = requiredStringValue(args, "entityId");
      return [
        operation("scene.add_entity", { sceneId, entityId }),
        operation("scene.set_transform", { sceneId, entityId, position: optionalVector3Value(args, "position") ?? [0, 0.5, 0], scale: optionalVector3Value(args, "scale") ?? [1, 1, 1] }),
        operation("scene.set_collider", { sceneId, entityId, kind: "box", size: optionalVector3Value(args, "size") ?? [1, 1, 1], trigger: true }),
        operation("scene.attach_script", { sceneId, systemId: optionalStringValue(args, "systemId") ?? `${entityId}.trigger`, modulePath: requiredStringValue(args, "modulePath"), exportName: requiredStringValue(args, "exportName") }),
      ];
    },
  },
  "kinematic-character": {
    required: ["sceneId", "entityId"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const entityId = requiredStringValue(args, "entityId");
      return [
        operation("scene.add_entity", { sceneId, entityId, prefabId: optionalStringValue(args, "prefabId") }),
        operation("scene.set_rigid_body", { sceneId, entityId, kind: "kinematic" }),
        operation("scene.set_collider", { sceneId, entityId, kind: "capsule", height: optionalNumberValue(args, "height") ?? 1.8, radius: optionalNumberValue(args, "radius") ?? 0.35 }),
        operation("scene.set_character_controller", { sceneId, entityId, grounding: "raycast", moveXAxis: optionalStringValue(args, "moveXAxis") ?? "MoveX", moveZAxis: optionalStringValue(args, "moveZAxis") ?? "MoveZ", speed: optionalNumberValue(args, "speed") ?? 6 }),
      ];
    },
  },
  "health-bar": {
    required: ["sceneId", "entityId"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const entityId = requiredStringValue(args, "entityId");
      const resourceId = optionalStringValue(args, "resourceId") ?? `${entityId}.health`;
      const resourcePath = optionalStringValue(args, "resourcePath") ?? `actors.${entityId}.health`;
      const uiNodeId = optionalStringValue(args, "uiNodeId") ?? `${entityId}.health-bar`;
      return [
        operation("scene.add_resource", { sceneId, resourceId, path: resourcePath, value: optionalNumberValue(args, "value") ?? 100 }),
        operation("scene.add_ui_node", { sceneId, uiNodeId }),
        operation("scene.bind_ui", { sceneId, uiNodeId, resourcePath: resourceId }),
      ];
    },
  },
  "top-down-collector": {
    required: ["sceneId", "playerId", "cameraId"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const playerId = requiredStringValue(args, "playerId");
      const cameraId = requiredStringValue(args, "cameraId");
      const goalId = optionalStringValue(args, "goalId") ?? "coin.01";
      const scoreResourceId = optionalStringValue(args, "scoreResourceId") ?? "GameState.scoreText";
      const inputDocId = optionalStringValue(args, "inputDocId") ?? `${sceneId}-input`;
      const systemId = optionalStringValue(args, "systemId") ?? "top-down-collector";
      const modulePath = optionalStringValue(args, "modulePath") ?? "src/scripts/player.ts";
      const exportName = optionalStringValue(args, "exportName") ?? "topDownCollectorSystem";
      return [
        operation("input.add_axis", { inputDocId, axisId: "MoveX", negativeKeys: ["KeyA", "ArrowLeft"], positiveKeys: ["KeyD", "ArrowRight"] }),
        operation("input.add_axis", { inputDocId, axisId: "MoveZ", negativeKeys: ["KeyS", "ArrowDown"], positiveKeys: ["KeyW", "ArrowUp"] }),
        operation("scene.add_prefab", { sceneId, prefabId: `${playerId}.prefab`, primitive: "capsule", color: optionalStringValue(args, "playerColor") ?? "#38bdf8" }),
        operation("scene.add_entity", { sceneId, entityId: playerId, prefabId: `${playerId}.prefab` }),
        operation("scene.set_transform", { sceneId, entityId: playerId, position: optionalVector3Value(args, "playerPosition") ?? [0, 0.8, 0] }),
        operation("scene.set_rigid_body", { sceneId, entityId: playerId, kind: "kinematic" }),
        operation("scene.set_collider", { sceneId, entityId: playerId, kind: "capsule", height: 1.6, radius: 0.35 }),
        operation("scene.set_character_controller", { sceneId, entityId: playerId, grounding: "raycast", moveXAxis: "MoveX", moveZAxis: "MoveZ", speed: optionalNumberValue(args, "speed") ?? 5 }),
        operation("scene.set_camera_component", { sceneId, entityId: cameraId, mode: "third-person-follow", targetId: playerId, fovY: 50 }),
        operation("scene.add_prefab", { sceneId, prefabId: `${goalId}.prefab`, primitive: "sphere", color: optionalStringValue(args, "goalColor") ?? "#ffd166" }),
        operation("scene.add_entity", { sceneId, entityId: goalId, prefabId: `${goalId}.prefab` }),
        operation("scene.set_transform", { sceneId, entityId: goalId, position: optionalVector3Value(args, "goalPosition") ?? [2, 0.6, -2] }),
        operation("scene.set_collider", { sceneId, entityId: goalId, kind: "sphere", radius: 0.45, trigger: true }),
        operation("scene.add_resource", { sceneId, resourceId: scoreResourceId, path: "score.text", value: "Score 0" }),
        operation("scene.add_ui_node", { sceneId, uiNodeId: "hud.score" }),
        operation("scene.bind_ui", { sceneId, uiNodeId: "hud.score", resourcePath: scoreResourceId }),
        operation("scene.attach_script", { sceneId, systemId, modulePath, exportName }),
      ];
    },
  },
  "lane-runner": {
    required: ["sceneId", "playerId", "cameraId"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const playerId = requiredStringValue(args, "playerId");
      const cameraId = requiredStringValue(args, "cameraId");
      const hazardId = optionalStringValue(args, "hazardId") ?? "hazard.barrier.01";
      const inputDocId = optionalStringValue(args, "inputDocId") ?? `${sceneId}-input`;
      const systemId = optionalStringValue(args, "systemId") ?? "lane-runner";
      return [
        operation("input.add_action", { inputDocId, actionId: "move-left", keys: ["KeyA", "ArrowLeft"] }),
        operation("input.add_action", { inputDocId, actionId: "move-right", keys: ["KeyD", "ArrowRight"] }),
        operation("input.add_action", { inputDocId, actionId: "jump", keys: ["KeyW", "ArrowUp", "Space"] }),
        operation("scene.add_prefab", { sceneId, prefabId: `${playerId}.prefab`, primitive: "capsule", color: optionalStringValue(args, "playerColor") ?? "#f97316" }),
        operation("scene.add_entity", { sceneId, entityId: playerId, prefabId: `${playerId}.prefab` }),
        operation("scene.set_transform", { sceneId, entityId: playerId, position: optionalVector3Value(args, "playerPosition") ?? [0, 0.8, 2.5] }),
        operation("scene.set_rigid_body", { sceneId, entityId: playerId, kind: "kinematic" }),
        operation("scene.set_collider", { sceneId, entityId: playerId, kind: "capsule", height: 1.6, radius: 0.35 }),
        operation("scene.set_camera_component", { sceneId, entityId: cameraId, mode: "third-person-follow", targetId: playerId, fovY: 55 }),
        operation("scene.add_prefab", { sceneId, prefabId: `${hazardId}.prefab`, primitive: "box", color: optionalStringValue(args, "hazardColor") ?? "#ef4444" }),
        operation("scene.add_entity", { sceneId, entityId: hazardId, prefabId: `${hazardId}.prefab` }),
        operation("scene.set_transform", { sceneId, entityId: hazardId, position: optionalVector3Value(args, "hazardPosition") ?? [1.5, 0.45, -6], scale: [0.8, 0.7, 0.35] }),
        operation("scene.set_collider", { sceneId, entityId: hazardId, kind: "box", size: [0.8, 0.7, 0.35], trigger: true }),
        operation("scene.attach_script", { sceneId, systemId, modulePath: optionalStringValue(args, "modulePath") ?? "src/scripts/player.ts", exportName: optionalStringValue(args, "exportName") ?? "laneRunnerSystem" }),
      ];
    },
  },
  "vehicle-checkpoint": {
    required: ["sceneId", "vehicleId", "cameraId"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const vehicleId = requiredStringValue(args, "vehicleId");
      const cameraId = requiredStringValue(args, "cameraId");
      const checkpointId = optionalStringValue(args, "checkpointId") ?? "checkpoint.01";
      const inputDocId = optionalStringValue(args, "inputDocId") ?? `${sceneId}-input`;
      return [
        operation("input.add_axis", { inputDocId, axisId: "Steer", negativeKeys: ["KeyA", "ArrowLeft"], positiveKeys: ["KeyD", "ArrowRight"] }),
        operation("input.add_axis", { inputDocId, axisId: "Throttle", negativeKeys: ["KeyS", "ArrowDown"], positiveKeys: ["KeyW", "ArrowUp"] }),
        operation("scene.add_prefab", { sceneId, prefabId: `${vehicleId}.prefab`, primitive: "box", color: optionalStringValue(args, "vehicleColor") ?? "#2563eb" }),
        operation("scene.add_entity", { sceneId, entityId: vehicleId, prefabId: `${vehicleId}.prefab` }),
        operation("scene.set_transform", { sceneId, entityId: vehicleId, position: optionalVector3Value(args, "vehiclePosition") ?? [0, 0.35, 2], scale: [1.4, 0.55, 2.2] }),
        operation("scene.set_rigid_body", { sceneId, entityId: vehicleId, kind: "kinematic" }),
        operation("scene.set_collider", { sceneId, entityId: vehicleId, kind: "box", size: [1.4, 0.55, 2.2] }),
        operation("scene.set_camera_component", { sceneId, entityId: cameraId, mode: "third-person-follow", targetId: vehicleId, fovY: 60 }),
        operation("scene.add_prefab", { sceneId, prefabId: `${checkpointId}.prefab`, primitive: "torus", color: optionalStringValue(args, "checkpointColor") ?? "#22c55e" }),
        operation("scene.add_entity", { sceneId, entityId: checkpointId, prefabId: `${checkpointId}.prefab` }),
        operation("scene.set_transform", { sceneId, entityId: checkpointId, position: optionalVector3Value(args, "checkpointPosition") ?? [0, 1.2, -8], scale: [2, 2, 0.2] }),
        operation("scene.set_collider", { sceneId, entityId: checkpointId, kind: "box", size: [2.2, 2.2, 0.35], trigger: true }),
        operation("scene.attach_script", { sceneId, systemId: optionalStringValue(args, "systemId") ?? "vehicle-checkpoint", modulePath: optionalStringValue(args, "modulePath") ?? "src/scripts/player.ts", exportName: optionalStringValue(args, "exportName") ?? "vehicleCheckpointSystem" }),
      ];
    },
  },
  "obstacle-avoider": {
    required: ["sceneId", "playerId"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const playerId = requiredStringValue(args, "playerId");
      const obstacleId = optionalStringValue(args, "obstacleId") ?? "obstacle.01";
      return [
        operation("scene.add_entity", { sceneId, entityId: playerId, prefabId: optionalStringValue(args, "playerPrefabId") }),
        operation("scene.set_rigid_body", { sceneId, entityId: playerId, kind: "kinematic" }),
        operation("scene.set_collider", { sceneId, entityId: playerId, kind: "capsule", height: 1.6, radius: 0.35 }),
        operation("scene.add_prefab", { sceneId, prefabId: `${obstacleId}.prefab`, primitive: "box", color: optionalStringValue(args, "obstacleColor") ?? "#dc2626" }),
        operation("scene.add_entity", { sceneId, entityId: obstacleId, prefabId: `${obstacleId}.prefab` }),
        operation("scene.set_transform", { sceneId, entityId: obstacleId, position: optionalVector3Value(args, "obstaclePosition") ?? [0, 0.5, -3], scale: optionalVector3Value(args, "obstacleScale") ?? [1, 1, 1] }),
        operation("scene.set_collider", { sceneId, entityId: obstacleId, kind: "box", size: optionalVector3Value(args, "obstacleSize") ?? [1, 1, 1], trigger: true }),
        operation("scene.attach_script", { sceneId, systemId: optionalStringValue(args, "systemId") ?? "obstacle-avoider", modulePath: optionalStringValue(args, "modulePath") ?? "src/scripts/player.ts", exportName: optionalStringValue(args, "exportName") ?? "obstacleAvoiderSystem" }),
      ];
    },
  },
  "physics-target": {
    required: ["sceneId", "targetId"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const targetId = requiredStringValue(args, "targetId");
      const projectileId = optionalStringValue(args, "projectileId") ?? "projectile.01";
      return [
        operation("scene.add_prefab", { sceneId, prefabId: `${targetId}.prefab`, primitive: "sphere", color: optionalStringValue(args, "targetColor") ?? "#facc15" }),
        operation("scene.add_entity", { sceneId, entityId: targetId, prefabId: `${targetId}.prefab` }),
        operation("scene.set_transform", { sceneId, entityId: targetId, position: optionalVector3Value(args, "targetPosition") ?? [0, 1, -5] }),
        operation("scene.set_rigid_body", { sceneId, entityId: targetId, kind: "dynamic", mass: optionalNumberValue(args, "targetMass") ?? 1 }),
        operation("scene.set_collider", { sceneId, entityId: targetId, kind: "sphere", radius: optionalNumberValue(args, "targetRadius") ?? 0.5 }),
        operation("scene.add_prefab", { sceneId, prefabId: `${projectileId}.prefab`, primitive: "sphere", color: optionalStringValue(args, "projectileColor") ?? "#38bdf8" }),
        operation("scene.add_entity", { sceneId, entityId: projectileId, prefabId: `${projectileId}.prefab` }),
        operation("scene.set_transform", { sceneId, entityId: projectileId, position: optionalVector3Value(args, "projectilePosition") ?? [0, 1, 2] }),
        operation("scene.set_rigid_body", { sceneId, entityId: projectileId, kind: "dynamic", mass: optionalNumberValue(args, "projectileMass") ?? 0.4 }),
        operation("scene.set_collider", { sceneId, entityId: projectileId, kind: "sphere", radius: optionalNumberValue(args, "projectileRadius") ?? 0.25 }),
        operation("scene.attach_script", { sceneId, systemId: optionalStringValue(args, "systemId") ?? "physics-target", modulePath: optionalStringValue(args, "modulePath") ?? "src/scripts/player.ts", exportName: optionalStringValue(args, "exportName") ?? "physicsTargetSystem" }),
      ];
    },
  },
  "dressed-environment-kit": {
    required: ["sceneId"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const groupId = optionalStringValue(args, "groupId") ?? "environment.dressing";
      return [
        operation("material.create", { materialId: "mat.ground" }),
        operation("material.set", { materialId: "mat.ground", color: optionalStringValue(args, "groundColor") ?? "#4b5563", roughness: 0.95, metalness: 0 }),
        operation("material.create", { materialId: "mat.landmark" }),
        operation("material.set", { materialId: "mat.landmark", color: optionalStringValue(args, "landmarkColor") ?? "#f59e0b", roughness: 0.7, metalness: 0 }),
        operation("scene.add_group", { sceneId, groupId, name: "Environment Dressing" }),
        operation("scene.add_prefab", { sceneId, prefabId: "prefab.ground", primitive: "box", color: optionalStringValue(args, "groundColor") ?? "#4b5563" }),
        operation("scene.add_entity", { sceneId, entityId: "ground", prefabId: "prefab.ground" }),
        operation("scene.set_transform", { sceneId, entityId: "ground", position: [0, -0.08, -2], scale: optionalVector3Value(args, "groundScale") ?? [12, 0.12, 18] }),
        operation("scene.add_prefab", { sceneId, prefabId: "prefab.landmark", primitive: "box", color: optionalStringValue(args, "landmarkColor") ?? "#f59e0b" }),
        operation("scene.add_entity", { sceneId, entityId: "landmark.01", prefabId: "prefab.landmark" }),
        operation("scene.set_transform", { sceneId, entityId: "landmark.01", position: optionalVector3Value(args, "landmarkPosition") ?? [-4, 1.2, -7], scale: [1.2, 2.4, 1.2] }),
        operation("scene.add_entity", { sceneId, entityId: "light.key" }),
        operation("scene.set_light", { sceneId, entityId: "light.key", kind: "directional", intensity: optionalNumberValue(args, "lightIntensity") ?? 2.5, color: optionalStringValue(args, "lightColor") ?? "#fff4d6" }),
      ];
    },
  },
};

for (const [recipeId, planner] of Object.entries(recipePlanners) as Array<[AuthoringRecipeId, IRecipePlanner]>) {
  planner.metadata ??= (args, operations) => defaultRecipeMetadata(recipeId, args, operations);
}

function recipeMetadata(recipeId: AuthoringRecipeId, planner: IRecipePlanner, args: Record<string, unknown>, operations: readonly IAuthoringRecipeOperation[]): IRecipeMetadata {
  return planner.metadata?.(args, operations) ?? defaultRecipeMetadata(recipeId, args, operations);
}

function defaultRecipeMetadata(recipeId: AuthoringRecipeId, args: Record<string, unknown>, operations: readonly IAuthoringRecipeOperation[]): IRecipeMetadata {
  const sourceOwners: Record<string, string[]> = {};
  const generatedIds: Record<string, string[]> = {};
  for (const operationInput of operations) {
    const descriptor = getAuthoringOperationDescriptor(operationInput.name);
    if (descriptor !== undefined) {
      addUnique(sourceOwners, descriptor.sourceFamily, descriptor.name);
    }
    for (const [key, value] of Object.entries(operationInput.args)) {
      if (typeof value === "string" && (key === "entityId" || key === "prefabId" || key === "resourceId" || key === "systemId" || key === "uiNodeId" || key.endsWith("Id"))) {
        addUnique(generatedIds, key, value);
      }
    }
  }
  const sceneId = optionalStringValue(args, "sceneId") ?? "arena";
  const entityId = optionalStringValue(args, "playerId") ?? optionalStringValue(args, "vehicleId") ?? optionalStringValue(args, "targetId") ?? optionalStringValue(args, "entityId") ?? "<player-id>";
  return {
    gameplayBlocks: recipeGameplayBlocks(recipeId),
    generatedIds: sortRecordArrays(generatedIds),
    proofCommands: [
      "tn authoring validate --project . --json",
      "tn build --project . --json",
      `tn scene inspect ${sceneId} --node ${entityId} --json`,
      `tn playtest --project . --entity ${entityId} --press KeyD --frames 30 --expect-moved --json`,
    ],
    proofHints: recipeProofHints(recipeId),
    scriptResponsibilities: recipeScriptResponsibilities(recipeId),
    sourceOwners: sortRecordArrays(sourceOwners),
  };
}

function emptyRecipeMetadata(): IRecipeMetadata {
  return {
    gameplayBlocks: [],
    generatedIds: {},
    proofCommands: [],
    proofHints: [],
    scriptResponsibilities: [],
    sourceOwners: {},
  };
}

function recipeGameplayBlocks(recipeId: AuthoringRecipeId): string[] {
  const blocks: Record<AuthoringRecipeId, string[]> = {
    collectible: ["objective.collectible", "state.resource-score", "proof.ui-binding"],
    "dressed-environment-kit": ["world.dressed-play-space", "proof.screenshot-scale"],
    "health-bar": ["state.health-resource", "proof.ui-binding"],
    "kinematic-character": ["basis.y-up-z-forward", "controller.world-cardinal-character", "proof.playtest-motion"],
    "lane-runner": ["basis.y-up-z-forward", "controller.lane-runner", "camera.position-follow", "objective.obstacle-avoid", "state.fail-retry", "proof.playtest-motion"],
    "obstacle-avoider": ["basis.y-up-z-forward", "controller.world-cardinal-character", "objective.obstacle-avoid", "state.fail-retry", "proof.trigger-event"],
    "physics-target": ["basis.y-up-z-forward", "objective.physics-target", "spawn.region-sampler", "proof.physics-contact"],
    "third-person-controller": ["basis.y-up-z-forward", "controller.world-cardinal-character", "camera.position-follow", "proof.playtest-motion"],
    "top-down-collector": ["basis.y-up-z-forward", "controller.top-down-cardinal", "camera.position-follow", "objective.collectible", "state.resource-score", "proof.ui-binding"],
    "trigger-zone": ["objective.trigger-zone", "proof.trigger-event"],
    "vehicle-checkpoint": ["basis.y-up-z-forward", "controller.vehicle-cardinal", "camera.position-follow", "objective.checkpoint-lap", "spawn.region-sampler", "proof.playtest-motion"],
  };
  return blocks[recipeId];
}

function recipeProofHints(recipeId: AuthoringRecipeId): string[] {
  const hints: Partial<Record<AuthoringRecipeId, string[]>> = {
    "dressed-environment-kit": ["Capture screenshot proof with visible ground, landmark, lighting, and scale cues."],
    "lane-runner": ["Playtest lateral lane input and jump input; verify fail/retry state changes on hazard trigger."],
    "physics-target": ["Record contact or impulse evidence for the target and projectile before claiming physics behavior."],
    "top-down-collector": ["Playtest MoveX/MoveZ axes and verify HUD score text updates after collection."],
    "vehicle-checkpoint": ["Playtest throttle/steer axes and verify checkpoint trigger progress or lap state."],
  };
  return hints[recipeId] ?? ["Validate source, build, inspect scene wiring, and run a movement or trigger proof tied to the recipe."];
}

function recipeScriptResponsibilities(recipeId: AuthoringRecipeId): string[] {
  const responsibilities: Partial<Record<AuthoringRecipeId, string[]>> = {
    collectible: ["owns collectible trigger state", "owns HUD/resource update"],
    "lane-runner": ["owns lane movement intent", "owns hazard collision fail/retry state", "owns score/distance resource"],
    "obstacle-avoider": ["owns movement intent", "owns hazard trigger fail state"],
    "physics-target": ["owns projectile/target scoring state", "owns contact proof resource"],
    "third-person-controller": ["owns movement intent", "owns camera target assumptions"],
    "top-down-collector": ["owns top-down movement intent", "owns collectible progress", "owns HUD text"],
    "vehicle-checkpoint": ["owns vehicle movement intent", "owns checkpoint progress", "owns lap/fail-retry state"],
  };
  return responsibilities[recipeId] ?? ["owns declared source mutations and proof evidence for the recipe"];
}

function addUnique(record: Record<string, string[]>, key: string, value: string): void {
  const values = record[key] ?? [];
  if (!values.includes(value)) {
    values.push(value);
  }
  record[key] = values;
}

function sortRecordArrays(record: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => [key, [...values].sort()]));
}

function requiredRecipeArgs(recipeId: string, args: Record<string, unknown>, required: readonly string[]): IAuthoringDiagnostic[] {
  return required.flatMap((name) => {
    const value = args[name];
    return typeof value === "string" && value.trim() !== ""
      ? []
      : [
          authoringDiagnostic({
            code: "TN_AUTHORING_RECIPE_ARG_MISSING",
            message: `Authoring recipe '${recipeId}' requires argument '${name}'.`,
            path: `/args/${name}`,
            value: recipeId,
          }),
        ];
  });
}

function operationDiagnostics(recipeId: string, operationInput: IAuthoringRecipeOperation, index: number): IAuthoringDiagnostic[] {
  return getAuthoringOperationDescriptor(operationInput.name) === undefined
    ? [
        authoringDiagnostic({
          code: "TN_AUTHORING_RECIPE_OPERATION_UNSUPPORTED",
          message: `Authoring recipe '${recipeId}' produced unsupported operation '${operationInput.name}'.`,
          path: `/operations/${index}/name`,
          value: operationInput.name,
        }),
      ]
    : [];
}

function operation(name: AuthoringOperationName | string, args: Record<string, unknown>): IAuthoringRecipeOperation {
  return { name, args: defined(args) };
}

function defined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function requiredStringValue(args: Record<string, unknown>, name: string): string {
  return args[name] as string;
}

function optionalStringValue(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function optionalNumberValue(args: Record<string, unknown>, name: string): number | undefined {
  const value = args[name];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalVector3Value(args: Record<string, unknown>, name: string): [number, number, number] | undefined {
  const value = args[name];
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry)) ? [value[0], value[1], value[2]] : undefined;
}
