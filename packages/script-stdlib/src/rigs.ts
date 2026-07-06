import { BasisEx, CameraMath, InputEx } from "./gameplay.js";
import { NumberEx } from "./numeric.js";
import { Quat, TransformMath } from "./rotation.js";
import { EPSILON, isRecord, type QuatTuple, type Vec2Value, type Vec3Tuple, type Vec3Value } from "./types.js";
import { Vec2, Vec3 } from "./vectors.js";

type ForwardAxis = "+z" | "-z" | "+x" | "-x";

interface ISystemEntityLike {
  readonly components?: Record<string, unknown>;
  has?(component: unknown): boolean;
  readonly id: string;
  get?<T = unknown>(component: unknown): T | undefined;
  patch?(component: unknown, value: unknown): void;
  set?(component: unknown, value: unknown): void;
  transform?(): {
    positionOr(fallback: readonly [number, number, number]): Vec3Tuple;
    setPose(position: readonly [number, number, number], rotation: readonly [number, number, number, number]): void;
    yawOr(fallback: number): number;
  };
}

interface IRigContextLike {
  animation?: {
    play(entity: string | ISystemEntityLike, clip: string, options?: Record<string, unknown>): unknown;
  };
  character?: {
    move(entity: string | ISystemEntityLike, options?: { direction?: [number, number]; fixedDelta?: number; speed?: number }): { resolved?: Vec3Value; start?: Vec3Value } | null;
  };
  entity?(id: string): ISystemEntityLike | undefined;
  input?: {
    action(name: string): boolean;
    axis(name: string): number;
  };
  physics?: {
    raycast?(options: { direction: Vec3Value; ignore?: readonly string[]; mask?: readonly string[]; maxDistance?: number; origin: Vec3Value }): { distance?: number; hit?: boolean } | null;
    sensor(options?: { phases?: Array<"enter" | "exit" | "stay">; sensor?: string }): { events: IPhysicsSensorEventLike[] };
  };
  resources?: {
    set(name: string, value: unknown): void;
  };
  state<T extends object>(key: string, defaults: T): T;
  time?: {
    delta?: number;
    dt?: number;
    elapsed?: number;
    fixedDelta?(options?: { fallback?: number }): number;
    fixedDt?: number;
  };
}

interface IPhysicsSensorEventLike {
  readonly filteredOut?: readonly string[];
  readonly interactionKind?: string;
  readonly occupants: readonly string[];
  readonly phase: "enter" | "exit" | "stay";
  readonly sensor: string;
  readonly step?: number;
}

export interface ICharacterRigOptions {
  readonly acceleration?: number;
  readonly bounds?: { readonly max: Vec3Value; readonly min: Vec3Value };
  readonly cameraYaw?: number;
  readonly clips?: {
    readonly idle?: string | ICharacterRigClipOptions;
    readonly run?: string | ICharacterRigClipOptions;
    readonly walk?: string | ICharacterRigClipOptions;
  };
  readonly deceleration?: number;
  readonly fixedDelta?: number;
  readonly forwardAxis?: ForwardAxis;
  readonly maxTurnSpeed?: number;
  readonly moveXAxis?: string;
  readonly moveZAxis?: string;
  readonly sprintAction?: string;
  readonly sprintSpeed?: number;
  readonly turnSmoothing?: number;
  readonly walkSpeed?: number;
}

export interface ICharacterRigClipOptions {
  readonly clip: string;
  readonly referenceSpeed?: number;
  readonly sourceClip?: string;
}

export interface ICharacterRigResult {
  readonly moving: boolean;
  readonly position: Vec3Tuple;
  readonly speed: number;
  readonly sprinting: boolean;
  readonly yaw: number;
}

export interface ICameraRigOptions {
  readonly cameraId?: string;
  readonly followSmoothing?: number;
  readonly lookAhead?: Vec3Value;
  readonly maxYawSpeed?: number;
  readonly offset?: Vec3Value;
  readonly shoulderOffset?: Vec3Value;
  readonly sprintPullback?: number;
  readonly sprinting?: boolean;
  readonly target: string | ISystemEntityLike;
  readonly yaw?: number;
  readonly yawSmoothing?: number;
}

export interface ICameraRigResult {
  readonly yaw: number;
}

