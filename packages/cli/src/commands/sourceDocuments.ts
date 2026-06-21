import {
  addInputAction,
  addPrefabComponent,
  addUiText,
  attachSystemScript,
  bindUiDocument,
  createMaterial,
  createMeshPrimitive,
  createPrefabDocument,
  createSystem,
  createUiDocument,
  setMaterial,
  setUiLayout,
  type IAuthoringOperationResult,
} from "@threenative/authoring";
import { isAbsolute, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";

interface ISourceCommandOptions {
  cwd?: string;
}

export async function uiCommand(argv: readonly string[], options: ISourceCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);

  if (subcommand === "create") {
    const uiDocId = readPositional(normalizedArgv, 1);
    if (uiDocId === undefined) {
      return renderUsage(json, "TN_UI_CREATE_ARGS_MISSING", "Usage: tn ui create <ui-doc-id> [--project <path>] [--json]");
    }
    return renderAuthoringResult("ui", await createUiDocument({ projectPath, uiDocId }), json, `UI document '${uiDocId}' created.`);
  }

  if (subcommand === "add-text") {
    const uiDocId = readPositional(normalizedArgv, 1);
    const nodeId = readPositional(normalizedArgv, 2);
    const text = readFlag(normalizedArgv, "--text");
    if (uiDocId === undefined || nodeId === undefined || text === undefined) {
      return renderUsage(json, "TN_UI_ADD_TEXT_ARGS_MISSING", "Usage: tn ui add-text <ui-doc-id> <node-id> --text <text> [--project <path>] [--json]");
    }
    return renderAuthoringResult("ui", await addUiText({ projectPath, uiDocId, nodeId, text }), json, `UI text node '${nodeId}' added.`);
  }

  if (subcommand === "set-layout") {
    const uiDocId = readPositional(normalizedArgv, 1);
    const nodeId = readPositional(normalizedArgv, 2);
    if (uiDocId === undefined || nodeId === undefined) {
      return renderUsage(json, "TN_UI_SET_LAYOUT_ARGS_MISSING", "Usage: tn ui set-layout <ui-doc-id> <node-id> [--justify <value>] [--align <value>] [--top <n>] [--height <n>] [--width <n>] [--project <path>] [--json]");
    }
    const numbers = parseNumberFlags(normalizedArgv, ["--top", "--height", "--width"]);
    if (numbers.diagnostic !== undefined) {
      return renderUsage(json, numbers.diagnostic, "Layout numeric flags must be finite numbers.");
    }
    return renderAuthoringResult(
      "ui",
      await setUiLayout({
        projectPath,
        uiDocId,
        nodeId,
        align: readFlag(normalizedArgv, "--align"),
        height: numbers.values["--height"],
        justify: readFlag(normalizedArgv, "--justify"),
        top: numbers.values["--top"],
        width: numbers.values["--width"],
      }),
      json,
      `UI layout for '${nodeId}' updated.`,
    );
  }

  if (subcommand === "bind") {
    const uiDocId = readPositional(normalizedArgv, 1);
    const nodeId = readPositional(normalizedArgv, 2);
    const resourcePath = readFlag(normalizedArgv, "--resource");
    if (uiDocId === undefined || nodeId === undefined || resourcePath === undefined) {
      return renderUsage(json, "TN_UI_BIND_ARGS_MISSING", "Usage: tn ui bind <ui-doc-id> <node-id> --resource <resource.path> [--project <path>] [--json]");
    }
    return renderAuthoringResult("ui", await bindUiDocument({ projectPath, uiDocId, nodeId, resourcePath }), json, `UI node '${nodeId}' bound.`);
  }

  return renderUsage(json, "TN_UI_COMMAND_UNKNOWN", "Usage: tn ui create|add-text|set-layout|bind ... [--json]");
}

