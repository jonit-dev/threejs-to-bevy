import type { IEditorShellModel } from "./adapters/editorModel.js";

export const devFixtureModel: IEditorShellModel = {
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
  projectName: "structured-source-starter",
  selectedRowId: "entity:player",
  status: "ready",
  statusItems: [
    { id: "mode", label: "Mode", value: "Static fixture" },
    { id: "access", label: "Source policy", value: "Structured documents" },
  ],
};
