import {
  addAudioSound,
  addInputAction,
  addInputAxis,
  addPrefabComponent,
  addUiNodeDocument,
  addUiText,
  attachSystemScript,
  bindUiDocument,
  createAudioDocument,
  createEnvironmentDocument,
  createMaterial,
  createMeshPrimitive,
  createPrefabDocument,
  createRuntimeConfig,
  createSystem,
  createUiDocument,
  setMaterial,
  setEnvironmentMap,
  setEnvironmentSkybox,
  setEnvironmentTerrain,
  setRuntimeRendering,
  setRuntimeWindow,
  setUiLayout,
  setUiStyle,
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

  if (subcommand === "add-node") {
    const uiDocId = readPositional(normalizedArgv, 1);
    const nodeId = readPositional(normalizedArgv, 2);
    const type = readFlag(normalizedArgv, "--type");
    const value = parseOptionalNumber(normalizedArgv, "--value");
    if (value.diagnostic !== undefined) {
      return renderUsage(json, value.diagnostic, "UI node value must be a finite number.");
    }
    if (uiDocId === undefined || nodeId === undefined || type === undefined) {
      return renderUsage(json, "TN_UI_ADD_NODE_ARGS_MISSING", "Usage: tn ui add-node <ui-doc-id> <node-id> --type <text|button|image|bar|slider|row|column|stack> [--label <label>] [--text <text>] [--action <action-id>] [--src <asset-id-or-path>] [--value <n>] [--project <path>] [--json]");
    }
    return renderAuthoringResult(
      "ui",
      await addUiNodeDocument({
        action: readFlag(normalizedArgv, "--action"),
        label: readFlag(normalizedArgv, "--label"),
        nodeId,
        projectPath,
        src: readFlag(normalizedArgv, "--src"),
        text: readFlag(normalizedArgv, "--text"),
        type,
        uiDocId,
        value: value.value,
      }),
      json,
      `UI node '${nodeId}' added.`,
    );
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

  if (subcommand === "set-style") {
    const uiDocId = readPositional(normalizedArgv, 1);
    const nodeId = readPositional(normalizedArgv, 2);
    if (uiDocId === undefined || nodeId === undefined) {
      return renderUsage(json, "TN_UI_SET_STYLE_ARGS_MISSING", uiSetStyleUsage());
    }
    const numbers = parseNumberFlags(normalizedArgv, ["--border-radius", "--border-width", "--font-size", "--opacity"]);
    if (numbers.diagnostic !== undefined) {
      return renderUsage(json, numbers.diagnostic, "Style numeric flags must be finite numbers.");
    }
    const wrap = parseOptionalBoolean(normalizedArgv, "--wrap");
    if (wrap.diagnostic !== undefined) {
      return renderUsage(json, wrap.diagnostic, "Style --wrap must be true or false.");
    }
    return renderAuthoringResult(
      "ui",
      await setUiStyle({
        backgroundColor: readFlag(normalizedArgv, "--background-color"),
        borderColor: readFlag(normalizedArgv, "--border-color"),
        borderRadius: numbers.values["--border-radius"],
        borderWidth: numbers.values["--border-width"],
        color: readFlag(normalizedArgv, "--color"),
        fontSize: numbers.values["--font-size"],
        fontWeight: readFlag(normalizedArgv, "--font-weight"),
        nodeId,
        opacity: numbers.values["--opacity"],
        projectPath,
        textAlign: readFlag(normalizedArgv, "--text-align"),
        textDecoration: readFlag(normalizedArgv, "--text-decoration"),
        uiDocId,
        wrap: wrap.value,
      }),
      json,
      `UI style for '${nodeId}' updated.`,
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

  return renderUsage(json, "TN_UI_COMMAND_UNKNOWN", "Usage: tn ui create|add-text|add-node|set-layout|set-style|bind ... [--json]");
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
      return renderUsage(json, "TN_MATERIAL_SET_ARGS_MISSING", materialSetUsage());
    }
    const numbers = parseNumberFlags(normalizedArgv, [
      "--alpha-cutoff",
      "--clearcoat",
      "--clearcoat-roughness",
      "--emissive-intensity",
      "--metalness",
      "--opacity",
      "--roughness",
      "--transmission",
    ]);
    if (numbers.diagnostic !== undefined) {
      return renderUsage(json, numbers.diagnostic, "Material numeric flags must be finite numbers.");
    }
    return renderAuthoringResult(
      "material",
      await setMaterial({
        alphaCutoff: numbers.values["--alpha-cutoff"],
        alphaMode: readFlag(normalizedArgv, "--alpha-mode"),
        baseColorTexture: readFlag(normalizedArgv, "--base-color-texture"),
        clearcoat: numbers.values["--clearcoat"],
        clearcoatRoughness: numbers.values["--clearcoat-roughness"],
        clearcoatRoughnessTexture: readFlag(normalizedArgv, "--clearcoat-roughness-texture"),
        clearcoatTexture: readFlag(normalizedArgv, "--clearcoat-texture"),
        color: readFlag(normalizedArgv, "--color"),
        emissive: readFlag(normalizedArgv, "--emissive"),
        emissiveIntensity: numbers.values["--emissive-intensity"],
        emissiveTexture: readFlag(normalizedArgv, "--emissive-texture"),
        materialId,
        metallicRoughnessTexture: readFlag(normalizedArgv, "--metallic-roughness-texture"),
        metalness: numbers.values["--metalness"],
        normalTexture: readFlag(normalizedArgv, "--normal-texture"),
        occlusionTexture: readFlag(normalizedArgv, "--occlusion-texture"),
        opacity: numbers.values["--opacity"],
        projectPath,
        roughness: numbers.values["--roughness"],
        transmission: numbers.values["--transmission"],
        transmissionTexture: readFlag(normalizedArgv, "--transmission-texture"),
      }),
      json,
      `Material '${materialId}' updated.`,
    );
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
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);
  const inputDocId = readPositional(normalizedArgv, 1);

  if (subcommand === "add-action") {
    const actionId = readPositional(normalizedArgv, 2);
    const keys = readCsvFlag(normalizedArgv, "--keys");
    if (inputDocId === undefined || actionId === undefined || keys === undefined || keys.length === 0) {
      return renderUsage(json, "TN_INPUT_ADD_ACTION_ARGS_MISSING", "Usage: tn input add-action <input-doc-id> <action-id> --keys <key,key> [--project <path>] [--json]");
    }
    return renderAuthoringResult("input", await addInputAction({ projectPath, inputDocId, actionId, keys }), json, `Input action '${actionId}' added.`);
  }

  if (subcommand === "add-axis") {
    const axisId = readPositional(normalizedArgv, 2);
    const negativeKeys = readCsvFlag(normalizedArgv, "--negative-keys");
    const positiveKeys = readCsvFlag(normalizedArgv, "--positive-keys");
    if (inputDocId === undefined || axisId === undefined || negativeKeys === undefined || negativeKeys.length === 0 || positiveKeys === undefined || positiveKeys.length === 0) {
      return renderUsage(json, "TN_INPUT_ADD_AXIS_ARGS_MISSING", "Usage: tn input add-axis <input-doc-id> <axis-id> --negative-keys <key,key> --positive-keys <key,key> [--value <binding>] [--project <path>] [--json]");
    }
    return renderAuthoringResult("input", await addInputAxis({ axisId, inputDocId, negativeKeys, positiveKeys, projectPath, value: readFlag(normalizedArgv, "--value") }), json, `Input axis '${axisId}' added.`);
  }

  return renderUsage(json, "TN_INPUT_COMMAND_UNKNOWN", "Usage: tn input add-action|add-axis ... [--json]");
}

export async function audioCommand(argv: readonly string[], options: ISourceCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);
  const audioDocId = readPositional(normalizedArgv, 1);

  if (subcommand === "create") {
    if (audioDocId === undefined) {
      return renderUsage(json, "TN_AUDIO_CREATE_ARGS_MISSING", "Usage: tn audio create <audio-doc-id> [--project <path>] [--json]");
    }
    return renderAuthoringResult("audio", await createAudioDocument({ audioDocId, projectPath }), json, `Audio document '${audioDocId}' created.`);
  }

  if (subcommand === "add-sound") {
    const soundId = readPositional(normalizedArgv, 2);
    const asset = readFlag(normalizedArgv, "--asset");
    if (audioDocId === undefined || soundId === undefined || asset === undefined) {
      return renderUsage(json, "TN_AUDIO_ADD_SOUND_ARGS_MISSING", "Usage: tn audio add-sound <audio-doc-id> <sound-id> --asset <asset-id-or-path> [--project <path>] [--json]");
    }
    return renderAuthoringResult("audio", await addAudioSound({ asset, audioDocId, projectPath, soundId }), json, `Audio sound '${soundId}' added.`);
  }

  return renderUsage(json, "TN_AUDIO_COMMAND_UNKNOWN", "Usage: tn audio create|add-sound ... [--json]");
}