export async function materialCommand(argv: readonly string[], options: ISourceCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);
  const materialId = readPositional(normalizedArgv, 1);

  if (subcommand === "create") {
    if (materialId === undefined) {
      return renderUsage(json, "TN_MATERIAL_CREATE_ARGS_MISSING", "Usage: tn material create <material-id> [--project <path>] [--json]");
    }
    return renderAuthoringResult("material", await createMaterial({ projectPath, materialId }), json, `Material '${materialId}' created.`);
  }

  if (subcommand === "set") {
    if (materialId === undefined) {
      return renderUsage(json, "TN_MATERIAL_SET_ARGS_MISSING", "Usage: tn material set <material-id> [--color <css-color>] [--roughness <n>] [--project <path>] [--json]");
    }
    const roughness = parseOptionalNumber(normalizedArgv, "--roughness");
    if (roughness.diagnostic !== undefined) {
      return renderUsage(json, roughness.diagnostic, "Material roughness must be a finite number.");
    }
    return renderAuthoringResult("material", await setMaterial({ projectPath, materialId, color: readFlag(normalizedArgv, "--color"), roughness: roughness.value }), json, `Material '${materialId}' updated.`);
  }

  return renderUsage(json, "TN_MATERIAL_COMMAND_UNKNOWN", "Usage: tn material create|set ... [--json]");
}

export async function meshCommand(argv: readonly string[], options: ISourceCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);
  const meshId = readPositional(normalizedArgv, 1);
  const kind = readFlag(normalizedArgv, "--kind");
  if (normalizedArgv[0] !== "primitive" || meshId === undefined || kind === undefined) {
    return renderUsage(json, "TN_MESH_PRIMITIVE_ARGS_MISSING", "Usage: tn mesh primitive <mesh-id> --kind <box|sphere|cylinder|cone|plane> [--project <path>] [--json]");
  }
  return renderAuthoringResult("mesh", await createMeshPrimitive({ projectPath, meshId, kind }), json, `Mesh '${meshId}' created.`);
}

export async function prefabCommand(argv: readonly string[], options: ISourceCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);
  const prefabId = readPositional(normalizedArgv, 1);

  if (subcommand === "create") {
    if (prefabId === undefined) {
      return renderUsage(json, "TN_PREFAB_CREATE_ARGS_MISSING", "Usage: tn prefab create <prefab-id> [--project <path>] [--json]");
    }
    return renderAuthoringResult("prefab", await createPrefabDocument({ projectPath, prefabId }), json, `Prefab '${prefabId}' created.`);
  }

  if (subcommand === "add-component") {
    const componentKind = readPositional(normalizedArgv, 2);
    const parsedValue = parseJsonFlag(normalizedArgv, "--value");
    if (parsedValue.diagnostic !== undefined) {
      return renderUsage(json, parsedValue.diagnostic, "Component value must be a valid JSON object.");
    }
    if (prefabId === undefined || componentKind === undefined || parsedValue.value === undefined) {
      return renderUsage(json, "TN_PREFAB_ADD_COMPONENT_ARGS_MISSING", "Usage: tn prefab add-component <prefab-id> <component> --value <json-object> [--project <path>] [--json]");
    }
    if (!isRecord(parsedValue.value)) {
      return renderUsage(json, "TN_PREFAB_COMPONENT_VALUE_INVALID", "Component value must be a valid JSON object.");
    }
    return renderAuthoringResult("prefab", await addPrefabComponent({ projectPath, prefabId, componentKind, value: parsedValue.value }), json, `Component '${componentKind}' added to prefab '${prefabId}'.`);
  }

  return renderUsage(json, "TN_PREFAB_COMMAND_UNKNOWN", "Usage: tn prefab create|add-component ... [--json]");
}

export async function inputCommand(argv: readonly string[], options: ISourceCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);
  const inputDocId = readPositional(normalizedArgv, 1);
  const actionId = readPositional(normalizedArgv, 2);
  const keys = readFlag(normalizedArgv, "--keys")?.split(",").map((key) => key.trim()).filter((key) => key.length > 0);
  if (normalizedArgv[0] !== "add-action" || inputDocId === undefined || actionId === undefined || keys === undefined || keys.length === 0) {
    return renderUsage(json, "TN_INPUT_ADD_ACTION_ARGS_MISSING", "Usage: tn input add-action <input-doc-id> <action-id> --keys <key,key> [--project <path>] [--json]");
  }
  return renderAuthoringResult("input", await addInputAction({ projectPath, inputDocId, actionId, keys }), json, `Input action '${actionId}' added.`);
}

