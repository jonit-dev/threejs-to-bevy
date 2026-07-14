import assert from "node:assert/strict";
import test from "node:test";

import { compareInteractionParity, type IInteractionParitySnapshot } from "./interactionParity.js";

const baseline: IInteractionParitySnapshot = { componentStorage: { player: { Collider: "typed", Health: "custom", Transform: "typed" } }, components: { player: { Collider: { kind: "box", size: [4, 2, 2] }, Health: { value: 2 }, Transform: { position: [0, 0, 0], rotation: [0, 0.70710677, 0, 0.70710677] } } }, diagnostics: [], entities: ["player"], resources: { Score: { value: 1 } }, traces: [{ tick: 1, interaction: "pickup", source: "player", target: "orb", detector: "sensor-enter", gate: "passed", effects: ["addResource", "despawn"], completion: true }] };

test("interaction parity accepts structurally identical normalized trace and live state", () => {
  assert.deepEqual(compareInteractionParity(baseline, structuredClone(baseline)), []);
});

test("should reject legacy native overlap output", () => {
  const legacy = structuredClone(baseline);
  legacy.traces.push({ tick: 1, interaction: "outside", source: "player", target: "outside", detector: "overlap", gate: "passed", effects: ["addResource"], completion: false });
  assert.deepEqual(compareInteractionParity(baseline, legacy).map((item) => item.path), ["interaction-parity/traces"]);
});

test("should reject extra-only typed state", () => {
  const legacy = structuredClone(baseline);
  legacy.componentStorage!.player!.Transform = "typed+custom-shadow";
  assert.deepEqual(compareInteractionParity(baseline, legacy).map((item) => item.path), ["interaction-parity/component-storage"]);
});

test("should reject a missing native rotation", () => {
  const legacy = structuredClone(baseline);
  delete (legacy.components!.player!.Transform as { rotation?: unknown }).rotation;
  assert.deepEqual(compareInteractionParity(baseline, legacy).map((item) => item.path), ["interaction-parity/components"]);
});

test("interaction parity negative controls catch reordered trace, double reward, and missed despawn", () => {
  const reordered = structuredClone(baseline); reordered.traces[0]!.effects.reverse();
  const doubleReward = structuredClone(baseline); doubleReward.resources = { Score: { value: 2 } };
  const missedDespawn = structuredClone(baseline); missedDespawn.entities.push("orb");
  assert.deepEqual(compareInteractionParity(baseline, reordered).map((item) => item.path), ["interaction-parity/traces"]);
  assert.deepEqual(compareInteractionParity(baseline, doubleReward).map((item) => item.path), ["interaction-parity/resources"]);
  assert.deepEqual(compareInteractionParity(baseline, missedDespawn).map((item) => item.path), ["interaction-parity/entities"]);
  for (const broken of [reordered, doubleReward, missedDespawn]) assert.ok(compareInteractionParity(baseline, broken).every((item) => item.code === "TN_INTERACTION_PARITY_MISMATCH"));
});
