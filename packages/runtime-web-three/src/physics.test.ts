import assert from "node:assert/strict";
import test from "node:test";

import type { IEnvironmentSceneIr, IWorldIr } from "@threenative/ir";

import { applyLivePhysicsAtPoint, disposePhysicsRuntime, initializePhysicsRuntime, markScriptAuthoredTransform, observePhysicsJointLoads, overlapLive, physicsBodyMass, physicsBodySleeping, physicsRuntimeCcdSubsteps, physicsRuntimeStats, preparePhysicsRuntime, queryHitObservation, raycastLive, shapeCastLive, stepPhysics, tracePhysicsJoints, traceRigidBodyPrimitive } from "./physics.js";

test("physics should detect trigger overlap", () => {
  const world = makePhysicsWorld();

  const events = stepPhysics(world);

  assert.deepEqual(events, [{ a: "pickup", b: "player", phase: "enter" }]);
  assert.deepEqual(world.events?.TriggerEvent, [{ a: "pickup", b: "player", phase: "enter" }]);
});

test("physics should emit deterministic enter stay and exit phases", () => {
  const world = makePhysicsWorld();

  assert.deepEqual(stepPhysics(world), [{ a: "pickup", b: "player", phase: "enter" }]);
  assert.deepEqual(stepPhysics(world), [{ a: "pickup", b: "player", phase: "stay" }]);

  const player = world.entities.find((entity) => entity.id === "player");
  if (player?.components.Transform !== undefined) {
    player.components.Transform.position = [4, 0, 0];
  }

  assert.deepEqual(stepPhysics(world), [{ a: "pickup", b: "player", phase: "exit" }]);
  assert.deepEqual(world.events?.TriggerEvent, [{ a: "pickup", b: "player", phase: "exit" }]);
});

test("physics should apply portable contact filters before emitting events", () => {
  const world = makePhysicsWorld();
  const pickup = world.entities.find((entity) => entity.id === "pickup");
  const player = world.entities.find((entity) => entity.id === "player");
  if (pickup?.components.Collider !== undefined && player?.components.Collider !== undefined) {
    pickup.components.Collider.layer = "pickup";
    pickup.components.Collider.mask = ["enemy"];
    player.components.Collider.layer = "player";
    player.components.Collider.mask = ["pickup"];
  }

  assert.deepEqual(stepPhysics(world), []);
  assert.deepEqual(world.events?.TriggerEvent, []);
});

test("physics should emit deterministic contact ordering across simultaneous pairs", () => {
  const world = makeUnorderedContactWorld();

  assert.deepEqual(stepPhysics(world), [
    { a: "alpha", b: "middle", phase: "enter" },
    { a: "alpha", b: "zeta", phase: "enter" },
    { a: "middle", b: "zeta", phase: "enter" },
    { a: "middle", b: "sensor", phase: "enter" },
  ]);
  assert.deepEqual(world.events?.CollisionEvent, [
    { a: "alpha", b: "middle", phase: "enter" },
    { a: "alpha", b: "zeta", phase: "enter" },
    { a: "middle", b: "zeta", phase: "enter" },
  ]);
  assert.deepEqual(world.events?.TriggerEvent, [{ a: "middle", b: "sensor", phase: "enter" }]);
});

test("physics should trace dynamic box falling onto a static floor", () => {
  const world = makeFallingBoxWorld();

  assert.deepEqual(traceRigidBodyPrimitive(world, { fixedDelta: 0.25, steps: 4 }), [
    {
      damping: 0,
      entity: "box",
      friction: 0.5,
      gravityScale: 1,
      position: [0, 1.386875, 0],
      restitution: 0,
      step: 1,
      velocity: [0, -2.4525, 0],
    },
    {
      contact: "floor",
      damping: 0,
      entity: "box",
      friction: 0.5,
      gravityScale: 1,
      position: [0, 0.55, 0],
      restitution: 0,
      step: 2,
      velocity: [0, 0, 0],
    },
    {
      contact: "floor",
      damping: 0,
      entity: "box",
      friction: 0.5,
      gravityScale: 1,
      position: [0, 0.55, 0],
      restitution: 0,
      step: 3,
      velocity: [0, 0, 0],
    },
    {
      contact: "floor",
      damping: 0,
      entity: "box",
      friction: 0.5,
      gravityScale: 1,
      position: [0, 0.55, 0],
      restitution: 0,
      step: 4,
      velocity: [0, 0, 0],
    },
  ]);
});

