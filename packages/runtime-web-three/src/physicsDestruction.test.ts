import assert from "node:assert/strict";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";

import { createPhysicsDestructionRuntime, observePhysicsDestruction, queuePhysicsDestructionDamage, registerPhysicsDestructible, stepPhysicsDestruction, type IFractureManifest } from "./physicsDestruction.js";
import { disposePhysicsRuntime, initializePhysicsRuntime, observePhysicsDestructionBodies, preparePhysicsRuntime, stepPhysics } from "./physics.js";

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

test("piece activation should replace the intact body in retained Rapier without losing mass or momentum", async () => {
  await initializePhysicsRuntime();
  const runtime = createPhysicsDestructionRuntime();
  const world: IWorldIr = {
    entities: [{
      components: {
        Collider: { kind: "box", size: [2, 1, 1] },
        RigidBody: { angularVelocity: [0, 1, 0], gravityScale: 0, kind: "dynamic", mass: 10, velocity: [2, 0, 0] },
        Transform: { position: [0, 2, 0] },
      },
      id: "wall",
    }],
    schema: "threenative.world",
    version: "0.1.0",
  };
  const manifest = twoPieceManifest();
  registerPhysicsDestructible(runtime, { entity: "wall", fractureManifest: "fractures/wall.two.json" }, manifest);
  preparePhysicsRuntime(world, undefined, [0, 0, 0]);
  queuePhysicsDestructionDamage(runtime, { amount: 100, assembly: "wall", bond: "bond.main", cause: { kind: "script" }, tick: 1 });

  stepPhysicsDestruction(runtime, world, 1, 1 / 60);

  const observation = observePhysicsDestructionBodies(world, "wall");
  assert.equal(observation.assemblyCollisionActive, false);
  assert.deepEqual(observation.pieces.map(({ id, lifecycle }) => ({ id, lifecycle })), [
    { id: "wall/piece.left", lifecycle: "active" },
    { id: "wall/piece.right", lifecycle: "active" },
  ]);
  assert.ok(Math.abs(observation.pieces.reduce((sum, piece) => sum + piece.mass, 0) - 10) < 0.000001);
  assert.ok(Math.abs(observation.pieces.reduce((sum, piece) => sum + piece.mass * piece.velocity[0], 0) - 20) < 0.000001);
  const handles = observation.pieces.map((piece) => piece.handle);
  assert.deepEqual(stepPhysicsDestruction(runtime, world, 1, 1 / 60), []);
  assert.deepEqual(observePhysicsDestructionBodies(world, "wall").pieces.map((piece) => piece.handle), handles);
  queuePhysicsDestructionDamage(runtime, { amount: 100, assembly: "wall", bond: "bond.main", cause: { kind: "script" }, tick: 2 });
  assert.deepEqual(stepPhysicsDestruction(runtime, world, 2, 1 / 60), []);
  assert.deepEqual(observePhysicsDestructionBodies(world, "wall").pieces.map((piece) => piece.handle), handles);
  disposePhysicsRuntime(world);
});

test("regional activation should retain unrelated bound pieces as stable fixed bodies", async () => {
  await initializePhysicsRuntime();
  const runtime = createPhysicsDestructionRuntime();
  const world: IWorldIr = {
    entities: [{
      components: {
        Collider: { kind: "box", size: [3, 1, 1] },
        RigidBody: { gravityScale: 0, kind: "dynamic", mass: 12 },
        Transform: { position: [0, 2, 0] },
      },
      id: "wall",
    }],
    schema: "threenative.world",
    version: "0.1.0",
  };
  const manifest = fractureManifest();
  registerPhysicsDestructible(runtime, { entity: "wall", fractureManifest: "fractures/wall.fracture.json" }, manifest);
  preparePhysicsRuntime(world, undefined, [0, 0, 0]);
  queuePhysicsDestructionDamage(runtime, { amount: 100, assembly: "wall", bond: "bond.left", cause: { kind: "script" }, tick: 1 });

  stepPhysicsDestruction(runtime, world, 1, 1 / 60);

  const first = observePhysicsDestructionBodies(world, "wall");
  assert.deepEqual(first.pieces.map(({ id, lifecycle }) => ({ id, lifecycle })), [
    { id: "wall/piece.core", lifecycle: "active" },
    { id: "wall/piece.left", lifecycle: "active" },
    { id: "wall/piece.right", lifecycle: "bound" },
  ]);
  assert.ok(Math.abs(first.pieces.reduce((sum, piece) => sum + piece.mass, 0) - 12) < 0.000001);
  const bound = first.pieces.find((piece) => piece.lifecycle === "bound");
  assert.ok(bound !== undefined);
  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });
  const nextBound = observePhysicsDestructionBodies(world, "wall").pieces.find((piece) => piece.lifecycle === "bound");
  assert.equal(nextBound?.handle, bound.handle);
  assert.deepEqual(nextBound?.position, bound.position);
  disposePhysicsRuntime(world);
});

test("retained Rapier contacts should feed destruction damage without a manual contact queue", async () => {
  await initializePhysicsRuntime();
  const runtime = createPhysicsDestructionRuntime();
  const world: IWorldIr = {
    entities: [
      { components: { Collider: { kind: "box", size: [1, 2, 2] }, RigidBody: { gravityScale: 0, kind: "dynamic", mass: 10 }, Transform: { position: [0, 0, 0] } }, id: "wall" },
      { components: { Collider: { kind: "sphere", radius: 0.25 }, RigidBody: { ccd: { enabled: true, mode: "linear" }, gravityScale: 0, kind: "dynamic", mass: 1, velocity: [20, 0, 0] }, Transform: { position: [-2, 0, 0] } }, id: "projectile" },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  };
  const manifest = twoPieceManifest();
  manifest.bonds[0]!.health = 0.1;
  manifest.bonds[0]!.impulseThreshold = 0.1;
  registerPhysicsDestructible(runtime, { entity: "wall", fractureManifest: "fractures/wall.two.json" }, manifest);
  preparePhysicsRuntime(world, undefined, [0, 0, 0]);

  const eventTypes: string[] = [];
  for (let tick = 0; tick < 12 && !eventTypes.includes("bondBroken"); tick += 1) {
    stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });
    eventTypes.push(...stepPhysicsDestruction(runtime, world, tick, 1 / 60).map((event) => event.type));
  }

  assert.ok(eventTypes.includes("bondBroken"));
  assert.equal(observePhysicsDestructionBodies(world, "wall").assemblyCollisionActive, false);
  disposePhysicsRuntime(world);
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

function twoPieceManifest(): IFractureManifest {
  return {
    bonds: [{ health: 50, id: "bond.main", impulseThreshold: 50, pieces: ["piece.left", "piece.right"] }],
    budgets: { maxActivePieces: 2, maxDepth: 0, overflowPolicy: "reject-new" },
    id: "wall.two",
    pieces: [
      { activationDepth: 0, collider: { halfExtents: [0.5, 0.5, 0.5], kind: "box" }, id: "piece.left", localPosition: [-0.5, 0, 0], massFraction: 0.5 },
      { activationDepth: 0, collider: { halfExtents: [0.5, 0.5, 0.5], kind: "box" }, id: "piece.right", localPosition: [0.5, 0, 0], massFraction: 0.5 },
    ],
    schema: "threenative.fracture-manifest",
    source: { kind: "primitive", seed: 9, sourceHash: "fixture-hash" },
    version: "0.1.0",
  };
}