export interface IOrbitCameraRigOptions {
  readonly cameraId?: string;
  readonly collision?: {
    readonly ignore?: readonly string[];
    readonly mask?: readonly string[];
    readonly padding?: number;
  };
  readonly distance?: number;
  readonly input?: {
    readonly lookX?: string;
    readonly lookY?: string;
    readonly maxAxisMagnitude?: number;
    readonly maxPitchStep?: number;
    readonly maxYawStep?: number;
    readonly pitchSensitivity?: number;
    readonly yawSensitivity?: number;
  };
  readonly lookHeight?: number;
  readonly minDistance?: number;
  readonly pitch?: {
    readonly default?: number;
    readonly max?: number;
    readonly min?: number;
  };
  readonly rounding?: {
    readonly positionDigits?: number;
    readonly rotationDigits?: number;
  };
  readonly target: string | ISystemEntityLike;
  readonly yaw?: number;
}

export interface IOrbitCameraRigResult {
  readonly collided: boolean;
  readonly distance: number;
  readonly pitch: number;
  readonly position: Vec3Tuple;
  readonly target: Vec3Tuple;
  readonly yaw: number;
}

export interface ITriggerExOptions {
  readonly component?: string;
  readonly layer?: string;
}

export interface IKinematicMoverExOptions {
  readonly axis?: "x" | "y" | "z";
  readonly direction?: Vec3Value;
  readonly origin?: Vec3Value;
  readonly phase?: number;
  readonly radius?: number;
  readonly speed?: number;
}

export interface IKinematicMoverExResult {
  readonly position: Vec3Tuple;
  readonly velocity: Vec3Tuple;
}

export interface IRespawnExOptions {
  readonly components?: Record<string, unknown>;
  readonly position?: Vec3Value;
  readonly resources?: Record<string, unknown>;
  readonly stateKeys?: readonly string[];
  readonly yaw?: number;
}

export interface IRespawnExResult {
  readonly entity: string;
  readonly position: Vec3Tuple;
}

interface ICharacterRigState extends Record<string, unknown> {
  dirX: number;
  dirZ: number;
  speed: number;
  yaw: number;
}

interface ICameraRigState extends Record<string, unknown> {
  followX: number;
  followY: number;
  followZ: number;
  yaw: number;
}

interface IOrbitCameraRigState extends Record<string, unknown> {
  pitch: number;
  yaw: number;
}

interface ITriggerExState extends Record<string, unknown> {
  active: string;
}

interface ITriggerCooldownState extends Record<string, unknown> {
  nextReady: number;
}

export const CharacterRig = Object.freeze({
  update(context: IRigContextLike, entityRef: string | ISystemEntityLike, options: ICharacterRigOptions = {}): ICharacterRigResult {
    const entity = typeof entityRef === "string" ? context.entity?.(entityRef) : entityRef;
    const entityId = typeof entityRef === "string" ? entityRef : entityRef.id;
    const transform = entity?.transform?.();
    const start = transform?.positionOr([0, 0, 0]) ?? readComponentPosition(entity, [0, 0, 0]);
    const dt = Math.max(0, NumberEx.finite(options.fixedDelta, readFixedDelta(context)));
    const state = context.state<ICharacterRigState>(`tn.characterRig.${entityId}`, { dirX: 0, dirZ: 1, speed: 0, yaw: transform?.yawOr(0) ?? TransformMath.yaw(readComponentRotation(entity), 0) });
    const input = InputEx.axis2([context.input?.axis(options.moveXAxis ?? "MoveX") ?? 0, context.input?.axis(options.moveZAxis ?? "MoveZ") ?? 0], { normalize: true });
    const hasInput = Vec2.length(input) > EPSILON;
    const sprinting = options.sprintAction === undefined ? false : context.input?.action(options.sprintAction) === true;
    const targetSpeed = hasInput ? (sprinting ? options.sprintSpeed ?? 5.5 : options.walkSpeed ?? 3.1) : 0;
    const accel = targetSpeed > state.speed ? options.acceleration ?? 18 : options.deceleration ?? 24;
    state.speed = NumberEx.moveToward(state.speed, targetSpeed, Math.max(0, accel) * dt);
    const inputDirection = hasInput ? Vec3.normalize(Vec3.rotateYaw([input[0], 0, input[1]], NumberEx.finite(options.cameraYaw, 0))) : [state.dirX, 0, state.dirZ] as const;
    if (hasInput) {
      state.dirX = inputDirection[0];
      state.dirZ = inputDirection[2];
    }
    const moving = state.speed > EPSILON;
    const moveDirection = moving ? Vec3.normalize([NumberEx.finite(state.dirX, inputDirection[0]), 0, NumberEx.finite(state.dirZ, inputDirection[2])]) : [0, 0, 0] as const;
    // state.yaw always stays in the library's plain "+Z is yaw 0" convention
    // (the same convention CameraRig, BasisEx, and Vec3.rotateYaw use), so it
    // can be shared with CameraRig/cameraYaw without further translation.
    // forwardAxis only corrects the mesh's own rest-pose facing below, at the
    // point the quaternion is built.
    const targetYaw = hasInput ? BasisEx.forwardToYaw(inputDirection) : state.yaw;
    const maxTurn = Math.max(0, NumberEx.finite(options.maxTurnSpeed, Math.PI * 8)) * dt;
    const smoothing = Math.max(0, NumberEx.finite(options.turnSmoothing, 1));
    const yawStep = smoothing <= EPSILON ? maxTurn : maxTurn * Math.min(1, smoothing);
    state.yaw = moveAngleToward(state.yaw, targetYaw, yawStep);
    const trace = moving ? context.character?.move(entityRef, { direction: [moveDirection[0], moveDirection[2]], fixedDelta: dt, speed: state.speed }) ?? null : null;
    const position = clampVec3(Vec3.from(trace?.resolved, start), options.bounds);
    transform?.setPose(position, Quat.fromYaw(state.yaw + meshYawOffset(options.forwardAxis ?? "+z")));
    playCharacterClip(context, entityRef, state.speed, sprinting, options.clips);
    return { moving, position, speed: state.speed, sprinting, yaw: state.yaw };
  },
});