test("physics should trace dynamic body against environment terrain collider", () => {
  const source = makeFallingBoxWorld();
  const world = { ...source, entities: source.entities.filter((entity) => entity.id !== "floor") };

  assert.deepEqual(traceRigidBodyPrimitive(world, { environmentScene: makeHeightfieldEnvironment(), fixedDelta: 0.25, steps: 3 }).map((item) => ({ contact: item.contact, entity: item.entity, position: item.position, step: item.step })), [
    { contact: undefined, entity: "box", position: [0, 1.386875, 0], step: 1 },
    { contact: "terrain.reference.heightfield", entity: "box", position: [0, 0.55, 0], step: 2 },
    { contact: "terrain.reference.heightfield", entity: "box", position: [0, 0.55, 0], step: 3 },
  ]);
});

test("physics should apply gravity scale, damping, restitution, and friction in primitive trace", () => {
  const world = makeFallingBoxWorld();
  const box = world.entities.find((entity) => entity.id === "box");
  const floor = world.entities.find((entity) => entity.id === "floor");
  if (box?.components.RigidBody !== undefined && box.components.Collider !== undefined && floor?.components.Collider !== undefined) {
    box.components.RigidBody.damping = 0.4;
    box.components.RigidBody.gravityScale = 0.5;
    box.components.RigidBody.velocity = [1, 0, 0];
    box.components.Collider.friction = 0.25;
    box.components.Collider.restitution = 0.5;
    floor.components.Collider.friction = 0.75;
  }

  const observations = traceRigidBodyPrimitive(world, { fixedDelta: 0.25, steps: 4 });

  assert.deepEqual(observations[2], {
    contact: "floor",
    damping: 0.4,
    entity: "box",
    friction: 0.25,
    gravityScale: 0.5,
    position: [0.60975, 0.55, 0],
    restitution: 0.5,
    step: 3,
    velocity: [0.3645, 1.495412, 0],
  });
});

test("physics should settle stacked primitive bodies with deterministic contact order", () => {
  const world = makeStackedBoxWorld();

  const observations = traceRigidBodyPrimitive(world, { fixedDelta: 0.25, steps: 2 });

  assert.deepEqual(observations.filter((observation) => observation.step === 2).map((observation) => ({ contact: observation.contact, contacts: observation.contacts, entity: observation.entity, position: observation.position })), [
    { contact: "floor", contacts: undefined, entity: "lower", position: [0, 0.55, 0] },
    { contact: "lower", contacts: undefined, entity: "upper", position: [0, 1.55, 0] },
  ]);
});

test("physics should use bounded mesh collider metadata and CCD for high-speed track contacts", () => {
  const world = makeDynamicMeshCcdWorld();

  const observations = traceRigidBodyPrimitive(world, { fixedDelta: 0.25, steps: 1 });

  assert.deepEqual(observations, [
    {
      ccd: true,
      contact: "track",
      damping: 0,
      entity: "car",
      friction: 0.4,
      gravityScale: 0,
      position: [0, 0.35, 0],
      restitution: 0,
      step: 1,
      velocity: [0, 0, 0],
    },
  ]);
});

test("physics should report portable suspension joint metadata", () => {
  const world = makeDynamicMeshCcdWorld();
  world.entities.push({
    id: "wheel.fl",
    components: {
      Collider: { kind: "sphere" as const, radius: 0.35 },
      PhysicsJoint: { axis: [0, 1, 0] as const, connectedEntity: "car", damping: 0.6, kind: "suspension" as const, stiffness: 12, travel: 0.4 },
      RigidBody: { kind: "dynamic" as const },
      Transform: { position: [-0.8, 1.2, 1.2] as const },
    },
  });

  assert.deepEqual(tracePhysicsJoints(world), [{ axis: [0, 1, 0], connectedEntity: "car", entity: "wheel.fl", kind: "suspension" }]);
});

