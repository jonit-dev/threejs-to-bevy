import { resolve } from "node:path";

import {
  dispatchAuthoringOperation,
  getAuthoringOperationDescriptor,
  type AuthoringOperationName,
  type IAuthoringDiagnostic,
  type IAuthoringOperationArgumentDescriptor,
  type IAuthoringOperationResult,
} from "@threenative/authoring";
import { SceneBuilder } from "./scene.js";

export type AuthoringClientOperationName = AuthoringOperationName | string;
export type AuthoringClientOperationArgs = Record<string, unknown>;

export interface IAuthoringClientOperationInput<TName extends AuthoringClientOperationName = AuthoringClientOperationName> {
  args?: AuthoringClientOperationArgs;
  name: TName;
}

export interface IAuthoringClientOperationTrace<TName extends AuthoringClientOperationName = AuthoringClientOperationName> {
  args: AuthoringClientOperationArgs;
  index: number;
  name: TName;
}

export interface IAuthoringClientOperationResult<TName extends AuthoringClientOperationName = AuthoringClientOperationName> {
  result: IAuthoringOperationResult;
  trace: IAuthoringClientOperationTrace<TName>;
}

export interface IAuthoringClientTransactionResult {
  changed: boolean;
  diagnostics: IAuthoringDiagnostic[];
  filesWritten: string[];
  ok: boolean;
  operationResults: IAuthoringClientOperationResult[];
  operations: IAuthoringClientOperationTrace[];
  projectPath: string;
  stoppedAt?: number;
}

export interface IAuthoringClientCommitOptions {
  stopOnError?: boolean;
}

export interface IAuthoringClientDryRunResult {
  diagnostics: IAuthoringDiagnostic[];
  ok: boolean;
  operations: IAuthoringClientOperationTrace[];
  projectPath: string;
}

export interface IAuthoringClientProject {
  readonly projectPath: string;
  operation<TName extends AuthoringClientOperationName>(name: TName, args?: AuthoringClientOperationArgs): AuthoringClientTransaction;
  scene(sceneId: string): SceneBuilder;
  transaction(): AuthoringClientTransaction;
}

export class AuthoringClientProject implements IAuthoringClientProject {
  readonly projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = resolve(projectPath);
  }

  operation<TName extends AuthoringClientOperationName>(name: TName, args: AuthoringClientOperationArgs = {}): AuthoringClientTransaction {
    return this.transaction().operation(name, args);
  }

  scene(sceneId: string): SceneBuilder {
    return new SceneBuilder(this.transaction(), sceneId);
  }

  transaction(): AuthoringClientTransaction {
    return new AuthoringClientTransaction(this.projectPath);
  }
}

export class AuthoringClientTransaction {
  readonly projectPath: string;
  readonly operations: IAuthoringClientOperationTrace[] = [];

  constructor(projectPath: string) {
    this.projectPath = resolve(projectPath);
  }

  operation<TName extends AuthoringClientOperationName>(name: TName, args: AuthoringClientOperationArgs = {}): this {
    this.operations.push({
      args: cloneArgs(args),
      index: this.operations.length,
      name,
    });
    return this;
  }

  async commit(options: IAuthoringClientCommitOptions = {}): Promise<IAuthoringClientTransactionResult> {
    const stopOnError = options.stopOnError ?? true;
    const operationResults: IAuthoringClientOperationResult[] = [];
    const diagnostics: IAuthoringDiagnostic[] = [];
    const filesWritten = new Set<string>();
    let changed = false;
    let stoppedAt: number | undefined;

    for (const trace of this.operations) {
      const result = await dispatchAuthoringOperation({
        args: trace.args,
        name: trace.name,
        projectPath: this.projectPath,
      });
      operationResults.push({ result, trace });
      diagnostics.push(...result.diagnostics);
      for (const file of result.filesWritten) {
        filesWritten.add(file);
      }
      changed = changed || result.changed;
      if (!result.ok && stopOnError) {
        stoppedAt = trace.index;
        break;
      }
    }

    const ok = operationResults.length === this.operations.length && operationResults.every((entry) => entry.result.ok);
    return {
      changed,
      diagnostics,
      filesWritten: [...filesWritten].sort(),
      ok,
      operationResults,
      operations: this.operations.map((operation) => ({ ...operation, args: cloneArgs(operation.args) })),
      projectPath: this.projectPath,
      ...(stoppedAt === undefined ? {} : { stoppedAt }),
    };
  }

