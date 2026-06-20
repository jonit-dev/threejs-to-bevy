import { inspectScene, validateScene, type IAuthoringOperationResult, type IInspectSceneResult } from "@threenative/authoring";
import { isAbsolute, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";

interface ISceneCommandOptions {
  cwd?: string;
}

export async function sceneCommand(argv: readonly string[], options: ISceneCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);

  if (subcommand === "validate") {
    const sceneId = readPositional(normalizedArgv, 1);
    const result = await validateScene({ projectPath, ...(sceneId === undefined ? {} : { sceneId }) });
    return renderSceneResult(result, json, result.ok ? "Scene validation passed." : "Scene validation failed.");
  }

  if (subcommand === "inspect") {
    const sceneId = readPositional(normalizedArgv, 1);
    if (sceneId === undefined) {
      return renderUsage(json, "TN_SCENE_INSPECT_ID_MISSING", "Usage: tn scene inspect <scene-id> [--project <path>] [--json]");
    }
    const result = await inspectScene({ projectPath, sceneId });
    return renderSceneResult(result, json, result.ok ? `Scene '${sceneId}' inspected.` : `Scene '${sceneId}' inspection failed.`);
  }

  return renderUsage(json, "TN_SCENE_COMMAND_UNKNOWN", "Usage: tn scene validate [scene-id] [--project <path>] [--json]\n       tn scene inspect <scene-id> [--project <path>] [--json]");
}

function renderSceneResult(result: IAuthoringOperationResult | IInspectSceneResult, json: boolean, message: string): ICommandResult {
  const payload = {
    code: result.ok ? "TN_SCENE_OK" : "TN_SCENE_FAILED",
    message,
    ...result,
  };

  if (json) {
    return {
      exitCode: result.ok ? 0 : 1,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  if (result.ok) {
    const summary = "scene" in result && result.scene !== undefined
      ? `\nScene: ${result.scene.id}\nFile: ${result.scene.file}\nEntities: ${result.scene.entities.length}\nSystems: ${result.scene.systems.length}`
      : "";
    return {
      exitCode: 0,
      stdout: `${message}${summary}\n`,
    };
  }

  const diagnostics = result.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.file ?? ""}${diagnostic.path ?? ""}: ${diagnostic.message}`).join("\n");
  return {
    exitCode: 1,
    stderr: `${message}\n${diagnostics}\n`,
    stdout: "",
  };
}

function renderUsage(json: boolean, code: string, usage: string): ICommandResult {
  const payload = {
    code,
    message: usage,
    severity: "error",
  };
  return {
    exitCode: 2,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${usage}\n`,
  };
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
    return previous !== "--project";
  });
  return positionals[index];
}
