import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { loadBundle } from "../loadBundle.js";
import { traceUiNavigation } from "./navigation.js";
import type { IUiNodeIr } from "@threenative/ir";

test("ui navigation trace should follow focus order and activate actions", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/rich-ui-navigation/game.bundle"));
  const trace = traceUiNavigation(bundle.ui!, { events: ["tab", "activate"] });

  assert.deepEqual(trace, {
    events: [
      { focus: "settings", input: "tab", kind: "focus" },
      { action: "OpenSettings", focus: "settings", input: "activate", kind: "activate" },
    ],
    finalFocus: "settings",
    focusOrder: ["play", "settings"],
    initialFocus: "play",
    safeArea: { edges: ["top", "bottom"], mode: "avoid" },
  });
});

test("ui navigation trace should support reverse tab navigation", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/rich-ui-navigation/game.bundle"));
  const trace = traceUiNavigation(bundle.ui!, { events: ["tab", "shiftTab"] });

  assert.deepEqual(trace.events, [
    { focus: "settings", input: "tab", kind: "focus" },
    { focus: "play", input: "shiftTab", kind: "focus" },
  ]);
  assert.equal(trace.finalFocus, "play");
});

test("ui navigation trace should skip disabled nodes for sequential and explicit focus", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/rich-ui-navigation/game.bundle"));
  const ui = structuredClone(bundle.ui!);
  const play = findNode(ui.root, "play");
  const settings = findNode(ui.root, "settings");
  if (play !== undefined) play.navigation = { right: "settings" };
  if (settings !== undefined) settings.disabled = true;
  ui.root.children?.push({ id: "credits", kind: "button", action: "Credits", label: "Credits" });
  ui.focusOrder = ["play", "settings", "credits"];

  const trace = traceUiNavigation(ui, { events: ["right", "activate"] });

  assert.deepEqual(trace.focusOrder, ["play", "credits"]);
  assert.deepEqual(trace.events, [
    { focus: "credits", input: "right", kind: "focus" },
    { action: "Credits", focus: "credits", input: "activate", kind: "activate" },
  ]);
});

function findNode(node: IUiNodeIr, id: string): IUiNodeIr | undefined {
  if (node.id === id) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
