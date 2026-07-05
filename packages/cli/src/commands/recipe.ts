import {
  applyAuthoringRecipe,
  listAuthoringRecipeIds,
  planAuthoringRecipe,
  type IAuthoringRecipeApplyResult,
  type IAuthoringRecipePlanResult,
} from "@threenative/authoring";
import { access, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";
import { buildGameTaskGraph } from "../game/taskGraph.js";

interface IRecipeCommandOptions {
  cwd?: string;
}

export async function recipeCommand(argv: readonly string[], options: IRecipeCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const positionals = readPositionals(normalizedArgv);
  const recipeId = positionals[0] === "apply" ? positionals[1] : positionals[0];
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

  const scaffoldedScript = await scaffoldRecipeScript(recipeId, args, projectPath);
  const result = await applyAuthoringRecipe({ args, projectPath, recipeId });
  if (result.ok && scaffoldedScript !== undefined) {
    result.changed = true;
    result.filesWritten = Array.from(new Set([...result.filesWritten, scaffoldedScript])).sort();
  }
  await scaffoldProofRecipe(result, projectPath);
  if (result.ok) {
    await persistGameTaskGraph(projectPath);
  }
  return renderRecipeApply(result, json);
}

async function persistGameTaskGraph(projectPath: string): Promise<void> {
  const graph = await buildGameTaskGraph({ projectPath });
  const outPath = resolve(projectPath, "artifacts/game-production/task-graph.json");
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
}

async function scaffoldRecipeScript(recipeId: string, args: Record<string, unknown>, projectPath: string): Promise<string | undefined> {
  const script = recipeScript(recipeId, args);
  if (script === undefined) {
    return undefined;
  }
  const absolutePath = resolve(projectPath, script.modulePath);
  if (await pathExists(absolutePath)) {
    return undefined;
  }
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, script.source, "utf8");
  return script.modulePath;
}

async function scaffoldProofRecipe(result: IAuthoringRecipeApplyResult, projectPath: string): Promise<void> {
  if (!result.ok || !gameKitRecipeIds.has(result.recipeId)) {
    return;
  }
  const relativePath = `content/proofs/${result.recipeId}.proof.json`;
  const absolutePath = resolve(projectPath, relativePath);
  if (await pathExists(absolutePath)) {
    return;
  }
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  await writeFile(
    absolutePath,
    `${JSON.stringify(
      {
        schema: "threenative.proof-recipe",
        version: "0.1.0",
        id: result.recipeId,
        recipeId: result.recipeId,
        commands: result.proofCommands,
        requiredArtifacts: ["authoring-validation", "build", "input-playtest", "screenshot-or-scene-proof"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  result.changed = true;
  result.filesWritten = Array.from(new Set([...result.filesWritten, relativePath])).sort();
}

function recipeScript(recipeId: string, args: Record<string, unknown>): { modulePath: string; source: string } | undefined {
  if (recipeId === "top-down-collector") {
    const modulePath = stringArg(args, "modulePath") ?? "src/scripts/player.ts";
    const exportName = stringArg(args, "exportName") ?? "topDownCollectorSystem";
    return {
      modulePath,
      source: `export function ${exportName}(): void {\n  // Starter system stub for the top-down collector recipe.\n}\n`,
    };
  }
  if (recipeId === "lane-runner") {
    const modulePath = stringArg(args, "modulePath") ?? "src/scripts/player.ts";
    const exportName = stringArg(args, "exportName") ?? "laneRunnerSystem";
    return {
      modulePath,
      source: `export function ${exportName}(): void {\n  // Starter system stub for the lane runner recipe.\n}\n`,
    };
  }
  if (recipeId === "vehicle-checkpoint") {
    const modulePath = stringArg(args, "modulePath") ?? "src/scripts/player.ts";
    const exportName = stringArg(args, "exportName") ?? "vehicleCheckpointSystem";
    return {
      modulePath,
      source: `export function ${exportName}(): void {\n  // Starter system stub for the vehicle checkpoint recipe.\n}\n`,
    };
  }
  return undefined;
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
  return "Usage: tn recipe [apply] <recipe-id> --scene <scene-id> [--entity <entity-id>|--player <player-id>|--vehicle <vehicle-id>] [--camera <camera-id>] [--module <path>] [--export <name>] [--dry-run] [--project <path>] [--json]";
}

function recipeArgs(argv: readonly string[]): Record<string, unknown> {
  return defined({
    cameraId: readFlag(argv, "--camera"),
    color: readFlag(argv, "--color"),
    entityId: readFlag(argv, "--entity"),
    exportName: readFlag(argv, "--export"),
    goalId: readFlag(argv, "--goal-entity"),
    height: parseOptionalNumber(argv, "--height"),
    inputDocId: readFlag(argv, "--input-doc"),
    modulePath: readFlag(argv, "--module"),
    moveXAxis: readFlag(argv, "--move-x"),
    moveZAxis: readFlag(argv, "--move-z"),
    playerId: readFlag(argv, "--player"),
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
    vehicleId: readFlag(argv, "--vehicle"),
  });
}

function resolveProjectPath(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): string {
  const project = readFlag(argv, "--project") ?? ".";
  return isAbsolute(project) ? project : resolve(cwd, project);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function readPositional(argv: readonly string[], index: number): string | undefined {
  return readPositionals(argv)[index];
}

function readPositionals(argv: readonly string[]): string[] {
  return argv.filter((arg, argIndex) => {
    if (arg.startsWith("--")) {
      return false;
    }
    const previous = argv[argIndex - 1];
    return !flagsWithValues.has(previous ?? "");
  });
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
  "--goal-entity",
  "--input-doc",
  "--player",
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
  "--vehicle",
]);

const gameKitRecipeIds = new Set(["top-down-collector", "lane-runner", "vehicle-checkpoint"]);
