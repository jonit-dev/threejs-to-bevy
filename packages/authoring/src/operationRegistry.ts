import { authoringDiagnostic } from "./diagnostics.js";
import {
  addEntity,
  attachScript,
  attachSystemScript,
  bindUi,
  bindUiDocument,
  setCamera,
  setMaterial,
  setTransform,
  setUiLayout,
  type IAuthoringOperationContext,
  type IAuthoringOperationResult,
} from "./operations.js";

export type AuthoringOperationName =
  | "material.set"
  | "scene.add_entity"
  | "scene.attach_script"
  | "scene.bind_ui"
  | "scene.set_camera"
  | "scene.set_transform"
  | "system.attach_script"
  | "ui.bind"
  | "ui.set_layout";

export type AuthoringOperationPathPolicy = "source-document" | "source-script";
export type AuthoringOperationSourceFamily = "material" | "scene" | "system" | "ui";
export type AuthoringOperationResultShape = "authoring-operation-result";

export interface IAuthoringOperationArgumentDescriptor {
  name: string;
  required: boolean;
  type: "number" | "string" | "vector3";
}

export interface IAuthoringOperationDescriptor {
  arguments: IAuthoringOperationArgumentDescriptor[];
  description: string;
  name: AuthoringOperationName;
  pathPolicy: AuthoringOperationPathPolicy;
  resultShape: AuthoringOperationResultShape;
  sourceFamily: AuthoringOperationSourceFamily;
}

export interface IDispatchAuthoringOperationOptions extends IAuthoringOperationContext {
  args: Record<string, unknown>;
  name: AuthoringOperationName | string;
}

type OperationDispatcher = (options: IDispatchAuthoringOperationOptions) => Promise<IAuthoringOperationResult>;

const descriptors = [
  descriptor("scene.add_entity", "Add an entity to a structured scene document.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    stringArg("prefabId", false),
  ]),
  descriptor("scene.set_transform", "Set a scene entity transform through structured source.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("entityId"),
    vectorArg("position", false),
    vectorArg("rotation", false),
    vectorArg("scale", false),
  ]),
  descriptor("scene.set_camera", "Set source camera metadata for a scene entity.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("cameraId"),
    stringArg("mode"),
    stringArg("targetId"),
  ]),
  descriptor("scene.attach_script", "Attach a script module/export to a scene system.", "scene", "source-script", [
    stringArg("sceneId"),
    stringArg("systemId"),
    stringArg("modulePath"),
    stringArg("exportName"),
  ]),
  descriptor("scene.bind_ui", "Bind a scene-owned UI node to a resource path.", "scene", "source-document", [
    stringArg("sceneId"),
    stringArg("uiNodeId"),
    stringArg("resourcePath"),
  ]),
  descriptor("ui.set_layout", "Set retained UI layout fields in a structured UI document.", "ui", "source-document", [
    stringArg("uiDocId"),
    stringArg("nodeId"),
    stringArg("justify", false),
    stringArg("align", false),
    numberArg("top", false),
    numberArg("height", false),
    numberArg("width", false),
  ]),
  descriptor("ui.bind", "Bind a retained UI node to a resource path.", "ui", "source-document", [
    stringArg("uiDocId"),
    stringArg("nodeId"),
    stringArg("resourcePath"),
  ]),
  descriptor("material.set", "Set material source fields.", "material", "source-document", [
    stringArg("materialId"),
    stringArg("color", false),
    numberArg("roughness", false),
  ]),
  descriptor("system.attach_script", "Attach a script module/export to a system document.", "system", "source-script", [
    stringArg("systemId"),
    stringArg("modulePath"),
    stringArg("exportName"),
  ]),
] as const satisfies readonly IAuthoringOperationDescriptor[];

const dispatchers: Record<AuthoringOperationName, OperationDispatcher> = {
  "material.set": async ({ args, projectPath }) =>
    setMaterial({ color: optionalString(args, "color"), materialId: requiredString(args, "materialId"), projectPath, roughness: optionalNumber(args, "roughness") }),
  "scene.add_entity": async ({ args, projectPath }) =>
    addEntity({ entityId: requiredString(args, "entityId"), prefabId: optionalString(args, "prefabId"), projectPath, sceneId: requiredString(args, "sceneId") }),
  "scene.attach_script": async ({ args, projectPath }) =>
    attachScript({
      exportName: requiredString(args, "exportName"),
      modulePath: requiredString(args, "modulePath"),
      projectPath,
      sceneId: requiredString(args, "sceneId"),
      systemId: requiredString(args, "systemId"),
    }),
  "scene.bind_ui": async ({ args, projectPath }) =>
    bindUi({ projectPath, resourcePath: requiredString(args, "resourcePath"), sceneId: requiredString(args, "sceneId"), uiNodeId: requiredString(args, "uiNodeId") }),
  "scene.set_camera": async ({ args, projectPath }) =>
    setCamera({
      cameraId: requiredString(args, "cameraId"),
      mode: requiredString(args, "mode"),
      projectPath,
      sceneId: requiredString(args, "sceneId"),
      targetId: requiredString(args, "targetId"),
    }),
  "scene.set_transform": async ({ args, projectPath }) =>
    setTransform({
      entityId: requiredString(args, "entityId"),
      position: optionalVector3(args, "position"),
      projectPath,
      rotation: optionalVector3(args, "rotation"),
      scale: optionalVector3(args, "scale"),
      sceneId: requiredString(args, "sceneId"),
    }),
  "system.attach_script": async ({ args, projectPath }) =>
    attachSystemScript({
      exportName: requiredString(args, "exportName"),
      modulePath: requiredString(args, "modulePath"),
      projectPath,
      systemId: requiredString(args, "systemId"),
    }),
  "ui.bind": async ({ args, projectPath }) =>
    bindUiDocument({ nodeId: requiredString(args, "nodeId"), projectPath, resourcePath: requiredString(args, "resourcePath"), uiDocId: requiredString(args, "uiDocId") }),
  "ui.set_layout": async ({ args, projectPath }) =>
    setUiLayout({
      align: optionalString(args, "align"),
      height: optionalNumber(args, "height"),
      justify: optionalString(args, "justify"),
      nodeId: requiredString(args, "nodeId"),
      projectPath,
      top: optionalNumber(args, "top"),
      uiDocId: requiredString(args, "uiDocId"),
      width: optionalNumber(args, "width"),
    }),
};

