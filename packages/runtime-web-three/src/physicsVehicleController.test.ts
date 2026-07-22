import assert from "node:assert/strict";
import test from "node:test";

import type { IVehicleControllerComponent, IVehicleControllerInput, IWorldIr } from "@threenative/ir";

import { disposePhysicsRuntime, initializePhysicsRuntime, preparePhysicsRuntime, stepPhysics } from "./physics.js";
import {
  applyPhysicsVehicleBindings,
  disposePhysicsVehicleRuntime,
  observePhysicsVehicleControllers,
  observePhysicsVehicleVisuals,
  observePhysicsVehicles,
  setPhysicsVehicleControllerInputs,
  stepPhysicsVehicles,
  tracePhysicsVehicleControllerInputs,
} from "./physicsVehicle.js";
import { createSystemContext } from "./systems/context.js";
import { applySystemEffects } from "./systems/effects.js";

const FIXED_DELTA = 1 / 120;
const RELEASED_INPUTS: IVehicleControllerInput = { brake: 0, clutch: 0, handbrake: 0, steer: 0, throttle: 0 };

test("vehicle controller shifts through automatic gears under recorded throttle", async () => {
  await initializePhysicsRuntime();
  const world = makeControllerWorld({ shiftPolicy: "automatic" });
  assert.equal(setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, throttle: 1 }), true);
  const gears: number[] = [];
  const engagedTransitions: Array<{ gear: number; tick: number }> = [];
  const shiftStates = new Set<string>();

  for (let tick = 0; tick < 360; tick += 1) {
    stepController(world);
    const observation = observePhysicsVehicleControllers(world)[0];
    assert.ok(observation !== undefined);
    if (gears.at(-1) !== observation.gear) gears.push(observation.gear);
    if (observation.shiftState === "engaged" && engagedTransitions.at(-1)?.gear !== observation.gear) engagedTransitions.push({ gear: observation.gear, tick });
    shiftStates.add(observation.shiftState);
  }

  const observation = observePhysicsVehicleControllers(world)[0]!;
  assert.equal(gears[0], 1);
  assert.ok(gears.includes(2), `expected an upshift, got ${gears.join(",")}`);
  for (let index = 2; index < engagedTransitions.length; index += 1) {
    const previous = engagedTransitions[index - 1]!;
    const current = engagedTransitions[index]!;
    assert.ok(current.tick - previous.tick >= Math.ceil(0.08 / FIXED_DELTA), `automatic gear reversed inside post-shift lockout: ${JSON.stringify(engagedTransitions)}`);
  }
  assert.equal(shiftStates.has("shifting"), true);
  assert.ok(observation.speed > 1);
  assert.deepEqual(observation.torquePath.wheels.map((wheel) => wheel.wheelId), ["rear-right", "front-left", "rear-left", "front-right"]);
  dispose(world);
});

test("manual gear commands are one-shot while the selected gear persists", async () => {
  await initializePhysicsRuntime();
  const world = makeControllerWorld({ shiftPolicy: "manual" });
  setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, gear: 1, throttle: 1 });
  stepController(world);
  setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, throttle: 1 });
  for (let tick = 1; tick < 180; tick += 1) stepController(world);
  assert.equal(observePhysicsVehicleControllers(world)[0]?.gear, 1);

  setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, gear: 2, throttle: 1 });
  stepController(world);
  setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, throttle: 1 });
  for (let tick = 1; tick < 180; tick += 1) stepController(world);
  const observation = observePhysicsVehicleControllers(world)[0]!;
  assert.equal(observation.gear, 2);
  assert.equal(observation.inputs.gear, undefined, "consumed gear commands must not become persistent analog state");
  dispose(world);
});

test("controller steering follows the authored speed curve through solver-owned motion", async () => {
  await initializePhysicsRuntime();
  const world = makeControllerWorld({ shiftPolicy: "manual" });
  const start = [...world.entities.find((entity) => entity.id === "chassis")!.components.Transform!.position!] as [number, number, number];
  setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, gear: 1, steer: 0.5, throttle: 1 });
  for (let tick = 0; tick < 90; tick += 1) stepController(world);
  const chassis = world.entities.find((entity) => entity.id === "chassis")!;
  const position = chassis.components.Transform!.position!;
  const rotation = chassis.components.Transform!.rotation ?? [0, 0, 0, 1];
  assert.ok(Math.abs(position[0] - start[0]) > 0.05, `expected a lateral path, got ${position.join(",")}`);
  assert.ok(Math.abs(rotation[1]) > 0.01, `expected solver yaw, got ${rotation.join(",")}`);
  dispose(world);
});

