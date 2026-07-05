import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "./errors.js";
import { uiColorToken, uiComponent, uiComponentInstance, uiGlyphPrompt, uiLocalization, uiRecipe, uiSpacingToken, uiTheme, uiToastQueue, uiTooltip, validateUiWidgetSupport } from "./ui.js";

test("ui should reject virtual keyboard as unsupported in v9 widget set", () => {
  assert.throws(
    () => validateUiWidgetSupport({ unsupported: { virtualKeyboard: true } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_UI_WIDGET_VIRTUAL_KEYBOARD_UNSUPPORTED",
  );
});

test("ui theme helpers should create deterministic bounded token declarations", () => {
  const theme = uiTheme([
    uiSpacingToken("space.panel", 16),
    uiColorToken("color.panel", "#101820cc"),
  ]);

  assert.deepEqual(theme.tokens.map((token) => token.id), ["color.panel", "space.panel"]);
  assert.deepEqual(theme.tokens[0], { id: "color.panel", kind: "color", value: "#101820cc" });
});

test("ui component helpers should create deterministic component metadata", () => {
  const component = uiComponent({
    id: "inventorySlot",
    props: [{ id: "label", required: true }, { id: "count", defaultValue: "0" }],
    root: { id: "root", kind: "button" },
    slots: ["badge", "icon"],
  });
  const instance = uiComponentInstance("inventorySlot", { props: { count: "3", label: "Potion" } });

  assert.deepEqual(component.props?.map((prop) => prop.id), ["count", "label"]);
  assert.deepEqual(component.slots, ["badge", "icon"]);
  assert.deepEqual(instance, { ref: "inventorySlot", props: { count: "3", label: "Potion" } });
});

test("should create inventory recipe source with bindings", () => {
  const recipe = uiRecipe("inventory-grid", {
    id: "inventory",
    actions: { inspect: "item.inspect", back: "inventory.close" },
    bindings: { count: "InventoryState.count" },
    props: { items: 2 },
  });

  assert.deepEqual(recipe.nodes, [
    {
      id: "inventory",
      type: "column",
      label: "Inventory",
      layout: { anchor: "center", padding: 16 },
      responsive: [
        { target: "desktop", layout: { width: 640 } },
        { target: "mobile", layout: { width: 320 } },
        { target: "tablet", layout: { width: 520 } },
      ],
    },
    { id: "inventory.slot.1", label: "Slot 1", type: "button", action: "item.inspect", layout: { width: 96, height: 96 } },
    { id: "inventory.slot.2", label: "Slot 2", type: "button", action: "item.inspect", layout: { width: 96, height: 96 } },
  ]);
  assert.deepEqual(recipe.bindings, [{ node: "inventory.count", resource: "InventoryState.count" }]);
  assert.deepEqual(recipe.focusOrder, ["inventory.slot.1", "inventory.slot.2"]);
  assert.deepEqual(recipe.components[0]?.props, [{ id: "label", required: true }]);
  assert.deepEqual(recipe.screens[0], {
    id: "inventory",
    role: "menu",
    root: "inventory",
    stackPolicy: "push",
    focusScope: { entry: "inventory.slot.1", backAction: "inventory.close", inputCapture: "keyboard", restore: "previous" },
  });
  assert.deepEqual(recipe.provenance, { "recipes/inventory": { kind: "inventory-grid", source: "sdk.uiRecipe", version: 1 } });
});

test("should create bounded virtual inventory recipe source", () => {
  const recipe = uiRecipe("inventory-grid", { id: "inventory", props: { items: 120 } });

  assert.equal(recipe.nodes.length, 33);
  assert.deepEqual(recipe.nodes[0], {
    id: "inventory",
    type: "column",
    label: "Inventory",
    layout: { anchor: "center", padding: 16 },
    responsive: [
      { target: "desktop", layout: { width: 640 } },
      { target: "mobile", layout: { width: 320 } },
      { target: "tablet", layout: { width: 520 } },
    ],
    virtualRange: { buffer: 2, itemCount: 120, itemExtent: 104, orientation: "vertical", viewportExtent: 416 },
  });
});

test("should create attached ui recipe source", () => {
  const recipe = uiRecipe("nameplate", { id: "enemy.name", props: { targetId: "enemy.1", label: "Scout" } });

  assert.deepEqual(recipe.nodes, [
    {
      id: "enemy.name",
      type: "column",
      label: "Nameplate",
      attachTo: { target: { kind: "entity", id: "enemy.1" }, anchor: "top-center", localOffset: [0, 1.4, 0] },
      layout: { anchor: "center", padding: 6 },
    },
    { id: "enemy.name.label", type: "text", label: "Nameplate", text: "Scout", action: "enemy.name.select" },
  ]);
  assert.deepEqual(recipe.screens[0], {
    id: "enemy.name",
    role: "hud",
    root: "enemy.name",
    stackPolicy: "overlay",
    focusScope: { entry: "enemy.name.label", backAction: "ui.back", inputCapture: "none", restore: "previous" },
  });
});

test("should create ui affordance helper metadata", () => {
  assert.deepEqual(uiGlyphPrompt("Interact", { glyphSet: "gamepad", label: "A" }), { action: "Interact", glyphSet: "gamepad", label: "A" });
  assert.deepEqual(uiTooltip("interact", "Open the selected chest.", { delayMs: 250 }), { anchor: "interact", description: "Open the selected chest.", open: "focus", delayMs: 250 });
  assert.deepEqual(uiLocalization("prompt.open", "Open", { params: { item: "Chest" }, cases: { one: "Open chest", other: "Open chests" } }), {
    key: "prompt.open",
    fallback: "Open",
    cases: { one: "Open chest", other: "Open chests" },
    params: { item: "Chest" },
  });
  assert.deepEqual(uiToastQueue("combat", { coalesce: "count", durationMs: 2500, maxVisible: 2, stack: "up" }), {
    id: "combat",
    coalesce: "count",
    durationMs: 2500,
    maxVisible: 2,
    stack: "up",
  });
});
