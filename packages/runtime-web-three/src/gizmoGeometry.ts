import * as THREE from "three";

export type Vec3Tuple = readonly [number, number, number];
export type RgbTuple = readonly [number, number, number];
export type GizmoKind = "axis" | "wireBox" | "wireSphere";
export type EditorGizmoKind = "bounds" | "camera" | "light" | "transform" | "uiNode";

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

export interface IEditorGizmoOverlay {
  debugOnly: true;
  gizmos: Array<IGizmoGeometry & { id: string; role: EditorGizmoKind }>;
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

export function buildEditorGizmoOverlay(options: {
  bounds?: readonly { id: string; size?: Vec3Tuple }[];
  cameras?: readonly { id: string }[];
  lights?: readonly { id: string; radius?: number }[];
  transforms?: readonly { id: string; length?: number }[];
  uiNodes?: readonly { id: string; size?: Vec3Tuple }[];
}): IEditorGizmoOverlay {
  const gizmos: IEditorGizmoOverlay["gizmos"] = [];
  for (const item of options.transforms ?? []) {
    gizmos.push({ ...createAxisGizmo(item.length ?? 1), id: item.id, role: "transform" });
  }
  for (const item of options.bounds ?? []) {
    gizmos.push({ ...createWireBoxGizmo(item.size ?? [1, 1, 1], [1, 0.85, 0]), id: item.id, role: "bounds" });
  }
  for (const item of options.cameras ?? []) {
    gizmos.push({ ...createWireBoxGizmo([1.2, 0.7, 1], [0.25, 0.65, 1]), id: item.id, role: "camera" });
  }
  for (const item of options.lights ?? []) {
    gizmos.push({ ...createWireSphereGizmo(item.radius ?? 0.5, 12, [1, 0.95, 0.35]), id: item.id, role: "light" });
  }
  for (const item of options.uiNodes ?? []) {
    gizmos.push({ ...createWireBoxGizmo(item.size ?? [1, 1, 0], [0.9, 0.35, 1]), id: item.id, role: "uiNode" });
  }
  return { debugOnly: true, gizmos: gizmos.sort((left, right) => left.id.localeCompare(right.id)) };
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
