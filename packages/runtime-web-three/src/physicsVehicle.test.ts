import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { PHYSICS_INVARIANT_REGISTRY, type IPhysicsSurfaceComponent, type IWheelControlInput, type IWorldIr } from "@threenative/ir";

import { disposePhysicsRuntime, initializePhysicsRuntime, preparePhysicsRuntime, stepPhysics } from "./physics.js";
import type { IThreeWorld } from "./mapWorld.js";
import { buildPhysicsVehicleDebugOverlay, disposePhysicsVehicleRuntime, observePhysicsVehicles, observePhysicsVehicleVisuals, setPhysicsVehicleControlInput, stepPhysicsVehicles, tracePhysicsVehicleControls, updatePhysicsVehicleVisuals } from "./physicsVehicle.js";

test("vehicle suspension settles under static load with bounded compression", async () => {
  await initializePhysicsRuntime();
  const world = makeVehicleWorld({ surfaceGrip: 1 });
  const invariant = PHYSICS_INVARIANT_REGISTRY.staticLoad;
  const terminalLoads: number[] = [];
  const rideHeights: number[] = [];

  for (let step = 0; step < invariant.settleSteps + invariant.sampleWindowSteps; step += 1) {
    preparePhysicsRuntime(world);
    stepPhysicsVehicles(world, 1 / 60);
    stepPhysics(world, 1 / 60);
    if (step >= invariant.settleSteps) {
      terminalLoads.push(observePhysicsVehicles(world)[0]?.wheels.reduce((sum, wheel) => sum + wheel.normalLoad, 0) ?? 0);
      rideHeights.push(world.entities.find((entity) => entity.id === "chassis")?.components.Transform?.position?.[1] ?? Number.NaN);
    }
  }

  const observation = observePhysicsVehicles(world)[0];
  assert.ok(observation !== undefined);
  const chassis = world.entities.find((entity) => entity.id === "chassis");
  const mass = chassis?.components.RigidBody?.mass ?? 1;
  const chassisWeight = mass * 9.81;
  const meanTotalNormalLoad = terminalLoads.reduce((sum, load) => sum + load, 0) / terminalLoads.length;
  const rideHeightSpan = Math.max(...rideHeights) - Math.min(...rideHeights);
  const diagnostic = JSON.stringify({ chassis, chassisWeight, invariant, meanTotalNormalLoad, observation, rideHeightSpan });
  assert.equal(observation.wheels.every((wheel) => wheel.grounded), true, diagnostic);
  assert.equal(observation.wheels.every((wheel) => wheel.compression > 0 && wheel.compression <= 0.5), true, JSON.stringify(observation));
  assert.equal(observation.wheels.every((wheel) => wheel.normalLoad > 0), true, diagnostic);
  assert.ok(meanTotalNormalLoad >= chassisWeight * invariant.minTotalNormalLoadWeightRatio, diagnostic);
  assert.ok(meanTotalNormalLoad <= chassisWeight * invariant.maxTotalNormalLoadWeightRatio, diagnostic);
  assert.ok(rideHeightSpan <= invariant.maxRideHeightSpan, diagnostic);
  assert.ok(Math.abs(chassis?.components.RigidBody?.velocity?.[1] ?? Infinity) < 0.1, diagnostic);
  dispose(world);
});

test("lower-grip ice measurably reduces driven acceleration", async () => {
  await initializePhysicsRuntime();
  const asphalt = makeVehicleWorld({ surfaceGrip: 1 });
  const ice = makeVehicleWorld({ surfaceGrip: 0.05 });
  const input: IWheelControlInput = { brake: 0, drive: 1, steering: 0 };
  setPhysicsVehicleControlInput(asphalt, "chassis", input);
  setPhysicsVehicleControlInput(ice, "chassis", input);

  for (let step = 0; step < 60; step += 1) {
    for (const world of [asphalt, ice]) {
      preparePhysicsRuntime(world);
      stepPhysicsVehicles(world, 1 / 60);
      stepPhysics(world, 1 / 60);
    }
  }

  const asphaltSpeed = asphalt.entities.find((entity) => entity.id === "chassis")?.components.RigidBody?.velocity?.[2] ?? 0;
  const iceSpeed = ice.entities.find((entity) => entity.id === "chassis")?.components.RigidBody?.velocity?.[2] ?? 0;
  assert.ok(Math.abs(asphaltSpeed) > Math.abs(iceSpeed) * 1.5, `expected asphalt ${asphaltSpeed} to exceed ice ${iceSpeed}`);
  dispose(asphalt);
  dispose(ice);
});

