import type { IPhysicsBodyObservation, IPhysicsQueryHitObservation, IPhysicsSurfaceComponent, ITireModelComponent, IVehicleControllerComponent, IVehicleControllerInput, IVehicleControllerObservation, IWheelAssemblyComponent, IWheelAssemblyObservation, IWheelControlInput, IWorldIr, Quat, Vec3 } from "@threenative/ir";
import { combinePhysicsSurfaceValues, PHYSICS_CAPABILITY_LIMITS } from "@threenative/ir/physicsCapabilities";

import type { IThreeWorld } from "./mapWorld.js";
import type { IWebInputState } from "./input.js";
import type { IWebDebugDrawPrimitive, IWebDebugOverlayModel, IWebDebugOverlayRow } from "./debugOverlay.js";
import { applyLivePhysicsAtPoint, observeLivePhysicsBodies, preparePhysicsRuntime, queryHitObservation, shapeCastLive, stepPhysics } from "./physics.js";

const ZERO_CONTROL: IWheelControlInput = Object.freeze({ brake: 0, drive: 0, steering: 0 });
const ZERO_CONTROLLER_INPUT: IVehicleControllerInput = Object.freeze({ brake: 0, clutch: 0, handbrake: 0, steer: 0, throttle: 0 });
const controlsByWorld = new WeakMap<IWorldIr, Map<string, IWheelControlInput>>();
const controllerInputsByWorld = new WeakMap<IWorldIr, Map<string, IVehicleControllerInput>>();
const controllerObservationsByWorld = new WeakMap<IWorldIr, IVehicleControllerObservation[]>();
const statesByWorld = new WeakMap<IWorldIr, Map<string, IVehicleState>>();
const observationsByWorld = new WeakMap<IWorldIr, IWheelAssemblyObservation[]>();
const stepsByWorld = new WeakMap<IWorldIr, number>();

interface IVehicleState {
  controller?: IControllerState;
  wheels: Map<string, IWheelState>;
}

interface IControllerState {
  absFactor: number;
  clutchEngagement: number;
  engineRpm: number;
  gear: number;
  lastGroundedNormalizedWheelSpeed: number;
  pendingGear?: number;
  phase: "disengaging" | "engaged" | "engaging";
  shiftLockout: number;
  tcsFactor: number;
  ungroundedDrivenTicks: number;
}

interface IControllerStep {
  brakeForces: ReadonlyMap<string, number>;
  driveForces: ReadonlyMap<string, number>;
  observation: IVehicleControllerObservation;
  steering: number;
}

interface IWheelState {
  attachment: Vec3;
  angularSpeed: number;
  castEnd: Vec3;
  previousVisual: IWheelVisualPose;
  visual: IWheelVisualPose;
}

interface IWheelVisualPose {
  angle: number;
  position: Vec3;
  steering: number;
}

export interface IPhysicsVehicleControlSegment {
  input: IWheelControlInput;
  label: string;
  steps: number;
}

export interface IPhysicsVehicleControlTraceSample {
  chassisAngularVelocity: Vec3;
  chassisPosition: Vec3;
  chassisRotation: Quat;
  chassisVelocity: Vec3;
  input: IWheelControlInput;
  label: string;
  observation: IWheelAssemblyObservation;
  speed: number;
  visuals: IPhysicsVehicleVisualObservation[];
}

export interface IPhysicsVehicleControllerTraceSegment {
  input: IVehicleControllerInput;
  label: string;
  steps: number;
}

export interface IPhysicsVehicleControllerTraceSample {
  chassisAngularVelocity: Vec3;
  chassisPosition: Vec3;
  chassisRotation: Quat;
  chassisVelocity: Vec3;
  input: IVehicleControllerInput;
  label: string;
  observation: IVehicleControllerObservation;
  tick: number;
  wheels: Array<{ grounded: boolean; longitudinalSlip: number; wheelId: string }>;
}

export interface IPhysicsVehicleVisualObservation {
  entity: string;
  interpolatedPosition: Vec3;
  interpolatedSpinAngle: number;
  interpolatedSteeringAngle: number;
  interpolationAlpha: number;
  position: Vec3;
  previousSpinAngle: number;
  spinAngle: number;
  steeringAngle: number;
  targetId: string;
  wheelId: string;
}

export function setPhysicsVehicleControlInput(world: IWorldIr, entity: string, input: IWheelControlInput): boolean {
  const assembly = world.entities.find((candidate) => candidate.id === entity)?.components.WheelAssembly;
  if (assembly === undefined || !validControlInput(input)) return false;
  const controls = controlsByWorld.get(world) ?? new Map<string, IWheelControlInput>();
  controls.set(entity, { brake: input.brake, drive: input.drive, steering: input.steering });
  controlsByWorld.set(world, controls);
  return true;
}

export function setPhysicsVehicleControllerInputs(world: IWorldIr, entity: string, input: IVehicleControllerInput): boolean {
  const target = world.entities.find((candidate) => candidate.id === entity);
  const controller = target?.components.VehicleController;
  if (target === undefined || controller === undefined || target.components.WheelAssembly === undefined || target.components.RigidBody?.kind !== "dynamic" || !isValidPhysicsVehicleControllerInput(input, controller.transmission.forwardRatios.length)) return false;
  const inputs = controllerInputsByWorld.get(world) ?? new Map<string, IVehicleControllerInput>();
  inputs.set(entity, { brake: input.brake, clutch: input.clutch, ...(input.gear === undefined ? {} : { gear: input.gear }), handbrake: input.handbrake, steer: input.steer, throttle: input.throttle });
  controllerInputsByWorld.set(world, inputs);
  return true;
}

