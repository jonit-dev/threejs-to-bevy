import { resolve } from "node:path";

import {
  applyAuthoringBatch,
  AUTHORING_BATCH_SCHEMA,
  AUTHORING_BATCH_VERSION,
  getAuthoringOperationDescriptor,
  planAuthoringRecipe,
  type AuthoringOperationName,
  type AuthoringRecipeId,
  type IAuthoringDiagnostic,
  type IAuthoringOperationArgumentDescriptor,
  type IAuthoringOperationResult,
  type IAuthoringRecipePlanResult,
} from "@threenative/authoring";
import { SceneBuilder } from "./scene.js";
import type {
  AuthoringOperationArgsMap,
  AuthoringOperationCallArgs,
  GeneratedAuthoringOperationName,
} from "./generatedOperations.js";

export type AuthoringClientOperationName = AuthoringOperationName & GeneratedAuthoringOperationName;
export type AuthoringClientOperationArgs<TName extends string = AuthoringClientOperationName> =
  TName extends AuthoringClientOperationName ? AuthoringOperationArgsMap[TName] & Record<string, unknown> : Record<string, unknown>;

export interface IAuthoringClientOperationInput<TName extends string = AuthoringClientOperationName> {
  args: AuthoringClientOperationArgs<TName>;
  name: TName;
}

export interface IAuthoringClientOperationTrace<TName extends string = AuthoringClientOperationName> {
  args: AuthoringClientOperationArgs<TName>;
  index: number;
  name: TName;
}

export interface IAuthoringClientOperationResult<TName extends string = AuthoringClientOperationName> {
  result: IAuthoringOperationResult;
  trace: IAuthoringClientOperationTrace<TName>;
}

export interface IAuthoringClientTransactionResult {
  changed: boolean;
  committed: boolean;
  diagnostics: IAuthoringDiagnostic[];
  filesWritten: string[];
  filesCreated: string[];
  filesDeleted: string[];
  filesModified: string[];
  ok: boolean;
  operationResults: IAuthoringClientOperationResult<string>[];
  operations: IAuthoringClientOperationTrace<string>[];
  projectPath: string;
  planHash: string;
  recovered: boolean;
  stoppedAt?: number;
  transactionId: string;
}

export interface IAuthoringClientCommitOptions {
  stopOnError?: boolean;
}

export interface IAuthoringClientDryRunResult {
  diagnostics: IAuthoringDiagnostic[];
  ok: boolean;
  operations: IAuthoringClientOperationTrace<string>[];
  projectPath: string;
}

export interface IAuthoringClientProject {
  readonly projectPath: string;
  operation<TName extends AuthoringClientOperationName>(name: TName, ...args: AuthoringOperationCallArgs<TName>): AuthoringClientTransaction;
  unsafeOperation(name: string, args?: Record<string, unknown>): AuthoringClientTransaction;
  planRecipe(recipeId: AuthoringRecipeId | string, args?: Record<string, unknown>): IAuthoringRecipePlanResult;
  recipe(recipeId: AuthoringRecipeId | string, args?: Record<string, unknown>): AuthoringClientTransaction;
  scene(sceneId: string): SceneBuilder;
  transaction(): AuthoringClientTransaction;
}

export class AuthoringClientProject implements IAuthoringClientProject {
  readonly projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = resolve(projectPath);
  }

  operation<TName extends AuthoringClientOperationName>(name: TName, ...args: AuthoringOperationCallArgs<TName>): AuthoringClientTransaction {
    return this.transaction().operation(name, ...args);
  }

  unsafeOperation(name: string, args: Record<string, unknown> = {}): AuthoringClientTransaction {
    return this.transaction().unsafeOperation(name, args);
  }

  planRecipe(recipeId: AuthoringRecipeId | string, args: Record<string, unknown> = {}): IAuthoringRecipePlanResult {
    return planAuthoringRecipe({ args, projectPath: this.projectPath, recipeId });
  }

  recipe(recipeId: AuthoringRecipeId | string, args: Record<string, unknown> = {}): AuthoringClientTransaction {
    const transaction = this.transaction();
    const plan = this.planRecipe(recipeId, args);
    for (const operation of plan.operations) {
      transaction.queueOperation(operation.name, operation.args);
    }
    return transaction;
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
  readonly operations: IAuthoringClientOperationTrace<string>[] = [];

  constructor(projectPath: string) {
    this.projectPath = resolve(projectPath);
  }

  operation<TName extends AuthoringClientOperationName>(name: TName, ...args: AuthoringOperationCallArgs<TName>): this {
    return this.queueOperation(name, (args[0] ?? {}) as Record<string, unknown>);
  }

  unsafeOperation(name: string, args: Record<string, unknown> = {}): this {
    return this.queueOperation(name, args);
  }

  queueOperation(name: string, args: Record<string, unknown>): this {
    this.operations.push({
      args: cloneArgs(args),
      index: this.operations.length,
      name,
    });
    return this;
  }

  async commit(options: IAuthoringClientCommitOptions = {}): Promise<IAuthoringClientTransactionResult> {
    const batchResult = await applyAuthoringBatch({
      batch: {
        id: "authoring-client-transaction",
        operations: this.operations.map(({ args, name }) => ({ args, name: name as AuthoringOperationName })),
        schema: AUTHORING_BATCH_SCHEMA,
        version: AUTHORING_BATCH_VERSION,
      },
      projectPath: this.projectPath,
      stopOnError: options.stopOnError,
    });
    return {
      changed: batchResult.changed,
      committed: batchResult.committed,
      diagnostics: batchResult.diagnostics,
      filesCreated: batchResult.filesCreated,
      filesDeleted: batchResult.filesDeleted,
      filesModified: batchResult.filesModified,
      filesWritten: batchResult.filesWritten,
      ok: batchResult.ok,
      operationResults: batchResult.operationResults.map((entry) => ({
        result: entry.result,
        trace: this.operations[entry.index]!,
      })),
      operations: this.operations.map((operation) => ({ ...operation, args: cloneArgs(operation.args) })),
      planHash: batchResult.planHash,
      projectPath: this.projectPath,
      recovered: batchResult.recovered,
      ...(batchResult.stoppedAt === undefined ? {} : { stoppedAt: batchResult.stoppedAt }),
      transactionId: batchResult.transactionId,
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
  AuthoringJsonObject,
  AuthoringJsonValue,
  AuthoringOperationArgs,
  AuthoringOperationArgsMap,
  AuthoringOperationCallArgs,
  AuthoringVector3,
  GeneratedAuthoringOperationName,
} from "./generatedOperations.js";
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

function cloneArgs<TArgs extends Record<string, unknown>>(args: TArgs): TArgs {
  return JSON.parse(JSON.stringify(args)) as TArgs;
}

function dryRunOperations(projectPath: string, operations: readonly IAuthoringClientOperationTrace<string>[]): IAuthoringClientDryRunResult {
  const diagnostics = operations.flatMap((operation) => dryRunOperationDiagnostics(operation));
  return {
    diagnostics,
    ok: diagnostics.length === 0,
    operations: operations.map((operation) => ({ ...operation, args: cloneArgs(operation.args) })),
    projectPath,
  };
}

function dryRunOperationDiagnostics(operation: IAuthoringClientOperationTrace<string>): IAuthoringDiagnostic[] {
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

function requiredArgumentDiagnostic(operation: IAuthoringClientOperationTrace<string>, argument: IAuthoringOperationArgumentDescriptor): IAuthoringDiagnostic[] {
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
