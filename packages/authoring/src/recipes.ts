import { authoringDiagnostic, type IAuthoringDiagnostic } from "./diagnostics.js";
import {
  getAuthoringOperationDescriptor,
  type AuthoringOperationName,
} from "./operationRegistry.js";
import { type IAuthoringOperationResult } from "./operations.js";
import { loadAuthoringProject } from "./project.js";
import {
  applyAuthoringBatch,
  AUTHORING_BATCH_SCHEMA,
  AUTHORING_BATCH_VERSION,
} from "./batches.js";
import { resolve } from "node:path";

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

export interface IAuthoringRecipeArgumentDescriptor {
  flag: string;
  name: string;
  placeholder: string;
}

export interface IAuthoringRecipeDescriptor {
  id: AuthoringRecipeId;
  requiredArguments: IAuthoringRecipeArgumentDescriptor[];
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

export function getAuthoringRecipeDescriptor(recipeId: string): IAuthoringRecipeDescriptor | undefined {
  const planner = recipePlanners[recipeId as AuthoringRecipeId];
  return planner === undefined
    ? undefined
    : { id: recipeId as AuthoringRecipeId, requiredArguments: planner.required.map(recipeArgumentDescriptor) };
}

export function listAuthoringRecipeDescriptors(): IAuthoringRecipeDescriptor[] {
  return authoringRecipeIds.map((recipeId) => getAuthoringRecipeDescriptor(recipeId)!);
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
  if (!plan.ok || options.projectPath === undefined) {
    return failedRecipeApply(plan, options.projectPath);
  }

  const projectPath = resolve(options.projectPath);
  const project = await loadAuthoringProject({ projectPath });
  const decisions = plan.operations.map((operation, index) => ({
    index,
    operation,
    policy: recipeOperationPolicy(operation, project.documents),
  }));
  const operations = decisions.filter((decision) => decision.policy === undefined).map((decision) => ({
    args: decision.operation.args,
    name: decision.operation.name as AuthoringOperationName,
  }));
  const batch = operations.length === 0 ? undefined : await applyAuthoringBatch({
    batch: {
      id: `recipe-${plan.recipeId}`,
      operations,
      schema: AUTHORING_BATCH_SCHEMA,
      version: AUTHORING_BATCH_VERSION,
    },
    projectPath,
    stopOnError: options.stopOnError,
  });
  const appliedResults = [...(batch?.operationResults ?? [])];
  const operationResults = decisions.map(({ index, operation, policy }) => ({
    result: policy === undefined
      ? (appliedResults.shift()?.result ?? failedBatchOperationResult(projectPath, batch?.diagnostics ?? []))
      : adoptedRecipeOperationResult(projectPath, operation, policy),
    trace: { ...operation, index },
  }));
  const policyDiagnostics = decisions.flatMap(({ operation, policy }) => policy === undefined
    ? []
    : adoptedRecipeOperationResult(projectPath, operation, policy).diagnostics);
  const diagnostics = [...plan.diagnostics, ...(batch?.diagnostics ?? []), ...policyDiagnostics];
  const committed = batch?.committed ?? true;
  const ok = committed && operationResults.every((entry) => entry.result.ok);
  return {
    ...plan,
    changed: batch?.committed === true && batch.changed,
    diagnostics,
    filesWritten: batch?.committed === true ? batch.filesWritten : [],
    ok,
    operationResults,
    ...(batch?.stoppedAt === undefined ? {} : { stoppedAt: decisions.filter((decision) => decision.policy === undefined)[batch.stoppedAt]?.index }),
  };
}

function failedRecipeApply(plan: IAuthoringRecipePlanResult, projectPath: string | undefined): IAuthoringRecipeApplyResult {
  const diagnostics = [...plan.diagnostics];
  if (projectPath === undefined) {
    diagnostics.push(authoringDiagnostic({
      code: "TN_AUTHORING_RECIPE_PROJECT_MISSING",
      message: "Applying an authoring recipe requires projectPath.",
      path: "/projectPath",
    }));
  }
  return { ...plan, changed: false, diagnostics, filesWritten: [], ok: false, operationResults: [] };
}

type RecipeExistingOutputPolicy = "adopt" | "preserve-adopted-target";

interface IRecipeOperationPolicy {
  collection: readonly string[];
  diagnosticCode: string;
  identityArg: string;
  policy: RecipeExistingOutputPolicy;
  scopeArg: string;
  sourceKind: string;
}

// Recipe retries and starter adoption are product policy, not transaction behavior.
// The batch engine sees only operations that this policy declares safe to publish.
const RECIPE_OPERATION_POLICIES: Partial<Record<string, IRecipeOperationPolicy>> = {
  "input.add_action": { collection: ["actions"], diagnosticCode: "TN_AUTHORING_DUPLICATE_INPUT_ACTION_ID", identityArg: "actionId", policy: "adopt", scopeArg: "inputDocId", sourceKind: "input" },
  "input.add_axis": { collection: ["axes"], diagnosticCode: "TN_AUTHORING_DUPLICATE_INPUT_AXIS_ID", identityArg: "axisId", policy: "adopt", scopeArg: "inputDocId", sourceKind: "input" },
  "material.create": { collection: ["materials"], diagnosticCode: "TN_AUTHORING_DUPLICATE_MATERIAL_ID", identityArg: "materialId", policy: "adopt", scopeArg: "materialId", sourceKind: "material" },
  "material.set": { collection: ["materials"], diagnosticCode: "TN_AUTHORING_DUPLICATE_MATERIAL_ID", identityArg: "materialId", policy: "preserve-adopted-target", scopeArg: "materialId", sourceKind: "material" },
  "scene.add_entity": { collection: ["entities"], diagnosticCode: "TN_AUTHORING_DUPLICATE_ENTITY_ID", identityArg: "entityId", policy: "adopt", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.add_group": { collection: ["entities"], diagnosticCode: "TN_AUTHORING_DUPLICATE_ENTITY_ID", identityArg: "groupId", policy: "adopt", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.add_prefab": { collection: ["prefabs"], diagnosticCode: "TN_AUTHORING_DUPLICATE_PREFAB_ID", identityArg: "prefabId", policy: "adopt", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.add_resource": { collection: ["resources"], diagnosticCode: "TN_AUTHORING_DUPLICATE_RESOURCE_ID", identityArg: "resourceId", policy: "adopt", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.add_ui_node": { collection: ["ui", "nodes"], diagnosticCode: "TN_AUTHORING_DUPLICATE_UI_NODE_ID", identityArg: "uiNodeId", policy: "adopt", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.attach_script": { collection: ["systems"], diagnosticCode: "TN_AUTHORING_DUPLICATE_SYSTEM_ID", identityArg: "systemId", policy: "adopt", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.bind_ui": { collection: ["ui", "bindings"], diagnosticCode: "TN_AUTHORING_DUPLICATE_UI_BINDING_ID", identityArg: "uiNodeId", policy: "adopt", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.set_camera_component": { collection: ["entities"], diagnosticCode: "TN_AUTHORING_DUPLICATE_ENTITY_ID", identityArg: "entityId", policy: "preserve-adopted-target", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.set_character_controller": { collection: ["entities"], diagnosticCode: "TN_AUTHORING_DUPLICATE_ENTITY_ID", identityArg: "entityId", policy: "preserve-adopted-target", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.set_collider": { collection: ["entities"], diagnosticCode: "TN_AUTHORING_DUPLICATE_ENTITY_ID", identityArg: "entityId", policy: "preserve-adopted-target", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.set_light": { collection: ["entities"], diagnosticCode: "TN_AUTHORING_DUPLICATE_ENTITY_ID", identityArg: "entityId", policy: "preserve-adopted-target", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.set_rigid_body": { collection: ["entities"], diagnosticCode: "TN_AUTHORING_DUPLICATE_ENTITY_ID", identityArg: "entityId", policy: "preserve-adopted-target", scopeArg: "sceneId", sourceKind: "scene" },
  "scene.set_transform": { collection: ["entities"], diagnosticCode: "TN_AUTHORING_DUPLICATE_ENTITY_ID", identityArg: "entityId", policy: "preserve-adopted-target", scopeArg: "sceneId", sourceKind: "scene" },
};

function recipeOperationPolicy(operation: IAuthoringRecipeOperation, documents: Awaited<ReturnType<typeof loadAuthoringProject>>["documents"]): IRecipeOperationPolicy | undefined {
  const policy = RECIPE_OPERATION_POLICIES[operation.name];
  if (policy === undefined) return undefined;
  const identity = operation.args[policy.identityArg];
  const scope = operation.args[policy.scopeArg];
  if (typeof identity !== "string" || typeof scope !== "string") return undefined;
  const document = documents.find((candidate) => candidate.kind === policy.sourceKind && isRecord(candidate.data) && candidate.data.id === scope);
  if (document === undefined || !isRecord(document.data)) return undefined;
  const collection = policy.collection.reduce<unknown>((value, key) => isRecord(value) ? value[key] : undefined, document.data);
  if (!Array.isArray(collection)) return undefined;
  const exists = collection.some((value) => isRecord(value) && (policy.collection.at(-1) === "bindings" ? value.node : value.id) === identity);
  return exists ? policy : undefined;
}

function adoptedRecipeOperationResult(projectPath: string, operation: IAuthoringRecipeOperation, policy: IRecipeOperationPolicy): IAuthoringOperationResult {
  const identity = operation.args[policy.identityArg];
  return {
    changed: false,
    diagnostics: [authoringDiagnostic({
      code: policy.diagnosticCode,
      message: policy.policy === "adopt"
        ? `Recipe output '${String(identity)}' already exists; adopting it and continuing.`
        : `Recipe target '${String(identity)}' already exists; preserving its authored values.`,
      path: `/${policy.identityArg}`,
      severity: "info",
      value: identity,
    })],
    filesWritten: [],
    ok: true,
    projectPath,
  };
}

function failedBatchOperationResult(projectPath: string, diagnostics: IAuthoringDiagnostic[]): IAuthoringOperationResult {
  return { changed: false, diagnostics, filesWritten: [], ok: false, projectPath };
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
      const inputDocId = optionalStringValue(args, "inputDocId") ?? `${sceneId}-input`;
      return [
        operation("input.add_axis", { inputDocId, axisId: "MoveX", negativeKeys: ["KeyA", "ArrowLeft"], positiveKeys: ["KeyD", "ArrowRight"] }),
        operation("input.add_axis", { inputDocId, axisId: "MoveZ", negativeKeys: ["KeyS", "ArrowDown"], positiveKeys: ["KeyW", "ArrowUp"] }),
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
      addUnique(sourceOwners, recipeSourceOwner(operationInput.name, descriptor.sourceFamily), descriptor.name);
    }
    for (const [key, value] of Object.entries(operationInput.args)) {
      if (typeof value === "string" && (key === "entityId" || key === "prefabId" || key === "resourceId" || key === "systemId" || key === "uiNodeId" || key.endsWith("Id"))) {
        addUnique(generatedIds, key, value);
      }
    }
  }
  const sceneId = optionalStringValue(args, "sceneId") ?? "arena";
  const entityId = optionalStringValue(args, "playerId") ?? optionalStringValue(args, "vehicleId") ?? optionalStringValue(args, "targetId") ?? optionalStringValue(args, "entityId") ?? "<player-id>";
  const movementKey = recipeId === "vehicle-checkpoint" || entityId.endsWith(".car") ? "KeyW" : "KeyD";
  const movementProof = recipeId === "collectible" || recipeId === "top-down-collector"
    ? "tn playtest scaffold --assert pickup --project . --json"
    : `tn playtest --project . --entity ${entityId} --press ${movementKey} --frames 30 --expect-moved --json`;
  return {
    gameplayBlocks: recipeGameplayBlocks(recipeId),
    generatedIds: sortRecordArrays(generatedIds),
    proofCommands: [
      "tn authoring validate --project . --json",
      "tn build --project . --json",
      `tn scene inspect ${sceneId} --node ${entityId} --json`,
      movementProof,
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

function recipeSourceOwner(operationName: string, defaultOwner: string): string {
  if (operationName === "scene.attach_script") {
    return "systems";
  }
  if (operationName === "scene.add_ui_node" || operationName === "scene.bind_ui") {
    return "ui";
  }
  return defaultOwner;
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
            message: `Authoring recipe '${recipeId}' requires ${recipeArgumentUsage(name)}.`,
            path: `/args/${name}`,
            suggestion: `Pass ${recipeArgumentUsage(name)}. Required recipe flags: ${required.map(recipeArgumentUsage).join(" ")}.`,
            value: recipeId,
          }),
        ];
  });
}

function recipeArgumentDescriptor(name: string): IAuthoringRecipeArgumentDescriptor {
  const known: Record<string, Omit<IAuthoringRecipeArgumentDescriptor, "name">> = {
    cameraId: { flag: "--camera", placeholder: "<camera-id>" },
    entityId: { flag: "--entity", placeholder: "<entity-id>" },
    exportName: { flag: "--export", placeholder: "<export-name>" },
    modulePath: { flag: "--module", placeholder: "<module-path>" },
    playerId: { flag: "--player", placeholder: "<player-id>" },
    sceneId: { flag: "--scene", placeholder: "<scene-id>" },
    vehicleId: { flag: "--vehicle", placeholder: "<vehicle-id>" },
  };
  const descriptor = known[name] ?? {
    flag: `--${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`,
    placeholder: `<${name}>`,
  };
  return { name, ...descriptor };
}

function recipeArgumentUsage(name: string): string {
  const descriptor = recipeArgumentDescriptor(name);
  return `${descriptor.flag} ${descriptor.placeholder}`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
