import { PHYSICS_CAPABILITY_DESCRIPTORS, PHYSICS_CAPABILITY_LIMITS, validateAerodynamicBody, validatePhysicsComponents, validatePhysicsJointGraph, validateVehicleController, validateWindVolume, type IAerodynamicBodyComponent, type IIrDiagnostic, type IVehicleControllerComponent, type IWindVolumeComponent, type IWorldIr } from "@threenative/ir";
import { authoringDiagnostic } from "../diagnostics.js";
import { loadAuthoringProject } from "../project.js";
import { isRecord, type ISceneDocument, type ISceneEntity } from "../schemas.js";
import { authoringOperationResult } from "./shared.js";
import { removeComponent, setComponent } from "./sceneComponents.js";
export { setRigidBodyComponent } from "./sceneComponents.js";
import type { IAuthoringOperationResult } from "./types.js";

export const PORTABLE_PHYSICS_AUTHORING_COMPONENTS = {
  aerodynamics: { component: "AerodynamicBody", operationPrefix: "physics.aerodynamics", resultField: "body", valueArgument: "body" },
  compound: { component: "CompoundCollider", operationPrefix: "physics.compound", resultField: "collider", valueArgument: "collider" },
  destructible: { component: "Destructible", operationPrefix: "physics.destructible", resultField: "destructible", valueArgument: "destructible" },
  joint: { component: "PhysicsJoint", operationPrefix: "physics.joint", resultField: "joint", valueArgument: "joint" },
  vehicle: { component: "VehicleController", operationPrefix: "physics.vehicle", resultField: "controller", valueArgument: "controller" },
  wheel: { component: "WheelAssembly", operationPrefix: "physics.wheel", resultField: "assembly", valueArgument: "assembly" },
} as const;

export type PortablePhysicsAuthoringComponent = (typeof PORTABLE_PHYSICS_AUTHORING_COMPONENTS)[keyof typeof PORTABLE_PHYSICS_AUTHORING_COMPONENTS];

export interface IPortablePhysicsComponentOperationOptions {
  definition: PortablePhysicsAuthoringComponent;
  entityId: string;
  projectPath: string;
  sceneId: string;
}

export interface ISetPortablePhysicsComponentOptions extends IPortablePhysicsComponentOperationOptions {
  value: Record<string, unknown>;
}

export async function setPortablePhysicsComponent(options: ISetPortablePhysicsComponentOptions): Promise<IAuthoringOperationResult> {
  if (options.definition.component === "AerodynamicBody") {
    return addAerodynamicBody({ body: options.value, entityId: options.entityId, projectPath: options.projectPath, sceneId: options.sceneId });
  }
  if (options.definition.component === "VehicleController") {
    return addVehicleController({ controller: options.value, entityId: options.entityId, projectPath: options.projectPath, sceneId: options.sceneId });
  }
  const failure = await portablePhysicsCandidateFailure(options);
  if (failure !== undefined) return failure;
  return setComponent({
    componentKind: options.definition.component,
    entityId: options.entityId,
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    value: structuredClone(options.value),
  });
}

async function portablePhysicsCandidateFailure(options: ISetPortablePhysicsComponentOptions): Promise<IAuthoringOperationResult | undefined> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const document = project.documents.find((item) => item.kind === "scene" && (item.data as { id?: unknown }).id === options.sceneId);
  if (document === undefined) return missing(options, "TN_AUTHORING_SCENE_MISSING", "/sceneId", `Scene '${options.sceneId}' was not found.`);
  const scene = structuredClone(document.data) as ISceneDocument;
  const index = scene.entities?.findIndex((item) => item.id === options.entityId) ?? -1;
  if (index < 0) return missing(options, "TN_AUTHORING_ENTITY_MISSING", "/entityId", `Entity '${options.entityId}' was not found.`);
  const entity = scene.entities![index]!;
  entity.components = { ...(entity.components ?? {}), [options.definition.component]: structuredClone(options.value) };
  const entities = physicsValidationEntities(scene);
  const entityIds = new Set(entities.map((candidate) => candidate.id));
  const rigidBodyEntityIds = new Set(entities.filter((candidate) => candidate.components?.RigidBody !== undefined).map((candidate) => candidate.id));
  const tireModelEntityIds = new Set(entities.filter((candidate) => candidate.components?.TireModel !== undefined).map((candidate) => candidate.id));
  const diagnostics: IIrDiagnostic[] = [];
  validatePhysicsComponents(entities[index]!, `/entities/${index}`, entityIds, rigidBodyEntityIds, tireModelEntityIds, diagnostics);
  if (options.definition.component === "PhysicsJoint") validatePhysicsJointGraph({ entities, schema: "threenative.world", version: "0.1.0" }, "", diagnostics);
  attachStructuredPhysicsFixes(options, diagnostics, entities);
  return portablePhysicsFailure(options, diagnostics, `Correct the ${options.definition.component} fields and run \`tn ${options.definition.operationPrefix.replaceAll(".", " ")} validate\` again.`);
}

