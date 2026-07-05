import type { IAssetsManifest, IAudioIr, ISceneLifecycleIr, IScenesIr, ISceneTransitionIr, IUiIr, IUiNodeIr, IWorldIr } from "./types.js";
import type { ISystemsIr } from "./systems.js";
import type { IInputIr } from "./input.js";
import type { IIrDiagnostic } from "./validate.js";
import { IR_SCHEMA_IDS, IR_VERSION } from "./documents.js";
import { isRecord } from "./validationPrimitives.js";

export function validateScenes(
  scenes: IScenesIr,
  path: string,
  world: IWorldIr | undefined,
  assets: IAssetsManifest | undefined,
  input: IInputIr | undefined,
  audio: IAudioIr | undefined,
  ui: IUiIr | undefined,
  systems: ISystemsIr | undefined,
  diagnostics: IIrDiagnostic[],
): void {
  if (scenes.schema !== IR_SCHEMA_IDS.scenes || scenes.version !== IR_VERSION) {
    diagnostics.push({ code: "TN_IR_SCENE_VERSION_UNSUPPORTED", message: `Scenes document must use ${IR_SCHEMA_IDS.scenes} version ${IR_VERSION}.`, path });
  }
  if (typeof scenes.initialScene !== "string" || scenes.initialScene.trim() === "") {
    diagnostics.push({ code: "TN_IR_SCENE_INITIAL_INVALID", message: "Scenes initialScene must be a non-empty string.", path: `${path}/initialScene` });
  }
  if (!Array.isArray(scenes.scenes) || scenes.scenes.length === 0) {
    diagnostics.push({ code: "TN_IR_SCENES_EMPTY", message: "Scenes document must include at least one scene.", path: `${path}/scenes` });
    return;
  }

  const sceneIds = new Set<string>();
  scenes.scenes.forEach((scene, index) => {
    const scenePath = `${path}/scenes/${index}`;
    validateSceneShape(scene, scenePath, diagnostics);
    if (typeof scene.id === "string" && scene.id.trim() !== "") {
      if (sceneIds.has(scene.id)) {
        diagnostics.push({ code: "TN_IR_SCENE_ID_DUPLICATE", message: `Scene '${scene.id}' is duplicated.`, path: `${scenePath}/id` });
      }
      sceneIds.add(scene.id);
    }
  });
  if (typeof scenes.initialScene === "string" && scenes.initialScene.trim() !== "" && !sceneIds.has(scenes.initialScene)) {
    diagnostics.push({ code: "TN_IR_SCENE_INITIAL_UNKNOWN", message: `Initial scene '${scenes.initialScene}' is not declared.`, path: `${path}/initialScene` });
  }

  const entityIds = new Set((world?.entities ?? []).map((entity) => entity.id));
  const assetGroupIds = new Set((assets?.groups ?? []).map((group) => group.id));
  const inputIds = new Set<string>([
    ...(input?.actions ?? []).map((action) => action.id),
    ...(input?.axes ?? []).map((axis) => axis.id),
  ]);
  const musicIds = new Set((audio?.music ?? []).map((music) => music.id));
  const uiIds = collectUiNodeIds(ui);
  const systemIds = new Set((systems?.systems ?? []).map((system) => system.name));
  const exclusiveOwners = new Map<string, string>();

  scenes.scenes.forEach((scene, index) => {
    const scenePath = `${path}/scenes/${index}`;
    validateSceneReferences(scene, scenePath, { assetGroupIds, entityIds, inputIds, musicIds, sceneIds, systemIds, uiIds }, diagnostics);
    for (const entityId of scene.entities ?? []) {
      if (scene.activation === "exclusive") {
        const owner = exclusiveOwners.get(entityId);
        if (owner !== undefined && owner !== scene.id) {
          diagnostics.push({
            code: "TN_IR_SCENE_OWNERSHIP_CONFLICT",
            message: `Entity '${entityId}' is owned by multiple exclusive scenes.`,
            path: `${scenePath}/entities`,
            target: entityId,
          });
        } else {
          exclusiveOwners.set(entityId, scene.id);
        }
      }
    }
  });
}

function validateSceneShape(scene: ISceneLifecycleIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(scene)) {
    diagnostics.push({ code: "TN_IR_SCENE_INVALID", message: "Scene entry must be an object.", path });
    return;
  }
  if (typeof scene.id !== "string" || scene.id.trim() === "") {
    diagnostics.push({ code: "TN_IR_SCENE_ID_INVALID", message: "Scene ID must be a non-empty string.", path: `${path}/id` });
  }
  if (!["credits", "cutscene", "level", "loading", "menu", "overlay", "system"].includes(String(scene.kind))) {
    diagnostics.push({ code: "TN_IR_SCENE_KIND_INVALID", message: `Scene '${String(scene.id)}' uses unsupported kind '${String(scene.kind)}'.`, path: `${path}/kind` });
  }
  if (!["additive", "exclusive", "loading", "overlay", "persistent"].includes(String(scene.activation))) {
    diagnostics.push({ code: "TN_IR_SCENE_ACTIVATION_INVALID", message: `Scene '${String(scene.id)}' uses unsupported activation '${String(scene.activation)}'.`, path: `${path}/activation` });
  }
  validateStringList(scene.entities, `${path}/entities`, "TN_IR_SCENE_ENTITY_ID_INVALID", diagnostics);
  validateStringList(scene.assetGroups, `${path}/assetGroups`, "TN_IR_SCENE_ASSET_GROUP_ID_INVALID", diagnostics);
  validateStringList(scene.systems, `${path}/systems`, "TN_IR_SCENE_SYSTEM_ID_INVALID", diagnostics);
  validateStringList(scene.ui, `${path}/ui`, "TN_IR_SCENE_UI_ID_INVALID", diagnostics);
  validateSceneTransition(scene.transitions?.enter, `${path}/transitions/enter`, diagnostics);
  validateSceneTransition(scene.transitions?.exit, `${path}/transitions/exit`, diagnostics);
  validateSceneTransition(scene.audio?.transition, `${path}/audio/transition`, diagnostics);
}

