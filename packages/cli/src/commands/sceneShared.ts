import {
  type IAuthoringOperationResult,
  type ICreateSceneResult,
  type IInspectSceneResult,
} from "@threenative/authoring";
import { isAbsolute, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";

export type SceneRecord = Record<string, unknown>;
export type ModularTrackLayout = Array<{
  asset: string;
  center: [number, number] | [number, number, number];
  yaw: 0 | 90 | 180 | 270;
}>;
export type ModularTrackSize = "large" | "medium" | "small";
export type ModularConnectorDirection = "east" | "north" | "south" | "west";

export function renderCreateSceneResult(result: ICreateSceneResult, json: boolean): ICommandResult {
  const message = result.ok ? `Scene '${result.sceneId}' created.` : `Scene '${result.sceneId}' was not created.`;
  const payload = {
    code: result.ok ? "TN_SCENE_OK" : "TN_SCENE_FAILED",
    message,
    sceneId: result.sceneId,
    file: result.file,
    changed: result.changed,
    diagnostics: result.diagnostics,
    nextCommands: result.nextCommands,
  };

  if (json) {
    return {
      exitCode: result.ok ? 0 : 1,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  if (result.ok) {
    return {
      exitCode: 0,
      stdout: `${message}\nFile: ${result.file}\nNext:\n${result.nextCommands.map((command) => `  ${command}`).join("\n")}\n`,
    };
  }

  const diagnostics = result.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.file ?? ""}${diagnostic.path ?? ""}: ${diagnostic.message}`).join("\n");
  return {
    exitCode: 1,
    stderr: `${message}\n${diagnostics}\n`,
    stdout: "",
  };
}

export function renderSceneResult(result: IAuthoringOperationResult | IInspectSceneResult, json: boolean, message: string): ICommandResult {
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

export function renderGeneratedModularTrackResult(
  result: IAuthoringOperationResult & { prefix: string; tileCount: number },
  metadata: { shape: string; size: ModularTrackSize | undefined; straightCount: number | undefined },
  json: boolean,
  message: string,
): ICommandResult {
  if (json) {
    const payload = {
      code: result.ok ? "TN_SCENE_OK" : "TN_SCENE_FAILED",
      message,
      ...result,
      ...metadata,
    };
    return {
      exitCode: result.ok ? 0 : 1,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  if (result.ok) {
    return {
      exitCode: 0,
      stdout: `${message}\nTiles: ${result.tileCount}\n`,
    };
  }

  const diagnostics = result.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.file ?? ""}${diagnostic.path ?? ""}: ${diagnostic.message}`).join("\n");
  return {
    exitCode: 1,
    stderr: `${message}\n${diagnostics}\n`,
    stdout: "",
  };
}

export function renderUsage(json: boolean, code: string, usage: string): ICommandResult {
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

export function resolveProjectPath(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): string {
  const project = readFlag(argv, "--project") ?? ".";
  return isAbsolute(project) ? project : resolve(cwd, project);
}

export function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export function parseJsonFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: unknown } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { diagnostic: "TN_SCENE_JSON_VALUE_INVALID" };
  }
}

