import assert from "node:assert/strict";
import test from "node:test";
import type { IInputIr, IUiIr, IWorldIr } from "@threenative/ir";

import { mergeInputs, mergeUis, mergeWorlds } from "./bundle.js";

test("should deduplicate merged world entities by id", () => {
  const scene: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      { id: "entity.shared", components: { Transform: { position: [0, 0, 0] } }, tags: ["scene"] },
      { id: "entity.scene", components: { Visibility: { visible: true } } },
    ],
    events: { scene: { value: true } },
  };
  const ecs: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      { id: "entity.shared", components: { GameplayState: { active: true } }, tags: ["ecs"] },
      { id: "entity.ecs", components: { Visibility: { visible: false } } },
    ],
    resources: { score: { value: 1 } },
  };

  assert.deepEqual(mergeWorlds(scene, ecs), {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      { id: "entity.ecs", components: { Visibility: { visible: false } } },
      { id: "entity.scene", components: { Visibility: { visible: true } } },
      {
        id: "entity.shared",
        components: { Transform: { position: [0, 0, 0] }, GameplayState: { active: true } },
        tags: ["ecs"],
      },
    ],
    events: { scene: { value: true } },
    resources: { score: { value: 1 } },
  });
});

test("should merge input actions and axes deterministically", () => {
  const left: IInputIr = {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [{ id: "jump", bindings: [{ code: "Space", device: "keyboard" }] }],
    axes: [{ id: "move", negative: [{ code: "KeyA", device: "keyboard" }], positive: [{ code: "KeyD", device: "keyboard" }] }],
    persistedBindingOverrides: [{
      actionOrAxisId: "jump",
      control: "Space",
      device: "keyboard",
      profileId: "default",
      updatedAt: "2026-07-08T00:00:00.000Z",
    }],
  };
  const right: IInputIr = {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [
      { id: "fire", bindings: [{ code: "KeyF", device: "keyboard" }] },
      { id: "jump", bindings: [{ code: "KeyJ", device: "keyboard" }] },
    ],
    axes: [{ id: "look", negative: [{ code: "ArrowLeft", device: "keyboard" }], positive: [{ code: "ArrowRight", device: "keyboard" }] }],
    controlsSettings: { profileId: "default", rows: [] },
  };

  assert.deepEqual(mergeInputs(left, right), {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [
      { id: "fire", bindings: [{ code: "KeyF", device: "keyboard" }] },
      { id: "jump", bindings: [{ code: "KeyJ", device: "keyboard" }] },
    ],
    axes: [
      { id: "look", negative: [{ code: "ArrowLeft", device: "keyboard" }], positive: [{ code: "ArrowRight", device: "keyboard" }] },
      { id: "move", negative: [{ code: "KeyA", device: "keyboard" }], positive: [{ code: "KeyD", device: "keyboard" }] },
    ],
    controlsSettings: { profileId: "default", rows: [] },
    persistedBindingOverrides: [{
      actionOrAxisId: "jump",
      control: "Space",
      device: "keyboard",
      profileId: "default",
      updatedAt: "2026-07-08T00:00:00.000Z",
    }],
  });
});

test("should stack multiple UI roots deterministically", () => {
  const left: IUiIr = {
    schema: "threenative.ui",
    version: "0.1.0",
    root: { id: "z.panel", kind: "column" },
    focusOrder: ["z.panel"],
  };
  const right: IUiIr = {
    schema: "threenative.ui",
    version: "0.1.0",
    root: { id: "a.panel", kind: "column" },
    inputActions: { activate: "ui.activate" },
  };

  assert.deepEqual(mergeUis(left, right), {
    schema: "threenative.ui",
    version: "0.1.0",
    focusOrder: ["z.panel"],
    inputActions: { activate: "ui.activate" },
    root: {
      id: "ui.scope.root",
      kind: "stack",
      children: [
        { id: "a.panel", kind: "column" },
        { id: "z.panel", kind: "column" },
      ],
    },
  });
});