test("controller speed and steering ignore vertical-only chassis velocity", async () => {
  await initializePhysicsRuntime();
  const world = makeControllerWorld({ shiftPolicy: "manual" });
  world.entities.find((entity) => entity.id === "chassis")!.components.RigidBody!.velocity = [0, 12, 0];
  setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, steer: 0.5 });
  preparePhysicsRuntime(world);
  stepPhysicsVehicles(world, FIXED_DELTA);

  assert.equal(observePhysicsVehicleControllers(world)[0]?.speed, 0);
  assert.equal(observePhysicsVehicleVisuals(world).find((wheel) => wheel.wheelId === "front-left")?.steeringAngle, 0.3);
  dispose(world);
});

test("controller speed and steering use Y-up planar chassis velocity", async () => {
  await initializePhysicsRuntime();
  const world = makeControllerWorld({ shiftPolicy: "manual" });
  world.entities.find((entity) => entity.id === "chassis")!.components.RigidBody!.velocity = [3, 12, 4];
  setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, steer: 0.5 });
  preparePhysicsRuntime(world);
  stepPhysicsVehicles(world, FIXED_DELTA);

  assert.equal(observePhysicsVehicleControllers(world)[0]?.speed, 5);
  assert.equal(observePhysicsVehicleVisuals(world).find((wheel) => wheel.wheelId === "front-left")?.steeringAngle, 0.2625);
  dispose(world);
});

test("zero steering keeps symmetric limited-slip drive grounded and laterally bounded", async () => {
  await initializePhysicsRuntime();
  const world = makeControllerWorld({ differential: "limited-slip", shiftPolicy: "automatic" });
  world.entities.find((entity) => entity.id === "chassis")!.components.RigidBody!.enabledRotations = [false, true, false];
  setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, throttle: 1 });
  for (let tick = 0; tick < 60; tick += 1) {
    stepController(world);
  }
  const chassis = world.entities.find((entity) => entity.id === "chassis")!;
  const position = chassis.components.Transform!.position!;
  const rotation = chassis.components.Transform!.rotation ?? [0, 0, 0, 1];
  const wheelObservation = observePhysicsVehicles(world)[0];
  const drivenTorque = observePhysicsVehicleControllers(world)[0]!.torquePath.wheels.filter((wheel) => wheel.torque !== 0).map((wheel) => wheel.torque.toFixed(6));
  assert.equal(wheelObservation?.wheels.every((wheel) => wheel.grounded), true, `symmetric no-steer checkpoint must keep all wheels grounded: ${JSON.stringify({ position, rotation, wheels: wheelObservation?.wheels })}`);
  assert.equal(new Set(drivenTorque).size, 1, `limited-slip torque must remain equal below the descriptor-owned activation delta: ${drivenTorque}`);
  assert.ok(Math.abs(position[0]) < 0.5, `zero steering accumulated lateral drift: ${position.join(",")}`);
  assert.ok(Math.abs(rotation[1]) < 0.03, `zero steering accumulated yaw: ${rotation.join(",")}`);
  dispose(world);
});