function physicsValidationEntities(scene: ISceneDocument): IWorldIr["entities"] {
  return [...(scene.entities ?? []), ...(scene.instances ?? [])].map((candidate) => ({
    ...candidate,
    components: {
      ...(candidate.components ?? {}),
      ...(candidate.components?.Transform !== undefined || candidate.transform === undefined
        ? {}
        : { Transform: structuredClone(candidate.transform) }),
    },
  })) as unknown as IWorldIr["entities"];
}

function attachStructuredPhysicsFixes(
  options: ISetPortablePhysicsComponentOptions,
  diagnostics: IIrDiagnostic[],
  entities: IWorldIr["entities"],
): void {
  for (const diagnostic of diagnostics) {
    if (diagnostic.fix !== undefined) continue;
    const fixed = structuredClone(options.value);
    let allowed: readonly string[] | undefined;
    if (diagnostic.code.endsWith("_FIELD_UNSUPPORTED") || diagnostic.code === "TN_IR_PHYSICS_COMPOUND_FIELD_UNSUPPORTED") {
      if (!deletePhysicsValueAtDiagnosticPath(fixed, options.definition.component, diagnostic.path)) continue;
      const capability = PHYSICS_CAPABILITY_DESCRIPTORS.find((candidate) => candidate.component === options.definition.component);
      allowed = capability === undefined ? undefined : [...capability.runtimeFields];
    } else if (diagnostic.code === "TN_IR_PHYSICS_DESTRUCTIBLE_BOND_STRENGTH_INVALID") {
      if (!setPhysicsValueAtDiagnosticPath(fixed, options.definition.component, diagnostic.path, 1)) continue;
      allowed = ["finite number in (0, 1000000]"];
    } else if (diagnostic.code === "TN_IR_PHYSICS_DESTRUCTIBLE_BUDGET_INVALID") {
      if (!setPhysicsValueAtDiagnosticPath(fixed, options.definition.component, diagnostic.path, PHYSICS_CAPABILITY_LIMITS.fracturePiecesPerAssembly)) continue;
      allowed = [`1..${PHYSICS_CAPABILITY_LIMITS.fracturePiecesPerAssembly}`];
    } else if (diagnostic.code === "TN_IR_PHYSICS_WHEEL_REFERENCE_INVALID") {
      const referenceKind = diagnostic.path.endsWith("/tire") ? "TireModel" : undefined;
      const candidates = entities
        .filter((entity) => referenceKind === undefined || entity.components[referenceKind] !== undefined)
        .map((entity) => entity.id)
        .sort();
      const replacement = candidates[0];
      if (replacement === undefined || !setPhysicsValueAtDiagnosticPath(fixed, options.definition.component, diagnostic.path, replacement)) continue;
      allowed = candidates;
    } else {
      continue;
    }
    const capability = PHYSICS_CAPABILITY_DESCRIPTORS.find((candidate) => candidate.component === options.definition.component);
    const cookbook = capability !== undefined && "cookbook" in capability ? capability.cookbook : undefined;
    diagnostic.fix = {
      ...(allowed === undefined ? {} : { allowed }),
      ...(cookbook === undefined ? {} : { cookbook }),
      instruction: `Apply this corrected ${options.definition.component} payload through '${options.definition.operationPrefix}.set'.`,
      snippet: JSON.stringify(fixed),
    };
  }
}

function deletePhysicsValueAtDiagnosticPath(value: Record<string, unknown>, component: string, path: string): boolean {
  const target = physicsDiagnosticTarget(value, component, path);
  if (target === undefined) return false;
  if (Array.isArray(target.parent)) {
    const index = Number(target.key);
    if (!Number.isInteger(index)) return false;
    target.parent.splice(index, 1);
  } else {
    delete target.parent[target.key];
  }
  return true;
}

function setPhysicsValueAtDiagnosticPath(value: Record<string, unknown>, component: string, path: string, replacement: unknown): boolean {
  const target = physicsDiagnosticTarget(value, component, path);
  if (target === undefined) return false;
  if (Array.isArray(target.parent)) {
    const index = Number(target.key);
    if (!Number.isInteger(index)) return false;
    target.parent[index] = replacement;
  } else {
    target.parent[target.key] = replacement;
  }
  return true;
}

