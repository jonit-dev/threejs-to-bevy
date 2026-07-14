import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import type { IInteractionsIr, ISystemsIr, IWorldIr } from "@threenative/ir";
import { createInteractionRuntimeState, runInteractionFixedTick } from "./interactions.js";

test("interaction browser module keeps IR root imports type-only", async () => {
  const source = await readFile(new URL("../src/interactions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import \{[^\n]+\} from "@threenative\/ir";/m);
  assert.match(source, /from "@threenative\/ir\/feedback"/);
});

test("pickup interaction deduplicates sensor contact, rewards once, despawns, and completes once", () => {
  const world = makeWorld(); const state = createInteractionRuntimeState();
  const interactions = document({ id: "pickup", detector: { kind: "sensor-enter", source: { entity: "player" }, target: { withTag: "pickup" } }, gate: { kind: "once-per-target" }, effects: [{ kind: "addResource", resource: "Score", field: "value", value: 1 }, { kind: "despawn", target: "detected" }], complete: { when: { resource: "Score", field: "value", gte: 1 }, event: "match.win" } });
  const sensorEvents = [{ filteredOut: [], occupants: ["orb"], phase: "enter" as const, sensor: "player", step: 0 }];
  const first = runInteractionFixedTick({ interactions, sensorEvents, state, tick: 0, world });
  const second = runInteractionFixedTick({ interactions, sensorEvents, state, tick: 0, world });
  assert.equal((world.resources?.Score as { value: number }).value, 1);
  assert.equal(world.entities.some((entity) => entity.id === "orb"), false);
  assert.deepEqual(world.events?.["match.win"], [{}]);
  assert.deepEqual(first.traces[0], { tick: 0, interaction: "pickup", source: "player", target: "orb", detector: "sensor-enter", gate: "passed", effects: ["addResource", "despawn"], completion: true });
  assert.deepEqual(second.traces, []);
});

test("hazard overlap applies component damage and cooldown deterministically", () => {
  const world = makeWorld(); const state = createInteractionRuntimeState();
  const interactions = document({ id: "hazard", detector: { kind: "overlap", source: { entity: "player" }, target: { withTag: "hazard" } }, gate: { kind: "cooldown", ticks: 2 }, effects: [{ kind: "patchComponent", target: "source", component: "Health", patch: { value: 2 } }] });
  runInteractionFixedTick({ interactions, state, tick: 0, world });
  const blocked = runInteractionFixedTick({ interactions, state, tick: 1, world });
  assert.equal((world.entities[0]!.components.Health as { value: number }).value, 2);
  assert.equal(blocked.traces[0]?.gate, "blocked");
});

test("checkpoint event and projectile ray-hit use normalized event source-target pairs", () => {
  const world = makeWorld(); world.events = { checkpoint: [{ source: "player", target: "checkpoint" }], hit: [{ source: "player", target: "enemy" }] };
  const interactions: IInteractionsIr = { schema: "threenative.interactions", version: "0.1.0", id: "events", interactions: [
    { id: "checkpoint", detector: { kind: "event", event: "checkpoint", source: { entity: "player" }, target: { withTag: "checkpoint" } }, gate: { kind: "once" }, effects: [{ kind: "emitEvent", event: "checkpoint.hit" }] },
    { id: "projectile", detector: { kind: "ray-hit", event: "hit", source: { entity: "player" }, target: { withTag: "enemy" } }, gate: { kind: "once-per-target" }, effects: [{ kind: "despawn", target: "detected" }] },
  ] };
  const result = runInteractionFixedTick({ interactions, state: createInteractionRuntimeState(), tick: 4, world });
  assert.deepEqual(result.traces.map((trace) => trace.interaction), ["checkpoint", "projectile"]);
  assert.equal(world.entities.some((entity) => entity.id === "enemy"), false);
  assert.deepEqual(world.events["checkpoint.hit"], [{}]);
});

test("feedback and flow transition effects use existing portable declarations", () => {
  const world = makeWorld(); const state = createInteractionRuntimeState();
  const interactions = document({ id: "finish", detector: { kind: "distance2d", radius: 2, source: { entity: "player" }, target: { withTag: "checkpoint" } }, gate: { kind: "once" }, effects: [{ kind: "feedbackPreset", preset: "pickup" }, { kind: "requestFlowTransition", flow: "match", transition: "win" }] });
  const systems = { schema: "threenative.systems", version: "0.1.0", systems: [], feedbackPresets: [{ id: "pickup", camera: { duration: 0.1, intensity: 0.2 } }] } as unknown as ISystemsIr;
  const gameFlow = { schema: "threenative.game-flow" as const, version: "0.1.0" as const, flows: [{ id: "match", initial: "playing", states: [{ id: "playing" }, { id: "won" }], transitions: [{ id: "win", from: "playing", to: "won", trigger: { kind: "event" as const, event: "unused" }, actions: [{ kind: "emitEvent" as const, event: "flow.won" }] }] }] };
  const result = runInteractionFixedTick({ gameFlow, interactions, state, systems, tick: 0, world });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(state.flowStates.get("match"), "won");
  assert.deepEqual(world.events?.["flow.won"], [{}]);
  assert.deepEqual(result.traces[0]?.effects, ["feedbackPreset", "requestFlowTransition"]);
});

test("runtime reports unsupported missing feedback and flow actions instead of silently accepting", () => {
  const world = makeWorld();
  const interactions = document({ id: "bad", detector: { kind: "distance2d", radius: 2, source: { entity: "player" }, target: { withTag: "checkpoint" } }, gate: { kind: "once" }, effects: [{ kind: "feedbackPreset", preset: "missing" }, { kind: "requestFlowTransition", flow: "missing", transition: "missing" }] });
  const result = runInteractionFixedTick({ interactions, state: createInteractionRuntimeState(), tick: 0, world });
  assert.equal(result.diagnostics.filter((item) => item.code === "TN_INTERACTION_RUNTIME_UNSUPPORTED").length, 2);
  assert.deepEqual(result.traces[0]?.effects, []);
});

test("should use collider extents for overlap boundaries", () => {
  const world = makeWorld();
  world.entities[0]!.components.Collider!.size = [4, 2, 2];
  const enemy = world.entities.find((entity) => entity.id === "enemy")!;
  enemy.components.Collider!.size = [2, 2, 2];
  enemy.components.Transform!.position = [3, 0, 0];
  const interaction = document({ id: "boundary", detector: { kind: "overlap", source: { entity: "player" }, target: { entity: "enemy" } }, gate: { kind: "once" }, effects: [{ kind: "setResource", resource: "Score", field: "value", value: 1 }] });
  assert.equal(runInteractionFixedTick({ interactions: interaction, state: createInteractionRuntimeState(), tick: 0, world }).traces.length, 1);

  enemy.components.Transform!.position = [3.01, 0, 0];
  assert.equal(runInteractionFixedTick({ interactions: interaction, state: createInteractionRuntimeState(), tick: 0, world }).traces.length, 0);
});

test("should evaluate a predicate against a typed component", () => {
  const world = makeWorld();
  const interactions = document({ id: "typed-predicate", detector: { kind: "distance3d", radius: 2, source: { entity: "player" }, target: { entity: "enemy" } }, gate: { kind: "once" }, when: [{ target: "source", component: "Collider", field: "kind", equals: "box" }], effects: [{ kind: "setResource", resource: "Score", field: "value", value: 7 }] });
  runInteractionFixedTick({ interactions, state: createInteractionRuntimeState(), tick: 0, world });
  assert.equal((world.resources?.Score as { value: number }).value, 7);
});

test("should patch a typed component without creating a shadow extra component", () => {
  const world = makeWorld();
  const interactions = document({ id: "typed-patch", detector: { kind: "distance3d", radius: 2, source: { entity: "player" }, target: { entity: "enemy" } }, gate: { kind: "once" }, effects: [{ kind: "patchComponent", target: "source", component: "Transform", patch: { position: [5, 6, 7] } }] });
  runInteractionFixedTick({ interactions, state: createInteractionRuntimeState(), tick: 0, world });
  assert.deepEqual(world.entities[0]!.components.Transform, { position: [5, 6, 7] });
  assert.equal(Object.keys(world.entities[0]!.components).filter((name) => name === "Transform").length, 1);
});

test("should preserve quaternion rotation in setTransform", () => {
  const world = makeWorld();
  const rotation = [0, 0.70710677, 0, 0.70710677] as const;
  const interactions = document({ id: "rotation", detector: { kind: "distance3d", radius: 2, source: { entity: "player" }, target: { entity: "enemy" } }, gate: { kind: "once" }, effects: [{ kind: "setTransform", target: "source", rotation }] });
  runInteractionFixedTick({ interactions, state: createInteractionRuntimeState(), tick: 0, world });
  assert.deepEqual(world.entities[0]!.components.Transform!.rotation, rotation);
});

function document(interaction: IInteractionsIr["interactions"][number]): IInteractionsIr { return { schema: "threenative.interactions", version: "0.1.0", id: "test", interactions: [interaction] }; }
function makeWorld(): IWorldIr { return { schema: "threenative.world", version: "0.1.0", resources: { Score: { value: 0 } }, entities: [
  { id: "player", components: { Transform: { position: [0, 0, 0] }, Collider: { kind: "box", size: [1, 1, 1] }, Health: { value: 3 } } },
  { id: "orb", tags: ["pickup"], components: { Transform: { position: [0, 0, 0] }, Collider: { kind: "box", size: [1, 1, 1] } } },
  { id: "spikes", tags: ["hazard"], components: { Transform: { position: [0, 0, 0] }, Collider: { kind: "box", size: [1, 1, 1] } } },
  { id: "checkpoint", tags: ["checkpoint"], components: { Transform: { position: [1, 0, 0] }, Collider: { kind: "box", size: [1, 1, 1] } } },
  { id: "enemy", tags: ["enemy"], components: { Transform: { position: [1, 0, 0] }, Collider: { kind: "box", size: [1, 1, 1] } } },
] }; }