test("physics should solve hinge slider and suspension joints in Rapier", async () => {
  await initializePhysicsRuntime();
  const hinge = makeLiveJointWorld("hinge");
  const slider = makeLiveJointWorld("slider");
  const suspension = makeLiveJointWorld("suspension");

  for (let step = 0; step < 120; step += 1) {
    stepPhysics(hinge, 1 / 60);
    stepPhysics(slider, 1 / 60);
    stepPhysics(suspension, 1 / 60);
  }

  const hingePosition = hinge.entities.find((entity) => entity.id === "body")?.components.Transform?.position;
  const sliderPosition = slider.entities.find((entity) => entity.id === "body")?.components.Transform?.position;
  const suspensionPosition = suspension.entities.find((entity) => entity.id === "body")?.components.Transform?.position;
  assert.ok(hingePosition);
  assert.ok(sliderPosition);
  assert.ok(suspensionPosition);
  assert.ok(Math.abs(Math.hypot(...hingePosition) - 1) < 0.05, `hinge anchor drifted to ${hingePosition.join(",")}`);
  assert.ok(sliderPosition[0] <= 1.05 && sliderPosition[0] >= 0.9, `slider limit resolved to ${sliderPosition[0]}`);
  assert.ok(Math.abs(suspensionPosition[1]) <= 0.3, `suspension travel resolved to ${suspensionPosition[1]}`);

  disposePhysicsRuntime(hinge);
  disposePhysicsRuntime(slider);
  disposePhysicsRuntime(suspension);
});

test("fixed ball and rope joints should be created through the retained joint runtime", async () => {
  await initializePhysicsRuntime();
  const world = makeRichJointWorld();

  for (let step = 0; step < 30; step += 1) stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });

  assert.deepEqual(observePhysicsJointLoads(world).map(({ entity, kind }) => ({ entity, kind })), [
    { entity: "ball", kind: "ball" },
    { entity: "fixed", kind: "fixed" },
    { entity: "rope", kind: "rope" },
  ]);
  const fixedPosition = world.entities.find((entity) => entity.id === "fixed")?.components.Transform?.position;
  assert.ok(fixedPosition && Math.abs(fixedPosition[0] - 1) < 0.05, `fixed joint drifted to ${String(fixedPosition)}`);
  disposePhysicsRuntime(world);
});

test("joint component patches should reconcile without rebuilding unrelated bodies", async () => {
  await initializePhysicsRuntime();
  const world = makeRichJointWorld();
  world.entities = world.entities.filter((entity) => entity.id === "anchor" || entity.id === "fixed");

  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });
  const fixed = world.entities.find((entity) => entity.id === "fixed");
  assert.ok(fixed?.components.PhysicsJoint);
  fixed.components.PhysicsJoint = { connectedEntity: "anchor", kind: "ball" };
  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });

  assert.deepEqual(physicsRuntimeStats(world), { jointCreations: 2, jointRemovals: 1, rebuilds: 1 });
  delete fixed.components.PhysicsJoint;
  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });
  assert.deepEqual(physicsRuntimeStats(world), { jointCreations: 2, jointRemovals: 2, rebuilds: 1 });
  disposePhysicsRuntime(world);
});

test("joint motors should cap authored force before applying their impulse", async () => {
  await initializePhysicsRuntime();
  const world = makeLiveJointWorld("slider");
  const body = world.entities.find((entity) => entity.id === "body");
  assert.ok(body?.components.PhysicsJoint && body.components.RigidBody);
  body.components.RigidBody.velocity = [0, 0, 0];
  body.components.PhysicsJoint.motor = { damping: 10, maxForce: 2, mode: "velocity", target: 100 };

  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });

  assert.equal(observePhysicsJointLoads(world)[0]?.force, 2);
  disposePhysicsRuntime(world);
});

test("explicit suspension motors should replace the uncapped spring motor", async () => {
  await initializePhysicsRuntime();
  const world = makeLiveJointWorld("suspension");
  const body = world.entities.find((entity) => entity.id === "body");
  assert.ok(body?.components.PhysicsJoint && body.components.RigidBody);
  body.components.RigidBody.velocity = [0, 0, 0];
  body.components.PhysicsJoint.motor = { damping: 10, maxForce: 3, mode: "velocity", target: 100 };

  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });

  assert.equal(observePhysicsJointLoads(world)[0]?.force, 3);
  disposePhysicsRuntime(world);
});