export async function environmentCommand(argv: readonly string[], options: ISourceCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);
  const environmentId = readPositional(normalizedArgv, 1);

  if (subcommand === "create") {
    if (environmentId === undefined) {
      return renderUsage(json, "TN_ENVIRONMENT_CREATE_ARGS_MISSING", "Usage: tn environment create <environment-id> [--project <path>] [--json]");
    }
    return renderAuthoringResult("environment", await createEnvironmentDocument({ environmentId, projectPath }), json, `Environment document '${environmentId}' created.`);
  }

  if (subcommand === "set-skybox") {
    const asset = readFlag(normalizedArgv, "--asset");
    if (environmentId === undefined || asset === undefined) {
      return renderUsage(json, "TN_ENVIRONMENT_SET_SKYBOX_ARGS_MISSING", "Usage: tn environment set-skybox <environment-id> --asset <asset-id-or-path> [--mode equirect|cube|color] [--project <path>] [--json]");
    }
    return renderAuthoringResult("environment", await setEnvironmentSkybox({ asset, environmentId, mode: readFlag(normalizedArgv, "--mode"), projectPath }), json, `Environment skybox '${environmentId}' updated.`);
  }

  if (subcommand === "set-map") {
    const asset = readFlag(normalizedArgv, "--asset");
    if (environmentId === undefined || asset === undefined) {
      return renderUsage(json, "TN_ENVIRONMENT_SET_MAP_ARGS_MISSING", "Usage: tn environment set-map <environment-id> --asset <asset-id-or-path> [--project <path>] [--json]");
    }
    return renderAuthoringResult("environment", await setEnvironmentMap({ asset, environmentId, projectPath }), json, `Environment map '${environmentId}' updated.`);
  }

  if (subcommand === "set-terrain") {
    if (environmentId === undefined) {
      return renderUsage(json, "TN_ENVIRONMENT_SET_TERRAIN_ARGS_MISSING", environmentSetTerrainUsage());
    }
    return renderAuthoringResult(
      "environment",
      await setEnvironmentTerrain({
        environmentId,
        heightmap: readFlag(normalizedArgv, "--heightmap"),
        heightMode: readFlag(normalizedArgv, "--height-mode"),
        projectPath,
        terrainId: readFlag(normalizedArgv, "--id"),
      }),
      json,
      `Environment terrain '${environmentId}' updated.`,
    );
  }

  return renderUsage(json, "TN_ENVIRONMENT_COMMAND_UNKNOWN", "Usage: tn environment create|set-skybox|set-map|set-terrain ... [--json]");
}