export function observePhysicsVehicleControllers(world: IWorldIr): IVehicleControllerObservation[] {
  return controllerObservationsByWorld.get(world)?.map((observation) => ({
    ...observation,
    inputs: { ...observation.inputs },
    torquePath: { ...observation.torquePath, wheels: observation.torquePath.wheels.map((wheel) => ({ ...wheel })) },
  })) ?? [];
}

export function applyPhysicsVehicleBindings(world: IWorldIr, input: IWebInputState, allowGearEdges = true): void {
  const observedGears = new Map((controllerObservationsByWorld.get(world) ?? []).map((observation) => [observation.entity, observation.gear]));
  for (const entity of world.entities) {
    const controller = entity.components.VehicleController;
    const bindings = controller?.bindings;
    if (controller === undefined || bindings === undefined || entity.components.WheelAssembly === undefined) continue;
    const analog = (binding: string | undefined): number => binding === undefined ? 0 : clamp(Math.max(input.action(binding) ? 1 : 0, input.axis(binding)), 0, 1);
    const steer = bindings.steer === undefined ? 0 : clamp(input.axis(bindings.steer), -1, 1);
    const currentGear = observedGears.get(entity.id) ?? (controller.transmission.shiftPolicy === "automatic" ? 1 : 0);
    const gearDelta = allowGearEdges && bindings.gearUp !== undefined && input.pressed(bindings.gearUp)
      ? 1
      : allowGearEdges && bindings.gearDown !== undefined && input.pressed(bindings.gearDown)
        ? -1
        : 0;
    const gear = controller.transmission.shiftPolicy === "manual" && gearDelta !== 0
      ? clamp(currentGear + gearDelta, -1, controller.transmission.forwardRatios.length)
      : undefined;
    setPhysicsVehicleControllerInputs(world, entity.id, {
      brake: analog(bindings.brake),
      clutch: analog(bindings.clutch),
      ...(gear === undefined ? {} : { gear }),
      handbrake: analog(bindings.handbrake),
      steer,
      throttle: analog(bindings.throttle),
    });
  }
}

export function observePhysicsVehicles(world: IWorldIr): IWheelAssemblyObservation[] {
  return observationsByWorld.get(world)?.map((assembly) => ({
    entity: assembly.entity,
    step: assembly.step,
    wheels: assembly.wheels.map((wheel) => ({
      ...wheel,
      ...(wheel.contact === undefined ? {} : { contact: { ...wheel.contact, normal: [...wheel.contact.normal] as Vec3, point: [...wheel.contact.point] as Vec3 } }),
    })),
  })) ?? [];
}

export function observePhysicsVehicleVisuals(world: IWorldIr, entityId?: string, alpha = 0.5): IPhysicsVehicleVisualObservation[] {
  const states = statesByWorld.get(world);
  if (states === undefined) return [];
  const interpolationAlpha = clamp(alpha, 0, 1);
  const visuals: IPhysicsVehicleVisualObservation[] = [];
  for (const entity of world.entities) {
    if (entityId !== undefined && entity.id !== entityId) continue;
    const assembly = entity.components.WheelAssembly;
    const vehicle = states.get(entity.id);
    if (assembly === undefined || vehicle === undefined) continue;
    for (const wheel of assembly.wheels) {
      const state = vehicle.wheels.get(wheel.id);
      if (wheel.visual === undefined || state === undefined) continue;
      visuals.push({
        entity: entity.id,
        interpolatedPosition: lerpVec3(state.previousVisual.position, state.visual.position, interpolationAlpha),
        interpolatedSpinAngle: lerpAngle(state.previousVisual.angle, state.visual.angle, interpolationAlpha),
        interpolatedSteeringAngle: lerpAngle(state.previousVisual.steering, state.visual.steering, interpolationAlpha),
        interpolationAlpha,
        position: [...state.visual.position],
        previousSpinAngle: state.previousVisual.angle,
        spinAngle: state.visual.angle,
        steeringAngle: state.visual.steering,
        targetId: wheel.visual,
        wheelId: wheel.id,
      });
    }
  }
  return visuals;
}