test("brake reverse assists and fresh retry remain causal and deterministic", async () => {
  await initializePhysicsRuntime();
  const braking = makeControllerWorld({ assists: true, shiftPolicy: "manual", surfaceGrip: 0.1 });
  setPhysicsVehicleControllerInputs(braking, "chassis", { ...RELEASED_INPUTS, gear: 1, throttle: 1 });
  const launchAssistStates: Array<[boolean, boolean]> = [];
  for (let tick = 0; tick < 120; tick += 1) {
    stepController(braking);
    const observation = observePhysicsVehicleControllers(braking)[0]!;
    launchAssistStates.push([observation.absActive, observation.tcsActive]);
  }
  const launchSpeed = observePhysicsVehicleControllers(braking)[0]!.speed;
  setPhysicsVehicleControllerInputs(braking, "chassis", { ...RELEASED_INPUTS, brake: 1 });
  const assistStates: Array<[boolean, boolean]> = [];
  for (let tick = 0; tick < 60; tick += 1) {
    stepController(braking);
    const observation = observePhysicsVehicleControllers(braking)[0]!;
    assistStates.push([observation.absActive, observation.tcsActive]);
  }
  assert.ok(observePhysicsVehicleControllers(braking)[0]!.speed < launchSpeed);
  assertOrderedAssistTransition(launchAssistStates.map(([, tcs]) => tcs), "TCS");
  assertOrderedAssistTransition([...launchAssistStates.map(([abs]) => abs), ...assistStates.map(([abs]) => abs)], "ABS");

  const reverse = makeControllerWorld({ shiftPolicy: "manual" });
  setPhysicsVehicleControllerInputs(reverse, "chassis", { ...RELEASED_INPUTS, gear: -1, throttle: 1 });
  for (let tick = 0; tick < 180; tick += 1) stepController(reverse);
  const reversePosition = reverse.entities.find((entity) => entity.id === "chassis")!.components.Transform!.position![2];
  assert.ok(reversePosition > 0.1, `reverse gear did not reverse the -Z forward convention: ${reversePosition}`);

  const retryA = recordedLaunch(makeControllerWorld({ shiftPolicy: "automatic" }));
  const retryB = recordedLaunch(makeControllerWorld({ shiftPolicy: "automatic" }));
  assert.deepEqual(retryB, retryA);

  const reused = makeControllerWorld({ shiftPolicy: "manual" });
  setPhysicsVehicleControllerInputs(reused, "chassis", { ...RELEASED_INPUTS, gear: 2, throttle: 1 });
  for (let tick = 0; tick < 30; tick += 1) stepController(reused);
  dispose(reused);
  reused.entities.find((entity) => entity.id === "chassis")!.components.VehicleController!.transmission.shiftPolicy = "automatic";
  const reusedBody = reused.entities.find((entity) => entity.id === "chassis")!;
  reusedBody.components.Transform!.position = [0, 1, 0];
  reusedBody.components.Transform!.rotation = [0, 0, 0, 1];
  reusedBody.components.RigidBody!.velocity = [0, 0, 0];
  reusedBody.components.RigidBody!.angularVelocity = [0, 0, 0];
  stepController(reused);
  const freshObservation = observePhysicsVehicleControllers(reused)[0]!;
  assert.equal(freshObservation.gear, 1);
  assert.deepEqual(freshObservation.inputs, RELEASED_INPUTS, "disposed controller input leaked into a fresh runtime");
  dispose(braking);
  dispose(reverse);
  dispose(reused);
});

test("open locked and limited-slip differentials produce causal authored-order torque paths", async () => {
  await initializePhysicsRuntime();
  const open = makeControllerWorld({ differential: "open", liftWheel: true, shiftPolicy: "automatic", splitGrip: true });
  const locked = makeControllerWorld({ differential: "locked", liftWheel: true, shiftPolicy: "automatic", splitGrip: true });
  const limitedSlip = makeControllerWorld({ differential: "limited-slip", liftWheel: true, shiftPolicy: "automatic", splitGrip: true });
  for (const world of [open, locked, limitedSlip]) {
    setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, throttle: 1 });
    for (let tick = 0; tick < 120; tick += 1) stepController(world);
  }
  const openTorque = observePhysicsVehicleControllers(open)[0]!.torquePath.wheels.map((wheel) => wheel.torque);
  const lockedTorque = observePhysicsVehicleControllers(locked)[0]!.torquePath.wheels.map((wheel) => wheel.torque);
  const limitedTorque = observePhysicsVehicleControllers(limitedSlip)[0]!.torquePath.wheels.map((wheel) => wheel.torque);
  const groundedOpenTorque = openTorque.filter((value) => value !== 0);
  assert.ok(groundedOpenTorque.length > 1, `open differential had insufficient grounded wheels: ${openTorque}`);
  assert.equal(new Set(groundedOpenTorque.map((value) => value.toFixed(6))).size, 1, `open grounded torque was not equal: ${openTorque}`);
  assert.notEqual(lockedTorque[3], 0, "locked differential did not retain torque on the lifted driven wheel");
  assert.ok(new Set(limitedTorque.map((value) => value.toFixed(6))).size > 1, `limited-slip torque did not bias above the descriptor-owned activation delta: ${limitedTorque}`);
  for (const world of [open, locked, limitedSlip]) dispose(world);
});

