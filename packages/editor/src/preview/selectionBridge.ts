export interface IPreviewSelectionTarget {
  runtimeId: string;
  sourceEntityId: string;
}

export interface IViewportSelectableNode {
  parent: IViewportSelectableNode | null;
  userData: {
    rowId?: unknown;
    tnEditorNonSelectable?: unknown;
  };
}

export function resolvePreviewSelection(
  sourceEntityId: string,
  provenance: { entities?: Array<{ runtimeId: string; sourceEntityId: string }> } | undefined,
): IPreviewSelectionTarget | undefined {
  return provenance?.entities?.find((entity) => entity.sourceEntityId === sourceEntityId);
}

export function markViewportSelectionOwner<T extends IViewportSelectableNode>(node: T, rowId: string): T {
  node.userData.rowId = rowId;
  return node;
}

export function markViewportNonSelectable<T extends IViewportSelectableNode>(node: T): T {
  node.userData.tnEditorNonSelectable = true;
  return node;
}

export function resolveViewportSelectionOwnerRowId(node: IViewportSelectableNode | null | undefined): string | undefined {
  let candidate = node;
  while (candidate !== undefined && candidate !== null) {
    if (candidate.userData.tnEditorNonSelectable === true) {
      return undefined;
    }
    if (typeof candidate.userData.rowId === "string") {
      return candidate.userData.rowId;
    }
    candidate = candidate.parent;
  }
  return undefined;
}
