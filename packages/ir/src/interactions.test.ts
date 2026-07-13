import assert from "node:assert/strict";
import test from "node:test";

import type { IInteractionsIr } from "./interactions.js";
import { validateInteractions } from "./interactionsValidation.js";
import type { IIrDiagnostic } from "./validate.js";

const context = {
  componentSchemas: { Health: { fields: { value: { kind: "number" as const } } } },
  eventSchemas: { "checkpoint.hit": { fields: {} }, "hit": { fields: {} }, "match.win": { fields: {} } },
  feedbackPresets: [{ id: "pickup" }] as never[],
  gameFlow: { schema: "threenative.game-flow" as const, version: "0.1.0" as const, flows: [{ id: "match", initial: "playing", states: [{ id: "playing" }, { id: "won" }], transitions: [{ id: "win", from: "playing", to: "won", trigger: { kind: "event" as const, event: "match.win" } }] }] },
  prefabs: { schema: "threenative.prefabs" as const, version: "0.1.0" as const, prefabs: [{ id: "prefab.reward", root: "root", entities: [{ id: "root", components: {} }] }] },
  resourceSchemas: { Score: { fields: { value: { kind: "number" as const } } } },
  world: { schema: "threenative.world" as const, version: "0.1.0" as const, entities: [
    { id: "player", tags: ["player"], components: { Transform: {} } },
    { id: "orb", tags: ["orb"], components: { Health: { value: 1 }, Transform: {} } },
  ] },
};

test("interaction validation accepts the closed V1 detector, gate, predicate, and effect vocabulary", () => {
  const detectors: IInteractionsIr["interactions"][number]["detector"][] = [
    { kind: "sensor-enter", source: { entity: "player" }, target: { withTag: "orb" }, fallback: { kind: "distance2d", radius: 1, source: { entity: "player" }, target: { withTag: "orb" } } },
    { kind: "sensor-exit", source: { entity: "player" }, target: { withComponent: "Health" } },
    { kind: "overlap", source: { entity: "player" }, target: { entity: "orb" } },
    { kind: "distance2d", radius: 1, source: { entity: "player" }, target: { entity: "orb" } },
    { kind: "distance3d", radius: 1, source: { entity: "player" }, target: { entity: "orb" } },
    { kind: "ray-hit", event: "hit", source: { entity: "player" }, target: { entity: "orb" } },
    { kind: "event", event: "hit", source: { entity: "player" }, target: { entity: "orb" } },
  ];
  const interactions: IInteractionsIr = {
    schema: "threenative.interactions", version: "0.1.0", id: "fixture",
    interactions: detectors.map((detector, index) => ({
      id: `interaction.${index}`,
      detector,
      gate: index === 0 ? { kind: "once-per-target" } : index === 1 ? { kind: "once" } : index === 2 ? { kind: "cooldown", ticks: 2 } : { kind: "equals", predicate: { resource: "Score", field: "value", equals: 0 } },
      when: [{ component: "Health", field: "value", target: "detected", equals: 1 }],
      effects: index === 0 ? [
        { kind: "addResource", resource: "Score", field: "value", value: 1 },
        { kind: "setResource", resource: "Score", field: "value", value: 2 },
        { kind: "patchComponent", target: "detected", component: "Health", patch: { value: 0 } },
        { kind: "emitEvent", event: "checkpoint.hit" },
        { kind: "feedbackPreset", preset: "pickup", target: "detected" },
        { kind: "setTransform", target: "detected", position: [0, 1, 0] },
        { kind: "instantiate", prefab: "prefab.reward", prefix: "reward" },
        { kind: "despawn", target: "detected" },
        { kind: "requestFlowTransition", flow: "match", transition: "win" },
      ] : [{ kind: "addResource", resource: "Score", field: "value", value: 1 }],
      complete: index === 0 ? { when: { resource: "Score", field: "value", gte: 2 }, event: "match.win" } : undefined,
    })),
  };
  const diagnostics: IIrDiagnostic[] = [];
  validateInteractions(interactions, "interactions.ir.json", context, diagnostics);
  assert.deepEqual(diagnostics, []);
});

test("interaction validation reports unsupported vocabulary and exclusive write conflicts", () => {
  const interactions = { schema: "threenative.interactions", version: "0.1.0", id: "bad", interactions: [
    { id: "a", detector: { kind: "lane-crossing" }, gate: { kind: "sometimes" }, effects: [{ kind: "script" }] },
    { id: "b", detector: { kind: "distance2d", radius: 1, source: { entity: "player" }, target: { entity: "orb" } }, gate: { kind: "once" }, effects: [{ kind: "setResource", resource: "Score", field: "value", value: 1 }] },
    { id: "c", detector: { kind: "distance2d", radius: 1, source: { entity: "player" }, target: { entity: "orb" } }, gate: { kind: "once" }, effects: [{ kind: "setResource", resource: "Score", field: "value", value: 2 }] },
  ] } as unknown as IInteractionsIr;
  const diagnostics: IIrDiagnostic[] = [];
  validateInteractions(interactions, "interactions.ir.json", context, diagnostics);
  assert.ok(diagnostics.some((item) => item.code === "TN_INTERACTION_DETECTOR_UNSUPPORTED"));
  assert.ok(diagnostics.some((item) => item.code === "TN_INTERACTION_GATE_UNSUPPORTED"));
  assert.ok(diagnostics.some((item) => item.code === "TN_INTERACTION_EFFECT_UNSUPPORTED"));
  assert.ok(diagnostics.some((item) => item.code === "TN_INTERACTION_WRITE_CONFLICT"));
});