test("authored bindings and controller traces preserve normalized inputs and tick order", async () => {
  await initializePhysicsRuntime();
  const world = makeControllerWorld({ shiftPolicy: "manual" });
  world.entities.find((entity) => entity.id === "chassis")!.components.VehicleController!.bindings = {
    brake: "Brake",
    gearUp: "GearUp",
    steer: "Steer",
    throttle: "Throttle",
  };
  applyPhysicsVehicleBindings(world, {
    action: (name) => name === "Throttle",
    axis: (name) => name === "Steer" ? 0.4 : 0,
    beginFrame() {},
    enqueueUiAction() {},
    handleGamepadAxis() {},
    handleGamepadButton() {},
    handleKeyDown() {},
    handleKeyUp() {},
    handlePointerDown() {},
    handlePointerMove() {},
    handlePointerUp() {},
    handleTouchAxis() {},
    handleTouchControl() {},
    pressed: (name) => name === "GearUp",
    released: () => false,
  });
  stepController(world);
  assert.deepEqual(observePhysicsVehicleControllers(world)[0]!.inputs, { ...RELEASED_INPUTS, gear: 1, steer: 0.4, throttle: 1 });
  setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, throttle: 0.5 });
  for (let tick = 0; tick < 30; tick += 1) stepController(world);

  const trace = tracePhysicsVehicleControllerInputs(world, "chassis", FIXED_DELTA, [
    { input: { ...RELEASED_INPUTS, throttle: 0.5 }, label: "coast", steps: 3 },
  ]);
  assert.deepEqual(trace.map((sample) => sample.tick), [0, 1, 2]);
  assert.equal(trace.every((sample) => sample.chassisRotation.length === 4 && sample.chassisAngularVelocity.length === 3 && sample.wheels.length === 4), true);
  assert.equal(trace.every((sample) => sample.label === "coast" && sample.observation.inputs.throttle === 0.5), true);
  dispose(world);
});

test("physics.vehicle.setInputs validates and applies through the script service boundary", async () => {
  await initializePhysicsRuntime();
  const world = makeControllerWorld({ shiftPolicy: "manual" });
  const queued = createSystemContext(world, { delta: FIXED_DELTA, fixedDelta: FIXED_DELTA });
  assert.deepEqual(queued.context.physics.vehicle.setInputs("chassis", { ...RELEASED_INPUTS, gear: 1, throttle: 0.75 }), { accepted: true, entity: "chassis", status: "applied" });
  assert.deepEqual(queued.context.physics.vehicle.setInputs("chassis", { ...RELEASED_INPUTS, throttle: 2 }), { accepted: false, entity: "chassis", status: "invalid-input" });
  applySystemEffects(world, {
    commands: [], eventReads: [], eventWrites: [], name: "vehicle-input", queries: [], reads: [], resourceReads: [], resourceWrites: [], schedule: "fixedUpdate", services: ["physics.vehicle.setInputs"], writes: [],
  }, { commands: [], events: [], resources: [], services: queued.services }, { frame: 0, tick: 0 });
  stepController(world);
  assert.equal(observePhysicsVehicleControllers(world)[0]!.inputs.throttle, 0.75, "invalid queued input replaced the accepted controller input");
  dispose(world);
});