export async function runtimeCommand(argv: readonly string[], options: ISourceCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);
  const runtimeId = readPositional(normalizedArgv, 1);

  if (subcommand === "create") {
    if (runtimeId === undefined) {
      return renderUsage(json, "TN_RUNTIME_CREATE_ARGS_MISSING", "Usage: tn runtime create <runtime-id> [--project <path>] [--json]");
    }
    return renderAuthoringResult("runtime", await createRuntimeConfig({ projectPath, runtimeId }), json, `Runtime config '${runtimeId}' created.`);
  }

  if (subcommand === "set-window") {
    if (runtimeId === undefined) {
      return renderUsage(json, "TN_RUNTIME_SET_WINDOW_ARGS_MISSING", runtimeSetWindowUsage());
    }
    const numbers = parseNumberFlags(normalizedArgv, ["--height", "--width"]);
    if (numbers.diagnostic !== undefined) {
      return renderUsage(json, numbers.diagnostic, "Runtime window numeric flags must be finite numbers.");
    }
    return renderAuthoringResult(
      "runtime",
      await setRuntimeWindow({
        height: numbers.values["--height"],
        projectPath,
        runtimeId,
        title: readFlag(normalizedArgv, "--title"),
        width: numbers.values["--width"],
      }),
      json,
      `Runtime window '${runtimeId}' updated.`,
    );
  }

  if (subcommand === "set-rendering") {
    if (runtimeId === undefined) {
      return renderUsage(json, "TN_RUNTIME_SET_RENDERING_ARGS_MISSING", runtimeSetRenderingUsage());
    }
    const numbers = parseNumberFlags(normalizedArgv, ["--bloom-intensity", "--bloom-threshold"]);
    if (numbers.diagnostic !== undefined) {
      return renderUsage(json, numbers.diagnostic, "Runtime rendering numeric flags must be finite numbers.");
    }
    const bloom = parseOptionalBoolean(normalizedArgv, "--bloom");
    if (bloom.diagnostic !== undefined) {
      return renderUsage(json, bloom.diagnostic, "Runtime --bloom must be true or false.");
    }
    return renderAuthoringResult(
      "runtime",
      await setRuntimeRendering({
        antialias: readFlag(normalizedArgv, "--antialias"),
        bloomEnabled: bloom.value,
        bloomIntensity: numbers.values["--bloom-intensity"],
        bloomThreshold: numbers.values["--bloom-threshold"],
        projectPath,
        renderPath: readFlag(normalizedArgv, "--render-path"),
        runtimeId,
      }),
      json,
      `Runtime rendering '${runtimeId}' updated.`,
    );
  }

  return renderUsage(json, "TN_RUNTIME_COMMAND_UNKNOWN", "Usage: tn runtime create|set-window|set-rendering ... [--json]");
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

