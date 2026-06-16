import { CustomMeshGeometry, type ICustomMeshAttribute, type MeshAttributeItemSize, type MeshAttributeName } from "@threenative/sdk";

export interface IBufferGeometrySnapshotAttribute {
  array: ArrayLike<number>;
  itemSize: MeshAttributeItemSize;
  normalized?: boolean;
}

export interface IBufferGeometrySnapshot {
  attributes: Record<string, IBufferGeometrySnapshotAttribute>;
  index?: ArrayLike<number>;
}

const attributeNames: Record<string, MeshAttributeName> = {
  color: "color",
  normal: "normal",
  position: "position",
  uv: "uv",
  uv1: "uv1",
};

export function normalizeBufferGeometrySnapshot(
  id: string,
  snapshot: IBufferGeometrySnapshot,
): CustomMeshGeometry {
  const attributes = Object.entries(snapshot.attributes)
    .map(([name, attribute]) => normalizeAttribute(name, attribute))
    .sort((left, right) => left.name.localeCompare(right.name));
  const position = attributes.find((attribute) => attribute.name === "position");
  const bounds = position === undefined ? undefined : computeBounds(position.values);
  return new CustomMeshGeometry({
    attributes,
    bounds,
    generation: { id, source: "BufferGeometrySnapshot" },
    indices: snapshot.index === undefined ? undefined : Array.from(snapshot.index),
    storage: "binary",
    topology: "triangle-list",
    usage: "static",
  });
}

function normalizeAttribute(name: string, attribute: IBufferGeometrySnapshotAttribute): ICustomMeshAttribute {
  if (attribute.normalized === true) {
    throw new Error(`BufferGeometry snapshot attribute '${name}' must be flattened before compile; normalized/interleaved data is not portable.`);
  }
  const mappedName = attributeNames[name] ?? customName(name);
  return {
    itemSize: attribute.itemSize,
    name: mappedName,
    values: Array.from(attribute.array),
  };
}

function customName(name: string): `custom:${string}` {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`BufferGeometry snapshot attribute '${name}' is not a supported portable attribute name.`);
  }
  return `custom:${name}`;
}

function computeBounds(positions: readonly number[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    min[0] = Math.min(min[0], positions[index] ?? 0);
    min[1] = Math.min(min[1], positions[index + 1] ?? 0);
    min[2] = Math.min(min[2], positions[index + 2] ?? 0);
    max[0] = Math.max(max[0], positions[index] ?? 0);
    max[1] = Math.max(max[1], positions[index + 1] ?? 0);
    max[2] = Math.max(max[2], positions[index + 2] ?? 0);
  }
  return { min, max };
}