export function stepPhysicsVehicles(world: IWorldIr, fixedDelta: number): void {
  if (!(fixedDelta > 0) || !Number.isFinite(fixedDelta)) return;
  const bodyObservations = new Map(observeLivePhysicsBodies(world, 0).map((body) => [body.entity, body]));
  const entityById = new Map(world.entities.map((entity) => [entity.id, entity]));
  const runtimeStates = statesByWorld.get(world) ?? new Map<string, IVehicleState>();
  const controls = controlsByWorld.get(world);
  const controllerInputs = controllerInputsByWorld.get(world);
  const assemblies: IWheelAssemblyObservation[] = [];
  const controllerObservations: IVehicleControllerObservation[] = [];
  const step = (stepsByWorld.get(world) ?? -1) + 1;
  const previousAssemblies = new Map((observationsByWorld.get(world) ?? []).map((observation) => [observation.entity, observation]));

  for (const entity of [...world.entities].sort((left, right) => left.id.localeCompare(right.id))) {
    const assembly = entity.components.WheelAssembly;
    const body = bodyObservations.get(entity.id);
    if (assembly === undefined || body === undefined || entity.components.RigidBody?.kind !== "dynamic") continue;
    const vehicleState = runtimeStates.get(entity.id) ?? { wheels: new Map<string, IWheelState>() };
    const input = controls?.get(entity.id) ?? ZERO_CONTROL;
    const controllerStep = entity.components.VehicleController === undefined ? undefined : stepVehicleController(
      entity.id,
      entity.components.VehicleController,
      assembly,
      vehicleState,
      body,
      previousAssemblies.get(entity.id),
      controllerInputs?.get(entity.id) ?? ZERO_CONTROLLER_INPUT,
      fixedDelta,
    );
    if (controllerStep !== undefined) controllerObservations.push(controllerStep.observation);
    const chassisRotation = body.rotation;
    const down = rotateVec3([0, -1, 0], chassisRotation);
    const wheelObservations = assembly.wheels.map((wheel) => {
      const attachment = addVec3(body.position, rotateVec3(wheel.attachment, chassisRotation));
      const previous = vehicleState.wheels.get(wheel.id) ?? initialWheelState(attachment, wheel.suspension.travel);
      const result = shapeCastLive(world, {
        direction: [...down],
        ignore: [entity.id],
        maxDistance: wheel.suspension.travel,
        origin: [...attachment],
        shape: { kind: "sphere", radius: wheel.radius },
      });
      const contact = queryHitObservation(result, world);
      const compression = contact === undefined ? 0 : clamp(wheel.suspension.travel - contact.distance, 0, wheel.suspension.travel);
      const contactVelocity = contact === undefined
        ? body.velocity
        : addVec3(body.velocity, crossVec3(body.angularVelocity, subtractVec3(contact.point, body.position)));
      const compressionVelocity = dotVec3(contactVelocity, down);
      const normalLoad = contact === undefined ? 0 : clamp(
        wheel.suspension.springRate * compression + wheel.suspension.damperRate * compressionVelocity,
        0,
        assembly.maxSuspensionForce,
      );
      const steeringInput = controllerStep?.steering ?? input.steering;
      const steeringAngle = wheel.steering ? steeringInput * assembly.maxSteeringAngle : 0;
      const forward = rotateVec3([-Math.sin(steeringAngle), 0, -Math.cos(steeringAngle)], chassisRotation);
      const right = rotateVec3([Math.cos(steeringAngle), 0, -Math.sin(steeringAngle)], chassisRotation);
      const forwardSpeed = dotVec3(contactVelocity, forward);
      const lateralSpeed = dotVec3(contactVelocity, right);
      const driveRequest = controllerStep?.driveForces.get(wheel.id) ?? (wheel.driven ? input.drive * assembly.maxTireForce : 0);
      const brakeMagnitude = controllerStep?.brakeForces.get(wheel.id) ?? (wheel.braked ? input.brake * assembly.maxTireForce : 0);
      const brakeDirection = Math.abs(forwardSpeed) > 0.0001 ? Math.sign(forwardSpeed) : Math.sign(previous.angularSpeed);
      const brakeRequest = -brakeDirection * brakeMagnitude;
      let angularSpeed = previous.angularSpeed + driveRequest * fixedDelta / Math.max(wheel.radius, 0.0001);
      if (brakeMagnitude > 0) angularSpeed = moveToward(angularSpeed, 0, brakeMagnitude * fixedDelta / Math.max(wheel.radius, 0.0001));
      const wheelSurfaceSpeed = angularSpeed * wheel.radius;
      const longitudinalSlip = (wheelSurfaceSpeed - forwardSpeed) / Math.max(1, Math.abs(wheelSurfaceSpeed), Math.abs(forwardSpeed));
      const lateralSlip = Math.atan2(lateralSpeed, Math.max(0.1, Math.abs(forwardSpeed)));
      const tire = entityById.get(wheel.tire)?.components.TireModel;
      const surface = contact === undefined ? undefined : entityById.get(contact.entity)?.components.PhysicsSurface;

      if (contact !== undefined && tire !== undefined && normalLoad > 0) {
        const suspensionForce = scaleVec3(contact.normal, normalLoad);
        applyLivePhysicsAtPoint(world, entity.id, suspensionForce, contact.point, "force");
        const loadFactor = 1 / (1 + tire.loadSensitivity * normalLoad / assembly.maxSuspensionForce);
        const longitudinalGrip = combinedGrip(sampleSlipCurve(tire.longitudinalSlipCurve, longitudinalSlip), surface) * loadFactor;
        const lateralGrip = combinedGrip(sampleSlipCurve(tire.lateralSlipCurve, lateralSlip), surface) * loadFactor;
        const rollingResistance = combinedRollingResistance(tire, surface);
        const longitudinalLimit = Math.min(assembly.maxTireForce, longitudinalGrip * normalLoad);
        const lateralLimit = Math.min(assembly.maxTireForce, lateralGrip * normalLoad);
        const rollingRequest = Math.abs(forwardSpeed) > 0.0001 ? -Math.sign(forwardSpeed) * rollingResistance * normalLoad : 0;
        let longitudinalForce = clamp(driveRequest + brakeRequest + rollingRequest, -longitudinalLimit, longitudinalLimit);
        let lateralForce = clamp(-lateralSpeed * normalLoad, -lateralLimit, lateralLimit);
        const magnitude = Math.hypot(longitudinalForce, lateralForce);
        if (magnitude > assembly.maxTireForce) {
          const scale = assembly.maxTireForce / magnitude;
          longitudinalForce *= scale;
          lateralForce *= scale;
        }
        applyLivePhysicsAtPoint(world, entity.id, addVec3(scaleVec3(forward, longitudinalForce), scaleVec3(right, lateralForce)), contact.point, "force");
        const coupling = clamp(longitudinalGrip * fixedDelta * 10, 0, 1);
        angularSpeed += (forwardSpeed / wheel.radius - angularSpeed) * coupling;
      }

      const wheelCenter = addVec3(attachment, scaleVec3(down, wheel.suspension.travel - compression));
      const next: IWheelState = {
        attachment,
        angularSpeed,
        castEnd: addVec3(attachment, scaleVec3(down, wheel.suspension.travel)),
        previousVisual: previous.visual,
        visual: { angle: normalizeAngle(previous.visual.angle + angularSpeed * fixedDelta), position: wheelCenter, steering: steeringAngle },
      };
      vehicleState.wheels.set(wheel.id, next);
      return wheelObservation(wheel.id, angularSpeed, compression, normalLoad, longitudinalSlip, lateralSlip, contact, surface);
    });
    runtimeStates.set(entity.id, vehicleState);
    assemblies.push({ entity: entity.id, step, wheels: wheelObservations });
  }
  statesByWorld.set(world, runtimeStates);
  observationsByWorld.set(world, assemblies);
  controllerObservationsByWorld.set(world, controllerObservations);
  stepsByWorld.set(world, step);
  for (const [entity, controllerInput] of controllerInputs ?? []) {
    if (controllerInput.gear !== undefined) {
      const { gear: _consumedGear, ...persistentInput } = controllerInput;
      controllerInputs!.set(entity, persistentInput);
    }
  }
}