  dryRun(): IAuthoringClientDryRunResult {
    return dryRunOperations(this.projectPath, this.operations);
  }
}

export function openProject(projectPath: string): IAuthoringClientProject {
  return new AuthoringClientProject(projectPath);
}

export { SceneBuilder } from "./scene.js";
export type {
  ISceneAddEntityOptions,
  ISceneAddPrefabOptions,
  ISceneCameraOptions,
  ISceneCharacterControllerOptions,
  ISceneColliderOptions,
  ISceneLightOptions,
  ISceneMeshRendererOptions,
  ISceneResourceOptions,
  ISceneRigidBodyOptions,
  ISceneScriptOptions,
  ISceneTransformOptions,
} from "./scene.js";

function cloneArgs(args: AuthoringClientOperationArgs): AuthoringClientOperationArgs {
  return JSON.parse(JSON.stringify(args)) as AuthoringClientOperationArgs;
}

function dryRunOperations(projectPath: string, operations: readonly IAuthoringClientOperationTrace[]): IAuthoringClientDryRunResult {
  const diagnostics = operations.flatMap((operation) => dryRunOperationDiagnostics(operation));
  return {
    diagnostics,
    ok: diagnostics.length === 0,
    operations: operations.map((operation) => ({ ...operation, args: cloneArgs(operation.args) })),
    projectPath,
  };
}

function dryRunOperationDiagnostics(operation: IAuthoringClientOperationTrace): IAuthoringDiagnostic[] {
  const descriptor = getAuthoringOperationDescriptor(operation.name);
  if (descriptor === undefined) {
    return [
      {
        code: "TN_AUTHORING_OPERATION_UNSUPPORTED",
        message: `Authoring operation '${operation.name}' is not registered.`,
        path: `/operations/${operation.index}/name`,
        severity: "error",
        value: operation.name,
      },
    ];
  }
  return descriptor.arguments.flatMap((argument) => requiredArgumentDiagnostic(operation, argument));
}

function requiredArgumentDiagnostic(operation: IAuthoringClientOperationTrace, argument: IAuthoringOperationArgumentDescriptor): IAuthoringDiagnostic[] {
  const value = operation.args[argument.name];
  if (value === undefined) {
    return argument.required
      ? [
          {
            code: "TN_AUTHORING_OPERATION_ARG_MISSING",
            message: `Authoring operation '${operation.name}' requires argument '${argument.name}'.`,
            path: `/operations/${operation.index}/args/${argument.name}`,
            severity: "error",
            value: operation.name,
          },
        ]
      : [];
  }
  const expected = expectedArgumentShape(argument, value);
  if (expected === undefined) {
    return [];
  }
  return [
    {
      code: "TN_AUTHORING_OPERATION_ARG_INVALID",
      message: `Authoring operation '${operation.name}' argument '${argument.name}' must be ${expected}.`,
      path: `/operations/${operation.index}/args/${argument.name}`,
      severity: "error",
      value: operation.name,
    },
  ];
}

function expectedArgumentShape(argument: IAuthoringOperationArgumentDescriptor, value: unknown): string | undefined {
  if (argument.type === "string" && (typeof value !== "string" || value.trim() === "")) {
    return "a non-empty string";
  }
  if (argument.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    return "a finite number";
  }
  if (argument.type === "number-array" && (!Array.isArray(value) || !value.every((entry) => typeof entry === "number" && Number.isFinite(entry)))) {
    return "an array of finite numbers";
  }
  if (argument.type === "boolean" && typeof value !== "boolean") {
    return "a boolean";
  }
  if (argument.type === "json-object" && !isObject(value)) {
    return "a JSON object";
  }
  if (argument.type === "json-object-array" && (!Array.isArray(value) || !value.every(isObject))) {
    return "an array of JSON objects";
  }
  if (argument.type === "string-array" && (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.trim() !== ""))) {
    return "an array of non-empty strings";
  }
  if (argument.type === "vector3" && (!Array.isArray(value) || value.length !== 3 || !value.every((entry) => typeof entry === "number" && Number.isFinite(entry)))) {
    return "a three-number vector";
  }
  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