export const AUTHORING_OPERATION_NAMES: readonly AuthoringOperationName[] = descriptors.map((operation) => operation.name);
export const AUTHORING_OPERATION_REGISTRY: ReadonlyMap<AuthoringOperationName, IAuthoringOperationDescriptor> = new Map(
  descriptors.map((operation) => [operation.name, operation]),
);

export function listAuthoringOperationDescriptors(): IAuthoringOperationDescriptor[] {
  return descriptors.map((operation) => ({ ...operation, arguments: operation.arguments.map((argument) => ({ ...argument })) }));
}

export function getAuthoringOperationDescriptor(name: string): IAuthoringOperationDescriptor | undefined {
  const operation = AUTHORING_OPERATION_REGISTRY.get(name as AuthoringOperationName);
  return operation === undefined ? undefined : { ...operation, arguments: operation.arguments.map((argument) => ({ ...argument })) };
}

export async function dispatchAuthoringOperation(options: IDispatchAuthoringOperationOptions): Promise<IAuthoringOperationResult> {
  const operation = getAuthoringOperationDescriptor(options.name);
  if (operation === undefined) {
    return {
      changed: false,
      diagnostics: [
        authoringDiagnostic({
          code: "TN_AUTHORING_OPERATION_UNSUPPORTED",
          message: `Authoring operation '${options.name}' is not registered.`,
          path: "/name",
          suggestion: `Use one of: ${AUTHORING_OPERATION_NAMES.join(", ")}.`,
          value: options.name,
        }),
      ],
      filesWritten: [],
      ok: false,
      projectPath: options.projectPath,
    };
  }

  const diagnostics = validateRegistryArguments(operation, options.args);
  if (diagnostics.length > 0) {
    return {
      changed: false,
      diagnostics,
      filesWritten: [],
      ok: false,
      projectPath: options.projectPath,
    };
  }

  return dispatchers[operation.name]({ ...options, name: operation.name });
}

function validateRegistryArguments(operation: IAuthoringOperationDescriptor, args: Record<string, unknown>) {
  return operation.arguments.flatMap((argument) => {
    const value = args[argument.name];
    if (value === undefined) {
      return argument.required
        ? [
            authoringDiagnostic({
              code: "TN_AUTHORING_OPERATION_ARG_MISSING",
              message: `Authoring operation '${operation.name}' requires argument '${argument.name}'.`,
              path: `/${argument.name}`,
              value: operation.name,
            }),
          ]
        : [];
    }
    if (argument.type === "string" && (typeof value !== "string" || value.trim() === "")) {
      return [invalidArgumentDiagnostic(operation.name, argument.name, "a non-empty string")];
    }
    if (argument.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      return [invalidArgumentDiagnostic(operation.name, argument.name, "a finite number")];
    }
    if (argument.type === "vector3" && !isVector3(value)) {
      return [invalidArgumentDiagnostic(operation.name, argument.name, "a three-number vector")];
    }
    return [];
  });
}

function invalidArgumentDiagnostic(operationName: string, argumentName: string, expected: string) {
  return authoringDiagnostic({
    code: "TN_AUTHORING_OPERATION_ARG_INVALID",
    message: `Authoring operation '${operationName}' argument '${argumentName}' must be ${expected}.`,
    path: `/${argumentName}`,
    value: operationName,
  });
}

function descriptor(
  name: AuthoringOperationName,
  description: string,
  sourceFamily: AuthoringOperationSourceFamily,
  pathPolicy: AuthoringOperationPathPolicy,
  args: IAuthoringOperationArgumentDescriptor[],
): IAuthoringOperationDescriptor {
  return {
    arguments: args,
    description,
    name,
    pathPolicy,
    resultShape: "authoring-operation-result",
    sourceFamily,
  };
}

function stringArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "string" };
}

function numberArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "number" };
}

function vectorArg(name: string, required = true): IAuthoringOperationArgumentDescriptor {
  return { name, required, type: "vector3" };
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Operation argument '${key}' was not validated.`);
  }
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalVector3(args: Record<string, unknown>, key: string): [number, number, number] | undefined {
  const value = args[key];
  return isVector3(value) ? value : undefined;
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}