test("vehicle observations preserve authored wheel order", async () => {
  await initializePhysicsRuntime();
  const world = makeVehicleWorld({ surfaceGrip: 1, wheelIds: ["rear-right", "front-left", "rear-left", "front-right"] });

  preparePhysicsRuntime(world);
  stepPhysicsVehicles(world, 1 / 60);

  const observation = observePhysicsVehicles(world)[0];
  assert.equal(observation?.step, 0);
  assert.deepEqual(observation?.wheels.map((wheel) => wheel.wheelId), ["rear-right", "front-left", "rear-left", "front-right"]);
  assert.deepEqual(observation?.wheels.map((wheel) => wheel.surface), ["ground", "ground", "ground", "ground"]);
  const debug = buildPhysicsVehicleDebugOverlay(world);
  assert.equal(debug.enabled, true);
  assert.deepEqual(debug.primitives.map((primitive) => primitive.id), [
    "chassis:rear-right:cast", "chassis:rear-right:contact",
    "chassis:front-left:cast", "chassis:front-left:contact",
    "chassis:rear-left:cast", "chassis:rear-left:contact",
    "chassis:front-right:cast", "chassis:front-right:contact",
  ]);
  assert.equal(debug.rows.every((row) => row.value.includes("compression=") && row.value.includes("slip=") && row.value.includes("surface=ground")), true);
  dispose(world);
});

test("negative drive is causal only for wheels authored as driven", async () => {
  await initializePhysicsRuntime();
  const driven = makeVehicleWorld({ driven: true, surfaceGrip: 1 });
  const freeRolling = makeVehicleWorld({ driven: false, surfaceGrip: 1 });
  const reverse: IWheelControlInput = { brake: 0, drive: -1, steering: 0 };
  setPhysicsVehicleControlInput(driven, "chassis", reverse);
  setPhysicsVehicleControlInput(freeRolling, "chassis", reverse);

  for (let step = 0; step < 30; step += 1) {
    for (const world of [driven, freeRolling]) {
      preparePhysicsRuntime(world, undefined, [0, 0, 0]);
      stepPhysicsVehicles(world, 1 / 60);
      stepPhysics(world, 1 / 60, undefined, { gravity: [0, 0, 0] });
    }
  }

  const drivenSpeed = driven.entities.find((entity) => entity.id === "chassis")?.components.RigidBody?.velocity?.[2] ?? 0;
  const freeSpeed = freeRolling.entities.find((entity) => entity.id === "chassis")?.components.RigidBody?.velocity?.[2] ?? 0;
  assert.ok(Math.abs(drivenSpeed) > 0.1, `expected causal reverse velocity, got ${drivenSpeed}`);
  assert.ok(Math.abs(freeSpeed) < 0.01, `non-driven wheels responded to drive input: ${freeSpeed}`);
  dispose(driven);
  dispose(freeRolling);
});

