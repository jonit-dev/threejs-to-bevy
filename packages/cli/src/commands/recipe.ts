import {
  applyAuthoringRecipe,
  listAuthoringRecipeIds,
  planAuthoringRecipe,
  type IAuthoringRecipeApplyResult,
  type IAuthoringRecipePlanResult,
} from "@threenative/authoring";
import { isAbsolute, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";

interface IRecipeCommandOptions {
  cwd?: string;
}

export async function recipeCommand(argv: readonly string[], options: IRecipeCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const recipeId = readPositional(normalizedArgv, 0);
  const json = normalizedArgv.includes("--json");
  const dryRun = normalizedArgv.includes("--dry-run");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);

  if (recipeId === undefined) {
    return renderUsage(json, "TN_RECIPE_ARGS_MISSING");
  }

  const args = recipeArgs(normalizedArgv);
  if (dryRun) {
    const plan = planAuthoringRecipe({ args, projectPath, recipeId });
    return renderRecipePlan(plan, json);
  }

  const result = await applyAuthoringRecipe({ args, projectPath, recipeId });
  return renderRecipeApply(result, json);
}

function renderRecipePlan(plan: IAuthoringRecipePlanResult, json: boolean): ICommandResult {
  const payload = {
    code: plan.ok ? "TN_RECIPE_PLAN_OK" : "TN_RECIPE_PLAN_FAILED",
    message: plan.ok ? `Recipe '${plan.recipeId}' plan is valid.` : `Recipe '${plan.recipeId}' plan failed.`,
    ...plan,
  };
  return {
    exitCode: plan.ok ? 0 : 1,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
}

function renderRecipeApply(result: IAuthoringRecipeApplyResult, json: boolean): ICommandResult {
  const payload = {
    code: result.ok ? "TN_RECIPE_APPLY_OK" : "TN_RECIPE_APPLY_FAILED",
    message: result.ok ? `Recipe '${result.recipeId}' applied.` : `Recipe '${result.recipeId}' failed.`,
    ...result,
  };
  if (json) {
    return { exitCode: result.ok ? 0 : 1, stdout: `${JSON.stringify(payload, null, 2)}\n` };
  }
  if (result.ok) {
    return { exitCode: 0, stdout: `${payload.message}\n` };
  }
  const diagnostics = result.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.file ?? ""}${diagnostic.path ?? ""}: ${diagnostic.message}`).join("\n");
  return { exitCode: 1, stderr: `${payload.message}\n${diagnostics}\n`, stdout: "" };
}

function renderUsage(json: boolean, code: string): ICommandResult {
  const payload = {
    code,
    message: recipeUsage(),
    recipes: listAuthoringRecipeIds(),
    severity: "error",
  };
  return { exitCode: 2, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
}

function recipeUsage(): string {
  return "Usage: tn recipe <third-person-controller|collectible|trigger-zone|kinematic-character|health-bar> --scene <scene-id> --entity <entity-id> [--camera <camera-id>] [--module <path>] [--export <name>] [--dry-run] [--project <path>] [--json]";
}

function recipeArgs(argv: readonly string[]): Record<string, unknown> {
  return defined({
    cameraId: readFlag(argv, "--camera"),
    color: readFlag(argv, "--color"),
    entityId: readFlag(argv, "--entity"),
    exportName: readFlag(argv, "--export"),
    height: parseOptionalNumber(argv, "--height"),
    modulePath: readFlag(argv, "--module"),
    moveXAxis: readFlag(argv, "--move-x"),
    moveZAxis: readFlag(argv, "--move-z"),
    position: parseOptionalVector3(argv, "--position"),
    prefabId: readFlag(argv, "--prefab"),
    primitive: readFlag(argv, "--primitive"),
    radius: parseOptionalNumber(argv, "--radius"),
    resourceId: readFlag(argv, "--resource"),
    resourcePath: readFlag(argv, "--resource-path"),
    scale: parseOptionalVector3(argv, "--scale"),
    sceneId: readFlag(argv, "--scene"),
    size: parseOptionalVector3(argv, "--size"),
    speed: parseOptionalNumber(argv, "--speed"),
    systemId: readFlag(argv, "--system"),
    uiNodeId: readFlag(argv, "--ui-node"),
    value: parseOptionalNumber(argv, "--value"),
  });
}

function resolveProjectPath(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): string {
  const project = readFlag(argv, "--project") ?? ".";
  return isAbsolute(project) ? project : resolve(cwd, project);
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function readPositional(argv: readonly string[], index: number): string | undefined {
  const positionals = argv.filter((arg, argIndex) => {
    if (arg.startsWith("--")) {
      return false;
    }
    const previous = argv[argIndex - 1];
    return !flagsWithValues.has(previous ?? "");
  });
  return positionals[index];
}

function parseOptionalNumber(argv: readonly string[], flag: string): number | undefined {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseOptionalVector3(argv: readonly string[], flag: string): [number, number, number] | undefined {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return undefined;
  }
  const values = raw.split(",").map((entry) => Number(entry.trim()));
  return values.length === 3 && values.every((value) => Number.isFinite(value)) ? [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0] : undefined;
}

function defined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

const flagsWithValues = new Set([
  "--camera",
  "--color",
  "--entity",
  "--export",
  "--height",
  "--module",
  "--move-x",
  "--move-z",
  "--position",
  "--prefab",
  "--primitive",
  "--project",
  "--radius",
  "--resource",
  "--resource-path",
  "--scale",
  "--scene",
  "--size",
  "--speed",
  "--system",
  "--ui-node",
  "--value",
]);
