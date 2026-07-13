import assert from "node:assert/strict";
import test from "node:test";
import { expandRegistryDocumentPreset, listRegistryDocumentPresetIds } from "./documentPresets.js";

test("registry document presets expand compact ownership references deterministically", () => {
  assert.deepEqual(listRegistryDocumentPresetIds(), ["flow.ready-playing-win", "game-archetype.top-down", "sequence.intro-camera"]);
  const first = expandRegistryDocumentPreset({ preset: "flow.ready-playing-win" });
  assert.deepEqual(first, expandRegistryDocumentPreset({ preset: "flow.ready-playing-win" }));
  assert.equal((first as { initial: string }).initial, "ready");
});

test("registry document presets preserve unknown documents", () => {
  const source = { preset: "not-registered", value: 1 };
  assert.equal(expandRegistryDocumentPreset(source), source);
});