function materialSetUsage(): string {
  return "Usage: tn material set <material-id> [--color <css-color>] [--roughness <n>] [--metalness <n>] [--emissive <css-color>] [--emissive-intensity <n>] [--alpha-mode opaque|mask|blend] [--alpha-cutoff <n>] [--opacity <n>] [--base-color-texture <asset-id>] [--normal-texture <asset-id>] [--metallic-roughness-texture <asset-id>] [--emissive-texture <asset-id>] [--occlusion-texture <asset-id>] [--clearcoat <n>] [--clearcoat-roughness <n>] [--clearcoat-texture <asset-id>] [--clearcoat-roughness-texture <asset-id>] [--transmission <n>] [--transmission-texture <asset-id>] [--project <path>] [--json]";
}

function uiSetStyleUsage(): string {
  return "Usage: tn ui set-style <ui-doc-id> <node-id> [--color <css-color>] [--background-color <css-color>] [--font-size <n>] [--font-weight <value>] [--text-align left|center|right] [--opacity <n>] [--border-radius <n>] [--border-width <n>] [--border-color <css-color>] [--wrap true|false] [--project <path>] [--json]";
}

function environmentSetTerrainUsage(): string {
  return "Usage: tn environment set-terrain <environment-id> [--id <terrain-id>] [--height-mode flat|heightmap] [--heightmap <asset-id-or-path>] [--project <path>] [--json]";
}

function runtimeSetWindowUsage(): string {
  return "Usage: tn runtime set-window <runtime-id> [--width <n>] [--height <n>] [--title <title>] [--project <path>] [--json]";
}

function runtimeSetRenderingUsage(): string {
  return "Usage: tn runtime set-rendering <runtime-id> [--antialias none|msaa2|msaa4|msaa8|fxaa|taa|smaa] [--bloom true|false] [--bloom-intensity <n>] [--bloom-threshold <n>] [--render-path forward] [--project <path>] [--json]";
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

function readCsvFlag(argv: readonly string[], flag: string): string[] | undefined {
  return readFlag(argv, flag)?.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
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

function parseOptionalBoolean(argv: readonly string[], flag: string): { diagnostic?: string; value?: boolean } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  if (raw !== "true" && raw !== "false") {
    return { diagnostic: "TN_AUTHORING_BOOLEAN_INVALID" };
  }
  return { value: raw === "true" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const flagsWithValues = new Set([
  "--align",
  "--alpha-cutoff",
  "--alpha-mode",
  "--asset",
  "--action",
  "--antialias",
  "--background-color",
  "--base-color-texture",
  "--border-color",
  "--border-radius",
  "--border-width",
  "--bloom",
  "--bloom-intensity",
  "--bloom-threshold",
  "--clearcoat",
  "--clearcoat-roughness",
  "--clearcoat-roughness-texture",
  "--clearcoat-texture",
  "--color",
  "--emissive",
  "--emissive-intensity",
  "--emissive-texture",
  "--export",
  "--height",
  "--height-mode",
  "--heightmap",
  "--id",
  "--keys",
  "--kind",
  "--label",
  "--metallic-roughness-texture",
  "--metalness",
  "--module",
  "--mode",
  "--negative-keys",
  "--normal-texture",
  "--occlusion-texture",
  "--opacity",
  "--positive-keys",
  "--project",
  "--resource",
  "--roughness",
  "--schedule",
  "--render-path",
  "--src",
  "--type",
  "--text-align",
  "--text-decoration",
  "--text",
  "--top",
  "--title",
  "--transmission",
  "--transmission-texture",
  "--value",
  "--width",
  "--wrap",
  "--justify",
]);
