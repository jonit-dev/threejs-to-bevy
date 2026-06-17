import type { IGltfNodeHandleIr, IGltfNodeOperationIr, IGltfSceneHandlesIr, IGltfSceneMetadataIr, IGltfSceneNodeIr, ITransformComponent } from "@threenative/ir";

export interface IGltfSceneHandleObservation {
  after?: {
    material?: string;
    transform?: ITransformComponent;
    visible?: boolean;
  };
  before?: {
    material?: string;
    transform?: ITransformComponent;
    visible?: boolean;
  };
  extras?: unknown;
  handle: string;
  nodePath?: string;
  operation: IGltfNodeOperationIr["kind"] | "resolve";
  status: "applied" | "deferred" | "missing";
}

interface INodeState {
  material?: string;
  node: IGltfSceneNodeIr;
  transform: ITransformComponent;
  visible: boolean;
}

export function applyGltfSceneHandleOperations(
  metadata: IGltfSceneMetadataIr,
  handles: IGltfSceneHandlesIr,
  options: { barrierReady?: boolean } = {},
): IGltfSceneHandleObservation[] {
  const barrierReady = options.barrierReady ?? true;
  const states = new Map<string, INodeState>();
  const observations: IGltfSceneHandleObservation[] = [];
  const handlesById = new Map(handles.handles.map((handle) => [handle.id, handle]));

  for (const handle of [...handles.handles].sort((left, right) => left.id.localeCompare(right.id))) {
    const node = resolveNode(metadata, handle);
    if (node === undefined) {
      observations.push({ handle: handle.id, operation: "resolve", status: "missing" });
      continue;
    }
    states.set(handle.id, {
      material: node.materials?.[0],
      node,
      transform: fromNodeTransform(node),
      visible: true,
    });
  }

  for (const operation of [...handles.operations].sort((left, right) => operationSortKey(left).localeCompare(operationSortKey(right)))) {
    const handle = handlesById.get(operation.handle);
    const state = states.get(operation.handle);
    if (handle === undefined || state === undefined) {
      observations.push({ handle: operation.handle, operation: operation.kind, status: "missing" });
      continue;
    }
    if (!barrierReady) {
      observations.push({ handle: operation.handle, nodePath: state.node.path, operation: operation.kind, status: "deferred" });
      continue;
    }
    observations.push(applyOperation(state, operation));
  }

  return observations.sort((left, right) => `${left.handle}:${left.operation}`.localeCompare(`${right.handle}:${right.operation}`));
}

function applyOperation(state: INodeState, operation: IGltfNodeOperationIr): IGltfSceneHandleObservation {
  if (operation.kind === "visibility") {
    const before = state.visible;
    state.visible = operation.visible;
    return {
      after: { visible: state.visible },
      before: { visible: before },
      handle: operation.handle,
      nodePath: state.node.path,
      operation: operation.kind,
      status: "applied",
    };
  }
  if (operation.kind === "transform") {
    const before = state.transform;
    state.transform = { ...state.transform, ...operation.transform };
    return {
      after: { transform: state.transform },
      before: { transform: before },
      handle: operation.handle,
      nodePath: state.node.path,
      operation: operation.kind,
      status: "applied",
    };
  }
  if (operation.kind === "material") {
    const before = state.material;
    state.material = operation.material;
    return {
      after: { material: state.material },
      before: before === undefined ? {} : { material: before },
      handle: operation.handle,
      nodePath: state.node.path,
      operation: operation.kind,
      status: "applied",
    };
  }
  return {
    extras: state.node.extras,
    handle: operation.handle,
    nodePath: state.node.path,
    operation: operation.kind,
    status: "applied",
  };
}

function resolveNode(metadata: IGltfSceneMetadataIr, handle: IGltfNodeHandleIr): IGltfSceneNodeIr | undefined {
  const asset = metadata.assets.find((item) => item.assetId === handle.assetId);
  if (asset === undefined) {
    return undefined;
  }
  if (handle.nodePath !== undefined) {
    return asset.nodes.find((node) => node.path === handle.nodePath);
  }
  return asset.nodes.filter((node) => node.name === handle.nodeName).length === 1
    ? asset.nodes.find((node) => node.name === handle.nodeName)
    : undefined;
}

function fromNodeTransform(node: IGltfSceneNodeIr): ITransformComponent {
  return {
    ...(node.transform?.translation === undefined ? {} : { position: node.transform.translation }),
    ...(node.transform?.rotation === undefined ? {} : { rotation: node.transform.rotation }),
    ...(node.transform?.scale === undefined ? {} : { scale: node.transform.scale }),
  };
}

function operationSortKey(operation: IGltfNodeOperationIr): string {
  return `${operation.handle}:${operation.kind}`;
}