test("wheel visuals interpolate presentation state without mutating authored transforms", async () => {
  await initializePhysicsRuntime();
  const world = JSON.parse(await readFile(fileURLToPath(new URL("../../ir/fixtures/conformance/advanced-physics-wheels/game.bundle/world.ir.json", import.meta.url)), "utf8")) as IWorldIr;
  const wheelIds = ["rear-right", "front-left", "rear-left", "front-right"];
  const targetIds = wheelIds.map((wheelId) => `wheel-visual-${wheelId}`);
  const assembly = world.entities.find((entity) => entity.id === "chassis")?.components.WheelAssembly;
  assert.deepEqual(assembly?.wheels.map((wheel) => wheel.visual), targetIds);
  assert.deepEqual(targetIds.map((targetId) => world.entities.find((entity) => entity.id === targetId)?.components), targetIds.map(() => ({ Hierarchy: { parent: "chassis" }, Transform: { position: [0, 0, 0] } })));
  const chassisObject = new THREE.Object3D();
  chassisObject.position.set(0, 1.02, 25);
  const objects = new Map(targetIds.map((targetId) => {
    const object = new THREE.Object3D();
    chassisObject.add(object);
    return [targetId, object] as const;
  }));
  const mapped = { objectsById: new Map<string, THREE.Object3D>([["chassis", chassisObject], ...objects]) } as IThreeWorld;
  const authoredBefore = JSON.stringify(world);

  setPhysicsVehicleControlInput(world, "chassis", { brake: 0, drive: 1, steering: 0.5 });
  preparePhysicsRuntime(world);
  stepPhysicsVehicles(world, 1 / 120);
  const previous = observePhysicsVehicleVisuals(world, "chassis", 0);
  const halfway = observePhysicsVehicleVisuals(world, "chassis", 0.5);
  const current = observePhysicsVehicleVisuals(world, "chassis", 1);
  updatePhysicsVehicleVisuals(world, mapped, 0.5);

  assert.equal(JSON.stringify(world), authoredBefore);
  assert.deepEqual(halfway.map((visual) => [visual.wheelId, visual.targetId]), wheelIds.map((wheelId, index) => [wheelId, targetIds[index]]));
  halfway.forEach((visual, index) => {
    const expectedLocal = chassisObject.worldToLocal(new THREE.Vector3(...visual.interpolatedPosition));
    assert.deepEqual(objects.get(visual.targetId)?.position.toArray(), expectedLocal.toArray());
    assert.equal(objects.get(visual.targetId)?.rotation.x, visual.interpolatedSpinAngle);
    assert.equal(objects.get(visual.targetId)?.rotation.y, visual.interpolatedSteeringAngle);
    assert.equal(objects.get(visual.targetId)?.rotation.z, Math.PI / 2);
    assert.ok(Math.abs(visual.interpolatedSpinAngle) > 0, JSON.stringify(visual));
    assert.ok(Math.abs(visual.interpolatedSpinAngle - (previous[index]!.interpolatedSpinAngle + current[index]!.interpolatedSpinAngle) / 2) < 1e-9, JSON.stringify({ previous: previous[index], visual, current: current[index] }));
    assert.ok(Math.abs(visual.interpolatedPosition[1] - previous[index]!.interpolatedPosition[1]) > 0, JSON.stringify({ previous: previous[index], visual }));
  });
  assert.deepEqual(halfway.map((visual) => Number(visual.interpolatedSteeringAngle.toFixed(6))), [0, 0.15, 0, 0.15]);
  assert.deepEqual(halfway.map((visual) => visual.steeringAngle), [0, 0.3, 0, 0.3]);
  dispose(world);
});

test("wheel visual spin stays bounded and interpolates across wrap by the shortest arc", async () => {
  await initializePhysicsRuntime();
  const world = makeVehicleWorld({ surfaceGrip: 1 });
  const wheel = world.entities.find((entity) => entity.id === "chassis")?.components.WheelAssembly?.wheels[0];
  assert.ok(wheel !== undefined);
  wheel.visual = "wheel-visual";
  world.entities.push({ id: "wheel-visual", components: { Hierarchy: { parent: "chassis" }, Transform: { position: [0, 0, 0] } } });
  setPhysicsVehicleControlInput(world, "chassis", { brake: 0, drive: 1, steering: 0 });
  let wrapped: ReturnType<typeof observePhysicsVehicleVisuals>[number] | undefined;
  for (let step = 0; step < 30; step += 1) {
    preparePhysicsRuntime(world);
    stepPhysicsVehicles(world, 1 / 120);
    const visual = observePhysicsVehicleVisuals(world, "chassis", 0.5)[0];
    assert.ok(visual !== undefined);
    assert.ok(Math.abs(visual.previousSpinAngle) <= Math.PI && Math.abs(visual.spinAngle) <= Math.PI, JSON.stringify(visual));
    if (Math.abs(visual.spinAngle - visual.previousSpinAngle) > Math.PI) wrapped = visual;
  }
  assert.ok(wrapped !== undefined, "expected retained spin to cross the -pi/pi boundary");
  assert.ok(Math.abs(wrapped.interpolatedSpinAngle) > Math.PI * 0.75, JSON.stringify(wrapped));
  dispose(world);
});

