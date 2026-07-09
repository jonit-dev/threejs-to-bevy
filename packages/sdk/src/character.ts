import { assertPositiveNumber, SdkError } from "./errors.js";
import { defineComponent, type IEcsDeclaration } from "./ecs/schema.js";
import type { Vector3Tuple } from "./math/Vector3.js";

export type CharacterGroundingMode = "none" | "raycast";

export interface ICharacterControllerDeclaration {
  blocking: boolean;
  grounding: CharacterGroundingMode;
  interactAction?: string;
  moveXAxis: string;
  moveZAxis: string;
  pushPolicy?: ICharacterPushPolicy;
  slopeLimit?: number;
  speed: number;
  stepOffset?: number;
}

export interface ICharacterPushPolicy {
  allowedLayers?: ReadonlyArray<string>;
  blockedWhenTooHeavy?: boolean;
  enabled: boolean;
  impulseScale?: number;
  maxPushMass?: number;
  minMoveSpeed?: number;
}

export interface ICharacterMoveResult {
  blockedBy?: string;
  contacts?: ReadonlyArray<ICharacterContactObservation>;
  desired: Vector3Tuple;
  entity: string;
  groundEntity?: string;
  grounded: boolean;
  platformDelta?: Vector3Tuple;
  pushed?: ICharacterPushObservation;
  pushes?: ReadonlyArray<ICharacterPushObservation>;
  resolved: Vector3Tuple;
  slope?: ICharacterSlopeObservation;
  start: Vector3Tuple;
  tooHeavy?: string;
}

export interface ICharacterContactObservation {
  material?: string;
  normal?: Vector3Tuple;
  other: string;
  phase: "begin" | "end" | "stay";
  point?: Vector3Tuple;
  pointIndex: number;
  self: string;
}

export interface ICharacterPushObservation {
  entity: string;
  impulse: Vector3Tuple;
  position: Vector3Tuple;
}

export interface ICharacterSlopeObservation {
  angle: number;
  axis: "x" | "z";
  direction: -1 | 1;
  entity: string;
  rise: number;
  run: number;
  walkable: boolean;
}

export interface ICharacterControllerOptions {
  blocking?: boolean;
  grounding?: CharacterGroundingMode;
  interactAction?: string;
  moveXAxis?: string;
  moveZAxis?: string;
  pushPolicy?: ICharacterPushPolicy;
  slopeLimit?: number;
  speed?: number;
  stepOffset?: number;
  unsupported?: IUnsupportedCharacterControllerOptions;
}

export interface IUnsupportedCharacterControllerOptions {
  navmesh?: boolean;
}

export const CharacterController = defineComponent("CharacterController", {
  blocking: "boolean",
  grounding: "string",
  interactAction: { kind: "string", required: false },
  moveXAxis: "string",
  moveZAxis: "string",
  slopeLimit: { kind: "number", required: false },
  speed: "number",
  stepOffset: { kind: "number", required: false },
});

export function characterController(options: ICharacterControllerOptions = {}): IEcsDeclaration {
  assertSupportedCharacterOptions(options.unsupported);
  const speed = options.speed ?? 4;
  assertPositiveNumber(speed, "TN_SDK_CHARACTER_SPEED_INVALID", "CharacterController.speed");
  const slopeLimit = options.slopeLimit;
  if (slopeLimit !== undefined && (!Number.isFinite(slopeLimit) || slopeLimit < 0 || slopeLimit > 90)) {
    throw new SdkError("TN_SDK_CHARACTER_SLOPE_INVALID", "CharacterController.slopeLimit must be a finite angle from 0 to 90 degrees.");
  }
  const stepOffset = options.stepOffset;
  if (stepOffset !== undefined && (!Number.isFinite(stepOffset) || stepOffset < 0)) {
    throw new SdkError("TN_SDK_CHARACTER_STEP_INVALID", "CharacterController.stepOffset must be a finite non-negative number.");
  }
  return CharacterController({
    blocking: options.blocking ?? true,
    grounding: options.grounding ?? "raycast",
    ...(options.interactAction === undefined ? {} : { interactAction: assertNonEmpty(options.interactAction, "interactAction") }),
    moveXAxis: assertNonEmpty(options.moveXAxis ?? "MoveX", "moveXAxis"),
    moveZAxis: assertNonEmpty(options.moveZAxis ?? "MoveZ", "moveZAxis"),
    ...(options.pushPolicy === undefined ? {} : { pushPolicy: normalizePushPolicy(options.pushPolicy) }),
    ...(slopeLimit === undefined ? {} : { slopeLimit }),
    speed,
    ...(stepOffset === undefined ? {} : { stepOffset }),
  });
}

function normalizePushPolicy(policy: ICharacterPushPolicy): ICharacterPushPolicy {
  if (typeof policy.enabled !== "boolean") {
    throw new SdkError("TN_SDK_CHARACTER_PUSH_INVALID", "CharacterController.pushPolicy.enabled must be boolean.");
  }
  if (policy.maxPushMass !== undefined && (!Number.isFinite(policy.maxPushMass) || policy.maxPushMass < 0 || policy.maxPushMass > 1_000_000)) {
    throw new SdkError("TN_SDK_CHARACTER_PUSH_INVALID", "CharacterController.pushPolicy.maxPushMass must be a finite number from 0 to 1000000.");
  }
  if (policy.impulseScale !== undefined && (!Number.isFinite(policy.impulseScale) || policy.impulseScale < 0 || policy.impulseScale > 1000)) {
    throw new SdkError("TN_SDK_CHARACTER_PUSH_INVALID", "CharacterController.pushPolicy.impulseScale must be a finite number from 0 to 1000.");
  }
  if (policy.minMoveSpeed !== undefined && (!Number.isFinite(policy.minMoveSpeed) || policy.minMoveSpeed < 0)) {
    throw new SdkError("TN_SDK_CHARACTER_PUSH_INVALID", "CharacterController.pushPolicy.minMoveSpeed must be a finite non-negative number.");
  }
  if (policy.allowedLayers !== undefined && policy.allowedLayers.some((layer) => layer.trim() === "")) {
    throw new SdkError("TN_SDK_CHARACTER_PUSH_INVALID", "CharacterController.pushPolicy.allowedLayers must contain non-empty strings.");
  }
  return {
    ...(policy.allowedLayers === undefined ? {} : { allowedLayers: [...policy.allowedLayers] }),
    ...(policy.blockedWhenTooHeavy === undefined ? {} : { blockedWhenTooHeavy: policy.blockedWhenTooHeavy }),
    enabled: policy.enabled,
    ...(policy.impulseScale === undefined ? {} : { impulseScale: policy.impulseScale }),
    ...(policy.maxPushMass === undefined ? {} : { maxPushMass: policy.maxPushMass }),
    ...(policy.minMoveSpeed === undefined ? {} : { minMoveSpeed: policy.minMoveSpeed }),
  };
}

function assertSupportedCharacterOptions(options: IUnsupportedCharacterControllerOptions | undefined): void {
  if (options?.navmesh === true) {
    throw new SdkError("TN_SDK_CHARACTER_NAVMESH_UNSUPPORTED", "Character controllers cannot declare navmesh behavior before V7.");
  }
}

function assertNonEmpty(value: string, field: string): string {
  if (value.trim() === "") {
    throw new SdkError("TN_SDK_CHARACTER_INPUT_REF_EMPTY", `CharacterController.${field} must not be empty.`);
  }
  return value;
}
