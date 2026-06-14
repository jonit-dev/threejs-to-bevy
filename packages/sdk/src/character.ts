import { assertPositiveNumber, SdkError } from "./errors.js";
import { defineComponent, type IEcsDeclaration } from "./ecs/schema.js";

export type CharacterGroundingMode = "none" | "raycast";

export interface ICharacterControllerDeclaration {
  blocking: boolean;
  grounding: CharacterGroundingMode;
  interactAction?: string;
  moveXAxis: string;
  moveZAxis: string;
  speed: number;
}

export interface ICharacterControllerOptions {
  blocking?: boolean;
  grounding?: CharacterGroundingMode;
  interactAction?: string;
  moveXAxis?: string;
  moveZAxis?: string;
  speed?: number;
  unsupported?: IUnsupportedCharacterControllerOptions;
}

export interface IUnsupportedCharacterControllerOptions {
  navmesh?: boolean;
  slopeLimit?: number;
  stepOffset?: number;
}

export const CharacterController = defineComponent("CharacterController", {
  blocking: "boolean",
  grounding: "string",
  interactAction: { kind: "string", required: false },
  moveXAxis: "string",
  moveZAxis: "string",
  speed: "number",
});

export function characterController(options: ICharacterControllerOptions = {}): IEcsDeclaration {
  assertSupportedCharacterOptions(options.unsupported);
  const speed = options.speed ?? 4;
  assertPositiveNumber(speed, "TN_SDK_CHARACTER_SPEED_INVALID", "CharacterController.speed");
  return CharacterController({
    blocking: options.blocking ?? true,
    grounding: options.grounding ?? "raycast",
    ...(options.interactAction === undefined ? {} : { interactAction: assertNonEmpty(options.interactAction, "interactAction") }),
    moveXAxis: assertNonEmpty(options.moveXAxis ?? "MoveX", "moveXAxis"),
    moveZAxis: assertNonEmpty(options.moveZAxis ?? "MoveZ", "moveZAxis"),
    speed,
  });
}

function assertSupportedCharacterOptions(options: IUnsupportedCharacterControllerOptions | undefined): void {
  if (options?.navmesh === true) {
    throw new SdkError("TN_SDK_CHARACTER_NAVMESH_UNSUPPORTED", "Character controllers cannot declare navmesh behavior before V7.");
  }
  if (options?.slopeLimit !== undefined) {
    throw new SdkError("TN_SDK_CHARACTER_SLOPE_UNSUPPORTED", "Character controller slope limits are deferred to V7.");
  }
  if (options?.stepOffset !== undefined) {
    throw new SdkError("TN_SDK_CHARACTER_STEP_UNSUPPORTED", "Character controller step offsets are deferred to V7.");
  }
}

function assertNonEmpty(value: string, field: string): string {
  if (value.trim() === "") {
    throw new SdkError("TN_SDK_CHARACTER_INPUT_REF_EMPTY", `CharacterController.${field} must not be empty.`);
  }
  return value;
}
