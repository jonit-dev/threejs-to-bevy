import {
  addEntity,
  attachScript,
  bindUi,
  inspectScene,
  setCamera,
  setTransform,
  validateScene,
  type IAuthoringOperationResult,
  type IInspectSceneResult,
} from "@threenative/authoring";
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

  if (subcommand === "add-entity") {
    const sceneId = readPositional(normalizedArgv, 1);
    const entityId = readPositional(normalizedArgv, 2);
    if (sceneId === undefined || entityId === undefined) {
      return renderUsage(json, "TN_SCENE_ADD_ENTITY_ARGS_MISSING", "Usage: tn scene add-entity <scene-id> <entity-id> [--prefab <prefab-id>] [--project <path>] [--json]");
    }
    const result = await addEntity({ projectPath, sceneId, entityId, prefabId: readFlag(normalizedArgv, "--prefab") });
    return renderSceneResult(result, json, result.ok ? `Entity '${entityId}' added.` : `Entity '${entityId}' was not added.`);
  }

  if (subcommand === "set-transform") {
    const sceneId = readPositional(normalizedArgv, 1);
    const entityId = readPositional(normalizedArgv, 2);
    if (sceneId === undefined || entityId === undefined) {
      return renderUsage(json, "TN_SCENE_SET_TRANSFORM_ARGS_MISSING", "Usage: tn scene set-transform <scene-id> <entity-id> [--position x,y,z] [--rotation x,y,z] [--scale x,y,z] [--project <path>] [--json]");
    }
    const vectors = parseTransformVectors(normalizedArgv);
    if (vectors.diagnostic !== undefined) {
      return renderUsage(json, vectors.diagnostic, "Transform vectors must use x,y,z numeric values.");
    }
    const result = await setTransform({ projectPath, sceneId, entityId, ...vectors.value });
    return renderSceneResult(result, json, result.ok ? `Transform for '${entityId}' updated.` : `Transform for '${entityId}' was not updated.`);
  }

  if (subcommand === "set-camera") {
    const sceneId = readPositional(normalizedArgv, 1);
    const cameraId = readPositional(normalizedArgv, 2);
    const mode = readFlag(normalizedArgv, "--mode");
    const targetId = readFlag(normalizedArgv, "--target");
    if (sceneId === undefined || cameraId === undefined || mode === undefined || targetId === undefined) {
      return renderUsage(json, "TN_SCENE_SET_CAMERA_ARGS_MISSING", "Usage: tn scene set-camera <scene-id> <camera-id> --mode <mode> --target <entity-id> [--project <path>] [--json]");
    }
    const result = await setCamera({ projectPath, sceneId, cameraId, mode, targetId });
    return renderSceneResult(result, json, result.ok ? `Camera '${cameraId}' updated.` : `Camera '${cameraId}' was not updated.`);
  }

  if (subcommand === "attach-script") {
    const sceneId = readPositional(normalizedArgv, 1);
    const systemId = readPositional(normalizedArgv, 2);
    const modulePath = readFlag(normalizedArgv, "--module");
    const exportName = readFlag(normalizedArgv, "--export");
    if (sceneId === undefined || systemId === undefined || modulePath === undefined || exportName === undefined) {
      return renderUsage(json, "TN_SCENE_ATTACH_SCRIPT_ARGS_MISSING", "Usage: tn scene attach-script <scene-id> <system-id> --module <path> --export <name> [--project <path>] [--json]");
    }
    const result = await attachScript({ projectPath, sceneId, systemId, modulePath, exportName });
    return renderSceneResult(result, json, result.ok ? `Script attached to '${systemId}'.` : `Script was not attached to '${systemId}'.`);
  }

  if (subcommand === "bind-ui") {
    const sceneId = readPositional(normalizedArgv, 1);
    const uiNodeId = readPositional(normalizedArgv, 2);
    const resourcePath = readFlag(normalizedArgv, "--resource");
    if (sceneId === undefined || uiNodeId === undefined || resourcePath === undefined) {
      return renderUsage(json, "TN_SCENE_BIND_UI_ARGS_MISSING", "Usage: tn scene bind-ui <scene-id> <ui-node-id> --resource <resource.path> [--project <path>] [--json]");
    }
    const result = await bindUi({ projectPath, sceneId, uiNodeId, resourcePath });
    return renderSceneResult(result, json, result.ok ? `UI node '${uiNodeId}' bound.` : `UI node '${uiNodeId}' was not bound.`);
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
    return !flagsWithValues.has(previous ?? "");
  });
  return positionals[index];
}

const flagsWithValues = new Set(["--project", "--prefab", "--position", "--rotation", "--scale", "--mode", "--target", "--module", "--export", "--resource"]);

function parseTransformVectors(argv: readonly string[]): { diagnostic?: string; value?: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] } } {
  const value: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] } = {};
  for (const [flag, key] of [
    ["--position", "position"],
    ["--rotation", "rotation"],
    ["--scale", "scale"],
  ] as const) {
    const raw = readFlag(argv, flag);
    if (raw === undefined) {
      continue;
    }
    const vector = parseVector3(raw);
    if (vector === undefined) {
      return { diagnostic: "TN_SCENE_VECTOR_INVALID" };
    }
    value[key] = vector;
  }
  return { value };
}

function parseVector3(raw: string): [number, number, number] | undefined {
  const parts = raw.split(",").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}
