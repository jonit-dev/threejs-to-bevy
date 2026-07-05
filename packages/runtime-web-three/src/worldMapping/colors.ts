import * as THREE from "three";
import type { IMaterialIr } from "@threenative/ir";

export function colorToThree(color: IMaterialIr["color"]): THREE.Color {
  if (typeof color === "string") {
    return new THREE.Color(color);
  }
  return new THREE.Color(color[0], color[1], color[2]);
}
