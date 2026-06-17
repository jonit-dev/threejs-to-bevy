import type { IUiIr, IUiNodeIr, IWorldIr } from "@threenative/ir";

import { resolveUiBinding } from "./bindings.js";
import { dispatchUiAction, type IUiActionEvent } from "./inputBridge.js";

export interface IRenderedUiNode {
  action?: string;
  accessibilityLabel?: string;
  children: IRenderedUiNode[];
  focusable: boolean;
  id: string;
  kind: IUiNodeIr["kind"];
  label?: string;
  layout?: IUiNodeIr["layout"];
  max?: number;
  navigation?: IUiNodeIr["navigation"];
  role?: IUiNodeIr["role"];
  spans?: IUiNodeIr["spans"];
  style?: IUiNodeIr["style"];
  src?: string;
  text?: string;
  value?: number;
}

export interface IRenderedUi {
  actions: IUiActionEvent[];
  focusOrder?: string[];
  root: IRenderedUiNode;
  trigger(nodeId: string): void;
  update(): void;
}

export function renderUi(ui: IUiIr, world: IWorldIr): IRenderedUi {
  const actions: IUiActionEvent[] = [];
  let root = renderNode(ui.root, world);
  return {
    actions,
    ...(ui.focusOrder === undefined ? {} : { focusOrder: ui.focusOrder }),
    get root() {
      return root;
    },
    trigger(nodeId) {
      const node = findNode(ui.root, nodeId);
      if (node !== undefined) {
        dispatchUiAction(node, (event) => actions.push(event));
      }
    },
    update() {
      root = renderNode(ui.root, world);
    },
  };
}

function renderNode(node: IUiNodeIr, world: IWorldIr): IRenderedUiNode {
  const bindingValue = resolveUiBinding(node.binding, world);
  return {
    ...(node.action === undefined ? {} : { action: node.action }),
    ...(node.accessibilityLabel === undefined ? {} : { accessibilityLabel: node.accessibilityLabel }),
    children: node.children?.map((child) => renderNode(child, world)) ?? [],
    focusable: node.focusable ?? (node.kind === "button" || node.kind === "touchControl"),
    id: node.id,
    kind: node.kind,
    ...(node.label === undefined ? {} : { label: node.label }),
    ...(node.layout === undefined ? {} : { layout: node.layout }),
    ...(node.max === undefined ? {} : { max: node.max }),
    ...(node.navigation === undefined ? {} : { navigation: node.navigation }),
    ...(node.role === undefined ? {} : { role: node.role }),
    ...(node.spans === undefined ? {} : { spans: node.spans }),
    ...(node.style === undefined ? {} : { style: node.style }),
    ...(node.src === undefined ? {} : { src: node.src }),
    text: node.text ?? (typeof bindingValue === "string" || typeof bindingValue === "number" ? String(bindingValue) : undefined),
    value: typeof bindingValue === "number" ? bindingValue : node.value,
  };
}

function findNode(node: IUiNodeIr, nodeId: string): IUiNodeIr | undefined {
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNode(child, nodeId);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