test("RPM coupling bounds grounded wheelspin and retains an airborne locked-wheel fallback", async () => {
  await initializePhysicsRuntime();
  const wheelspin = makeControllerWorld({ shiftPolicy: "manual", surfaceGrip: 0.02 });
  setPhysicsVehicleControllerInputs(wheelspin, "chassis", { ...RELEASED_INPUTS, gear: 1, throttle: 1 });
  for (let tick = 0; tick < 120; tick += 1) stepController(wheelspin);
  const grounded = observePhysicsVehicleControllers(wheelspin)[0]!;
  const boundedRpm = Math.max(800, grounded.speed / 0.25 * 3 * 3.5 * 60 / (Math.PI * 2) * 1.5);
  assert.ok(grounded.engineRpm <= boundedRpm + 1, `grounded wheelspin over-revved normalized coupling: ${grounded.engineRpm} > ${boundedRpm}`);

  const transient = makeControllerWorld({ shiftPolicy: "manual", surfaceGrip: 0.001 });
  setPhysicsVehicleControllerInputs(transient, "chassis", { ...RELEASED_INPUTS, gear: 1 });
  for (let tick = 0; tick < 30; tick += 1) stepController(transient);
  setPhysicsVehicleControllerInputs(transient, "chassis", { ...RELEASED_INPUTS, throttle: 1 });
  for (let tick = 0; tick < 10; tick += 1) stepController(transient);
  const groundedRpm = observePhysicsVehicleControllers(transient)[0]!.engineRpm;
  const groundIndex = transient.entities.findIndex((entity) => entity.id === "ground");
  assert.ok(groundIndex >= 0);
  transient.entities.splice(groundIndex, 1);
  disposePhysicsRuntime(transient);
  stepController(transient);
  assert.equal(observePhysicsVehicles(transient)[0]?.wheels.every((wheel) => !wheel.grounded), true, "contact removal did not create the transient airborne sample");
  stepController(transient);
  const graceRpm = observePhysicsVehicleControllers(transient)[0]!.engineRpm;
  stepController(transient);
  const sustainedAirborneRpm = observePhysicsVehicleControllers(transient)[0]!.engineRpm;
  assert.ok(Math.abs(graceRpm - groundedRpm) < 1, `one zero-contact sample bypassed grounded coupling grace: grounded=${groundedRpm}, grace=${graceRpm}`);
  assert.ok(sustainedAirborneRpm > graceRpm + 100, `sustained airborne fallback did not switch to raw wheel speed: grace=${graceRpm}, sustained=${sustainedAirborneRpm}`);

  const airborne = makeControllerWorld({ differential: "locked", liftAll: true, shiftPolicy: "automatic" });
  setPhysicsVehicleControllerInputs(airborne, "chassis", { ...RELEASED_INPUTS, throttle: 1 });
  for (let tick = 0; tick < 60; tick += 1) stepController(airborne);
  const airborneObservation = observePhysicsVehicleControllers(airborne)[0]!;
  assert.ok(Number.isFinite(airborneObservation.engineRpm) && airborneObservation.engineRpm > 800, `airborne fallback did not couple stored wheel speed: ${airborneObservation.engineRpm}`);
  assert.equal(observePhysicsVehicles(airborne)[0]?.wheels.every((wheel) => !wheel.grounded && wheel.longitudinalSlip === 0 && wheel.lateralSlip === 0), true, "ungrounded wheels exposed contact-patch slip telemetry");
  dispose(wheelspin);
  dispose(transient);
  dispose(airborne);
});

test("engine braking ignores near-zero shaft noise and preserves real motion direction", async () => {
  await initializePhysicsRuntime();
  const noise = makeControllerWorld({ shiftPolicy: "automatic" });
  stepController(noise);
  assert.equal(observePhysicsVehicleControllers(noise)[0]?.torquePath.engine, 0, "near-zero solver noise selected an engine-braking direction");

  const moving = makeControllerWorld({ shiftPolicy: "automatic" });
  moving.entities.find((entity) => entity.id === "chassis")!.components.RigidBody!.velocity = [0, 0, -5];
  stepController(moving);
  assert.equal(observePhysicsVehicleControllers(moving)[0]?.torquePath.engine, -40, "forward chassis motion did not produce opposing engine braking");
  dispose(noise);
  dispose(moving);
});

function stepController(world: IWorldIr): void {
  preparePhysicsRuntime(world);
  stepPhysicsVehicles(world, FIXED_DELTA);
  stepPhysics(world, FIXED_DELTA);
}

function assertOrderedAssistTransition(states: readonly boolean[], label: string): void {
  const intervention = states.indexOf(true);
  assert.ok(intervention > 0, `${label} did not transition from released to intervention: ${states.join(",")}`);
  assert.equal(states.slice(0, intervention).some(Boolean), false, `${label} intervened before the recorded transition`);
}

function recordedLaunch(world: IWorldIr): Array<{ gear: number; rpm: number; speed: number }> {
  setPhysicsVehicleControllerInputs(world, "chassis", { ...RELEASED_INPUTS, throttle: 1 });
  const samples: Array<{ gear: number; rpm: number; speed: number }> = [];
  for (let tick = 0; tick < 360; tick += 1) {
    stepController(world);
    if (tick % 60 === 59) {
      const observation = observePhysicsVehicleControllers(world)[0]!;
      samples.push({ gear: observation.gear, rpm: observation.engineRpm, speed: observation.speed });
    }
  }
  dispose(world);
  return samples;
}