export function tracePhysicsVehicleControls(
  world: IWorldIr,
  entityId: string,
  fixedDelta: number,
  segments: readonly IPhysicsVehicleControlSegment[],
): IPhysicsVehicleControlTraceSample[] {
  const entity = world.entities.find((candidate) => candidate.id === entityId);
  if (entity?.components.WheelAssembly === undefined || !(fixedDelta > 0) || !Number.isFinite(fixedDelta)) return [];
  const samples: IPhysicsVehicleControlTraceSample[] = [];
  for (const segment of segments) {
    if (!Number.isInteger(segment.steps) || segment.steps <= 0 || !setPhysicsVehicleControlInput(world, entityId, segment.input)) continue;
    for (let step = 0; step < segment.steps; step += 1) {
      preparePhysicsRuntime(world);
      stepPhysicsVehicles(world, fixedDelta);
      stepPhysics(world, fixedDelta);
    }
    const observation = observePhysicsVehicles(world).find((candidate) => candidate.entity === entityId);
    const transform = entity.components.Transform;
    const body = entity.components.RigidBody;
    if (observation === undefined || transform?.position === undefined || body === undefined) continue;
    const velocity = [...(body.velocity ?? [0, 0, 0])] as Vec3;
    samples.push({
      chassisAngularVelocity: [...(body.angularVelocity ?? [0, 0, 0])] as Vec3,
      chassisPosition: [...transform.position] as Vec3,
      chassisRotation: [...(transform.rotation ?? [0, 0, 0, 1])] as Quat,
      chassisVelocity: velocity,
      input: { ...segment.input },
      label: segment.label,
      observation,
      speed: Math.abs(velocity[2]),
      visuals: observePhysicsVehicleVisuals(world, entityId, 0.5),
    });
  }
  return samples;
}

export function tracePhysicsVehicleControllerInputs(
  world: IWorldIr,
  entityId: string,
  fixedDelta: number,
  segments: readonly IPhysicsVehicleControllerTraceSegment[],
): IPhysicsVehicleControllerTraceSample[] {
  const entity = world.entities.find((candidate) => candidate.id === entityId);
  if (entity?.components.VehicleController === undefined || entity.components.WheelAssembly === undefined || !(fixedDelta > 0) || !Number.isFinite(fixedDelta)) return [];
  const samples: IPhysicsVehicleControllerTraceSample[] = [];
  let tick = 0;
  for (const segment of segments) {
    if (!Number.isInteger(segment.steps) || segment.steps <= 0 || !setPhysicsVehicleControllerInputs(world, entityId, segment.input)) continue;
    for (let step = 0; step < segment.steps; step += 1) {
      preparePhysicsRuntime(world);
      stepPhysicsVehicles(world, fixedDelta);
      stepPhysics(world, fixedDelta);
      const observation = observePhysicsVehicleControllers(world).find((candidate) => candidate.entity === entityId);
      const wheelObservation = observePhysicsVehicles(world).find((candidate) => candidate.entity === entityId);
      const position = entity.components.Transform?.position;
      if (observation !== undefined && wheelObservation !== undefined && position !== undefined) {
        samples.push({
          chassisAngularVelocity: [...(entity.components.RigidBody?.angularVelocity ?? [0, 0, 0])] as Vec3,
          chassisPosition: [...position] as Vec3,
          chassisRotation: [...(entity.components.Transform?.rotation ?? [0, 0, 0, 1])] as Quat,
          chassisVelocity: [...(entity.components.RigidBody?.velocity ?? [0, 0, 0])] as Vec3,
          input: { ...segment.input },
          label: segment.label,
          observation,
          tick,
          wheels: wheelObservation.wheels.map((wheel) => ({ grounded: wheel.grounded, longitudinalSlip: wheel.longitudinalSlip, wheelId: wheel.wheelId })),
        });
      }
      tick += 1;
    }
  }
  return samples;
}