test("fixed joints should hold their relative pose under a below-threshold load", async () => {
  await initializePhysicsRuntime();
  const world = makeRichJointWorld();
  world.entities = world.entities.filter((entity) => entity.id === "anchor" || entity.id === "fixed");
  const fixed = world.entities.find((entity) => entity.id === "fixed");
  const anchor = world.entities.find((entity) => entity.id === "anchor");
  assert.ok(fixed?.components.PhysicsJoint && fixed.components.RigidBody && fixed.components.Transform?.position && anchor?.components.Transform?.position);
  fixed.components.RigidBody.velocity = [0, 0, 0];
  fixed.components.PhysicsJoint.breakForce = 100;
  const initialRelative = fixed.components.Transform.position.map((value, index) => value - (anchor.components.Transform?.position?.[index] ?? 0));
  const initialRotation = fixed.components.Transform.rotation ?? [0, 0, 0, 1];
  preparePhysicsRuntime(world, undefined, [0, 0, 0]);
  assert.equal(applyLivePhysicsAtPoint(world, "fixed", [50, 0, 0], fixed.components.Transform.position, "force"), true);

  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });

  const position = fixed.components.Transform?.position;
  const rotation = fixed.components.Transform?.rotation ?? [0, 0, 0, 1];
  assert.ok(position && anchor.components.Transform?.position);
  const relative = position.map((value, index) => value - (anchor.components.Transform?.position?.[index] ?? 0));
  assert.ok(Math.hypot(...relative.map((value, index) => value - (initialRelative[index] ?? 0))) < 0.01);
  assert.ok(2 * Math.acos(Math.min(1, Math.abs(rotation.reduce((sum, value, index) => sum + value * (initialRotation[index] ?? 0), 0)))) < 0.01);
  assert.equal(observePhysicsJointLoads(world)[0]?.force, 50);
  disposePhysicsRuntime(world);
});

test("break thresholds should emit once and remove the joint before remaining substeps", async () => {
  await initializePhysicsRuntime();
  const world = makeRichJointWorld();
  world.entities = world.entities.filter((entity) => entity.id === "anchor" || entity.id === "fixed");
  const fixed = world.entities.find((entity) => entity.id === "fixed");
  assert.ok(fixed?.components.PhysicsJoint);
  fixed.components.PhysicsJoint.breakForce = 10;

  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });
  assert.equal(applyLivePhysicsAtPoint(world, "fixed", [1000, 0, 0], [1, 0, 0], "force"), true);
  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });
  assert.deepEqual((world.events?.JointBreakEvent as Array<{ connectedEntity: string; entity: string; kind: string; phase: string }>).map(({ connectedEntity, entity, kind, phase }) => ({ connectedEntity, entity, kind, phase })), [{ connectedEntity: "anchor", entity: "fixed", kind: "fixed", phase: "break" }]);
  assert.deepEqual(observePhysicsJointLoads(world), []);
  assert.deepEqual(physicsRuntimeStats(world), { jointCreations: 1, jointRemovals: 1, rebuilds: 1 });

  stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });
  assert.deepEqual(world.events?.JointBreakEvent, []);
  assert.deepEqual(observePhysicsJointLoads(world), []);
  assert.deepEqual(physicsRuntimeStats(world), { jointCreations: 1, jointRemovals: 1, rebuilds: 1 });
  disposePhysicsRuntime(world);
});

test("should rotate a body when force is applied off center", async () => {
  await initializePhysicsRuntime();
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [{
      id: "body",
      components: {
        CompoundCollider: { children: [{ id: "core", localPose: { position: [0, 0, 0] }, shape: { kind: "box", size: [2, 1, 1] } }] },
        RigidBody: { gravityScale: 0, kind: "dynamic", mass: 2 },
        Transform: { position: [0, 0, 0] },
      },
    }],
  };

  assert.equal(applyLivePhysicsAtPoint(world, "body", [0, 0, 4], [0, 1, 0], "impulse"), true);
  stepPhysics(world, 1 / 60);

  const body = world.entities[0]?.components.RigidBody;
  assert.ok((body?.velocity?.[2] ?? 0) > 1.9, `expected linear velocity, got ${String(body?.velocity)}`);
  assert.ok(Math.abs(body?.angularVelocity?.[0] ?? 0) > 1, `expected off-center angular velocity, got ${String(body?.angularVelocity)}`);
  disposePhysicsRuntime(world);
});