function physicsDiagnosticTarget(
  value: Record<string, unknown>,
  component: string,
  path: string,
): { key: string; parent: Record<string, unknown> | unknown[] } | undefined {
  const marker = `/components/${component}`;
  const markerIndex = path.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const segments = path.slice(markerIndex + marker.length).split("/").filter(Boolean).map(decodeJsonPointerSegment);
  const key = segments.pop();
  if (key === undefined) return undefined;
  let parent: unknown = value;
  for (const segment of segments) {
    if (Array.isArray(parent)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      parent = parent[index];
    } else if (isRecord(parent)) {
      parent = parent[segment];
    } else {
      return undefined;
    }
  }
  return Array.isArray(parent) || isRecord(parent) ? { key, parent } : undefined;
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

export async function removePortablePhysicsComponent(options: IPortablePhysicsComponentOperationOptions): Promise<IAuthoringOperationResult> {
  const loaded = await findPortablePhysicsComponent(options);
  if (loaded.result !== undefined) return loaded.result;
  return removeComponent({ componentKind: options.definition.component, entityId: options.entityId, projectPath: options.projectPath, sceneId: options.sceneId });
}

export async function inspectPortablePhysicsComponent(options: IPortablePhysicsComponentOperationOptions): Promise<IAuthoringOperationResult> {
  const loaded = await findPortablePhysicsComponent(options);
  if (loaded.result !== undefined) return loaded.result;
  const result = {
    ...authoringOperationResult({ projectPath: options.projectPath }),
    [options.definition.resultField]: structuredClone(loaded.component),
    component: options.definition.component,
    entityId: options.entityId,
    sceneId: options.sceneId,
  };
  return result;
}

export async function validatePortablePhysicsComponent(options: IPortablePhysicsComponentOperationOptions): Promise<IAuthoringOperationResult> {
  if (options.definition.component === "AerodynamicBody") return validateAerodynamicBodySource(options);
  if (options.definition.component === "VehicleController") return validateVehicleControllerSource(options);
  const loaded = await findPortablePhysicsComponent(options);
  if (loaded.result !== undefined) return loaded.result;
  if (!isRecord(loaded.component)) return missing(options, "TN_AUTHORING_PHYSICS_COMPONENT_INVALID", `/entities/${options.entityId}/components/${options.definition.component}`, `${options.definition.component} must be an object.`);
  const failure = await portablePhysicsCandidateFailure({ ...options, value: structuredClone(loaded.component) });
  if (failure !== undefined) return failure;
  const result = {
    ...authoringOperationResult({ projectPath: options.projectPath }),
    [options.definition.resultField]: structuredClone(loaded.component),
    component: options.definition.component,
    valid: true,
  };
  return result;
}

async function findPortablePhysicsComponent(options: IPortablePhysicsComponentOperationOptions): Promise<{
  component?: unknown;
  document?: Awaited<ReturnType<typeof loadAuthoringProject>>["documents"][number];
  entity?: ISceneEntity;
  project?: Awaited<ReturnType<typeof loadAuthoringProject>>;
  result?: IAuthoringOperationResult;
  scene?: ISceneDocument;
}> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const document = project.documents.find((item) => item.kind === "scene" && (item.data as { id?: unknown }).id === options.sceneId);
  if (document === undefined) return { result: missing(options, "TN_AUTHORING_SCENE_MISSING", "/sceneId", `Scene '${options.sceneId}' was not found.`) };
  const scene = document.data as ISceneDocument;
  const entity = scene.entities?.find((item) => item.id === options.entityId);
  if (entity === undefined) return { result: missing(options, "TN_AUTHORING_ENTITY_MISSING", "/entityId", `Entity '${options.entityId}' was not found.`) };
  const component = entity.components?.[options.definition.component];
  if (component === undefined) {
    const codeName = options.definition.component.replace(/([a-z])([A-Z])/gu, "$1_$2").toUpperCase();
    return { result: missing(options, `TN_AUTHORING_${codeName}_MISSING`, `/entities/${options.entityId}/components/${options.definition.component}`, `Entity '${options.entityId}' has no ${options.definition.component}.`) };
  }
  return { component, document, entity, project, scene };
}

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
  return authoringOperationResult({ diagnostics: diagnostics.map((diagnostic) => authoringDiagnostic({ code: diagnostic.code, fix: diagnostic.fix, message: diagnostic.message, path: diagnostic.path, severity: diagnostic.severity, suggestion: diagnostic.suggestion ?? fallbackSuggestion })), projectPath: options.projectPath });
}
