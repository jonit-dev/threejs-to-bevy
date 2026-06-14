import * as THREE from "three";

export type Vec3Tuple = readonly [number, number, number];
export type RgbTuple = readonly [number, number, number];
export type GizmoKind = "axis" | "wireBox" | "wireSphere";

export interface IGizmoLine {
  color: RgbTuple;
  from: Vec3Tuple;
  to: Vec3Tuple;
}

export interface IGizmoGeometry {
  debugOnly: true;
  kind: GizmoKind;
  lines: IGizmoLine[];
}

export function createAxisGizmo(length = 1): IGizmoGeometry {
  const size = Math.max(0, length);
  return {
    debugOnly: true,
    kind: "axis",
    lines: [
      { color: [1, 0, 0], from: [0, 0, 0], to: [size, 0, 0] },
      { color: [0, 1, 0], from: [0, 0, 0], to: [0, size, 0] },
      { color: [0, 0.35, 1], from: [0, 0, 0], to: [0, 0, size] },
    ],
  };
}

export function createWireBoxGizmo(size: Vec3Tuple = [1, 1, 1], color: RgbTuple = [1, 1, 0]): IGizmoGeometry {
  const hx = Math.max(0, size[0]) / 2;
  const hy = Math.max(0, size[1]) / 2;
  const hz = Math.max(0, size[2]) / 2;
  const corners: Vec3Tuple[] = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, hy, -hz],
    [-hx, hy, -hz],
    [-hx, -hy, hz],
    [hx, -hy, hz],
    [hx, hy, hz],
    [-hx, hy, hz],
  ];
  const edges: Array<readonly [number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  return {
    debugOnly: true,
    kind: "wireBox",
    lines: edges.map(([from, to]) => ({ color, from: corners[from]!, to: corners[to]! })),
  };
}

export function createWireSphereGizmo(radius = 0.5, segments = 16, color: RgbTuple = [0, 0.75, 1]): IGizmoGeometry {
  const clampedRadius = Math.max(0, radius);
  const count = Math.max(3, Math.floor(segments));
  const lines: IGizmoLine[] = [];
  for (const plane of ["xy", "xz", "yz"] as const) {
    for (let index = 0; index < count; index += 1) {
      const from = circlePoint(plane, clampedRadius, (index / count) * Math.PI * 2);
      const to = circlePoint(plane, clampedRadius, ((index + 1) / count) * Math.PI * 2);
      lines.push({ color, from, to });
    }
  }
  return { debugOnly: true, kind: "wireSphere", lines };
}

export function gizmoToBufferGeometry(gizmo: IGizmoGeometry): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const line of gizmo.lines) {
    positions.push(...line.from, ...line.to);
    colors.push(...line.color, ...line.color);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function circlePoint(plane: "xy" | "xz" | "yz", radius: number, angle: number): Vec3Tuple {
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  if (plane === "xy") {
    return [x, y, 0];
  }
  if (plane === "xz") {
    return [x, 0, y];
  }
  return [0, x, y];
}
