import { authoringDiagnostic, type IAuthoringDiagnostic } from "./diagnostics.js";
import {
  dispatchAuthoringOperation,
  getAuthoringOperationDescriptor,
  type AuthoringOperationName,
} from "./operationRegistry.js";
import { type IAuthoringOperationResult } from "./operations.js";

export type AuthoringRecipeId = "collectible" | "health-bar" | "kinematic-character" | "third-person-controller" | "trigger-zone";

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
  ok: boolean;
  operations: IAuthoringRecipeOperation[];
  projectPath?: string;
  recipeId: string;
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

const authoringRecipeIds: AuthoringRecipeId[] = ["third-person-controller", "collectible", "trigger-zone", "kinematic-character", "health-bar"];

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
      ok: false,
      operations: [],
      projectPath: options.projectPath,
      recipeId: options.recipeId,
    };
  }

  const diagnostics = requiredRecipeArgs(options.recipeId, options.args, recipe.required);
  const operations = diagnostics.length === 0 ? recipe.plan(options.args) : [];
  diagnostics.push(...operations.flatMap((operation, index) => operationDiagnostics(options.recipeId, operation, index)));

  return {
    diagnostics,
    ok: diagnostics.length === 0,
    operations,
    projectPath: options.projectPath,
    recipeId: options.recipeId,
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
  plan(args: Record<string, unknown>): IAuthoringRecipeOperation[];
  required: readonly string[];
}

const recipePlanners: Record<AuthoringRecipeId, IRecipePlanner> = {
  "third-person-controller": {
    required: ["sceneId", "entityId", "cameraId"],
    plan: (args) => {
      const sceneId = requiredStringValue(args, "sceneId");
      const entityId = requiredStringValue(args, "entityId");
      const cameraId = requiredStringValue(args, "cameraId");
      return [
        operation("scene.add_entity", { sceneId, entityId, prefabId: optionalStringValue(args, "prefabId") }),
        operation("scene.set_rigid_body", { sceneId, entityId, kind: "kinematic" }),
        operation("scene.set_collider", { sceneId, entityId, kind: "capsule", height: optionalNumberValue(args, "height") ?? 1.8, radius: optionalNumberValue(args, "radius") ?? 0.35 }),
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
};

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
