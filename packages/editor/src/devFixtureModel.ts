import { EDITOR_ADD_COMPONENT_DEFINITIONS, type IEditorShellModel } from "./adapters/editorModel.js";

export const devFixtureModel: IEditorShellModel = {
  addComponentDefinitions: [...EDITOR_ADD_COMPONENT_DEFINITIONS],
  assets: [
    { access: "inspectableOnly", id: "asset:model.level", kind: "model", label: "model.level", path: "assets/level.glb" },
    { access: "inspectableOnly", id: "asset:material.player", kind: "material", label: "material.player" },
  ],
  diagnostics: [
    {
      code: "TN_EDITOR_FIXTURE_INFO",
      message: "Static editor fixture loaded.",
      severity: "info",
    },
  ],
  gamepadViewer: {
    controls: [
      { control: "buttonSouth", kind: "button", owner: "Interact" },
      { control: "leftStickX", kind: "axis", owner: "MoveX" },
    ],
    devices: [{ id: "declared-gamepad", status: "declared" }],
    requiredControls: [],
  },
  hierarchy: [
    {
      access: "sourcePersistable",
      badge: "scene",
      children: [
        {
          access: "sourcePersistable",
          badge: "entity",
          documentPath: "content/scenes/arena.scene.json",
          id: "entity:player",
          jsonPointer: "/entities/0",
          label: "player",
          sourcePath: "content/scenes/arena.scene.json",
        },
      ],
      documentPath: "content/scenes/arena.scene.json",
      id: "source:content/scenes/arena.scene.json",
      label: "arena.scene.json",
      sourcePath: "content/scenes/arena.scene.json",
    },
  ],
  inspector: [
    {
      access: "sourcePersistable",
      documentPath: "content/scenes/arena.scene.json",
      id: "inspect:player-transform",
      label: "Transform",
      path: "/entities/0/transform",
      readOnly: false,
      value: "position [0, 1, 0]",
    },
    {
      access: "inspectableOnly",
      documentPath: "dist/game.bundle/world.ir.json",
      id: "inspect:generated",
      label: "Generated world row",
      path: "/entities/0",
      readOnly: true,
      value: "inspect only",
    },
  ],
  lod: {
    budget: 200000,
    loadedTriangles: 1036,
    loading: false,
    mode: "auto",
    precision: "estimate",
    selected: "original",
    triangleCount: 1036,
  },
  projectName: "structured-source-starter",
  sceneObjects: [
    {
      color: "#34373d",
      documentPath: "content/scenes/arena.scene.json",
      id: "arena.floor",
      kind: "entity",
      label: "arena.floor",
      position: [0, -0.05, 0],
      primitive: "plane",
      rotation: [-1.570796, 0, 0],
      rowId: "entity:arena.floor",
      sourcePath: "content/scenes/arena.scene.json",
    },
    {
      color: "#2f80ed",
      documentPath: "content/scenes/arena.scene.json",
      id: "player",
      kind: "entity",
      label: "player",
      position: [0, 0.35, 0],
      primitive: "box",
      scale: [0.55, 0.55, 0.55],
      rowId: "entity:player",
      sourcePath: "content/scenes/arena.scene.json",
    },
  ],
  selectedRowId: "entity:player",
  status: "ready",
  statusItems: [
    { id: "mode", label: "Mode", value: "Static fixture" },
    { id: "access", label: "Source policy", value: "Structured documents" },
  ],
  uiPreview: [
    {
      documentPath: "content/ui/hud.ui.json",
      id: "hud",
      nodes: [
        { backgroundColor: "#101820", color: "#ffffff", fontSize: 16, id: "hud.score", kind: "text", text: "Score 0" },
        { action: "Pause", id: "hud.pause", kind: "button", label: "Pause", text: "Pause" },
      ],
      readOnlyReason: "Editor UI preview is read-only; edits go through source-backed UI operations.",
    },
  ],
};