function stepVehicleController(
  entityId: string,
  controller: IVehicleControllerComponent,
  assembly: IWheelAssemblyComponent,
  vehicleState: IVehicleState,
  body: IPhysicsBodyObservation,
  previousAssembly: IWheelAssemblyObservation | undefined,
  input: IVehicleControllerInput,
  fixedDelta: number,
): IControllerStep {
  const state = vehicleState.controller ?? initialControllerState(controller);
  const previousWheels = new Map((previousAssembly?.wheels ?? []).map((wheel) => [wheel.wheelId, wheel]));
  const driven = assembly.wheels.filter((wheel) => wheel.driven);
  const averageWheelSpeed = average(driven.map((wheel) => vehicleState.wheels.get(wheel.id)?.angularSpeed ?? 0));
  const groundedDriven = driven.filter((wheel) => previousWheels.get(wheel.id)?.grounded === true);
  const longitudinalSpeed = dotVec3(body.velocity, rotateVec3([0, 0, -1], body.rotation));
  let normalizedWheelSpeed: number;
  if (groundedDriven.length > 0) {
    normalizedWheelSpeed = average(groundedDriven.map((wheel) => Math.abs(longitudinalSpeed) / wheel.radius * (1 + clamp(previousWheels.get(wheel.id)?.longitudinalSlip ?? 0, -0.5, 0.5))));
    state.lastGroundedNormalizedWheelSpeed = normalizedWheelSpeed;
    state.ungroundedDrivenTicks = 0;
  } else {
    state.ungroundedDrivenTicks += 1;
    normalizedWheelSpeed = state.ungroundedDrivenTicks <= PHYSICS_CAPABILITY_LIMITS.vehicleGroundedCouplingGraceTicks
      ? state.lastGroundedNormalizedWheelSpeed
      : averageWheelSpeed;
  }
  state.shiftLockout = Math.max(0, state.shiftLockout - fixedDelta);

  if (controller.transmission.shiftPolicy === "manual" && input.gear !== undefined && input.gear !== state.gear && state.phase === "engaged") {
    beginControllerShift(state, input.gear);
  }
  advanceControllerClutch(state, input.clutch, controller.transmission.clutchResponse, fixedDelta);

  const ratio = transmissionRatio(controller, state.gear);
  const freeRpm = controller.engine.idleRpm + input.throttle * (controller.engine.redlineRpm - controller.engine.idleRpm);
  const coupledRpm = Math.abs(normalizedWheelSpeed * ratio * controller.transmission.finalDrive) * 60 / (Math.PI * 2);
  state.engineRpm = clamp(
    ratio === 0 ? freeRpm : freeRpm + (coupledRpm - freeRpm) * state.clutchEngagement,
    controller.engine.idleRpm,
    controller.engine.redlineRpm,
  );
  if (controller.transmission.shiftPolicy === "automatic" && state.phase === "engaged" && state.shiftLockout <= 0) {
    const upshiftRpm = controller.transmission.upshiftRpm ?? controller.engine.redlineRpm * 0.85;
    const downshiftRpm = controller.transmission.downshiftRpm ?? controller.engine.idleRpm * 1.5;
    if (state.engineRpm >= upshiftRpm && state.gear < controller.transmission.forwardRatios.length) beginControllerShift(state, state.gear + 1);
    else if (state.engineRpm <= downshiftRpm && state.gear > 1) beginControllerShift(state, state.gear - 1);
  }

  const drivenSlip = groundedDriven.map((wheel) => Math.abs(previousWheels.get(wheel.id)?.longitudinalSlip ?? 0));
  const brakingSlip = assembly.wheels.filter((wheel) => wheel.braked && previousWheels.get(wheel.id)?.grounded === true).map((wheel) => Math.abs(previousWheels.get(wheel.id)?.longitudinalSlip ?? 0));
  const tcsConfig = controller.assists?.tcs;
  const absConfig = controller.assists?.abs;
  const tcsTriggered = tcsConfig?.enabled === true && input.throttle > 0 && Math.max(0, ...drivenSlip) > tcsConfig.slipThreshold;
  const absTriggered = absConfig?.enabled === true && input.brake > 0 && Math.max(0, ...brakingSlip) > absConfig.slipThreshold;
  state.tcsFactor = assistFactor(state.tcsFactor, tcsTriggered, tcsConfig?.response, fixedDelta);
  state.absFactor = assistFactor(state.absFactor, absTriggered, absConfig?.response, fixedDelta);

  const combustionTorque = sampleNumericCurve(controller.engine.torqueCurve, state.engineRpm, "rpm", "torque") * input.throttle;
  const shaftDirection = Math.abs(longitudinalSpeed) > PHYSICS_CAPABILITY_LIMITS.vehicleShaftDirectionEpsilon
    ? Math.sign(longitudinalSpeed * ratio)
    : Math.abs(averageWheelSpeed) > PHYSICS_CAPABILITY_LIMITS.vehicleShaftDirectionEpsilon
      ? Math.sign(averageWheelSpeed * ratio)
      : 0;
  const engineBrake = controller.engine.engineBraking * (1 - input.throttle) * shaftDirection;
  const engineTorque = combustionTorque - engineBrake;
  const clutchTorque = engineTorque * state.clutchEngagement * state.tcsFactor;
  const gearboxTorque = clutchTorque * ratio;
  const finalDriveTorque = gearboxTorque * controller.transmission.finalDrive;
  const wheelTorque = distributeControllerTorque(controller, assembly, previousWheels, finalDriveTorque);
  const driveForces = new Map(assembly.wheels.map((wheel) => [wheel.id, clamp((wheelTorque.get(wheel.id) ?? 0) / wheel.radius, -assembly.maxTireForce, assembly.maxTireForce)]));
  const brakeForces = controllerBrakeForces(controller, assembly, input, state.absFactor);
  const speed = Math.hypot(body.velocity[0], body.velocity[2]);
  const steeringScale = sampleNumericCurve(controller.steering.speedCurve, speed, "speed", "scale");
  const observation: IVehicleControllerObservation = {
    absActive: absTriggered,
    clutch: round(1 - state.clutchEngagement),
    driveTorque: round(finalDriveTorque),
    engineRpm: round(state.engineRpm),
    entity: entityId,
    gear: state.gear,
    inputs: { ...input },
    shiftState: state.phase === "engaged" ? "engaged" : "shifting",
    speed: round(speed),
    tcsActive: tcsTriggered,
    torquePath: {
      clutch: round(clutchTorque),
      engine: round(engineTorque),
      finalDrive: round(finalDriveTorque),
      gearbox: round(gearboxTorque),
      wheels: assembly.wheels.map((wheel) => ({ torque: round(wheelTorque.get(wheel.id) ?? 0), wheelId: wheel.id })),
    },
  };
  vehicleState.controller = state;
  return { brakeForces, driveForces, observation, steering: clamp(input.steer * steeringScale, -1, 1) };
}

