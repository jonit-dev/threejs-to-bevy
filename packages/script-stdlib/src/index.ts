export {
  AngleEx,
  ArrayEx,
  Bounds2,
  Bounds3,
  BasisEx,
  CameraMath,
  CheckpointRaceEx,
  ColorEx,
  ControllerEx,
  Ease,
  InputEx,
  MotionEx,
  Mathf,
  MaterialEx,
  NumberEx,
  Quat,
  RandomEx,
  SpawnEx,
  TextEx,
  TimerEx,
  TransformMath,
  Vector2,
  Vector3,
  Vec2,
  Vec3,
} from "./helpers.js";
export type { IMaterialPatch } from "./feedback.js";
export { CameraRig, CharacterRig, KinematicMoverEx, RespawnEx, TriggerEx } from "./rigs.js";
export { defineBehavior } from "./behavior.js";
export type { BehaviorFunction, BehaviorSchedule, IBehaviorCommandMetadata, IBehaviorFunction, IBehaviorMetadata, IBehaviorQueryMetadata } from "./behavior.js";
export type {
  ICameraRigOptions,
  ICameraRigResult,
  ICharacterRigClipOptions,
  ICharacterRigOptions,
  ICharacterRigResult,
  IKinematicMoverExOptions,
  IKinematicMoverExResult,
  IOrbitCameraRigOptions,
  IOrbitCameraRigResult,
  IRespawnExOptions,
  IRespawnExResult,
  ITriggerExOptions,
} from "./rigs.js";

export { SCRIPT_STDLIB_BUNDLE_SOURCE } from "./bundle-source.js";
export type { ColorTuple, ColorValue, QuatTuple, QuatValue, Vec2Tuple, Vec2Value, Vec3Tuple, Vec3Value } from "./helpers.js";
export type { ScriptContext, ScriptEntity, ScriptQuatTuple, ScriptTransformFacade, ScriptVec3Tuple } from "./script-context.js";
