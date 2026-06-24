import type { IUiIr, IUiNodeIr, IWorldIr } from "@threenative/ir";

import { resolveUiBinding } from "./bindings.js";
import { dispatchUiAction, type IUiActionEvent } from "./inputBridge.js";

export interface IRenderedUiNode {
  action?: string;
  accessibilityLabel?: string;
  anchorId?: string;
  children: IRenderedUiNode[];
  disabled?: boolean;
  focusable: boolean;
  id: string;
  image?: IUiNodeIr["image"];
  kind: IUiNodeIr["kind"];
  label?: string;
  layout?: IUiNodeIr["layout"];
  max?: number;
  min?: number;
  minimap?: IUiNodeIr["minimap"];
  navigation?: IUiNodeIr["navigation"];
  orientation?: IUiNodeIr["orientation"];
  role?: IUiNodeIr["role"];
  spans?: IUiNodeIr["spans"];
  step?: number;
  style?: IUiNodeIr["style"];
  src?: string;
  text?: string;
  value?: number;
  valueText?: string;
}

export interface IRenderedUi {
  actions: IUiActionEvent[];
  focusOrder?: string[];
  root: IRenderedUiNode;
  trigger(nodeId: string, value?: number | string): void;
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
    trigger(nodeId, value) {
      const node = findNode(ui.root, nodeId);
      if (node !== undefined) {
        dispatchUiAction(node, (event) => actions.push(event), value);
      }
    },
    update() {
      root = renderNode(ui.root, world);
    },
  };
}

function renderNode(node: IUiNodeIr, world: IWorldIr): IRenderedUiNode {
  const bindingValue = resolveUiBinding(node.binding, world);
  const dynamicMinimap = node.kind === "minimap" ? readDynamicMinimap(bindingValue) : undefined;
  const minimap = node.minimap === undefined && dynamicMinimap === undefined
    ? undefined
    : ({ ...(node.minimap ?? dynamicMinimap), ...(dynamicMinimap ?? {}) } as IUiNodeIr["minimap"]);
  return {
    ...(node.action === undefined ? {} : { action: node.action }),
    ...(node.accessibilityLabel === undefined ? {} : { accessibilityLabel: node.accessibilityLabel }),
    ...(node.anchorId === undefined ? {} : { anchorId: node.anchorId }),
    children: node.children?.map((child) => renderNode(child, world)) ?? [],
    ...(node.disabled === undefined ? {} : { disabled: node.disabled }),
    focusable: node.focusable ?? (node.kind === "button" || node.kind === "textInput" || node.kind === "touchControl" || node.kind === "slider" || node.kind === "scrollbar"),
    id: node.id,
    ...(node.image === undefined ? {} : { image: node.image }),
    kind: node.kind,
    ...(node.label === undefined ? {} : { label: node.label }),
    ...(node.layout === undefined ? {} : { layout: node.layout }),
    ...(node.max === undefined ? {} : { max: node.max }),
    ...(node.min === undefined ? {} : { min: node.min }),
    ...(minimap === undefined ? {} : { minimap }),
    ...(node.navigation === undefined ? {} : { navigation: node.navigation }),
    ...(node.orientation === undefined ? {} : { orientation: node.orientation }),
    ...(node.role === undefined ? {} : { role: node.role }),
    ...(node.spans === undefined ? {} : { spans: node.spans }),
    ...(node.step === undefined ? {} : { step: node.step }),
    ...(node.style === undefined ? {} : { style: node.style }),
    ...(node.src === undefined ? {} : { src: node.src }),
    text: node.text ?? (typeof bindingValue === "string" || typeof bindingValue === "number" ? String(bindingValue) : undefined),
    value: typeof bindingValue === "number" ? bindingValue : node.value,
    ...(node.valueText === undefined ? {} : { valueText: node.valueText }),
  };
}

function readDynamicMinimap(value: unknown): IUiNodeIr["minimap"] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = typeof value === "string" ? parseJsonRecord(value) : value;
  if (parsed === undefined || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  return parsed as IUiNodeIr["minimap"];
}

function parseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
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
