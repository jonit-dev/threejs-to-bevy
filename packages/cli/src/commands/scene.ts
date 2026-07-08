import {
  addEntity,
  addPrefabInstance,
  addTenPinLayout,
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
  setComponent,
  setPrefab,
  setPrefabColor,
  setResource,
  setSceneLifecycle,
  setSpawnerComponent,
  setTransform,
  validateScene,
} from "@threenative/authoring";

import { type ICommandResult } from "../diagnostics.js";
import { proofCamera } from "./sceneCameraProof.js";
import { parseTypedComponent } from "./sceneComponents.js";
import {
  addModularTrack,
  generateOvalModularTrackLayout,
  parseModularTrackLayout,
  proofModularTrack,
} from "./sceneModularTrack.js";
import { sceneProofCommand } from "./sceneProof.js";
import {
  cameraLookAtEuler,
  isRecord,
  parseJsonFlag,
  parseJsonObjectFlag,
  parseNumberFlags,
  parseOptionalNumber,
  parseOptionalVectorFlag,
  parseStringListFlag,
  parseTransformVectors,
  readFlag,
  readPositional,
  renderCreateSceneResult,
  renderGeneratedModularTrackResult,
  renderSceneResult,
  renderUsage,
  resolveProjectPath,
  sceneAddComponentUsage,
  sceneLifecycleUsage,
  sceneUsage,
} from "./sceneShared.js";

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
      return renderUsage(json, "TN_SCENE_INSPECT_ID_MISSING", "Usage: tn scene inspect <scene-id> [--node <id>] [--project <path>] [--json]");
    }
    const result = await inspectScene({ projectPath, sceneId, nodeId: readFlag(normalizedArgv, "--node") });
    return renderSceneResult(result, json, result.ok ? `Scene '${sceneId}' inspected.` : `Scene '${sceneId}' inspection failed.`);
  }

  if (subcommand === "proof") {
    return sceneProofCommand(normalizedArgv.slice(1), { cwd: options.cwd });
  }

  if (subcommand === "add-modular-track") {
    const sceneId = readPositional(normalizedArgv, 1);
    const assetDir = readFlag(normalizedArgv, "--asset-dir");
    const layout = parseModularTrackLayout(readFlag(normalizedArgv, "--layout"));
    if (sceneId === undefined || assetDir === undefined || layout.value === undefined) {
      return renderUsage(json, layout.diagnostic ?? "TN_SCENE_MODULAR_TRACK_ARGS_MISSING", "Usage: tn scene add-modular-track <scene-id> --asset-dir <path> --layout <json-array> [--prefix <id-prefix>] [--project <path>] [--json]");
    }
    const result = await addModularTrack({
      assetDir,
      layout: layout.value,
      prefix: readFlag(normalizedArgv, "--prefix") ?? "track.tile",
      projectPath,
      sceneId,
    });
    return renderSceneResult(result, json, result.ok ? `Modular track '${result.prefix}' added to '${sceneId}'.` : `Modular track '${result.prefix}' was not added to '${sceneId}'.`);
  }

  if (subcommand === "generate-modular-track") {
    const sceneId = readPositional(normalizedArgv, 1);
    const assetDir = readFlag(normalizedArgv, "--asset-dir");
    const shape = readFlag(normalizedArgv, "--shape") ?? "oval";
    if (sceneId === undefined || assetDir === undefined) {
      return renderUsage(json, "TN_SCENE_GENERATE_MODULAR_TRACK_ARGS_MISSING", "Usage: tn scene generate-modular-track <scene-id> --asset-dir <path> [--shape oval] [--size small|medium|large] [--straight-count <odd-number>] [--prefix <id-prefix>] [--project <path>] [--json]");
    }
    if (shape !== "oval") {
      return renderUsage(json, "TN_SCENE_GENERATE_MODULAR_TRACK_SHAPE_UNSUPPORTED", "Only '--shape oval' is currently supported.");
    }
    const layout = generateOvalModularTrackLayout({
      size: readFlag(normalizedArgv, "--size"),
      straightCount: readFlag(normalizedArgv, "--straight-count"),
    });
    if (layout.diagnostic !== undefined || layout.value === undefined) {
      return renderUsage(json, layout.diagnostic ?? "TN_SCENE_GENERATE_MODULAR_TRACK_INVALID", layout.usage ?? "Track size must be small, medium, large, or an odd --straight-count >= 1.");
    }
    const result = await addModularTrack({
      assetDir,
      layout: layout.value,
      prefix: readFlag(normalizedArgv, "--prefix") ?? "track.tile",
      projectPath,
      sceneId,
    });
    return renderGeneratedModularTrackResult(
      result,
      { shape, size: layout.size, straightCount: layout.straightCount },
      json,
      result.ok ? `Generated ${layout.size} ${shape} modular track '${result.prefix}' in '${sceneId}'.` : `Generated modular track '${result.prefix}' was not added to '${sceneId}'.`,
    );
  }

  if (subcommand === "proof-modular-track") {
    const sceneId = readPositional(normalizedArgv, 1);
    const assetDir = readFlag(normalizedArgv, "--asset-dir");
    if (sceneId === undefined || assetDir === undefined) {
      return renderUsage(json, "TN_SCENE_MODULAR_TRACK_PROOF_ARGS_MISSING", "Usage: tn scene proof-modular-track <scene-id> --asset-dir <path> [--prefix <id-prefix>] [--actors <entity-id,...>] [--project <path>] [--json]");
    }
    const actorIds = parseStringListFlag(normalizedArgv, "--actors");
    if (actorIds.diagnostic !== undefined) {
      return renderUsage(json, actorIds.diagnostic, "Actor ids must be a comma-separated list.");
    }
    const result = await proofModularTrack({
      actorIds: actorIds.value ?? [],
      assetDir,
      prefix: readFlag(normalizedArgv, "--prefix") ?? "track.tile",
      projectPath,
      sceneId,
    });
    return renderSceneResult(result, json, result.ok ? `Modular track '${result.prefix}' proof passed.` : `Modular track '${result.prefix}' proof failed.`);
  }

  if (subcommand === "proof-camera") {
    const sceneId = readPositional(normalizedArgv, 1);
    const cameraId = readFlag(normalizedArgv, "--camera");
    const targetId = readFlag(normalizedArgv, "--target");
    const minOccupancy = parseOptionalNumber(normalizedArgv, "--min-occupancy");
    const maxRoll = parseOptionalNumber(normalizedArgv, "--max-roll");
    if (minOccupancy.diagnostic !== undefined || maxRoll.diagnostic !== undefined) {
      return renderUsage(json, minOccupancy.diagnostic ?? maxRoll.diagnostic ?? "TN_SCENE_CAMERA_PROOF_NUMBER_INVALID", "Camera proof numeric flags must be finite numbers.");
    }
    if (sceneId === undefined || cameraId === undefined || targetId === undefined) {
      return renderUsage(json, "TN_SCENE_CAMERA_PROOF_ARGS_MISSING", "Usage: tn scene proof-camera <scene-id> --camera <camera-id> --target <entity-id> [--min-occupancy <n>] [--max-roll <radians>] [--project <path>] [--json]");
    }
    const result = await proofCamera({
      cameraId,
      maxRoll: maxRoll.value ?? 0.05,
      minOccupancy: minOccupancy.value ?? 0.04,
      projectPath,
      sceneId,
      targetId,
    });
    return renderSceneResult(result, json, result.ok ? `Camera '${cameraId}' proof passed.` : `Camera '${cameraId}' proof failed.`);
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

  if (subcommand === "add-prefab-instance") {
    const sceneId = readPositional(normalizedArgv, 1);
    const instanceId = readPositional(normalizedArgv, 2);
    const prefabId = readFlag(normalizedArgv, "--prefab");
    const position = parseOptionalVectorFlag(normalizedArgv, "--position");
    const rotation = parseOptionalVectorFlag(normalizedArgv, "--rotation");
    const scale = parseOptionalVectorFlag(normalizedArgv, "--scale");
    const components = parseJsonObjectFlag(normalizedArgv, "--components", "TN_SCENE_ADD_PREFAB_INSTANCE_COMPONENTS_INVALID");
    if (position.diagnostic !== undefined || rotation.diagnostic !== undefined || scale.diagnostic !== undefined || components.diagnostic !== undefined) {
      return renderUsage(json, position.diagnostic ?? rotation.diagnostic ?? scale.diagnostic ?? components.diagnostic ?? "TN_SCENE_ADD_PREFAB_INSTANCE_INVALID", "Prefab instance vectors must use x,y,z and --components must be a JSON object.");
    }
    if (sceneId === undefined || instanceId === undefined || prefabId === undefined) {
      return renderUsage(json, "TN_SCENE_ADD_PREFAB_INSTANCE_ARGS_MISSING", "Usage: tn scene add-prefab-instance <scene-id> <instance-id> --prefab <prefab-id> [--position x,y,z] [--rotation x,y,z] [--scale x,y,z] [--components <json-object>] [--replace] [--project <path>] [--json]");
    }
    const transform = position.value === undefined && rotation.value === undefined && scale.value === undefined
      ? undefined
      : { position: position.value, rotation: rotation.value, scale: scale.value };
    const result = await addPrefabInstance({
      components: components.value,
      instanceId,
      prefabId,
      projectPath,
      replace: normalizedArgv.includes("--replace"),
      sceneId,
      transform,
    });
    return renderSceneResult(result, json, result.ok ? `Compact prefab instance '${instanceId}' added.` : `Compact prefab instance '${instanceId}' was not added.`);
  }

  if (subcommand === "layout") {
    const layoutKind = readPositional(normalizedArgv, 1);
    const sceneId = readPositional(normalizedArgv, 2);
    const prefabId = readFlag(normalizedArgv, "--prefab");
    const origin = parseOptionalVectorFlag(normalizedArgv, "--origin");
    const spacing = parseOptionalNumber(normalizedArgv, "--spacing");
    if (origin.diagnostic !== undefined || spacing.diagnostic !== undefined) {
      return renderUsage(json, origin.diagnostic ?? spacing.diagnostic ?? "TN_SCENE_LAYOUT_INVALID", "Layout --origin must use x,y,z and --spacing must be a finite number.");
    }
    if (layoutKind !== "ten-pin" || sceneId === undefined || prefabId === undefined) {
      return renderUsage(json, "TN_SCENE_LAYOUT_ARGS_MISSING", "Usage: tn scene layout ten-pin <scene-id> --prefab <prefab-id> [--prefix pin] [--origin x,y,z] [--spacing n] [--replace] [--project <path>] [--json]");
    }
    const result = await addTenPinLayout({
      origin: origin.value,
      prefabId,
      prefix: readFlag(normalizedArgv, "--prefix"),
      projectPath,
      replace: normalizedArgv.includes("--replace"),
      sceneId,
      spacing: spacing.value,
    });
    return renderSceneResult(result, json, result.ok ? `Compact ten-pin layout added to '${sceneId}'.` : `Compact ten-pin layout was not added to '${sceneId}'.`);
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
      return renderUsage(json, "TN_SCENE_SET_TRANSFORM_ARGS_MISSING", "Usage: tn scene set-transform <scene-id> <entity-id> [--position x,y,z] [--rotation x,y,z|--rotation-deg x,y,z] [--scale x,y,z] [--project <path>] [--json]");
    }
    const vectors = parseTransformVectors(normalizedArgv);
    if (vectors.diagnostic !== undefined) {
      return renderUsage(json, vectors.diagnostic, "Transform vectors must use x,y,z numeric values; use either --rotation or --rotation-deg, not both.");
    }
    const result = await setTransform({ projectPath, sceneId, entityId, ...vectors.value });
    return renderSceneResult(result, json, result.ok ? `Transform for '${entityId}' updated.` : `Transform for '${entityId}' was not updated.`);
  }

  if (subcommand === "set-camera-look-at") {
    const sceneId = readPositional(normalizedArgv, 1);
    const cameraId = readPositional(normalizedArgv, 2);
    if (sceneId === undefined || cameraId === undefined) {
      return renderUsage(json, "TN_SCENE_CAMERA_LOOK_AT_ARGS_MISSING", "Usage: tn scene set-camera-look-at <scene-id> <camera-id> --position x,y,z --target x,y,z [--project <path>] [--json]");
    }
    const position = parseOptionalVectorFlag(normalizedArgv, "--position");
    const target = parseOptionalVectorFlag(normalizedArgv, "--target");
    if (position.diagnostic !== undefined || target.diagnostic !== undefined) {
      return renderUsage(json, "TN_SCENE_VECTOR_INVALID", "Camera look-at vectors must use x,y,z numeric values.");
    }
    if (position.value === undefined || target.value === undefined) {
      return renderUsage(json, "TN_SCENE_CAMERA_LOOK_AT_ARGS_MISSING", "Usage: tn scene set-camera-look-at <scene-id> <camera-id> --position x,y,z --target x,y,z [--project <path>] [--json]");
    }
    const rotation = cameraLookAtEuler(position.value, target.value);
    const result = await setTransform({ projectPath, sceneId, entityId: cameraId, position: position.value, rotation });
    return renderSceneResult(result, json, result.ok ? `Camera '${cameraId}' framed toward target.` : `Camera '${cameraId}' was not framed.`);
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

  if (subcommand === "set-spawner") {
    const sceneId = readPositional(normalizedArgv, 1);
    const entityId = readPositional(normalizedArgv, 2);
    const prefab = readFlag(normalizedArgv, "--prefab");
    const area = parseJsonObjectFlag(normalizedArgv, "--area", "TN_SCENE_SET_SPAWNER_AREA_INVALID");
    const despawnPolicy = parseJsonObjectFlag(normalizedArgv, "--despawn-policy", "TN_SCENE_SET_SPAWNER_DESPAWN_POLICY_INVALID");
    if (sceneId === undefined || entityId === undefined || prefab === undefined) {
      return renderUsage(json, "TN_SCENE_SET_SPAWNER_ARGS_MISSING", "Usage: tn scene set-spawner <scene-id> <entity-id> --prefab <prefab-id> [--mode once|interval|wave] [--interval <seconds>] [--wave-size <count>] [--max-alive <count>] [--max-total <count>] [--jitter-seed <number>] [--area <json-object>] [--despawn-policy <json-object>] [--enabled true|false] [--project <path>] [--json]");
    }
    if (area.diagnostic !== undefined || despawnPolicy.diagnostic !== undefined) {
      return renderUsage(json, area.diagnostic ?? despawnPolicy.diagnostic ?? "TN_SCENE_SET_SPAWNER_JSON_INVALID", "Spawner --area and --despawn-policy must be valid JSON objects.");
    }
    const enabledRaw = readFlag(normalizedArgv, "--enabled");
    if (enabledRaw !== undefined && enabledRaw !== "true" && enabledRaw !== "false") {
      return renderUsage(json, "TN_SCENE_SET_SPAWNER_ENABLED_INVALID", "Spawner --enabled must be true or false.");
    }
    const interval = parseOptionalNumber(normalizedArgv, "--interval");
    const waveSize = parseOptionalNumber(normalizedArgv, "--wave-size");
    const maxAlive = parseOptionalNumber(normalizedArgv, "--max-alive");
    const maxTotal = parseOptionalNumber(normalizedArgv, "--max-total");
    const jitterSeed = parseOptionalNumber(normalizedArgv, "--jitter-seed");
    const numberDiagnostic = interval.diagnostic ?? waveSize.diagnostic ?? maxAlive.diagnostic ?? maxTotal.diagnostic ?? jitterSeed.diagnostic;
    if (numberDiagnostic !== undefined) {
      return renderUsage(json, numberDiagnostic, "Spawner numeric flags must be finite numbers.");
    }
    const result = await setSpawnerComponent({
      area: area.value,
      despawnPolicy: despawnPolicy.value,
      enabled: enabledRaw === undefined ? undefined : enabledRaw === "true",
      entityId,
      interval: interval.value,
      jitterSeed: jitterSeed.value,
      maxAlive: maxAlive.value,
      maxTotal: maxTotal.value,
      mode: readFlag(normalizedArgv, "--mode"),
      prefab,
      projectPath,
      sceneId,
      waveSize: waveSize.value,
    });
    return renderSceneResult(result, json, result.ok ? `Spawner set on '${entityId}'.` : `Spawner was not set on '${entityId}'.`);
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