test("should report the live collider hit rather than conservative bounds", async () => {
  await initializePhysicsRuntime();
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [{
      id: "compound",
      components: {
        CompoundCollider: { children: [
          { id: "left", localPose: { position: [-2, 0, 0] }, shape: { kind: "sphere", radius: 0.25 } },
          { id: "right", localPose: { position: [2, 0, 0] }, shape: { kind: "sphere", radius: 0.25 } },
        ] },
        RigidBody: { kind: "static" },
        Transform: { position: [0, 0, 0] },
      },
    }],
  };

  const result = raycastLive(world, { direction: [0, 0, 1], maxDistance: 10, origin: [0, 0, -5] });
  assert.deepEqual(result, { hit: false }, "a conservative compound AABB would incorrectly report a center hit");
  const childResult = raycastLive(world, { direction: [0, 0, 1], maxDistance: 10, origin: [-2, 0, -5] });
  assert.equal(childResult.hit, true);
  if (childResult.hit) {
    assert.equal(queryHitObservation(childResult, world)?.child, "left");
    assert.ok(Math.abs(childResult.distance - 4.75) < 0.0001);
  }
  disposePhysicsRuntime(world);
});

test("live queries should preserve bilateral filters and union mask with layers", async () => {
  await initializePhysicsRuntime();
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [{
      id: "target",
      components: {
        Collider: { kind: "sphere", layer: "friend", mask: ["player"], radius: 0.5 },
        RigidBody: { kind: "static" },
        Transform: { position: [0, 0, 0] },
      },
    }],
  };

  assert.deepEqual(overlapLive(world, { layer: "enemy", layers: ["friend"], mask: ["hostile"], position: [0, 0, 0], shape: { kind: "sphere", radius: 1 } }), { entities: [] });
  assert.deepEqual(overlapLive(world, { layer: "player", layers: ["friend"], mask: ["hostile"], position: [0, 0, 0], shape: { kind: "sphere", radius: 1 } }), { entities: ["target"] });
  disposePhysicsRuntime(world);
});

test("live shape casts should report world-space contact points", async () => {
  await initializePhysicsRuntime();
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [{
      id: "wall",
      components: {
        Collider: { kind: "box", size: [1, 2, 2] },
        RigidBody: { kind: "static" },
        Transform: { position: [3, 1, 0] },
      },
    }],
  };

  assert.deepEqual(shapeCastLive(world, {
    direction: [1, 0, 0],
    maxDistance: 5,
    origin: [0, 1, 0],
    shape: { halfExtents: [0.25, 0.25, 0.25], kind: "box" },
  }), {
    distance: 2.25,
    entity: "wall",
    hit: true,
    normal: [-1, 0, 0],
    point: [2.5, 1, 0],
  });
  disposePhysicsRuntime(world);
});

test("live queries should retain custom gravity and environment terrain without rebuilding", async () => {
  await initializePhysicsRuntime();
  const world = makeFallingBoxWorld();
  world.entities = world.entities.filter((entity) => entity.id !== "floor");
  const environment = makeHeightfieldEnvironment();

  stepPhysics(world, 0.1, environment, { gravity: [4, 0, 0] });
  assert.equal(physicsRuntimeStats(world).rebuilds, 1);
  const terrain = raycastLive(world, { direction: [0, -1, 0], ignore: ["box"], maxDistance: 10, origin: [0, 4, 0] });
  assert.equal(terrain.hit && terrain.entity, "terrain.reference.heightfield");
  assert.equal(physicsRuntimeStats(world).rebuilds, 1);
  stepPhysics(world, 0.1, environment, { gravity: [4, 0, 0] });
  assert.equal(physicsRuntimeStats(world).rebuilds, 1);
  assert.ok((world.entities[0]?.components.RigidBody?.velocity?.[0] ?? 0) > 0.79);
  assert.equal(world.entities.some((entity) => entity.id === "terrain.reference.heightfield"), false);
  disposePhysicsRuntime(world);
});