function initialControllerState(controller: IVehicleControllerComponent): IControllerState {
  return { absFactor: 1, clutchEngagement: 1, engineRpm: controller.engine.idleRpm, gear: controller.transmission.shiftPolicy === "automatic" ? 1 : 0, lastGroundedNormalizedWheelSpeed: 0, phase: "engaged", shiftLockout: 0, tcsFactor: 1, ungroundedDrivenTicks: 0 };
}

function beginControllerShift(state: IControllerState, gear: number): void {
  state.pendingGear = gear;
  state.phase = "disengaging";
}

function advanceControllerClutch(state: IControllerState, clutchPedal: number, response: number, fixedDelta: number): void {
  const delta = fixedDelta / response;
  if (state.phase === "disengaging") {
    state.clutchEngagement = moveToward(state.clutchEngagement, 0, delta);
    if (state.clutchEngagement <= 0.000001) {
      state.clutchEngagement = 0;
      state.gear = state.pendingGear ?? state.gear;
      delete state.pendingGear;
      state.phase = "engaging";
    }
    return;
  }
  const target = state.phase === "engaging" ? 1 : 1 - clutchPedal;
  state.clutchEngagement = moveToward(state.clutchEngagement, target, delta);
  if (state.phase === "engaging" && state.clutchEngagement >= 0.999999) {
    state.clutchEngagement = 1;
    state.phase = "engaged";
    state.shiftLockout = response;
  }
}

function transmissionRatio(controller: IVehicleControllerComponent, gear: number): number {
  if (gear === -1) return -controller.transmission.reverseRatio;
  if (gear <= 0) return 0;
  return controller.transmission.forwardRatios[gear - 1] ?? 0;
}

function distributeControllerTorque(
  controller: IVehicleControllerComponent,
  assembly: IWheelAssemblyComponent,
  previousWheels: ReadonlyMap<string, IWheelAssemblyObservation["wheels"][number]>,
  torque: number,
): Map<string, number> {
  const driven = assembly.wheels.filter((wheel) => wheel.driven);
  const eligible = driven.filter((wheel) => (
    controller.differential.kind === "locked"
    || previousWheels.get(wheel.id)?.grounded === true
  ));
  const weights = new Map<string, number>();
  if (eligible.length === 0) return new Map(assembly.wheels.map((wheel) => [wheel.id, 0]));
  const eligibleSlip = eligible.map((wheel) => Math.abs(previousWheels.get(wheel.id)?.longitudinalSlip ?? 0));
  const maximumSlip = Math.max(...eligibleSlip);
  const minimumSlip = Math.min(...eligibleSlip);
  const hasMeaningfulSlipDifference = maximumSlip - minimumSlip > PHYSICS_CAPABILITY_LIMITS.vehicleLimitedSlipActivationDelta;
  for (const wheel of eligible) {
    if (controller.differential.kind !== "limited-slip" || !hasMeaningfulSlipDifference) weights.set(wheel.id, 1);
    else {
      const slip = Math.abs(previousWheels.get(wheel.id)?.longitudinalSlip ?? 0);
      weights.set(wheel.id, clamp((maximumSlip + 0.001) / (slip + 0.001), 1, controller.differential.limitedSlipRatio ?? 1));
    }
  }
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  return new Map(assembly.wheels.map((wheel) => [wheel.id, torque * (weights.get(wheel.id) ?? 0) / total]));
}

