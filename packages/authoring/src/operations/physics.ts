import { validateAerodynamicBody, validateVehicleController, validateWindVolume, type IAerodynamicBodyComponent, type IIrDiagnostic, type IVehicleControllerComponent, type IWindVolumeComponent } from "@threenative/ir";
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

export interface IPortableAerodynamicsOperationOptions {
  projectPath: string;
  sceneId: string;
  entityId: string;
}

export interface IAddAerodynamicBodyOptions extends IPortableAerodynamicsOperationOptions {
  body: IAerodynamicBodyComponent | Record<string, unknown>;
}

export interface IAddWindVolumeOptions extends IPortableAerodynamicsOperationOptions {
  volume: IWindVolumeComponent | Record<string, unknown>;
}

export async function addAerodynamicBody(options: IAddAerodynamicBodyOptions): Promise<IAuthoringOperationResult> {
  const loaded = await findPhysicsComponent(options, "AerodynamicBody", false);
  if (loaded.result !== undefined) return loaded.result;
  const failure = aerodynamicValidationFailure(options, loaded.scene!, loaded.entity!, options.body);
  if (failure !== undefined) return failure;
  return setComponent({ componentKind: "AerodynamicBody", entityId: options.entityId, projectPath: options.projectPath, sceneId: options.sceneId, value: structuredClone(options.body) });
}

export async function addWindVolume(options: IAddWindVolumeOptions): Promise<IAuthoringOperationResult> {
  const loaded = await findPhysicsComponent(options, "WindVolume", false);
  if (loaded.result !== undefined) return loaded.result;
  const failure = windValidationFailure(options, loaded.scene!, loaded.entity!, options.volume);
  if (failure !== undefined) return failure;
  return setComponent({ componentKind: "WindVolume", entityId: options.entityId, projectPath: options.projectPath, sceneId: options.sceneId, value: structuredClone(options.volume) });
}

export async function inspectAerodynamicBody(options: IPortableAerodynamicsOperationOptions): Promise<IAuthoringOperationResult> {
  return inspectPhysicsComponent(options, "AerodynamicBody", "body");
}

export async function inspectWindVolume(options: IPortableAerodynamicsOperationOptions): Promise<IAuthoringOperationResult> {
  return inspectPhysicsComponent(options, "WindVolume", "volume");
}

export async function validateAerodynamicBodySource(options: IPortableAerodynamicsOperationOptions): Promise<IAuthoringOperationResult> {
  const loaded = await findPhysicsComponent(options, "AerodynamicBody");
  if (loaded.result !== undefined) return loaded.result;
  const result = aerodynamicValidationFailure(options, loaded.scene!, loaded.entity!, loaded.component!)
    ?? { ...authoringOperationResult({ projectPath: options.projectPath }), body: structuredClone(loaded.component), valid: true };
  return result;
}

export async function validateWindVolumeSource(options: IPortableAerodynamicsOperationOptions): Promise<IAuthoringOperationResult> {
  const loaded = await findPhysicsComponent(options, "WindVolume");
  if (loaded.result !== undefined) return loaded.result;
  const result = windValidationFailure(options, loaded.scene!, loaded.entity!, loaded.component!)
    ?? { ...authoringOperationResult({ projectPath: options.projectPath }), valid: true, volume: structuredClone(loaded.component) };
  return result;
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

type PortablePhysicsComponentKind = "AerodynamicBody" | "WindVolume";

async function findPhysicsComponent(options: IPortableAerodynamicsOperationOptions, kind: PortablePhysicsComponentKind, required = true): Promise<{ component?: unknown; entity?: ISceneEntity; scene?: ISceneDocument; result?: IAuthoringOperationResult }> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const document = project.documents.find((item) => item.kind === "scene" && (item.data as { id?: unknown }).id === options.sceneId);
  if (document === undefined) return { result: missing(options, "TN_AUTHORING_SCENE_MISSING", "/sceneId", `Scene '${options.sceneId}' was not found.`) };
  const scene = document.data as ISceneDocument;
  const entity = scene.entities?.find((item) => item.id === options.entityId);
  if (entity === undefined) return { result: missing(options, "TN_AUTHORING_ENTITY_MISSING", "/entityId", `Entity '${options.entityId}' was not found.`) };
  const component = entity.components?.[kind];
  if (required && component === undefined) return { result: missing(options, `TN_AUTHORING_${kind === "AerodynamicBody" ? "AERODYNAMIC_BODY" : "WIND_VOLUME"}_MISSING`, `/entities/${options.entityId}/components/${kind}`, `Entity '${options.entityId}' has no ${kind}.`) };
  return { component, entity, scene };
}

async function inspectPhysicsComponent(options: IPortableAerodynamicsOperationOptions, kind: PortablePhysicsComponentKind, resultField: "body" | "volume"): Promise<IAuthoringOperationResult> {
  const loaded = await findPhysicsComponent(options, kind);
  if (loaded.result !== undefined) return loaded.result;
  const result = { ...authoringOperationResult({ projectPath: options.projectPath }), [resultField]: structuredClone(loaded.component), entityId: options.entityId, sceneId: options.sceneId };
  return result;
}

function aerodynamicValidationFailure(options: IPortableAerodynamicsOperationOptions, scene: ISceneDocument, entity: ISceneEntity, value: unknown): IAuthoringOperationResult | undefined {
  const path = physicsComponentPath(scene, entity, "AerodynamicBody");
  const diagnostics: IIrDiagnostic[] = [];
  if (!isRecord(value)) diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_BODY_INVALID", message: "AerodynamicBody must be an object.", path, severity: "error" });
  else validateAerodynamicBody(value, path, diagnostics);
  if (!isRecord(entity.components?.RigidBody) || entity.components?.RigidBody.kind !== "dynamic") diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_BODY_DYNAMIC_REQUIRED", message: "AerodynamicBody must be co-located with a dynamic RigidBody.", path, severity: "error", suggestion: "Add RigidBody.kind=dynamic to the craft entity." });
  return portablePhysicsFailure(options, diagnostics, "Correct the AerodynamicBody fields and run `tn physics aerodynamics validate` again.");
}

function windValidationFailure(options: IPortableAerodynamicsOperationOptions, scene: ISceneDocument, entity: ISceneEntity, value: unknown): IAuthoringOperationResult | undefined {
  const path = physicsComponentPath(scene, entity, "WindVolume");
  const diagnostics: IIrDiagnostic[] = [];
  if (!isRecord(value)) diagnostics.push({ code: "TN_IR_PHYSICS_WIND_VOLUME_INVALID", message: "WindVolume must be an object.", path, severity: "error" });
  else validateWindVolume(value, path, diagnostics);
  return portablePhysicsFailure(options, diagnostics, "Correct the WindVolume fields and run `tn physics wind validate` again.");
}

function physicsComponentPath(scene: ISceneDocument, entity: ISceneEntity, kind: PortablePhysicsComponentKind): string {
  const index = Math.max(0, (scene.entities ?? []).findIndex((candidate) => candidate.id === entity.id));
  return `/entities/${index}/components/${kind}`;
}

function portablePhysicsFailure(options: IPortableAerodynamicsOperationOptions, diagnostics: IIrDiagnostic[], fallbackSuggestion: string): IAuthoringOperationResult | undefined {
  if (diagnostics.length === 0) return undefined;
  return authoringOperationResult({ diagnostics: diagnostics.map((diagnostic) => authoringDiagnostic({ code: diagnostic.code, message: diagnostic.message, path: diagnostic.path, severity: diagnostic.severity, suggestion: diagnostic.suggestion ?? fallbackSuggestion })), projectPath: options.projectPath });
}
