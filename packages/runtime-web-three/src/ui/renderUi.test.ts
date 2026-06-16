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

test("ui should dispatch pause action from button", () => {
  const rendered = renderUi(makeUi(), makeWorld());

  rendered.trigger("pause");

  assert.deepEqual(rendered.actions, [{ action: "Pause", node: "pause" }]);
});

test("ui should keep disabled controls inert", () => {
  const rendered = renderUi(makeUi(), makeWorld());

  rendered.trigger("locked");

  assert.equal(rendered.root.children[2]?.disabled, true);
  assert.equal(rendered.root.children[2]?.focusable, false);
  assert.deepEqual(rendered.actions, []);
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
        { id: "locked", kind: "button", label: "Locked", action: "Locked", disabled: true },
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