function controllerBrakeForces(controller: IVehicleControllerComponent, assembly: IWheelAssemblyComponent, input: IVehicleControllerInput, absFactor: number): Map<string, number> {
  const front = assembly.wheels.filter((wheel) => wheel.braked && wheel.attachment[2] < 0);
  const rear = assembly.wheels.filter((wheel) => wheel.braked && wheel.attachment[2] >= 0);
  const frontBudget = rear.length === 0 ? 1 : controller.brakes.frontBias;
  const rearBudget = front.length === 0 ? 1 : 1 - controller.brakes.frontBias;
  const handbrakeIds = new Set(controller.brakes.handbrakeWheelIds);
  return new Map(assembly.wheels.map((wheel) => {
    const serviceShare = !wheel.braked ? 0 : wheel.attachment[2] < 0 ? frontBudget / Math.max(front.length, 1) : rearBudget / Math.max(rear.length, 1);
    const service = input.brake * absFactor * serviceShare * assembly.maxTireForce;
    const handbrake = handbrakeIds.has(wheel.id) ? input.handbrake * assembly.maxTireForce : 0;
    return [wheel.id, Math.min(assembly.maxTireForce, service + handbrake)];
  }));
}

function assistFactor(current: number, triggered: boolean, response: number | undefined, fixedDelta: number): number {
  if (response === undefined) return 1;
  return moveToward(current, triggered ? 0 : 1, fixedDelta / response);
}