function makeControllerWorld(options: { assists?: boolean; differential?: "limited-slip" | "locked" | "open"; liftAll?: boolean; liftWheel?: boolean; shiftPolicy: "automatic" | "manual"; splitGrip?: boolean; surfaceGrip?: number }): IWorldIr {
  const controller: IVehicleControllerComponent = {
    ...(options.assists === true ? { assists: { abs: { enabled: true, response: 0.08, slipThreshold: 0.15 }, tcs: { enabled: true, response: 0.08, slipThreshold: 0.15 } } } : {}),
    brakes: { frontBias: 0.6, handbrakeWheelIds: ["rear-right", "rear-left"] },
    differential: { kind: options.differential ?? "open", ...((options.differential ?? "open") === "limited-slip" ? { limitedSlipRatio: 3 } : {}) },
    engine: { engineBraking: 40, idleRpm: 800, redlineRpm: 6_000, torqueCurve: [{ rpm: 800, torque: 220 }, { rpm: 3_000, torque: 300 }, { rpm: 6_000, torque: 160 }] },
    steering: { speedCurve: [{ scale: 1, speed: 0 }, { scale: 0.25, speed: 30 }] },
    transmission: { clutchResponse: 0.08, downshiftRpm: 1_400, finalDrive: 3.5, forwardRatios: [3, 2, 1.2], reverseRatio: 3, shiftPolicy: options.shiftPolicy, upshiftRpm: 2_800 },
  };
  const wheels = [
    { attachment: [-0.7, options.liftAll === true ? 2 : -0.3, 1] as const, id: "rear-right", steering: false },
    { attachment: [-0.7, options.liftAll === true ? 2 : -0.3, -1] as const, id: "front-left", steering: true },
    { attachment: [0.7, options.liftAll === true ? 2 : -0.3, 1] as const, id: "rear-left", steering: false },
    { attachment: [0.7, options.liftAll === true || options.liftWheel === true ? 2 : -0.3, -1] as const, id: "front-right", steering: true },
  ];
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "chassis",
        components: {
          Collider: { kind: "box", size: [1.4, 0.4, 2.4] },
          RigidBody: { damping: 0.05, gravityScale: 1, kind: "dynamic", mass: 100 },
          Transform: { position: [0, 1, 0] },
          VehicleController: controller,
          WheelAssembly: {
            maxSteeringAngle: 0.6,
            maxSuspensionForce: 5_000,
            maxTireForce: 2_000,
            wheels: wheels.map((wheel) => ({ ...wheel, braked: true, driven: true, radius: 0.25, suspension: { damperRate: 500, springRate: 5_000, travel: 0.5 }, tire: "tire", visual: `visual-${wheel.id}`, width: 0.2 })),
          },
        },
      },
      { id: "tire", components: { TireModel: { lateralSlipCurve: [{ grip: 1, slip: -1 }, { grip: 1, slip: 1 }], loadSensitivity: 0, longitudinalSlipCurve: [{ grip: 1, slip: -1 }, { grip: 1, slip: 1 }], rollingResistance: 0 } } },
      ...wheels.map((wheel) => ({ id: `visual-${wheel.id}`, components: { Transform: { position: [0, 0, 0] as [number, number, number] } } })),
      ...(options.splitGrip === true
        ? [
            { id: "ground-left", components: { Collider: { kind: "box" as const, size: [50, 0.2, 100] as [number, number, number] }, PhysicsSurface: { combineRule: "multiply" as const, grip: 1, rollingResistance: 0 }, RigidBody: { kind: "static" as const }, Transform: { position: [-25, -0.1, 0] as [number, number, number] } } },
            { id: "ground-right", components: { Collider: { kind: "box" as const, size: [50, 0.2, 100] as [number, number, number] }, PhysicsSurface: { combineRule: "multiply" as const, grip: 0.1, rollingResistance: 0 }, RigidBody: { kind: "static" as const }, Transform: { position: [25, -0.1, 0] as [number, number, number] } } },
          ]
        : [{ id: "ground", components: { Collider: { kind: "box" as const, size: [100, 0.2, 100] as [number, number, number] }, PhysicsSurface: { combineRule: "multiply" as const, grip: options.surfaceGrip ?? 1, rollingResistance: 0 }, RigidBody: { kind: "static" as const }, Transform: { position: [0, -0.1, 0] as [number, number, number] } } }]),
    ],
  };
}

function dispose(world: IWorldIr): void {
  disposePhysicsVehicleRuntime(world);
  disposePhysicsRuntime(world);
}