test("retained Rapier events should identify the contacting compound child", async () => {
  await initializePhysicsRuntime();
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "compound",
        components: {
          CompoundCollider: { children: [
            { id: "left", localPose: { position: [-2, 0, 0] }, shape: { kind: "sphere", radius: 0.4 } },
            { id: "right", localPose: { position: [2, 0, 0] }, shape: { kind: "sphere", radius: 0.4 } },
          ] },
          RigidBody: { kind: "static" },
          Transform: { position: [0, 0, 0] },
        },
      },
      {
        id: "probe",
        components: {
          Collider: { kind: "sphere", radius: 0.4 },
          RigidBody: { gravityScale: 0, kind: "dynamic" },
          Transform: { position: [2.5, 0, 0] },
        },
      },
    ],
  };

  assert.deepEqual(stepPhysics(world), [{ a: "compound", b: "probe", childA: "right", phase: "enter" }]);
  assert.deepEqual(world.events?.CollisionEvent, [{ a: "compound", b: "probe", childA: "right", phase: "enter" }]);
  disposePhysicsRuntime(world);
});

test("retained Rapier events should preserve non-dynamic trigger pairs", async () => {
  await initializePhysicsRuntime();
  const world = makePhysicsWorld();

  assert.deepEqual(stepPhysics(world), [{ a: "pickup", b: "player", phase: "enter" }]);
  assert.deepEqual(world.events?.TriggerEvent, [{ a: "pickup", b: "player", phase: "enter" }]);
  disposePhysicsRuntime(world);
});

test("physics should reuse the Rapier world while topology is unchanged", async () => {
  await initializePhysicsRuntime();
  const world = makeFallingBoxWorld();

  stepPhysics(world, 1 / 60);
  stepPhysics(world, 1 / 60);

  assert.deepEqual(physicsRuntimeStats(world), { rebuilds: 1 });
  world.entities.push({
    id: "new-static",
    components: {
      Collider: { kind: "box", size: [1, 1, 1] },
      RigidBody: { kind: "static" },
      Transform: { position: [4, 0, 0] },
    },
  });
  stepPhysics(world, 1 / 60);
  assert.deepEqual(physicsRuntimeStats(world), { rebuilds: 2 });
  disposePhysicsRuntime(world);
});

test("physics should treat collider-only entities as static Rapier bodies", async () => {
  await initializePhysicsRuntime();
  const world = makeColliderOnlyFloorWorld();

  for (let step = 0; step < 180; step += 1) {
    stepPhysics(world, 1 / 60);
  }

  const floor = world.entities.find((entity) => entity.id === "floor");
  const boxY = world.entities.find((entity) => entity.id === "box")?.components.Transform?.position?.[1];
  assert.equal(floor?.components.RigidBody, undefined);
  assert.ok(boxY !== undefined && boxY > 0.55 && boxY < 0.7, `box should rest on collider-only floor, got y=${String(boxY)}`);
  disposePhysicsRuntime(world);
});

test("physics should map authored mass and inverseMass to exact Rapier body mass", async () => {
  await initializePhysicsRuntime();
  const world = makeColliderOnlyFloorWorld();
  const box = world.entities.find((entity) => entity.id === "box");
  if (box?.components.RigidBody !== undefined) {
    box.components.RigidBody.mass = 10;
  }
  world.entities.push({
    id: "inverse-mass-box",
    components: {
      Collider: { kind: "box", size: [2, 2, 2] },
      RigidBody: { inverseMass: 1, kind: "dynamic" },
      Transform: { position: [4, 3, 0] },
    },
  });

  stepPhysics(world, 1 / 60);

  assert.ok(Math.abs((physicsBodyMass(world, "box") ?? 0) - 10) < 0.000001);
  assert.ok(Math.abs((physicsBodyMass(world, "inverse-mass-box") ?? 0) - 1) < 0.000001);
  disposePhysicsRuntime(world);
});

test("physics should apply configured gravity and CCD substeps and honor disabled sleep", async () => {
  await initializePhysicsRuntime();
  const world = makeColliderOnlyFloorWorld();
  const box = world.entities.find((entity) => entity.id === "box");
  assert.ok(box?.components.RigidBody);
  box.components.RigidBody.ccd = { enabled: true, maxSubsteps: 7, mode: "linear" };
  box.components.RigidBody.gravityScale = 1;
  box.components.RigidBody.sleepThreshold = 0;
  box.components.RigidBody.velocity = [0, 0, 0];
  box.components.Transform!.position = [0, 3, 0];

  for (let step = 0; step < 180; step += 1) {
    stepPhysics(world, 1 / 60, undefined, { gravity: [1, 0, 0] });
  }

  assert.ok((box.components.Transform?.position?.[0] ?? 0) > 1);
  assert.equal(physicsRuntimeCcdSubsteps(world), 7);
  assert.equal(physicsBodySleeping(world, "box"), false);
  disposePhysicsRuntime(world);
});