function sampleNumericCurve<T extends Record<string, number>>(curve: readonly T[], value: number, x: keyof T, y: keyof T): number {
  if (curve.length === 0) return 0;
  const first = curve[0]!;
  if (value <= first[x]!) return first[y]!;
  for (let index = 1; index < curve.length; index += 1) {
    const right = curve[index]!;
    const rightX = right[x]!;
    const rightY = right[y]!;
    if (value > rightX) continue;
    const left = curve[index - 1]!;
    const leftX = left[x]!;
    const leftY = left[y]!;
    const span = rightX - leftX;
    return span <= 0 ? rightY : leftY + (rightY - leftY) * (value - leftX) / span;
  }
  return curve[curve.length - 1]![y]!;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildPhysicsVehicleDebugOverlay(world: IWorldIr): IWebDebugOverlayModel {
  const observations = observationsByWorld.get(world) ?? [];
  const states = statesByWorld.get(world);
  const primitives: IWebDebugDrawPrimitive[] = [];
  const rows: IWebDebugOverlayRow[] = [];
  for (const assembly of observations) {
    const state = states?.get(assembly.entity);
    for (const wheel of assembly.wheels) {
      const wheelState = state?.wheels.get(wheel.wheelId);
      if (wheelState !== undefined) {
        primitives.push({ color: wheel.grounded ? "#44dd88" : "#ddaa44", id: `${assembly.entity}:${wheel.wheelId}:cast`, kind: "line", label: wheel.wheelId, target: assembly.entity, value: { end: wheelState.castEnd, start: wheelState.attachment } });
      }
      if (wheel.contact !== undefined) {
        primitives.push({ color: "#55aaff", id: `${assembly.entity}:${wheel.wheelId}:contact`, kind: "normal", label: wheel.surface ?? "default", target: wheel.contact.entity, value: { normal: wheel.contact.normal, point: wheel.contact.point } });
      }
      rows.push({
        category: "vehicle-wheel",
        label: `${assembly.entity}/${wheel.wheelId}`,
        severity: "info",
        sourcePath: `WheelAssembly/wheels/${wheel.wheelId}`,
        value: `compression=${wheel.compression.toFixed(3)} load=${wheel.normalLoad.toFixed(1)} slip=${wheel.longitudinalSlip.toFixed(3)}/${wheel.lateralSlip.toFixed(3)} surface=${wheel.surface ?? "none"}`,
      });
    }
  }
  for (const controller of controllerObservationsByWorld.get(world) ?? []) {
    rows.push({
      category: "vehicle-controller",
      label: controller.entity,
      severity: controller.absActive || controller.tcsActive ? "warning" : "info",
      sourcePath: "VehicleController",
      value: `speed=${controller.speed.toFixed(2)} rpm=${controller.engineRpm.toFixed(0)} gear=${controller.gear} clutch=${controller.clutch.toFixed(2)} torque=${controller.driveTorque.toFixed(1)} abs=${controller.absActive} tcs=${controller.tcsActive}`,
    });
  }
  return { enabled: primitives.length > 0 || rows.length > 0, primitives, rows };
}

export function updatePhysicsVehicleVisuals(world: IWorldIr, mapped: IThreeWorld, alpha: number): void {
  for (const observation of observePhysicsVehicleVisuals(world, undefined, alpha)) {
    const visual = mapped.objectsById.get(observation.targetId);
    if (visual === undefined) continue;
    visual.position.set(observation.interpolatedPosition[0], observation.interpolatedPosition[1], observation.interpolatedPosition[2]);
    if (visual.parent !== null) {
      visual.parent.updateWorldMatrix(true, false);
      visual.parent.worldToLocal(visual.position);
    }
    visual.rotation.set(observation.interpolatedSpinAngle, observation.interpolatedSteeringAngle, Math.PI / 2);
  }
}

export function disposePhysicsVehicleRuntime(world: IWorldIr): void {
  controlsByWorld.delete(world);
  controllerInputsByWorld.delete(world);
  controllerObservationsByWorld.delete(world);
  statesByWorld.delete(world);
  observationsByWorld.delete(world);
  stepsByWorld.delete(world);
}

function wheelObservation(
  wheelId: string,
  angularSpeed: number,
  compression: number,
  normalLoad: number,
  longitudinalSlip: number,
  lateralSlip: number,
  contact: IPhysicsQueryHitObservation | undefined,
  surface: IPhysicsSurfaceComponent | undefined,
): IWheelAssemblyObservation["wheels"][number] {
  return {
    angularSpeed: round(angularSpeed),
    compression: round(compression),
    ...(contact === undefined ? {} : { contact }),
    grounded: contact !== undefined,
    lateralSlip: contact === undefined ? 0 : round(lateralSlip),
    longitudinalSlip: contact === undefined ? 0 : round(longitudinalSlip),
    normalLoad: round(normalLoad),
    ...(contact === undefined || surface === undefined ? {} : { surface: contact.entity }),
    wheelId,
  };
}

function initialWheelState(attachment: Vec3, travel: number): IWheelState {
  const pose = { angle: 0, position: [attachment[0], attachment[1] - travel, attachment[2]] as Vec3, steering: 0 };
  return { attachment, angularSpeed: 0, castEnd: [attachment[0], attachment[1] - travel, attachment[2]], previousVisual: pose, visual: pose };
}

function validControlInput(input: IWheelControlInput): boolean {
  return Number.isFinite(input.brake) && input.brake >= 0 && input.brake <= 1
    && Number.isFinite(input.drive) && input.drive >= -1 && input.drive <= 1
    && Number.isFinite(input.steering) && input.steering >= -1 && input.steering <= 1;
}

export function isValidPhysicsVehicleControllerInput(input: IVehicleControllerInput, forwardGearCount: number): boolean {
  return Number.isFinite(input.brake) && input.brake >= 0 && input.brake <= 1
    && Number.isFinite(input.clutch) && input.clutch >= 0 && input.clutch <= 1
    && (input.gear === undefined || (Number.isInteger(input.gear) && input.gear >= -1 && input.gear <= forwardGearCount))
    && Number.isFinite(input.handbrake) && input.handbrake >= 0 && input.handbrake <= 1
    && Number.isFinite(input.steer) && input.steer >= -1 && input.steer <= 1
    && Number.isFinite(input.throttle) && input.throttle >= 0 && input.throttle <= 1;
}

function sampleSlipCurve(curve: ITireModelComponent["longitudinalSlipCurve"], slip: number): number {
  if (curve.length === 0) return 0;
  if (slip <= curve[0]!.slip) return curve[0]!.grip;
  for (let index = 1; index < curve.length; index += 1) {
    const right = curve[index]!;
    if (slip > right.slip) continue;
    const left = curve[index - 1]!;
    const span = right.slip - left.slip;
    return span <= 0 ? right.grip : left.grip + (right.grip - left.grip) * (slip - left.slip) / span;
  }
  return curve[curve.length - 1]!.grip;
}

function combinedGrip(tireGrip: number, surface: IPhysicsSurfaceComponent | undefined): number {
  return surface === undefined ? tireGrip : combinePhysicsSurfaceValues(tireGrip, "average", surface.grip, surface.combineRule);
}

function combinedRollingResistance(tire: ITireModelComponent, surface: IPhysicsSurfaceComponent | undefined): number {
  return surface === undefined ? tire.rollingResistance : combinePhysicsSurfaceValues(tire.rollingResistance, "average", surface.rollingResistance, surface.combineRule);
}

function rotateVec3([x, y, z]: Vec3, [qx, qy, qz, qw]: Quat): Vec3 {
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}

function addVec3(left: Vec3, right: Vec3): Vec3 { return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]; }
function subtractVec3(left: Vec3, right: Vec3): Vec3 { return [left[0] - right[0], left[1] - right[1], left[2] - right[2]]; }
function scaleVec3(value: Vec3, scale: number): Vec3 { return [value[0] * scale, value[1] * scale, value[2] * scale]; }
function dotVec3(left: Vec3, right: Vec3): number { return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]; }
function crossVec3(left: Vec3, right: Vec3): Vec3 { return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]]; }
function lerpVec3(left: Vec3, right: Vec3, alpha: number): Vec3 { return [left[0] + (right[0] - left[0]) * alpha, left[1] + (right[1] - left[1]) * alpha, left[2] + (right[2] - left[2]) * alpha]; }
function lerpAngle(left: number, right: number, alpha: number): number { return normalizeAngle(left + normalizeAngle(right - left) * alpha); }
function normalizeAngle(value: number): number { return ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }
function moveToward(value: number, target: number, maximumDelta: number): number { return value < target ? Math.min(target, value + maximumDelta) : Math.max(target, value - maximumDelta); }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
function round(value: number): number { return Number(value.toFixed(6)); }
