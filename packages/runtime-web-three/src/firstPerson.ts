import * as THREE from "three";
import type { IFirstPersonControllerIr } from "@threenative/ir";
import type { IWebInputState } from "./input.js";

export interface IFirstPersonControllerState {
  pitch: number;
  velocity: THREE.Vector3;
  yaw: number;
}

export function createFirstPersonState(): IFirstPersonControllerState {
  return { pitch: 0, velocity: new THREE.Vector3(), yaw: 0 };
}

export function updateFirstPersonController(options: {
  camera: THREE.Object3D;
  controller: IFirstPersonControllerIr;
  deltaSeconds: number;
  input: Pick<IWebInputState, "action" | "axis">;
  state: IFirstPersonControllerState;
}): void {
  const { camera, controller, deltaSeconds, input, state } = options;
  state.yaw -= input.axis(controller.input.lookX) * controller.sensitivity;
  state.pitch -= input.axis(controller.input.lookY) * controller.sensitivity;
  state.pitch = clamp(state.pitch, degreesToRadians(controller.pitch.min), degreesToRadians(controller.pitch.max));

  const moveX = (input.action(controller.input.right) ? 1 : 0) - (input.action(controller.input.left) ? 1 : 0);
  const moveZ = (input.action(controller.input.backward) ? 1 : 0) - (input.action(controller.input.forward) ? 1 : 0);
  const desired = new THREE.Vector3(moveX, 0, moveZ);
  if (desired.lengthSq() > 0) {
    desired.normalize().multiplyScalar(controller.maxSpeed);
    desired.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
  }
  const blend = Math.min(1, controller.acceleration * deltaSeconds);
  state.velocity.lerp(desired, blend);
  camera.position.addScaledVector(state.velocity, deltaSeconds);
  camera.position.y = controller.height;
  camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}