export const CameraRig = Object.freeze({
  thirdPerson(context: IRigContextLike, options: ICameraRigOptions): ICameraRigResult {
    const target = typeof options.target === "string" ? context.entity?.(options.target) : options.target;
    const cameraId = options.cameraId ?? "camera";
    const camera = context.entity?.(cameraId);
    const targetTransform = target?.transform?.();
    const targetPosition = targetTransform?.positionOr([0, 0, 0]) ?? readComponentPosition(target, [0, 0, 0]);
    const dt = Math.max(0, readDelta(context));
    const state = context.state<ICameraRigState>(`tn.cameraRig.${cameraId}`, { followX: targetPosition[0], followY: targetPosition[1], followZ: targetPosition[2], yaw: NumberEx.finite(options.yaw, targetTransform?.yawOr(0) ?? 0) });
    const targetYaw = NumberEx.finite(options.yaw, targetTransform?.yawOr(state.yaw) ?? state.yaw);
    state.yaw = moveAngleToward(state.yaw, targetYaw, Math.max(0, NumberEx.finite(options.maxYawSpeed, Math.PI * 3)) * dt * Math.max(1, NumberEx.finite(options.yawSmoothing, 1)));
    const followTarget = Vec3.add(targetPosition, Vec3.rotateYaw(Vec3.from(options.lookAhead, [0, 0, 0.75]), state.yaw));
    const followAlpha = exponentialAlpha(options.followSmoothing ?? 12, dt);
    state.followX = NumberEx.lerp(state.followX, followTarget[0], followAlpha);
    state.followY = NumberEx.lerp(state.followY, followTarget[1], followAlpha);
    state.followZ = NumberEx.lerp(state.followZ, followTarget[2], followAlpha);
    const pullback = options.sprinting === true ? Math.max(0, NumberEx.finite(options.sprintPullback, 1.25)) : 0;
    const offset = Vec3.add(Vec3.from(options.offset, [0, 3.2, -6]), [0, 0, -pullback]);
    const shoulder = Vec3.from(options.shoulderOffset, [0.55, 0, 0]);
    const pose = CameraMath.followPose({ offset: Vec3.add(offset, shoulder), target: [state.followX, state.followY, state.followZ], yaw: state.yaw });
    camera?.transform?.().setPose(pose.position, pose.rotation);
    return { yaw: state.yaw };
  },

  orbitThirdPerson(context: IRigContextLike, options: IOrbitCameraRigOptions): IOrbitCameraRigResult {
    const target = typeof options.target === "string" ? context.entity?.(options.target) : options.target;
    const cameraId = options.cameraId ?? "camera";
    const camera = context.entity?.(cameraId);
    const targetPosition = target?.transform?.().positionOr([0, 0, 0]) ?? readComponentPosition(target, [0, 0, 0]);
    const lookHeight = NumberEx.finite(options.lookHeight, 1.5);
    const lookTarget = Vec3.add(targetPosition, [0, lookHeight, 0]);
    const pitchMin = NumberEx.finite(options.pitch?.min, -Math.PI / 3);
    const pitchMax = NumberEx.finite(options.pitch?.max, Math.PI / 3);
    const defaultPitch = NumberEx.clamp(NumberEx.finite(options.pitch?.default, 0.25), pitchMin, pitchMax);
    const state = context.state<IOrbitCameraRigState>(`tn.cameraOrbitRig.${cameraId}`, {
      pitch: defaultPitch,
      yaw: NumberEx.finite(options.yaw, 0),
    });

    const maxAxisMagnitude = Math.max(0, NumberEx.finite(options.input?.maxAxisMagnitude, 36));
    const lookAxes = clampVec2Magnitude([
      context.input?.axis(options.input?.lookX ?? "LookX") ?? 0,
      context.input?.axis(options.input?.lookY ?? "LookY") ?? 0,
    ], maxAxisMagnitude);
    const yawStep = NumberEx.clamp(lookAxes[0] * NumberEx.finite(options.input?.yawSensitivity, 0.002), -Math.max(0, NumberEx.finite(options.input?.maxYawStep, 0.07)), Math.max(0, NumberEx.finite(options.input?.maxYawStep, 0.07)));
    const pitchStep = NumberEx.clamp(lookAxes[1] * NumberEx.finite(options.input?.pitchSensitivity, 0.0012), -Math.max(0, NumberEx.finite(options.input?.maxPitchStep, 0.045)), Math.max(0, NumberEx.finite(options.input?.maxPitchStep, 0.045)));
    state.yaw = NumberEx.repeat(NumberEx.finite(state.yaw, NumberEx.finite(options.yaw, 0)) - yawStep, Math.PI * 2);
    state.pitch = NumberEx.clamp(NumberEx.finite(state.pitch, defaultPitch) - pitchStep, pitchMin, pitchMax);

    const desiredDistance = Math.max(0, NumberEx.finite(options.distance, 5));
    const desiredPose = CameraMath.orbitPose({ distance: desiredDistance, pitch: state.pitch, target: lookTarget, yaw: state.yaw });
    const toCamera = Vec3.normalize(Vec3.sub(desiredPose.position, lookTarget));
    const hit = options.collision === undefined ? null : context.physics?.raycast?.({
      direction: toCamera,
      ignore: options.collision.ignore,
      mask: options.collision.mask,
      maxDistance: desiredDistance,
      origin: lookTarget,
    }) ?? null;
    const minDistance = Math.max(0, NumberEx.finite(options.minDistance, 0));
    const padding = Math.max(0, NumberEx.finite(options.collision?.padding, 0));
    const hitDistance = hit?.hit === true ? NumberEx.finite(hit.distance, desiredDistance) : desiredDistance;
    const resolvedDistance = hit?.hit === true ? Math.min(desiredDistance, Math.max(minDistance, hitDistance - padding)) : desiredDistance;
    const position = Vec3.add(lookTarget, Vec3.scale(toCamera, resolvedDistance));
    const roundedPosition = options.rounding?.positionDigits === undefined ? position : Vec3.round(position, options.rounding.positionDigits);
    const resolvedPose = CameraMath.lookAtPose(roundedPosition, lookTarget);
    const roundedRotation = options.rounding?.rotationDigits === undefined ? resolvedPose.rotation : roundQuat(resolvedPose.rotation, options.rounding.rotationDigits);
    camera?.transform?.().setPose(roundedPosition, roundedRotation);
    return {
      collided: hit?.hit === true,
      distance: resolvedDistance,
      pitch: state.pitch,
      position: roundedPosition,
      target: lookTarget,
      yaw: NumberEx.repeat(state.yaw + Math.PI, Math.PI * 2),
    };
  },
});