export async function systemCommand(argv: readonly string[], options: ISourceCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);
  const systemId = readPositional(normalizedArgv, 1);

  if (subcommand === "create") {
    const schedule = readFlag(normalizedArgv, "--schedule");
    if (systemId === undefined || schedule === undefined) {
      return renderUsage(json, "TN_SYSTEM_CREATE_ARGS_MISSING", "Usage: tn system create <system-id> --schedule <schedule> [--project <path>] [--json]");
    }
    return renderAuthoringResult("system", await createSystem({ projectPath, systemId, schedule }), json, `System '${systemId}' created.`);
  }

  if (subcommand === "attach-script") {
    const modulePath = readFlag(normalizedArgv, "--module");
    const exportName = readFlag(normalizedArgv, "--export");
    if (systemId === undefined || modulePath === undefined || exportName === undefined) {
      return renderUsage(json, "TN_SYSTEM_ATTACH_SCRIPT_ARGS_MISSING", "Usage: tn system attach-script <system-id> --module <path> --export <name> [--project <path>] [--json]");
    }
    return renderAuthoringResult("system", await attachSystemScript({ projectPath, systemId, modulePath, exportName }), json, `Script attached to system '${systemId}'.`);
  }

  return renderUsage(json, "TN_SYSTEM_COMMAND_UNKNOWN", "Usage: tn system create|attach-script ... [--json]");
}

function renderAuthoringResult(group: string, result: IAuthoringOperationResult, json: boolean, successMessage: string): ICommandResult {
  const payload = {
    code: result.ok ? `TN_${group.toUpperCase()}_OK` : `TN_${group.toUpperCase()}_FAILED`,
    message: result.ok ? successMessage : `${group} operation failed.`,
    ...result,
  };
  if (json) {
    return { exitCode: result.ok ? 0 : 1, stdout: `${JSON.stringify(payload, null, 2)}\n` };
  }
  if (result.ok) {
    return { exitCode: 0, stdout: `${successMessage}\n` };
  }
  const diagnostics = result.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.file ?? ""}${diagnostic.path ?? ""}: ${diagnostic.message}`).join("\n");
  return { exitCode: 1, stderr: `${payload.message}\n${diagnostics}\n`, stdout: "" };
}

function renderUsage(json: boolean, code: string, usage: string): ICommandResult {
  const payload = { code, message: usage, severity: "error" };
  return { exitCode: 2, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${usage}\n` };
}

function normalizeArgv(argv: readonly string[]): readonly string[] {
  return argv[0] === "--" ? argv.slice(1) : argv;
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

function parseJsonFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: unknown } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { diagnostic: "TN_AUTHORING_JSON_VALUE_INVALID" };
  }
}

function parseOptionalNumber(argv: readonly string[], flag: string): { diagnostic?: string; value?: number } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const value = Number(raw);
  return Number.isFinite(value) ? { value } : { diagnostic: "TN_AUTHORING_NUMBER_INVALID" };
}

function parseNumberFlags(argv: readonly string[], flags: readonly string[]): { diagnostic?: string; values: Record<string, number | undefined> } {
  const values: Record<string, number | undefined> = {};
  for (const flag of flags) {
    const parsed = parseOptionalNumber(argv, flag);
    if (parsed.diagnostic !== undefined) {
      return { diagnostic: parsed.diagnostic, values };
    }
    values[flag] = parsed.value;
  }
  return { values };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const flagsWithValues = new Set([
  "--align",
  "--color",
  "--export",
  "--height",
  "--keys",
  "--kind",
  "--module",
  "--project",
  "--resource",
  "--roughness",
  "--schedule",
  "--text",
  "--top",
  "--value",
  "--width",
  "--justify",
]);
