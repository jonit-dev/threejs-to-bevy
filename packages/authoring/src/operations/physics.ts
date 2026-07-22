import { validateVehicleController, type IVehicleControllerComponent } from "@threenative/ir";
import { authoringDiagnostic } from "../diagnostics.js";
import { loadAuthoringProject } from "../project.js";
import { isRecord, type ISceneDocument, type ISceneEntity } from "../schemas.js";
import { authoringOperationResult } from "./shared.js";
import { setComponent } from "./sceneComponents.js";
export { setRigidBodyComponent } from "./sceneComponents.js";
import type { IAuthoringOperationResult } from "./types.js";

export interface IVehicleControllerOperationOptions {
  projectPath: string;
  sceneId: string;
  entityId: string;
}

export interface IAddVehicleControllerOptions extends IVehicleControllerOperationOptions {
  controller: IVehicleControllerComponent | Record<string, unknown>;
}

export async function addVehicleController(options: IAddVehicleControllerOptions): Promise<IAuthoringOperationResult> {
  const diagnostics = await validateAuthoredVehicle(options);
  if (diagnostics !== undefined) return diagnostics;
  return setComponent({
    componentKind: "VehicleController",
    entityId: options.entityId,
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    value: structuredClone(options.controller),
  });
}

export async function inspectVehicleController(options: IVehicleControllerOperationOptions): Promise<IAuthoringOperationResult> {
  const loaded = await findVehicle(options);
  if (loaded.result !== undefined) return loaded.result;
  const result = {
    ...authoringOperationResult({ projectPath: options.projectPath }),
    controller: structuredClone(loaded.controller),
    entityId: options.entityId,
    sceneId: options.sceneId,
  };
  return result;
}

export async function validateVehicleControllerSource(options: IVehicleControllerOperationOptions): Promise<IAuthoringOperationResult> {
  const loaded = await findVehicle(options);
  if (loaded.result !== undefined) return loaded.result;
  return validateVehicleRecord(options, loaded.scene!, loaded.entity!, loaded.controller!);
}

async function validateAuthoredVehicle(options: IAddVehicleControllerOptions): Promise<IAuthoringOperationResult | undefined> {
  const loaded = await findVehicle(options, false);
  if (loaded.result !== undefined) return loaded.result;
  return validationFailureOrUndefined(options, loaded.scene!, loaded.entity!, options.controller);
}

function validateVehicleRecord(
  options: IVehicleControllerOperationOptions,
  scene: ISceneDocument,
  entity: ISceneEntity,
  controller: unknown,
): IAuthoringOperationResult {
  const failure = validationFailureOrUndefined(options, scene, entity, controller);
  if (failure !== undefined) return failure;
  const result = { ...authoringOperationResult({ projectPath: options.projectPath }), controller: structuredClone(controller), valid: true };
  return result;
}

function validationFailureOrUndefined(
  options: IVehicleControllerOperationOptions,
  scene: ISceneDocument,
  entity: ISceneEntity,
  controller: unknown,
): IAuthoringOperationResult | undefined {
  const diagnostics: Array<{ code: string; message: string; path: string; severity?: "error" | "warning" }> = [];
  const entities = scene.entities ?? [];
  const index = Math.max(0, entities.findIndex((candidate) => candidate.id === entity.id));
  if (!isRecord(controller)) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_INVALID", message: "VehicleController must be an object.", path: `/entities/${index}/components/VehicleController`, severity: "error" });
  else validateVehicleController(controller, `/entities/${index}/components/VehicleController`, isRecord(entity.components?.WheelAssembly) ? entity.components.WheelAssembly : undefined, diagnostics);
  if (diagnostics.length === 0) return undefined;
  return authoringOperationResult({
    diagnostics: diagnostics.map((diagnostic) => authoringDiagnostic({
      code: diagnostic.code,
      message: diagnostic.message,
      path: diagnostic.path,
      severity: diagnostic.severity,
      suggestion: "Correct the VehicleController fields and run `tn physics vehicle validate` again.",
    })),
    projectPath: options.projectPath,
  });
}

async function findVehicle(options: IVehicleControllerOperationOptions, requireController = true): Promise<{
  controller?: unknown;
  entity?: ISceneEntity;
  scene?: ISceneDocument;
  result?: IAuthoringOperationResult;
}> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const document = project.documents.find((item) => item.kind === "scene" && (item.data as { id?: unknown }).id === options.sceneId);
  if (document === undefined) return { result: missing(options, "TN_AUTHORING_SCENE_MISSING", `/sceneId`, `Scene '${options.sceneId}' was not found.`) };
  const scene = document.data as ISceneDocument;
  const entity = scene.entities?.find((item) => item.id === options.entityId);
  if (entity === undefined) return { result: missing(options, "TN_AUTHORING_ENTITY_MISSING", "/entityId", `Entity '${options.entityId}' was not found.`) };
  const controller = entity.components?.VehicleController;
  if (requireController && controller === undefined) return { result: missing(options, "TN_AUTHORING_VEHICLE_CONTROLLER_MISSING", `/entities/${options.entityId}/components/VehicleController`, `Entity '${options.entityId}' has no VehicleController.`) };
  return { controller, entity, scene };
}

function missing(options: IVehicleControllerOperationOptions, code: string, path: string, message: string): IAuthoringOperationResult {
  return authoringOperationResult({ diagnostics: [authoringDiagnostic({ code, message, path })], projectPath: options.projectPath });
}
