import assert from "node:assert/strict";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";

import { createPhysicsDestructionRuntime, observePhysicsDestruction, queuePhysicsDestructionDamage, registerPhysicsDestructible, stepPhysicsDestruction, type IFractureManifest } from "./physicsDestruction.js";

test("destruction damage should resolve once per tick with stable bond and piece events", () => {
  const runtime = createPhysicsDestructionRuntime();
  const world = emptyWorld();
  registerPhysicsDestructible(runtime, { entity: "wall", fractureManifest: "fractures/wall.fracture.json" }, fractureManifest());
  queuePhysicsDestructionDamage(runtime, { amount: 20, assembly: "wall", bond: "bond.left", cause: { entity: "projectile", kind: "script" }, tick: 1 });
  queuePhysicsDestructionDamage(runtime, { amount: 35, assembly: "wall", bond: "bond.left", cause: { entity: "projectile", kind: "script" }, tick: 1 });

  const events = stepPhysicsDestruction(runtime, world, 1, 1 / 60);

  assert.deepEqual(events.map((event) => [event.type, event.type === "pieceActivated" || event.type === "budgetExceeded" ? event.piece : event.type === "damaged" || event.type === "bondBroken" ? event.bond : undefined]), [
    ["damaged", "bond.left"],
    ["bondBroken", "bond.left"],
    ["pieceActivated", "piece.core"],
    ["pieceActivated", "piece.left"],
  ]);
  assert.deepEqual(stepPhysicsDestruction(runtime, world, 1, 1 / 60), []);
  assert.deepEqual(world.events?.DestructionEvent, []);
});

test("destruction should enforce stable activation budgets and expose overflow policy", () => {
  const runtime = createPhysicsDestructionRuntime({ maxActivePieces: 1 });
  const world = emptyWorld();
  registerPhysicsDestructible(runtime, { activationBudget: 2, entity: "wall", fractureManifest: "fractures/wall.fracture.json" }, fractureManifest());
  queuePhysicsDestructionDamage(runtime, { amount: 100, assembly: "wall", bond: "bond.left", cause: { kind: "contact", contact: "contact.1" }, tick: 1 });

  const events = stepPhysicsDestruction(runtime, world, 1, 1 / 60);

  assert.deepEqual(observePhysicsDestruction(runtime).pieces.map(({ id, lifecycle }) => ({ id, lifecycle })), [
    { id: "piece.core", lifecycle: "active" },
    { id: "piece.left", lifecycle: "bound" },
    { id: "piece.right", lifecycle: "bound" },
  ]);
  assert.deepEqual(events.filter((event) => event.type === "budgetExceeded"), [{ assembly: "wall", cause: { contact: "contact.1", kind: "contact" }, piece: "piece.left", policy: "reject-new", tick: 1, type: "budgetExceeded" }]);
});

test("destruction cleanup should sleep and pool pieces within authored capacity", () => {
  const runtime = createPhysicsDestructionRuntime();
  const manifest = fractureManifest();
  manifest.budgets.maxActivePieces = 1;
  manifest.cleanup = { despawnAfterSeconds: 2, poolCapacity: 1, sleepAfterSeconds: 1 };
  const world = emptyWorld();
  registerPhysicsDestructible(runtime, { cleanupPolicy: "pool", entity: "wall", fractureManifest: "fractures/wall.fracture.json" }, manifest);
  queuePhysicsDestructionDamage(runtime, { amount: 100, assembly: "wall", bond: "bond.left", cause: { kind: "script" }, tick: 1 });

  stepPhysicsDestruction(runtime, world, 1, 1);
  assert.equal(observePhysicsDestruction(runtime).pieces.find((piece) => piece.id === "piece.core")?.lifecycle, "active");
  stepPhysicsDestruction(runtime, world, 2, 1);
  assert.equal(observePhysicsDestruction(runtime).pieces.find((piece) => piece.id === "piece.core")?.lifecycle, "active");
  stepPhysicsDestruction(runtime, world, 3, 1);
  assert.equal(observePhysicsDestruction(runtime).pieces.find((piece) => piece.id === "piece.core")?.lifecycle, "pooled");
});

