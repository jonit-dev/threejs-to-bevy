import * as THREE from "three";

export type ThreeNativeColor = string | readonly [number, number, number] | readonly [number, number, number, number] | undefined;

export function colorToThree(color: ThreeNativeColor): THREE.Color {
  if (color === undefined) {
    return new THREE.Color("#ffffff");
  }
  if (typeof color === "string") {
    return new THREE.Color(color);
  }
  return new THREE.Color(color[0], color[1], color[2]);
}
