import {
  addEntity,
  addGroup,
  addPrefab,
  addResource,
  addTag,
  addUiNode,
  attachScript,
  bindUi,
  createScene,
  importWorld,
  inspectScene,
  removeComponent,
  setCamera,
  setCameraComponent,
  setCharacterControllerComponent,
  setColliderComponent,
  setComponent,
  setLightComponent,
  setMeshRendererComponent,
  setPrefab,
  setRenderLayersComponent,
  setPrefabColor,
  setRigidBodyComponent,
  setResource,
  setSceneLifecycle,
  setTransform,
  setVisibilityComponent,
  validateScene,
  type IAuthoringOperationResult,
  type ICreateSceneResult,
  type IInspectSceneResult,
} from "@threenative/authoring";
import { isAbsolute, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";
import { sceneProofCommand } from "./sceneProof.js";

interface ISceneCommandOptions {
  cwd?: string;
}

export async function sceneCommand(argv: readonly string[], options: ISceneCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);

  if (subcommand === "create") {
    const sceneId = readPositional(normalizedArgv, 1);
    if (sceneId === undefined) {
      return renderUsage(json, "TN_SCENE_CREATE_ID_MISSING", "Usage: tn scene create <scene-id> [--file <path>] [--project <path>] [--json]");
    }
    const result = await createScene({ projectPath, sceneId, file: readFlag(normalizedArgv, "--file") });
    return renderCreateSceneResult(result, json);
  }

  if (subcommand === "import-world") {
    const sceneId = readPositional(normalizedArgv, 1);
    const worldFile = readFlag(normalizedArgv, "--world");
    if (sceneId === undefined || worldFile === undefined) {
      return renderUsage(json, "TN_SCENE_IMPORT_WORLD_ARGS_MISSING", "Usage: tn scene import-world <scene-id> --world <path/to/world.ir.json> [--file <path>] [--replace] [--project <path>] [--json]");
    }
    const result = await importWorld({ projectPath, sceneId, worldFile, file: readFlag(normalizedArgv, "--file"), replace: normalizedArgv.includes("--replace") });
    return renderSceneResult(result, json, result.ok ? `World imported into scene '${sceneId}'.` : `World was not imported into scene '${sceneId}'.`);
  }

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

  if (subcommand === "proof") {
    return sceneProofCommand(normalizedArgv.slice(1), { cwd: options.cwd });
  }

  if (subcommand === "lifecycle") {
    const action = readPositional(normalizedArgv, 1);
    const sceneId = readPositional(normalizedArgv, 2);
    if (action !== "add" || sceneId === undefined) {
      return renderUsage(json, "TN_SCENE_LIFECYCLE_ARGS_MISSING", sceneLifecycleUsage());
    }
    const result = await setSceneLifecycle({
      activation: readFlag(normalizedArgv, "--activation"),
      initial: normalizedArgv.includes("--initial") ? true : undefined,
      kind: readFlag(normalizedArgv, "--kind"),
      projectPath,
      sceneId,
    });
    return renderSceneResult(result, json, result.ok ? `Lifecycle metadata for '${sceneId}' updated.` : `Lifecycle metadata for '${sceneId}' was not updated.`);
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

  if (subcommand === "add-tag") {
    const sceneId = readPositional(normalizedArgv, 1);
    const entityId = readPositional(normalizedArgv, 2);
    const tag = readPositional(normalizedArgv, 3);
    if (sceneId === undefined || entityId === undefined || tag === undefined) {
      return renderUsage(json, "TN_SCENE_ADD_TAG_ARGS_MISSING", "Usage: tn scene add-tag <scene-id> <entity-id> <tag> [--project <path>] [--json]");
    }
    const result = await addTag({ projectPath, sceneId, entityId, tag });
    return renderSceneResult(result, json, result.ok ? `Tag '${tag}' added to '${entityId}'.` : `Tag '${tag}' was not added to '${entityId}'.`);
  }

  if (subcommand === "add-group") {
    const sceneId = readPositional(normalizedArgv, 1);
    const groupId = readPositional(normalizedArgv, 2);
    if (sceneId === undefined || groupId === undefined) {
      return renderUsage(json, "TN_SCENE_ADD_GROUP_ARGS_MISSING", "Usage: tn scene add-group <scene-id> <group-id> [--name <label>] [--position x,y,z] [--project <path>] [--json]");
    }
    const position = parseOptionalVectorFlag(normalizedArgv, "--position");
    if (position.diagnostic !== undefined) {
      return renderUsage(json, position.diagnostic, "Group --position must use x,y,z numeric values.");
    }
    const result = await addGroup({ projectPath, sceneId, groupId, name: readFlag(normalizedArgv, "--name"), position: position.value });
    return renderSceneResult(result, json, result.ok ? `Group '${groupId}' added.` : `Group '${groupId}' was not added.`);
  }

  if (subcommand === "add-prefab") {
    const sceneId = readPositional(normalizedArgv, 1);
    const prefabId = readPositional(normalizedArgv, 2);
    if (sceneId === undefined || prefabId === undefined) {
      return renderUsage(json, "TN_SCENE_ADD_PREFAB_ARGS_MISSING", "Usage: tn scene add-prefab <scene-id> <prefab-id> [--primitive <primitive>] [--color <css-color>] [--asset <path.glb>] [--project <path>] [--json]");
    }
    const result = await addPrefab({ projectPath, sceneId, prefabId, primitive: readFlag(normalizedArgv, "--primitive"), color: readFlag(normalizedArgv, "--color"), asset: readFlag(normalizedArgv, "--asset") });
    return renderSceneResult(result, json, result.ok ? `Prefab '${prefabId}' added.` : `Prefab '${prefabId}' was not added.`);
  }

  if (subcommand === "set-prefab-color") {
    const sceneId = readPositional(normalizedArgv, 1);
    const prefabId = readPositional(normalizedArgv, 2);
    const color = readFlag(normalizedArgv, "--color");
    if (sceneId === undefined || prefabId === undefined || color === undefined) {
      return renderUsage(json, "TN_SCENE_SET_PREFAB_COLOR_ARGS_MISSING", "Usage: tn scene set-prefab-color <scene-id> <prefab-id> --color <css-color> [--project <path>] [--json]");
    }
    const result = await setPrefabColor({ projectPath, sceneId, prefabId, color });
    return renderSceneResult(result, json, result.ok ? `Prefab '${prefabId}' color updated.` : `Prefab '${prefabId}' color was not updated.`);
  }

  if (subcommand === "set-prefab") {
    const sceneId = readPositional(normalizedArgv, 1);
    const prefabId = readPositional(normalizedArgv, 2);
    const primitive = readFlag(normalizedArgv, "--primitive");
    const color = readFlag(normalizedArgv, "--color");
    const asset = readFlag(normalizedArgv, "--asset");
    if (sceneId === undefined || prefabId === undefined || (primitive === undefined && color === undefined && asset === undefined)) {
      return renderUsage(json, "TN_SCENE_SET_PREFAB_ARGS_MISSING", "Usage: tn scene set-prefab <scene-id> <prefab-id> [--primitive <primitive>] [--color <css-color>] [--asset <path.glb>] [--project <path>] [--json]");
    }
    const result = await setPrefab({ asset, color, prefabId, primitive, projectPath, sceneId });
    return renderSceneResult(result, json, result.ok ? `Prefab '${prefabId}' updated.` : `Prefab '${prefabId}' was not updated.`);
  }

  if (subcommand === "add-resource") {
    const sceneId = readPositional(normalizedArgv, 1);
    const resourceId = readPositional(normalizedArgv, 2);
    if (sceneId === undefined || resourceId === undefined) {
      return renderUsage(json, "TN_SCENE_ADD_RESOURCE_ARGS_MISSING", "Usage: tn scene add-resource <scene-id> <resource-id> [--path <resource.path>] [--project <path>] [--json]");
    }
    const parsedValue = parseJsonFlag(normalizedArgv, "--value");
    if (parsedValue.diagnostic !== undefined) {
      return renderUsage(json, parsedValue.diagnostic, "Resource value must be valid JSON.");
    }
    const result = await addResource({ projectPath, sceneId, resourceId, path: readFlag(normalizedArgv, "--path"), value: parsedValue.value });
    return renderSceneResult(result, json, result.ok ? `Resource '${resourceId}' added.` : `Resource '${resourceId}' was not added.`);
  }

  if (subcommand === "set-resource") {
    const sceneId = readPositional(normalizedArgv, 1);
    const resourceId = readPositional(normalizedArgv, 2);
    if (sceneId === undefined || resourceId === undefined) {
      return renderUsage(json, "TN_SCENE_SET_RESOURCE_ARGS_MISSING", "Usage: tn scene set-resource <scene-id> <resource-id> [--path <resource.path>] [--value <json>] [--project <path>] [--json]");
    }
    const parsedValue = parseJsonFlag(normalizedArgv, "--value");
    if (parsedValue.diagnostic !== undefined) {
      return renderUsage(json, parsedValue.diagnostic, "Resource value must be valid JSON.");
    }
    const result = await setResource({ projectPath, sceneId, resourceId, path: readFlag(normalizedArgv, "--path"), value: parsedValue.value });
    return renderSceneResult(result, json, result.ok ? `Resource '${resourceId}' updated.` : `Resource '${resourceId}' was not updated.`);
  }

  if (subcommand === "add-ui-node") {
    const sceneId = readPositional(normalizedArgv, 1);
    const uiNodeId = readPositional(normalizedArgv, 2);
    if (sceneId === undefined || uiNodeId === undefined) {
      return renderUsage(json, "TN_SCENE_ADD_UI_NODE_ARGS_MISSING", "Usage: tn scene add-ui-node <scene-id> <ui-node-id> [--project <path>] [--json]");
    }
    const result = await addUiNode({ projectPath, sceneId, uiNodeId });
    return renderSceneResult(result, json, result.ok ? `UI node '${uiNodeId}' added.` : `UI node '${uiNodeId}' was not added.`);
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
      return renderUsage(json, "TN_SCENE_SET_CAMERA_ARGS_MISSING", "Usage: tn scene set-camera <scene-id> <camera-id> --mode <mode> --target <entity-id> [--fov-y <n>] [--near <n>] [--far <n>] [--size <n>] [--project <path>] [--json]");
    }
    const numbers = parseNumberFlags(normalizedArgv, ["--fov-y", "--near", "--far", "--size"]);
    if (numbers.diagnostic !== undefined) {
      return renderUsage(json, numbers.diagnostic, "Camera numeric flags must be finite numbers.");
    }
    const result = await setCamera({
      cameraId,
      far: numbers.values["--far"],
      fovY: numbers.values["--fov-y"],
      mode,
      near: numbers.values["--near"],
      projectPath,
      sceneId,
      size: numbers.values["--size"],
      targetId,
    });
    return renderSceneResult(result, json, result.ok ? `Camera '${cameraId}' updated.` : `Camera '${cameraId}' was not updated.`);
  }

  if (subcommand === "add-component") {
    const sceneId = readPositional(normalizedArgv, 1);
    const entityId = readPositional(normalizedArgv, 2);
    const component = readPositional(normalizedArgv, 3);
    if (sceneId === undefined || entityId === undefined || component === undefined) {
      return renderUsage(json, "TN_SCENE_ADD_COMPONENT_ARGS_MISSING", sceneAddComponentUsage());
    }
    const typed = parseTypedComponent(normalizedArgv, sceneId, entityId, component);
    if (typed.diagnostic !== undefined) {
      return renderUsage(json, typed.diagnostic, typed.usage ?? sceneAddComponentUsage());
    }
    const result = await typed.apply(projectPath);
    return renderSceneResult(result, json, result.ok ? `Component '${typed.componentKind}' set on '${entityId}'.` : `Component '${typed.componentKind}' was not set on '${entityId}'.`);
  }

  if (subcommand === "set-component") {
    const sceneId = readPositional(normalizedArgv, 1);
    const entityId = readPositional(normalizedArgv, 2);
    const componentKind = readPositional(normalizedArgv, 3);
    const parsedValue = parseJsonFlag(normalizedArgv, "--value");
    if (sceneId === undefined || entityId === undefined || componentKind === undefined || parsedValue.value === undefined) {
      return renderUsage(json, "TN_SCENE_SET_COMPONENT_ARGS_MISSING", "Usage: tn scene set-component <scene-id> <entity-id> <component-kind> --value <json-object> [--project <path>] [--json]");
    }
    if (parsedValue.diagnostic !== undefined || !isRecord(parsedValue.value)) {
      return renderUsage(json, parsedValue.diagnostic ?? "TN_SCENE_COMPONENT_VALUE_INVALID", "Component value must be a valid JSON object.");
    }
    const result = await setComponent({ projectPath, sceneId, entityId, componentKind, value: parsedValue.value });
    return renderSceneResult(result, json, result.ok ? `Component '${componentKind}' set on '${entityId}'.` : `Component '${componentKind}' was not set on '${entityId}'.`);
  }

  if (subcommand === "remove-component") {
    const sceneId = readPositional(normalizedArgv, 1);
    const entityId = readPositional(normalizedArgv, 2);
    const componentKind = readPositional(normalizedArgv, 3);
    if (sceneId === undefined || entityId === undefined || componentKind === undefined) {
      return renderUsage(json, "TN_SCENE_REMOVE_COMPONENT_ARGS_MISSING", "Usage: tn scene remove-component <scene-id> <entity-id> <component-kind> [--project <path>] [--json]");
    }
    const result = await removeComponent({ projectPath, sceneId, entityId, componentKind });
    return renderSceneResult(result, json, result.ok ? `Component '${componentKind}' removed from '${entityId}'.` : `Component '${componentKind}' was not removed from '${entityId}'.`);
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

  return renderUsage(json, "TN_SCENE_COMMAND_UNKNOWN", sceneUsage());
}

function renderCreateSceneResult(result: ICreateSceneResult, json: boolean): ICommandResult {
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

function parseJsonFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: unknown } {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

const flagsWithValues = new Set(["--project", "--file", "--world", "--prefab", "--primitive", "--color", "--asset", "--path", "--value", "--position", "--rotation", "--scale", "--mode", "--target", "--module", "--export", "--resource", "--out", "--web-url", "--camera", "--native-frame", "--kind", "--activation", "--name", "--intensity", "--range", "--angle", "--mesh", "--material", "--mass", "--damping", "--gravity-scale", "--size", "--radius", "--height", "--speed", "--move-x", "--move-z", "--grounding", "--slope-limit", "--step-offset", "--visible", "--cast-shadow", "--receive-shadow", "--trigger", "--blocking"]);

function sceneUsage(): string {
  return "Usage: tn scene create <scene-id> [--file <path>] [--project <path>] [--json]\n       tn scene add-tag <scene-id> <entity-id> <tag> [--project <path>] [--json]\n       tn scene add-group <scene-id> <group-id> [--name <label>] [--position x,y,z] [--project <path>] [--json]\n       tn scene lifecycle add <scene-id> [--kind <kind>] [--activation <policy>] [--initial] [--project <path>] [--json]\n       tn scene validate [scene-id] [--project <path>] [--json]\n       tn scene inspect <scene-id> [--project <path>] [--json]\n       tn scene proof <scene-id> --project <path> --out <dir> [--web-url <url>] [--native] [--json]";
}

function sceneLifecycleUsage(): string {
  return "Usage: tn scene lifecycle add <scene-id> [--kind <credits|cutscene|level|loading|menu|overlay|system>] [--activation <additive|exclusive|loading|overlay|persistent>] [--initial] [--project <path>] [--json]";
}

function sceneAddComponentUsage(): string {
  return "Usage: tn scene add-component <scene-id> <entity-id> camera [--mode <perspective|orthographic|third-person-follow>] [--target <entity-id>] [--fov-y <n>] [--near <n>] [--far <n>] [--size <n>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> light [--kind <ambient|directional|point|spot>] [--intensity <n>] [--color <css-color>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> mesh-renderer --mesh <mesh-id> --material <material-id> [--visible <true|false>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> render-layers --layers <layer-a,layer-b> [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> visibility [--visible <true|false>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> rigid-body [--kind <dynamic|kinematic|static>] [--mass <n>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> collider [--kind <box|sphere|capsule|cylinder|mesh>] [--size x,y,z] [--radius <n>] [--height <n>] [--trigger <true|false>] [--project <path>] [--json]\n       tn scene add-component <scene-id> <entity-id> character-controller [--move-x <axis>] [--move-z <axis>] [--speed <n>] [--project <path>] [--json]";
}

function parseTypedComponent(
  argv: readonly string[],
  sceneId: string,
  entityId: string,
  component: string,
): { apply: (projectPath: string) => Promise<IAuthoringOperationResult>; componentKind: string; diagnostic?: string; usage?: string } {
  const normalized = component.toLowerCase();
  if (normalized === "camera") {
    const numbers = parseNumberFlags(argv, ["--fov-y", "--near", "--far", "--size"]);
    if (numbers.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "camera", diagnostic: numbers.diagnostic, usage: "Camera numeric flags must be finite numbers." };
    }
    return {
      componentKind: "camera",
      apply: (projectPath) => setCameraComponent({
        entityId,
        far: numbers.values["--far"],
        fovY: numbers.values["--fov-y"],
        mode: readFlag(argv, "--mode"),
        near: numbers.values["--near"],
        projectPath,
        sceneId,
        size: numbers.values["--size"],
        targetId: readFlag(argv, "--target"),
      }),
    };
  }
  if (normalized === "light") {
    const numbers = parseNumberFlags(argv, ["--intensity", "--range", "--angle"]);
    if (numbers.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "Light", diagnostic: numbers.diagnostic, usage: "Light numeric flags must be finite numbers." };
    }
    return {
      componentKind: "Light",
      apply: (projectPath) => setLightComponent({
        angle: numbers.values["--angle"],
        color: readFlag(argv, "--color"),
        entityId,
        intensity: numbers.values["--intensity"],
        kind: readFlag(argv, "--kind"),
        projectPath,
        range: numbers.values["--range"],
        sceneId,
      }),
    };
  }
  if (normalized === "mesh-renderer" || normalized === "meshrenderer") {
    const mesh = readFlag(argv, "--mesh");
    const material = readFlag(argv, "--material");
    if (mesh === undefined || material === undefined) {
      return { apply: neverApply, componentKind: "MeshRenderer", diagnostic: "TN_SCENE_ADD_COMPONENT_MESH_RENDERER_ARGS_MISSING", usage: "Usage: tn scene add-component <scene-id> <entity-id> mesh-renderer --mesh <mesh-id> --material <material-id> [--visible <true|false>] [--project <path>] [--json]" };
    }
    const booleans = parseBooleanFlags(argv, ["--visible", "--cast-shadow", "--receive-shadow"]);
    if (booleans.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "MeshRenderer", diagnostic: booleans.diagnostic, usage: "MeshRenderer boolean flags must be true or false." };
    }
    return {
      componentKind: "MeshRenderer",
      apply: (projectPath) => setMeshRendererComponent({
        castShadow: booleans.values["--cast-shadow"],
        entityId,
        material,
        mesh,
        projectPath,
        receiveShadow: booleans.values["--receive-shadow"],
        sceneId,
        visible: booleans.values["--visible"],
      }),
    };
  }
  if (normalized === "rigid-body" || normalized === "rigidbody") {
    const numbers = parseNumberFlags(argv, ["--mass", "--damping", "--gravity-scale"]);
    if (numbers.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "RigidBody", diagnostic: numbers.diagnostic, usage: "RigidBody numeric flags must be finite numbers." };
    }
    return {
      componentKind: "RigidBody",
      apply: (projectPath) => setRigidBodyComponent({
        damping: numbers.values["--damping"],
        entityId,
        gravityScale: numbers.values["--gravity-scale"],
        kind: readFlag(argv, "--kind"),
        mass: numbers.values["--mass"],
        projectPath,
        sceneId,
      }),
    };
  }
  if (normalized === "render-layers" || normalized === "renderlayers") {
    const layers = parseStringListFlag(argv, "--layers");
    if (layers.diagnostic !== undefined || layers.value === undefined) {
      return { apply: neverApply, componentKind: "RenderLayers", diagnostic: layers.diagnostic ?? "TN_SCENE_ADD_COMPONENT_RENDER_LAYERS_ARGS_MISSING", usage: "Usage: tn scene add-component <scene-id> <entity-id> render-layers --layers <layer-a,layer-b> [--project <path>] [--json]" };
    }
    const parsedLayers = layers.value;
    return {
      componentKind: "RenderLayers",
      apply: (projectPath) => setRenderLayersComponent({
        entityId,
        layers: parsedLayers,
        projectPath,
        sceneId,
      }),
    };
  }
  if (normalized === "visibility") {
    const booleans = parseBooleanFlags(argv, ["--visible"]);
    if (booleans.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "Visibility", diagnostic: booleans.diagnostic, usage: "Visibility boolean flags must be true or false." };
    }
    return {
      componentKind: "Visibility",
      apply: (projectPath) => setVisibilityComponent({
        entityId,
        projectPath,
        sceneId,
        visible: booleans.values["--visible"],
      }),
    };
  }
  if (normalized === "collider") {
    const numbers = parseNumberFlags(argv, ["--radius", "--height"]);
    if (numbers.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "Collider", diagnostic: numbers.diagnostic, usage: "Collider numeric flags must be finite numbers." };
    }
    const size = parseOptionalVectorFlag(argv, "--size");
    if (size.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "Collider", diagnostic: size.diagnostic, usage: "Collider --size must use x,y,z numeric values." };
    }
    const booleans = parseBooleanFlags(argv, ["--trigger"]);
    if (booleans.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "Collider", diagnostic: booleans.diagnostic, usage: "Collider boolean flags must be true or false." };
    }
    return {
      componentKind: "Collider",
      apply: (projectPath) => setColliderComponent({
        entityId,
        height: numbers.values["--height"],
        kind: readFlag(argv, "--kind"),
        projectPath,
        radius: numbers.values["--radius"],
        sceneId,
        size: size.value,
        trigger: booleans.values["--trigger"],
      }),
    };
  }
  if (normalized === "character-controller" || normalized === "charactercontroller") {
    const numbers = parseNumberFlags(argv, ["--speed", "--slope-limit", "--step-offset"]);
    if (numbers.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "CharacterController", diagnostic: numbers.diagnostic, usage: "CharacterController numeric flags must be finite numbers." };
    }
    const booleans = parseBooleanFlags(argv, ["--blocking"]);
    if (booleans.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "CharacterController", diagnostic: booleans.diagnostic, usage: "CharacterController boolean flags must be true or false." };
    }
    return {
      componentKind: "CharacterController",
      apply: (projectPath) => setCharacterControllerComponent({
        blocking: booleans.values["--blocking"],
        entityId,
        grounding: readFlag(argv, "--grounding"),
        moveXAxis: readFlag(argv, "--move-x"),
        moveZAxis: readFlag(argv, "--move-z"),
        projectPath,
        sceneId,
        slopeLimit: numbers.values["--slope-limit"],
        speed: numbers.values["--speed"],
        stepOffset: numbers.values["--step-offset"],
      }),
    };
  }
  return { apply: neverApply, componentKind: component, diagnostic: "TN_SCENE_ADD_COMPONENT_KIND_UNSUPPORTED", usage: sceneAddComponentUsage() };
}

function parseNumberFlags(argv: readonly string[], flags: readonly string[]): { diagnostic?: string; values: Record<string, number | undefined> } {
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

function parseBooleanFlags(argv: readonly string[], flags: readonly string[]): { diagnostic?: string; values: Record<string, boolean | undefined> } {
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

function parseOptionalVectorFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: [number, number, number] } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const vector = parseVector3(raw);
  return vector === undefined ? { diagnostic: "TN_SCENE_VECTOR_INVALID" } : { value: vector };
}

function parseStringListFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: string[] } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const values = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  return values.length === 0 ? { diagnostic: "TN_SCENE_STRING_LIST_INVALID" } : { value: values };
}

async function neverApply(): Promise<IAuthoringOperationResult> {
  throw new Error("Invalid typed component command should not be applied.");
}

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
