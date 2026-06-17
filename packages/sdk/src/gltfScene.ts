export interface IGltfNodeTransformOverride {
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number, number];
  scale?: readonly [number, number, number];
}

export interface IGltfNodeHandleDeclaration {
  assetId: string;
  id: string;
  instanceId: string;
  nodeName?: string;
  nodePath?: string;
}

export type GltfNodeHandleOperation =
  | { handle: string; kind: "extrasLookup" }
  | { handle: string; kind: "material"; material: string }
  | { handle: string; kind: "transform"; transform: IGltfNodeTransformOverride }
  | { handle: string; kind: "visibility"; visible: boolean };

export interface IGltfSceneHandlesDeclaration {
  handles: readonly IGltfNodeHandleDeclaration[];
  operations: readonly GltfNodeHandleOperation[];
}

export function gltfNodeHandle(
  id: string,
  options: { assetId: string; instanceId: string; nodeName?: string; nodePath?: string },
): IGltfNodeHandleDeclaration {
  if (id.trim() === "") {
    throw new Error("glTF node handle id must be non-empty.");
  }
  if (options.assetId.trim() === "" || options.instanceId.trim() === "") {
    throw new Error("glTF node handle assetId and instanceId must be non-empty.");
  }
  if ((options.nodeName === undefined || options.nodeName.trim() === "") && (options.nodePath === undefined || options.nodePath.trim() === "")) {
    throw new Error("glTF node handle must declare nodePath or nodeName.");
  }
  return {
    assetId: options.assetId,
    id,
    instanceId: options.instanceId,
    ...(options.nodeName === undefined ? {} : { nodeName: options.nodeName }),
    ...(options.nodePath === undefined ? {} : { nodePath: options.nodePath }),
  };
}

export function gltfSceneHandles(declaration: IGltfSceneHandlesDeclaration): IGltfSceneHandlesDeclaration {
  return {
    handles: [...declaration.handles].sort((left, right) => left.id.localeCompare(right.id)),
    operations: [...declaration.operations].sort((left, right) => operationSortKey(left).localeCompare(operationSortKey(right))),
  };
}

export function setGltfNodeTransform(handle: IGltfNodeHandleDeclaration | string, transform: IGltfNodeTransformOverride): GltfNodeHandleOperation {
  return { handle: handleId(handle), kind: "transform", transform };
}

export function setGltfNodeVisibility(handle: IGltfNodeHandleDeclaration | string, visible: boolean): GltfNodeHandleOperation {
  return { handle: handleId(handle), kind: "visibility", visible };
}

export function setGltfNodeMaterial(handle: IGltfNodeHandleDeclaration | string, material: string): GltfNodeHandleOperation {
  if (material.trim() === "") {
    throw new Error("glTF node material override must reference a non-empty material id.");
  }
  return { handle: handleId(handle), kind: "material", material };
}

export function lookupGltfNodeExtras(handle: IGltfNodeHandleDeclaration | string): GltfNodeHandleOperation {
  return { handle: handleId(handle), kind: "extrasLookup" };
}

function handleId(handle: IGltfNodeHandleDeclaration | string): string {
  return typeof handle === "string" ? handle : handle.id;
}

function operationSortKey(operation: GltfNodeHandleOperation): string {
  return `${operation.handle}:${operation.kind}`;
}