export const TriggerEx = Object.freeze({
  entered(context: IRigContextLike, triggerRef: string | ISystemEntityLike, options: ITriggerExOptions = {}): ISystemEntityLike[] {
    const sensorId = typeof triggerRef === "string" ? triggerRef : triggerRef.id;
    const state = context.state<ITriggerExState>(`tn.triggerEx.${sensorId}`, { active: "" });
    const result = context.physics?.sensor({ sensor: sensorId, phases: ["enter", "stay"] });
    if (result === undefined) {
      state.active = "";
      return [];
    }
    const previous = new Set(state.active.split("\n").filter((id) => id.length > 0));
    const current = new Set<string>();
    const entered: ISystemEntityLike[] = [];
    for (const event of result.events) {
      if (event.sensor !== sensorId || (event.phase !== "enter" && event.phase !== "stay")) {
        continue;
      }
      for (const occupantId of event.occupants) {
        const occupant = context.entity?.(occupantId) ?? { id: occupantId };
        if (!matchesTriggerOptions(occupant, options)) {
          continue;
        }
        current.add(occupantId);
        if (!previous.has(occupantId)) {
          entered.push(occupant);
        }
      }
    }
    state.active = [...current].sort().join("\n");
    return entered;
  },

  cooldown(context: IRigContextLike, key: string, seconds: number): boolean {
    const state = context.state<ITriggerCooldownState>(`tn.triggerCooldown.${key}`, { nextReady: Number.NEGATIVE_INFINITY });
    const now = readElapsed(context);
    if (now < state.nextReady) {
      return false;
    }
    state.nextReady = now + Math.max(0, NumberEx.finite(seconds, 0));
    return true;
  },
});

