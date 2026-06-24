import type { IRenderedUi, IRenderedUiNode } from "./renderUi.js";

export interface IUiDebugNodeReport {
  action?: string;
  accessibleName?: string;
  bounds: { height: number; width: number; x: number; y: number };
  clipping?: string;
  disabled: boolean;
  focusIndex?: number;
  fontAsset?: string;
  id: string;
  imageSource?: string;
  kind: string;
  navigation?: IRenderedUiNode["navigation"];
  role?: string;
  widgetState?: {
    max?: number;
    min?: number;
    orientation?: string;
    value?: number;
    valueText?: string;
  };
  zIndex?: number;
}

export interface IUiDebugOverlayReport {
  gizmos: Array<{ id: string; kind: string }>;
  nodes: IUiDebugNodeReport[];
}

export function createUiDebugOverlayReport(rendered: IRenderedUi): IUiDebugOverlayReport {
  const focusIndexes = focusOrder(rendered).reduce((indexes, id, index) => indexes.set(id, index), new Map<string, number>());
  const nodes: IUiDebugNodeReport[] = [];
  visit(rendered.root, (node) => {
    nodes.push(debugNode(node, focusIndexes.get(node.id)));
  });
  return {
    gizmos: nodes.flatMap((node) => gizmosForNode(node)),
    nodes,
  };
}

function debugNode(node: IRenderedUiNode, focusIndex: number | undefined): IUiDebugNodeReport {
  return {
    ...(node.action === undefined ? {} : { action: node.action }),
    ...(accessibleName(node) === undefined ? {} : { accessibleName: accessibleName(node) }),
    bounds: {
      height: node.layout?.height ?? 0,
      width: node.layout?.width ?? 0,
      x: node.layout?.inset?.left ?? 0,
      y: node.layout?.inset?.top ?? 0,
    },
    ...(node.layout?.overflow === undefined ? {} : { clipping: node.layout.overflow }),
    disabled: node.disabled === true,
    ...(focusIndex === undefined ? {} : { focusIndex }),
    ...(node.style?.fontFamily === undefined ? {} : { fontAsset: node.style.fontFamily }),
    id: node.id,
    ...(node.src === undefined ? {} : { imageSource: node.src }),
    kind: node.kind,
    ...(node.navigation === undefined ? {} : { navigation: node.navigation }),
    ...(role(node) === undefined ? {} : { role: role(node) }),
    ...(widgetState(node) === undefined ? {} : { widgetState: widgetState(node) }),
    ...(node.layout?.zIndex === undefined ? {} : { zIndex: node.layout.zIndex }),
  };
}

function gizmosForNode(node: IUiDebugNodeReport): Array<{ id: string; kind: string }> {
  const gizmos = [{ id: node.id, kind: "bounds" }];
  if (node.focusIndex !== undefined) {
    gizmos.push({ id: node.id, kind: "focusRing" });
  }
  if (node.clipping === "scroll") {
    gizmos.push({ id: node.id, kind: "scrollViewport" });
  }
  if (node.kind === "contextMenu") {
    gizmos.push({ id: node.id, kind: "contextMenuAnchor" });
  }
  if (node.kind === "image") {
    gizmos.push({ id: node.id, kind: "nineSliceInsets" });
  }
  return gizmos;
}

function focusOrder(rendered: IRenderedUi): string[] {
  if (rendered.focusOrder !== undefined) {
    return rendered.focusOrder;
  }
  const ids: string[] = [];
  visit(rendered.root, (node) => {
    if (node.focusable && node.disabled !== true) {
      ids.push(node.id);
    }
  });
  return ids;
}

function visit(node: IRenderedUiNode, callback: (node: IRenderedUiNode) => void): void {
  callback(node);
  for (const child of node.children) {
    visit(child, callback);
  }
}

function accessibleName(node: IRenderedUiNode): string | undefined {
  return node.accessibilityLabel ?? node.label ?? node.spans?.map((span) => span.accessibilityText ?? span.text).join("") ?? node.text;
}

function role(node: IRenderedUiNode): string | undefined {
  return node.role ?? defaultRole(node);
}

function defaultRole(node: IRenderedUiNode): string | undefined {
  if (node.kind === "button" || node.kind === "touchControl") {
    return "button";
  }
  if (node.kind === "textInput") {
    return "textbox";
  }
  if (node.kind === "bar") {
    return "progressbar";
  }
  if (node.kind === "image") {
    return "image";
  }
  if (node.kind === "slider") {
    return "slider";
  }
  if (node.kind === "scrollbar") {
    return "scrollbar";
  }
  if (node.kind === "text") {
    return "text";
  }
  return undefined;
}

function widgetState(node: IRenderedUiNode): IUiDebugNodeReport["widgetState"] | undefined {
  if (node.kind !== "slider" && node.kind !== "scrollbar") {
    return undefined;
  }
  return {
    ...(node.max === undefined ? {} : { max: node.max }),
    ...(node.min === undefined ? {} : { min: node.min }),
    ...(node.orientation === undefined ? {} : { orientation: node.orientation }),
    ...(node.value === undefined ? {} : { value: node.value }),
    ...(node.valueText === undefined ? {} : { valueText: node.valueText }),
  };
}