test("physics should derive contact velocity from script-posed kinematic motion", async () => {
  await initializePhysicsRuntime();
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "platform",
        components: {
          Collider: { friction: 1, kind: "box", size: [4, 0.5, 4] },
          RigidBody: { kind: "kinematic" },
          Transform: { position: [0, 0, 0] },
        },
      },
      {
        id: "box",
        components: {
          Collider: { friction: 1, kind: "box", size: [1, 1, 1] },
          RigidBody: { kind: "dynamic" },
          Transform: { position: [0, 0.75, 0] },
        },
      },
    ],
  };
  for (let step = 0; step < 60; step += 1) {
    stepPhysics(world, 1 / 60);
  }
  world.entities[0]!.components.Transform!.position = [0.1, 0, 0];
  markScriptAuthoredTransform(world, "platform");
  stepPhysics(world, 1 / 60);

  assert.ok((world.entities[1]?.components.Transform?.position?.[0] ?? 0) > 0.001);
  assert.deepEqual(world.entities[0]?.components.Transform?.position, [0.1, 0, 0]);
  disposePhysicsRuntime(world);
});

test("retained physics should fail closed above the portable layer capacity", async () => {
  await initializePhysicsRuntime();
  const world: IWorldIr = {
    entities: Array.from({ length: 17 }, (_, index) => ({
      components: {
        Collider: { kind: "box" as const, layer: `layer-${index}`, size: [1, 1, 1] },
        Transform: { position: [index * 2, 0, 0] },
      },
      id: `body-${index}`,
    })),
    schema: "threenative.world",
    version: "0.1.0",
  };

  assert.throws(() => preparePhysicsRuntime(world), /TN_PHYSICS_LAYER_CAPACITY_EXCEEDED/u);
});

function makeRichJointWorld(): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "anchor",
        components: {
          Collider: { kind: "sphere", radius: 0.1, trigger: true },
          RigidBody: { kind: "static" },
          Transform: { position: [0, 0, 0] },
        },
      },
      ...(["fixed", "ball", "rope"] as const).map((kind, index) => ({
        id: kind,
        components: {
          Collider: { kind: "sphere" as const, radius: 0.1 },
          PhysicsJoint: { connectedEntity: "anchor", kind, ...(kind === "rope" ? { length: 3 } : {}) },
          RigidBody: { gravityScale: 0, kind: "dynamic" as const, velocity: kind === "fixed" ? [5, 0, 0] as const : [0, 0, 0] as const },
          Transform: { position: [index + 1, 0, 0] as const },
        },
      })),
    ],
  };
}

function makeLiveJointWorld(kind: "hinge" | "slider" | "suspension"): IWorldIr {
  const hinge = kind === "hinge";
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "anchor",
        components: {
          Collider: { kind: "sphere", radius: 0.1, trigger: true },
          RigidBody: { kind: "static" },
          Transform: { position: [0, 0, 0] },
        },
      },
      {
        id: "body",
        components: {
          Collider: { kind: "sphere", radius: 0.1 },
          PhysicsJoint: {
            anchor: hinge ? [-1, 0, 0] : [0, 0, 0],
            axis: hinge ? [0, 0, 1] : kind === "slider" ? [1, 0, 0] : [0, 1, 0],
            connectedEntity: "anchor",
            ...(kind === "slider" ? { limits: { max: 1, min: -1 } } : {}),
            ...(kind === "suspension" ? { damping: 8, stiffness: 40, travel: 0.25 } : {}),
            kind,
          },
          RigidBody: {
            gravityScale: hinge ? 1 : 0,
            kind: "dynamic",
            velocity: kind === "slider" ? [10, 0, 0] : kind === "suspension" ? [0, 5, 0] : [0, 0, 0],
          },
          Transform: { position: hinge ? [1, 0, 0] : [0, 0, 0] },
        },
      },
    ],
  };
}

