import assert from "node:assert/strict";
import test from "node:test";

import type { IUiIr, IWorldIr } from "@threenative/ir";

import { renderUi } from "./renderUi.js";

test("ui should update health bar from resource", () => {
  const world = makeWorld();
  const rendered = renderUi(makeUi(), world);

  assert.equal(rendered.root.children[0]?.value, 10);

  world.resources = { Health: { current: 5 } };
  rendered.update();

  assert.equal(rendered.root.children[0]?.value, 5);
});

test("ui should prefer resource binding text over authored fallback text", () => {
  const world = makeWorld();
  world.resources = { ...world.resources, Score: { text: "Score 3" } };
  const rendered = renderUi(makeUi(), world);

  assert.equal(rendered.root.children[3]?.text, "Score 3");

  world.resources = { ...world.resources, Score: { text: "Score 9" } };
  rendered.update();

  assert.equal(rendered.root.children[3]?.text, "Score 9");
});

test("ui should dispatch pause action from button", () => {
  const rendered = renderUi(makeUi(), makeWorld());

  rendered.trigger("pause");

  assert.deepEqual(rendered.actions, [{ action: "Pause", node: "pause" }]);
});

test("ui should update minimap markers from resource binding", () => {
  const world = makeWorld();
  world.resources = { ...world.resources, Minimap: { state: JSON.stringify({ markers: [{ x: 1, z: 2, color: "#f97316", label: "P" }] }) } };
  const rendered = renderUi(makeUi(), world);

  assert.deepEqual(rendered.root.children[2]?.minimap?.markers, [{ x: 1, z: 2, color: "#f97316", label: "P" }]);

  world.resources = { ...world.resources, Minimap: { state: JSON.stringify({ markers: [{ x: 5, z: 6, color: "#22d3ee" }] }) } };
  rendered.update();

  assert.deepEqual(rendered.root.children[2]?.minimap?.markers, [{ x: 5, z: 6, color: "#22d3ee" }]);
});

function makeUi(): IUiIr {
  return {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "hud",
      kind: "column",
      children: [
        { id: "health", kind: "bar", max: 10, binding: { kind: "resource", name: "Health", field: "current" } },
        { id: "pause", kind: "button", label: "Pause", action: "Pause" },
        {
          id: "minimap",
          kind: "minimap",
          binding: { kind: "resource", name: "Minimap", field: "state" },
          minimap: {
            bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
            paths: [{ points: [[0, 0], [10, 10]], color: "#ffffff" }],
            markers: [],
          },
        },
        { id: "score", kind: "text", text: "Score 0", binding: { kind: "resource", name: "Score", field: "text" } },
      ],
    },
  };
}

function makeWorld(): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [],
    resources: { Health: { current: 10 } },
  };
}