export function parseJsonObjectFlag(argv: readonly string[], flag: string, diagnostic: string): { diagnostic?: string; value?: Record<string, unknown> } {
  const parsed = parseJsonFlag(argv, flag);
  if (parsed.diagnostic !== undefined) {
    return { diagnostic: parsed.diagnostic };
  }
  if (parsed.value === undefined) {
    return {};
  }
  return isRecord(parsed.value) ? { value: parsed.value } : { diagnostic };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readPositional(argv: readonly string[], index: number): string | undefined {
  const positionals = argv.filter((arg, argIndex) => {
    if (arg.startsWith("--")) {
      return false;
    }
    const previous = argv[argIndex - 1];
    return !flagsWithValues.has(previous ?? "");
  });
  return positionals[index];
}

const flagsWithValues = new Set(["--project", "--file", "--world", "--prefab", "--primitive", "--color", "--asset", "--asset-dir", "--layout", "--prefix", "--path", "--value", "--position", "--rotation", "--rotation-deg", "--scale", "--components", "--origin", "--spacing", "--mode", "--target", "--module", "--export", "--resource", "--out", "--web-url", "--camera", "--native-frame", "--kind", "--activation", "--name", "--node", "--intensity", "--range", "--angle", "--mesh", "--material", "--mass", "--damping", "--gravity-scale", "--size", "--radius", "--height", "--speed", "--move-x", "--move-z", "--grounding", "--slope-limit", "--step-offset", "--visible", "--cast-shadow", "--receive-shadow", "--trigger", "--blocking", "--shape", "--straight-count", "--min-occupancy", "--max-roll"]);

export function sceneUsage(): string {
  return "Usage: tn scene create <scene-id> [--file <path>] [--project <path>] [--json]\n       tn scene add-prefab-instance <scene-id> <instance-id> --prefab <prefab-id> [--position x,y,z] [--components <json-object>] [--replace] [--project <path>] [--json]\n       tn scene layout ten-pin <scene-id> --prefab <prefab-id> [--prefix pin] [--origin x,y,z] [--spacing n] [--replace] [--project <path>] [--json]\n       tn scene add-tag <scene-id> <entity-id> <tag> [--project <path>] [--json]\n       tn scene add-group <scene-id> <group-id> [--name <label>] [--position x,y,z] [--project <path>] [--json]\n       tn scene set-camera-look-at <scene-id> <camera-id> --position x,y,z --target x,y,z [--project <path>] [--json]\n       tn scene proof-camera <scene-id> --camera <camera-id> --target <entity-id> [--min-occupancy <n>] [--max-roll <radians>] [--project <path>] [--json]\n       tn scene generate-modular-track <scene-id> --asset-dir <path> [--shape oval] [--size small|medium|large] [--straight-count <odd-number>] [--prefix <id-prefix>] [--project <path>] [--json]\n       tn scene add-modular-track <scene-id> --asset-dir <path> --layout <json-array> [--prefix <id-prefix>] [--project <path>] [--json]\n       tn scene proof-modular-track <scene-id> --asset-dir <path> [--prefix <id-prefix>] [--actors <entity-id,...>] [--project <path>] [--json]\n       tn scene lifecycle add <scene-id> [--kind <kind>] [--activation <policy>] [--initial] [--project <path>] [--json]\n       tn scene validate [scene-id] [--project <path>] [--json]\n       tn scene inspect <scene-id> [--node <id>] [--project <path>] [--json]\n       tn scene proof <scene-id> --project <path> --out <dir> [--web-url <url>] [--native] [--json]";
}

export function sceneLifecycleUsage(): string {
  return "Usage: tn scene lifecycle add <scene-id> [--kind <credits|cutscene|level|loading|menu|overlay|system>] [--activation <additive|exclusive|loading|overlay|persistent>] [--initial] [--project <path>] [--json]";
}

export function sceneAddComponentUsage(): string {
  return "Usage: tn scene add-component <scene-id> <entity-id> camera [--mode <perspective|orthographic|third-person-follow>] [--target <entity-id>] [--fov-y <n>] [--near <n>] [--far <n>] [--size <n>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> light [--kind <ambient|directional|point|spot>] [--intensity <n>] [--color <css-color>] [--range <n>] [--angle <n>] [--shadow-bias <n>] [--shadow-normal-bias <n>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> mesh-renderer --mesh <mesh-id> --material <material-id> [--visible <true|false>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> render-layers --layers <layer-a,layer-b> [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> visibility [--visible <true|false>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> rigid-body [--kind <dynamic|kinematic|static>] [--mass <n>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> collider [--kind <box|sphere|capsule|cylinder|mesh>] [--size x,y,z] [--radius <n>] [--height <n>] [--trigger <true|false>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> character-controller [--move-x <axis>] [--move-z <axis>] [--speed <n>] [--project <path>] [--json]";
}

export function parseNumberFlags(argv: readonly string[], flags: readonly string[]): { diagnostic?: string; values: Record<string, number | undefined> } {
  const values: Record<string, number | undefined> = {};
  for (const flag of flags) {
    const raw = readFlag(argv, flag);
    if (raw === undefined) {
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return { diagnostic: "TN_SCENE_NUMBER_INVALID", values };
    }
    values[flag] = value;
  }
  return { values };
}

export function parseOptionalNumber(argv: readonly string[], flag: string): { diagnostic?: string; value?: number } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const value = Number(raw);
  return Number.isFinite(value) ? { value } : { diagnostic: "TN_SCENE_NUMBER_INVALID" };
}

export function parseBooleanFlags(argv: readonly string[], flags: readonly string[]): { diagnostic?: string; values: Record<string, boolean | undefined> } {
  const values: Record<string, boolean | undefined> = {};
  for (const flag of flags) {
    const raw = readFlag(argv, flag);
    if (raw === undefined) {
      continue;
    }
    if (raw !== "true" && raw !== "false") {
      return { diagnostic: "TN_SCENE_BOOLEAN_INVALID", values };
    }
    values[flag] = raw === "true";
  }
  return { values };
}

export function parseOptionalVectorFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: [number, number, number] } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const vector = parseVector3(raw);
  return vector === undefined ? { diagnostic: "TN_SCENE_VECTOR_INVALID" } : { value: vector };
}

export function parseStringListFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: string[] } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const values = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  return values.length === 0 ? { diagnostic: "TN_SCENE_STRING_LIST_INVALID" } : { value: values };
}

export function parseTransformVectors(argv: readonly string[]): { diagnostic?: string; value?: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] } } {
  const value: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] } = {};
  if (readFlag(argv, "--rotation") !== undefined && readFlag(argv, "--rotation-deg") !== undefined) {
    return { diagnostic: "TN_SCENE_ROTATION_FLAGS_CONFLICT" };
  }
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
  const rotationDeg = readFlag(argv, "--rotation-deg");
  if (rotationDeg !== undefined) {
    const vector = parseVector3(rotationDeg);
    if (vector === undefined) {
      return { diagnostic: "TN_SCENE_VECTOR_INVALID" };
    }
    value.rotation = vector.map((value) => round(value * Math.PI / 180)) as [number, number, number];
  }
  return { value };
}

export function parseVector3(raw: string): [number, number, number] | undefined {
  const parts = raw.split(",").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function cameraLookAtEuler(position: [number, number, number], target: [number, number, number]): [number, number, number] {
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const horizontal = Math.sqrt(dx * dx + dz * dz);
  if (horizontal === 0 && dy === 0) {
    return [0, 0, 0];
  }
  return [round(Math.atan2(dy, horizontal)), round(Math.atan2(-dx, -dz)), 0];
}

export function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((item) => Number.isFinite(item));
}

export function round(value: number): number {
  return Number(value.toFixed(6));
}