function validateSceneReferences(
  scene: ISceneLifecycleIr,
  path: string,
  refs: {
    assetGroupIds: Set<string>;
    entityIds: Set<string>;
    inputIds: Set<string>;
    musicIds: Set<string>;
    sceneIds: Set<string>;
    systemIds: Set<string>;
    uiIds: Set<string>;
  },
  diagnostics: IIrDiagnostic[],
): void {
  validateReferenceList(scene.entities, refs.entityIds, `${path}/entities`, "TN_IR_SCENE_ENTITY_MISSING", "entity", diagnostics);
  validateReferenceList(scene.assetGroups, refs.assetGroupIds, `${path}/assetGroups`, "TN_IR_SCENE_ASSET_GROUP_MISSING", "asset group", diagnostics);
  validateReferenceList(scene.systems, refs.systemIds, `${path}/systems`, "TN_IR_SCENE_SYSTEM_MISSING", "system", diagnostics);
  validateReferenceList(scene.ui, refs.uiIds, `${path}/ui`, "TN_IR_SCENE_UI_MISSING", "UI node", diagnostics);
  validateReference(scene.input, refs.inputIds, `${path}/input`, "TN_IR_SCENE_INPUT_MISSING", "input action or axis", diagnostics);
  validateReference(scene.audio?.music, refs.musicIds, `${path}/audio/music`, "TN_IR_SCENE_AUDIO_MISSING", "audio music", diagnostics);
  validateLoadingSceneReference(scene.transitions?.enter, refs.sceneIds, `${path}/transitions/enter/loadingScene`, diagnostics);
  validateLoadingSceneReference(scene.transitions?.exit, refs.sceneIds, `${path}/transitions/exit/loadingScene`, diagnostics);
  validateLoadingSceneReference(scene.audio?.transition, refs.sceneIds, `${path}/audio/transition/loadingScene`, diagnostics);
}

function validateStringList(value: readonly string[] | undefined, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code, message: "Expected an array of non-empty strings.", path });
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      diagnostics.push({ code, message: "Expected a non-empty string.", path: `${path}/${index}` });
    }
  });
}

function validateReferenceList(value: readonly string[] | undefined, ids: Set<string>, path: string, code: string, label: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  value.forEach((entry, index) => validateReference(entry, ids, `${path}/${index}`, code, label, diagnostics));
}

function validateReference(value: string | undefined, ids: Set<string>, path: string, code: string, label: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "" || !ids.has(value)) {
    diagnostics.push({ code, message: `Scene references unknown ${label} '${String(value)}'.`, path, target: String(value) });
  }
}

function validateLoadingSceneReference(transition: ISceneTransitionIr | undefined, sceneIds: Set<string>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (transition?.kind !== "loadingScreen") {
    return;
  }
  validateReference(transition.loadingScene, sceneIds, path, "TN_IR_SCENE_TRANSITION_LOADING_UNKNOWN", "loading scene", diagnostics);
}

function validateSceneTransition(transition: ISceneTransitionIr | undefined, path: string, diagnostics: IIrDiagnostic[]): void {
  if (transition === undefined) {
    return;
  }
  if (!["crossfade", "fade", "instant", "loadingScreen"].includes(String(transition.kind))) {
    diagnostics.push({ code: "TN_IR_SCENE_TRANSITION_KIND_INVALID", message: `Unsupported scene transition kind '${String(transition.kind)}'.`, path: `${path}/kind` });
  }
  if (typeof transition.durationMs !== "number" || !Number.isFinite(transition.durationMs) || transition.durationMs < 0 || transition.durationMs > 60000) {
    diagnostics.push({ code: "TN_IR_SCENE_TRANSITION_DURATION_INVALID", message: "Scene transition durationMs must be finite between 0 and 60000.", path: `${path}/durationMs` });
  }
  if (transition.color !== undefined && (typeof transition.color !== "string" || !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(transition.color))) {
    diagnostics.push({ code: "TN_IR_SCENE_TRANSITION_COLOR_INVALID", message: "Scene transition color must be #RRGGBB or #RRGGBBAA.", path: `${path}/color` });
  }
  if (transition.kind === "loadingScreen" && (typeof transition.loadingScene !== "string" || transition.loadingScene.trim() === "")) {
    diagnostics.push({ code: "TN_IR_SCENE_TRANSITION_LOADING_INVALID", message: "Loading-screen transition must reference a loading scene.", path: `${path}/loadingScene` });
  }
}

function collectUiNodeIds(ui: IUiIr | undefined): Set<string> {
  const ids = new Set<string>();
  const visit = (node: IUiNodeIr): void => {
    ids.add(node.id);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  if (ui !== undefined) {
    visit(ui.root);
  }
  return ids;
}