test("steering produces lateral path and yaw only through steerable wheels", async () => {
  await initializePhysicsRuntime();
  const steering = makeVehicleWorld({ steerable: true, surfaceGrip: 1 });
  const causalNegative = makeVehicleWorld({ steerable: false, surfaceGrip: 1 });
  const segment = [{ input: { brake: 0, drive: 1, steering: 0.5 }, label: "steering", steps: 90 }] as const;

  const steered = tracePhysicsVehicleControls(steering, "chassis", 1 / 120, segment)[0];
  const fixed = tracePhysicsVehicleControls(causalNegative, "chassis", 1 / 120, segment)[0];
  assert.ok(steered !== undefined && fixed !== undefined);
  const steeredLateralPath = Math.abs(steered.chassisPosition[0]);
  const fixedLateralPath = Math.abs(fixed.chassisPosition[0]);
  const steeredYaw = Math.abs(steered.chassisRotation[1]);
  const fixedYaw = Math.abs(fixed.chassisRotation[1]);
  assert.ok(steeredLateralPath > 0.05 && fixedLateralPath < steeredLateralPath * 0.1, `steering lateral=${steeredLateralPath}, negative=${fixedLateralPath}`);
  assert.ok(steeredYaw > 0.01 && fixedYaw < steeredYaw * 0.1, `steering yaw=${steeredYaw}, negative=${fixedYaw}`);
  dispose(steering);
  dispose(causalNegative);
});

test("braking reduces speed only through wheels authored as braked", async () => {
  await initializePhysicsRuntime();
  const invariant = PHYSICS_INVARIANT_REGISTRY.braking;
  const braking = makeVehicleWorld({ braked: true, surfaceGrip: 1 });
  const causalNegative = makeVehicleWorld({ braked: false, surfaceGrip: 1 });
  for (const world of [braking, causalNegative]) {
    world.entities.find((entity) => entity.id === "chassis")!.components.RigidBody!.velocity = [0, 0, -invariant.initialSpeed];
  }
  const segments = [{ input: { brake: 1, drive: 0, steering: 0 }, label: "braking", steps: invariant.ticks }] as const;

  const braked = tracePhysicsVehicleControls(braking, "chassis", invariant.fixedDelta, segments);
  const freeRolling = tracePhysicsVehicleControls(causalNegative, "chassis", invariant.fixedDelta, segments);
  const brakedFinal = braked.at(-1);
  const freeRollingFinal = freeRolling.at(-1);
  assert.ok(brakedFinal !== undefined && freeRollingFinal !== undefined);
  const diagnostic = JSON.stringify({ braked, freeRolling });
  assert.ok(brakedFinal.speed < invariant.initialSpeed * invariant.maxFinalSpeedRatio, diagnostic);
  assert.ok(brakedFinal.speed < freeRollingFinal.speed, diagnostic);
  dispose(braking);
  dispose(causalNegative);
});

function makeVehicleWorld(options: { braked?: boolean; driven?: boolean; steerable?: boolean; surfaceGrip: number; wheelIds?: readonly string[] }): IWorldIr {
  const wheelIds = options.wheelIds ?? ["front-left", "front-right", "rear-left", "rear-right"];
  const attachments = [[-0.7, -0.3, 1], [0.7, -0.3, 1], [-0.7, -0.3, -1], [0.7, -0.3, -1]] as const;
  const surface: IPhysicsSurfaceComponent = { combineRule: "multiply", grip: options.surfaceGrip, rollingResistance: 0 };
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "chassis",
        components: {
          Collider: { kind: "box", size: [1.4, 0.4, 2.4] },
          RigidBody: { damping: 0.05, enabledRotations: [false, true, false], gravityScale: 1, kind: "dynamic", mass: 100 },
          Transform: { position: [0, 1, 0] },
          WheelAssembly: {
            maxSteeringAngle: 0.6,
            maxSuspensionForce: 5_000,
            maxTireForce: 2_000,
            wheels: wheelIds.map((id, index) => ({
              attachment: [...attachments[index]!] as [number, number, number],
              braked: options.braked ?? true,
              driven: options.driven ?? true,
              id,
              radius: 0.25,
              steering: (options.steerable ?? true) && index < 2,
              suspension: { damperRate: 500, springRate: 5_000, travel: 0.5 },
              tire: "tire",
              width: 0.2,
            })),
          },
        },
      },
      {
        id: "tire",
        components: {
          TireModel: {
            lateralSlipCurve: [{ grip: 1, slip: 0 }, { grip: 1, slip: 1 }],
            loadSensitivity: 0,
            longitudinalSlipCurve: [{ grip: 1, slip: 0 }, { grip: 1, slip: 1 }],
            rollingResistance: 0,
          },
        },
      },
      {
        id: "ground",
        components: {
          Collider: { kind: "box", size: [100, 0.2, 100] },
          PhysicsSurface: surface,
          RigidBody: { kind: "static" },
          Transform: { position: [0, -0.1, 0] },
        },
      },
    ],
  };
}

function dispose(world: IWorldIr): void {
  disposePhysicsVehicleRuntime(world);
  disposePhysicsRuntime(world);
}