export const KinematicMoverEx = Object.freeze({
  sweep(context: IRigContextLike, entityRef: string | ISystemEntityLike, options: IKinematicMoverExOptions = {}): IKinematicMoverExResult {
    const entity = resolveEntity(context, entityRef);
    const transform = entity?.transform?.();
    const start = transform?.positionOr([0, 0, 0]) ?? readComponentPosition(entity, [0, 0, 0]);
    const rotation = readComponentRotation(entity);
    const origin = Vec3.from(options.origin, start);
    const direction = Vec3.normalize(options.direction === undefined ? axisVector(options.axis ?? "x") : options.direction);
    const radius = Math.max(0, NumberEx.finite(options.radius, 1));
    const speed = NumberEx.finite(options.speed, 1);
    const theta = NumberEx.finite(options.phase, 0) + readElapsed(context) * speed;
    const position = Vec3.add(origin, Vec3.scale(direction, Math.sin(theta) * radius));
    const velocity = Vec3.scale(direction, Math.cos(theta) * speed * radius);
    transform?.setPose(position, rotation);
    entity?.patch?.("RigidBody", { velocity });
    return { position, velocity };
  },
});

export const RespawnEx = Object.freeze({
  reset(context: IRigContextLike, entityRef: string | ISystemEntityLike, options: IRespawnExOptions = {}): IRespawnExResult {
    const entity = resolveEntity(context, entityRef);
    const entityId = typeof entityRef === "string" ? entityRef : entityRef.id;
    const transform = entity?.transform?.();
    const currentPosition = transform?.positionOr([0, 0, 0]) ?? readComponentPosition(entity, [0, 0, 0]);
    const position = Vec3.from(options.position, currentPosition);
    const yaw = NumberEx.finite(options.yaw, transform?.yawOr(0) ?? TransformMath.yaw(readComponentRotation(entity), 0));
    transform?.setPose(position, Quat.fromYaw(yaw));
    for (const [component, value] of Object.entries(options.components ?? {})) {
      if (entity?.patch !== undefined) {
        entity.patch(component, value);
      } else {
        entity?.set?.(component, value);
      }
    }
    for (const [name, value] of Object.entries(options.resources ?? {})) {
      context.resources?.set(name, value);
    }
    for (const key of options.stateKeys ?? []) {
      context.resources?.set(key, {});
    }
    return { entity: entityId, position };
  },
});

function playCharacterClip(context: IRigContextLike, entity: string | ISystemEntityLike, speed: number, sprinting: boolean, clips: ICharacterRigOptions["clips"]): void {
  const selected = speed <= EPSILON ? clips?.idle : sprinting ? clips?.run ?? clips?.walk : clips?.walk ?? clips?.run;
  if (selected === undefined) {
    return;
  }
  const clip = typeof selected === "string" ? selected : selected.clip;
  const referenceSpeed = typeof selected === "string" ? undefined : selected.referenceSpeed;
  const sourceClip = typeof selected === "string" ? selected : selected.sourceClip ?? selected.clip;
  context.animation?.play(entity, clip, {
    loop: true,
    sourceClip,
    speed: referenceSpeed === undefined ? 1 : Math.max(0.01, speed / Math.max(0.01, NumberEx.finite(referenceSpeed, 1))),
  });
}

function readFixedDelta(context: IRigContextLike): number {
  return context.time?.fixedDelta?.({ fallback: context.time?.fixedDt ?? 1 / 60 }) ?? context.time?.fixedDt ?? context.time?.delta ?? 1 / 60;
}