function makeColliderOnlyFloorWorld(): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "floor",
        components: {
          Collider: { kind: "box", size: [10, 0.2, 10] },
          Transform: { position: [0, 0, 0] },
        },
      },
      {
        id: "box",
        components: {
          Collider: { kind: "box", size: [1, 1, 1] },
          RigidBody: { kind: "dynamic" },
          Transform: { position: [0, 3, 0] },
        },
      },
    ],
  };
}

function makePhysicsWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "player",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "kinematic" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "pickup",
        components: {
          Collider: { kind: "sphere" as const, radius: 0.5, trigger: true },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0.25, 0, 0] as const },
        },
      },
    ],
  };
}

function makeStackedBoxWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "floor",
        components: {
          Collider: { kind: "box" as const, size: [4, 0.1, 4] as const },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "lower",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "dynamic" as const, velocity: [0, 0, 0] as const },
          Transform: { position: [0, 0.8, 0] as const },
        },
      },
      {
        id: "upper",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "dynamic" as const, velocity: [0, 0, 0] as const },
          Transform: { position: [0, 1.9, 0] as const },
        },
      },
    ],
  };
}

function makeUnorderedContactWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "zeta",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "sensor",
        components: {
          Collider: { kind: "sphere" as const, radius: 0.5, trigger: true },
          RigidBody: { kind: "static" as const },
          Transform: { position: [1.05, 0, 0] as const },
        },
      },
      {
        id: "middle",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0.1, 0, 0] as const },
        },
      },
      {
        id: "alpha",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "static" as const },
          Transform: { position: [-0.1, 0, 0] as const },
        },
      },
    ],
  };
}

function makeFallingBoxWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "floor",
        components: {
          Collider: { friction: 0.5, kind: "box" as const, restitution: 0, size: [4, 0.1, 4] as const },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "box",
        components: {
          Collider: { friction: 0.5, kind: "box" as const, restitution: 0, size: [1, 1, 1] as const },
          RigidBody: { gravityScale: 1, kind: "dynamic" as const, velocity: [0, 0, 0] as const },
          Transform: { position: [0, 2, 0] as const },
        },
      },
    ],
  };
}

function makeHeightfieldEnvironment(): IEnvironmentSceneIr {
  return {
    schema: "threenative.environment-scene",
    version: "0.1.0",
    sourceAssets: [],
    terrain: {
      bounds: { min: [-2, -0.05, -2], max: [2, 0.05, 2] },
      chunks: [
        {
          bounds: { min: [-2, -0.05, -2], max: [2, 0.05, 2] },
          heightRange: { min: 0, max: 0 },
          id: "terrain.reference.chunk.0",
          mesh: "mesh.terrain.reference.chunk.0",
          sampleRange: { x: [0, 2], z: [0, 2] },
        },
      ],
      collider: {
        asset: "heightmap.reference",
        cellSize: 1,
        heightRange: { min: 0, max: 0 },
        heightScale: 1,
        kind: "heightfield",
        mesh: "mesh.terrain.reference.chunk.0",
        origin: [-2, 0, -2],
        sampleCount: [3, 3],
      },
      heightmap: { asset: "heightmap.reference", cellSize: 1, heightScale: 1, origin: [-2, 0, -2] },
      heightMode: "heightmap",
      id: "terrain.reference",
    },
    instances: [],
    path: { id: "path", points: [[0, 0, 0], [1, 0, 1]], width: 1 },
  };
}

function makeDynamicMeshCcdWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "track",
        components: {
          Collider: { friction: 0.4, kind: "mesh" as const, mesh: { bounds: { size: [8, 0.2, 16] as const }, source: "mesh.track", triangleCount: 256 }, restitution: 0 },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "car",
        components: {
          Collider: { friction: 0.4, kind: "mesh" as const, mesh: { bounds: { size: [2, 0.5, 4] as const }, source: "mesh.car", triangleCount: 128 }, restitution: 0 },
          RigidBody: { ccd: { enabled: true, maxSubsteps: 4, mode: "swept-aabb" as const }, gravityScale: 0, kind: "dynamic" as const, velocity: [0, -20, 0] as const },
          Transform: { position: [0, 3, 0] as const },
        },
      },
    ],
  };
}
