import type { IUiIr, IUiNodeIr } from "@threenative/ir";

export interface IUiVirtualListRangeTrace {
  endIndex: number;
  endItem?: string;
  node: string;
  startIndex: number;
  startItem?: string;
}

export function traceUiVirtualListRange(ui: IUiIr, nodeId: string, scrollOffset: number): IUiVirtualListRangeTrace {
  const node = findNode(ui.root, nodeId);
  if (node?.virtualRange === undefined) {
    return { endIndex: -1, node: nodeId, startIndex: -1 };
  }
  const range = node.virtualRange;
  const buffer = range.buffer ?? 0;
  const startIndex = Math.max(0, Math.floor(scrollOffset / range.itemExtent) - buffer);
  const visibleCount = Math.ceil(range.viewportExtent / range.itemExtent) + buffer * 2;
  const endIndex = Math.min(range.itemCount - 1, startIndex + visibleCount - 1);
  return {
    endIndex,
    endItem: node.children?.[endIndex]?.id,
    node: node.id,
    startIndex,
    startItem: node.children?.[startIndex]?.id,
  };
}

function findNode(node: IUiNodeIr, id: string): IUiNodeIr | undefined {
  if (node.id === id) {
    return node;
  }
  for (const child of node.children ?? []) {
    const match = findNode(child, id);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}