function readDelta(context: IRigContextLike): number {
  return context.time?.delta ?? context.time?.dt ?? context.time?.fixedDt ?? 1 / 60;
}

function readComponentPosition(entity: ISystemEntityLike | undefined, fallback: Vec3Value): Vec3Tuple {
  const transform = entity?.get?.("Transform") ?? entity?.components?.Transform;
  return isRecord(transform) ? Vec3.from(transform.position as Vec3Value | undefined, fallback) : Vec3.from(fallback);
}

function readComponentRotation(entity: ISystemEntityLike | undefined): QuatTuple {
  const transform = entity?.get?.("Transform") ?? entity?.components?.Transform;
  return isRecord(transform) ? Quat.from(transform.rotation as QuatTuple | undefined) : Quat.identity();
}

function clampVec3(value: Vec3Tuple, bounds: ICharacterRigOptions["bounds"]): Vec3Tuple {
  if (bounds === undefined) {
    return value;
  }
  const min = Vec3.from(bounds.min, value);
  const max = Vec3.from(bounds.max, value);
  return [
    NumberEx.clamp(value[0], min[0], max[0]),
    NumberEx.clamp(value[1], min[1], max[1]),
    NumberEx.clamp(value[2], min[2], max[2]),
  ];
}

function clampVec2Magnitude(value: Vec2Value, maxMagnitude: number): [number, number] {
  const vec = Vec2.from(value);
  const max = Math.max(0, NumberEx.finite(maxMagnitude, 0));
  const length = Vec2.length(vec);
  return length > max && length > EPSILON ? [vec[0] * max / length, vec[1] * max / length] : [vec[0], vec[1]];
}

function roundQuat(value: QuatTuple, digits: number): QuatTuple {
  return [
    NumberEx.round(value[0], digits),
    NumberEx.round(value[1], digits),
    NumberEx.round(value[2], digits),
    NumberEx.round(value[3], digits),
  ];
}

// Correction applied only to the mesh's own quaternion, so a rig's stored/
// returned yaw always stays in the plain "+Z is yaw 0" convention regardless
// of which way the authored mesh's rest pose actually faces.
function meshYawOffset(forwardAxis: ForwardAxis): number {
  if (forwardAxis === "-z") {
    return Math.PI;
  }
  if (forwardAxis === "+x") {
    return -Math.PI / 2;
  }
  if (forwardAxis === "-x") {
    return Math.PI / 2;
  }
  return 0;
}

function moveAngleToward(current: number, target: number, maxDelta: number): number {
  const delta = NumberEx.repeat(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + NumberEx.clamp(delta, -Math.max(0, maxDelta), Math.max(0, maxDelta));
}

function exponentialAlpha(rate: number, dt: number): number {
  return 1 - Math.exp(-Math.max(0, NumberEx.finite(rate, 0)) * Math.max(0, NumberEx.finite(dt, 0)));
}

function resolveEntity(context: IRigContextLike, entityRef: string | ISystemEntityLike): ISystemEntityLike | undefined {
  return typeof entityRef === "string" ? context.entity?.(entityRef) : entityRef;
}

function readElapsed(context: IRigContextLike): number {
  return Math.max(0, NumberEx.finite(context.time?.elapsed, 0));
}

function axisVector(axis: "x" | "y" | "z"): Vec3Tuple {
  if (axis === "y") {
    return [0, 1, 0];
  }
  if (axis === "z") {
    return [0, 0, 1];
  }
  return [1, 0, 0];
}

function matchesTriggerOptions(entity: ISystemEntityLike, options: ITriggerExOptions): boolean {
  if (options.component !== undefined && !hasComponent(entity, options.component)) {
    return false;
  }
  if (options.layer !== undefined && !matchesColliderLayer(entity, options.layer)) {
    return false;
  }
  return true;
}

function hasComponent(entity: ISystemEntityLike, component: string): boolean {
  if (entity.has?.(component) === true) {
    return true;
  }
  if (entity.components !== undefined && component in entity.components) {
    return true;
  }
  return entity.get?.(component) !== undefined;
}

function matchesColliderLayer(entity: ISystemEntityLike, layer: string): boolean {
  const collider = entity.get?.("Collider") ?? entity.components?.Collider;
  if (!isRecord(collider)) {
    return false;
  }
  if (collider.layer === layer) {
    return true;
  }
  if (Array.isArray(collider.layers)) {
    return collider.layers.includes(layer);
  }
  return false;
}
