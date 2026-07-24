import { NumberEx } from "./numeric.js";
import { Vec3 } from "./vectors.js";
import type { Vec3Value } from "./types.js";

export interface IBoresightProjection {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
}

export const BoresightEx = Object.freeze({
  project(options: {
    readonly aim: Vec3Value;
    readonly aspect: number;
    readonly cameraPitch?: number;
    readonly verticalFov: number;
  }): IBoresightProjection {
    const aim = Vec3.normalize(options.aim);
    const pitch = NumberEx.finite(options.cameraPitch, 0);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const cameraX = aim[0];
    const cameraY = aim[1] * cosPitch + aim[2] * sinPitch;
    const cameraZ = -aim[1] * sinPitch + aim[2] * cosPitch;
    const depth = -cameraZ;
    if (depth <= Number.EPSILON) return { visible: false, x: 0.5, y: 0.5 };
    const halfHeight = Math.tan(Math.max(Number.EPSILON, NumberEx.finite(options.verticalFov, Math.PI / 3)) / 2);
    const halfWidth = halfHeight * Math.max(Number.EPSILON, NumberEx.finite(options.aspect, 1));
    const x = 0.5 + (cameraX / depth / halfWidth) * 0.5;
    const y = 0.5 - (cameraY / depth / halfHeight) * 0.5;
    return {
      visible: x >= 0 && x <= 1 && y >= 0 && y <= 1,
      x: NumberEx.clamp(x, 0, 1),
      y: NumberEx.clamp(y, 0, 1),
    };
  },
});