test("recorded impacts should honor filters and break the same regional bonds", () => {
  const runtime = createPhysicsDestructionRuntime();
  const world = emptyWorld();
  registerPhysicsDestructible(runtime, { entity: "wall", fractureManifest: "fractures/wall.fracture.json", impactFilter: { layers: ["projectile"], minImpulse: 10 } }, fractureManifest());
  queuePhysicsDestructionDamage(runtime, { assembly: "wall", bond: "bond.left", cause: { contact: "contact.low", kind: "contact" }, impulse: 5, layer: "projectile", tick: 1 });
  assert.deepEqual(stepPhysicsDestruction(runtime, world, 1, 1 / 60), []);

  queuePhysicsDestructionDamage(runtime, { assembly: "wall", bond: "bond.left", cause: { contact: "contact.left", kind: "contact" }, impulse: 50, layer: "projectile", tick: 2 });
  assert.deepEqual(stepPhysicsDestruction(runtime, world, 2, 1 / 60).map((event) => event.type), ["damaged", "bondBroken", "pieceActivated", "pieceActivated"]);
  queuePhysicsDestructionDamage(runtime, { assembly: "wall", bond: "bond.right", cause: { contact: "contact.right", kind: "contact" }, impulse: 50, layer: "projectile", tick: 3 });
  assert.deepEqual(stepPhysicsDestruction(runtime, world, 3, 1 / 60).map((event) => event.type), ["damaged", "bondBroken", "pieceActivated", "assemblyBroken"]);
  assert.deepEqual(observePhysicsDestruction(runtime).bonds.map(({ broken, id }) => ({ broken, id })), [{ broken: true, id: "bond.left" }, { broken: true, id: "bond.right" }]);
});

test("destruction should use portable scene defaults and component cleanup policies", () => {
  const runtime = createPhysicsDestructionRuntime();
  assert.equal(runtime.maxActivePieces, 1024);
  const manifest = fractureManifest();
  manifest.budgets.maxActivePieces = 1;
  manifest.cleanup = { despawnAfterSeconds: 2, poolCapacity: 1, sleepAfterSeconds: 1 };
  const world = emptyWorld();
  registerPhysicsDestructible(runtime, { cleanupPolicy: "sleep", entity: "sleeping-wall", fractureManifest: "fractures/wall.fracture.json" }, manifest);
  registerPhysicsDestructible(runtime, { cleanupPolicy: "despawn", entity: "despawned-wall", fractureManifest: "wall.fracture" }, manifest);
  queuePhysicsDestructionDamage(runtime, { amount: 100, assembly: "sleeping-wall", bond: "bond.left", cause: { kind: "script" }, tick: 1 });
  queuePhysicsDestructionDamage(runtime, { amount: 100, assembly: "despawned-wall", bond: "bond.left", cause: { kind: "script" }, tick: 1 });

  stepPhysicsDestruction(runtime, world, 1, 1);
  stepPhysicsDestruction(runtime, world, 2, 1);
  assert.equal(pieceLifecycle(runtime, "sleeping-wall", "piece.core"), "sleeping");
  assert.equal(pieceLifecycle(runtime, "despawned-wall", "piece.core"), "active");
  stepPhysicsDestruction(runtime, world, 3, 1);
  assert.equal(pieceLifecycle(runtime, "sleeping-wall", "piece.core"), "sleeping");
  assert.equal(pieceLifecycle(runtime, "despawned-wall", "piece.core"), "despawned");
});

function fractureManifest(): IFractureManifest {
  return {
    bonds: [
      { health: 50, id: "bond.left", impulseThreshold: 50, pieces: ["piece.core", "piece.left"] },
      { health: 50, id: "bond.right", impulseThreshold: 50, pieces: ["piece.core", "piece.right"] },
    ],
    budgets: { maxActivePieces: 3, maxDepth: 1, overflowPolicy: "reject-new" },
    id: "wall.fracture",
    pieces: [
      { activationDepth: 0, collider: { halfExtents: [0.5, 0.5, 0.5], kind: "box" }, id: "piece.core", localPosition: [0, 0, 0], massFraction: 0.5 },
      { activationDepth: 1, collider: { halfExtents: [0.5, 0.5, 0.5], kind: "box" }, id: "piece.left", localPosition: [-1, 0, 0], massFraction: 0.25 },
      { activationDepth: 1, collider: { halfExtents: [0.5, 0.5, 0.5], kind: "box" }, id: "piece.right", localPosition: [1, 0, 0], massFraction: 0.25 },
    ],
    schema: "threenative.fracture-manifest",
    source: { kind: "primitive", seed: 7, sourceHash: "fixture-hash" },
    version: "0.1.0",
  };
}

function emptyWorld(): IWorldIr { return { entities: [], schema: "threenative.world", version: "0.1.0" }; }
function pieceLifecycle(runtime: ReturnType<typeof createPhysicsDestructionRuntime>, assembly: string, id: string): string | undefined { return observePhysicsDestruction(runtime).pieces.find((piece) => piece.assembly === assembly && piece.id === id)?.lifecycle; }
