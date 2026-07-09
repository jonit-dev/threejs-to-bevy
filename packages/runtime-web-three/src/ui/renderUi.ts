import type { IUiIr, IUiNodeIr, IWorldIr } from "@threenative/ir";

import { resolveUiBinding } from "./bindings.js";
import { dispatchUiAction, type IUiActionEvent } from "./inputBridge.js";
import type { IUiActivateResult, IUiDisabledResult, IUiFocusResult, IUiReadResult, IUiValueResult } from "../systems/contextTypes.js";

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
  activate(nodeId: string): IUiActivateResult;
  drainActions(): IUiActionEvent[];
  focusOrder?: string[];
  focus(nodeId: string): IUiFocusResult;
  read(nodeId: string): IUiReadResult;
  recentActions(): IUiActionEvent[];
  root: IRenderedUiNode;
  safeArea?: IUiIr["safeArea"];
  setDisabled(nodeId: string, disabled: boolean): IUiDisabledResult;
  setValue(nodeId: string, value: boolean | number | string): IUiValueResult;
  trigger(nodeId: string, value?: number | string): void;
  update(): void;
}

export function renderUi(ui: IUiIr, world: IWorldIr): IRenderedUi {
  const actions: IUiActionEvent[] = [];
  let recentActions: IUiActionEvent[] = [];
  const disabled = new Map<string, boolean>();
  const values = new Map<string, boolean | number | string>();
  const nodes = new Map<string, IUiNodeIr>();
  collectNodes(ui.root, nodes);
  const focusable = new Set((ui.focusOrder ?? [...nodes.values()].filter(isFocusable).map((node) => node.id)).filter((id) => {
    const node = nodes.get(id);
    return node !== undefined && isFocusable(node);
  }));
  let currentFocus = [...focusable].sort()[0] ?? null;
  let root = renderNode(ui.root, world);
  root = applyState(root, disabled, values);
  return {
    actions,
    activate(nodeId) {
      const node = nodes.get(nodeId);
      if (node === undefined) {
        return { accepted: false, node: nodeId, status: "missing" };
      }
      if (disabled.get(nodeId) ?? node.disabled === true) {
        return { accepted: false, node: nodeId, status: "disabled" };
      }
      if (typeof node.action !== "string" || node.action.trim() === "") {
        return { accepted: false, node: nodeId, status: "no-action" };
      }
      dispatchUiAction({ ...node, disabled: false }, (event) => actions.push(event));
      return { accepted: true, action: node.action, node: nodeId, status: "activated" };
    },
    drainActions() {
      recentActions = actions.splice(0, actions.length);
      return recentActions.map((action) => ({ ...action }));
    },
    ...(ui.focusOrder === undefined ? {} : { focusOrder: ui.focusOrder }),
    ...(ui.safeArea === undefined ? {} : { safeArea: ui.safeArea }),
    focus(nodeId) {
      const previous = currentFocus;
      const node = nodes.get(nodeId);
      if (node === undefined) {
        return { accepted: false, current: currentFocus, previous, status: "missing" };
      }
      if (!focusable.has(nodeId) || (disabled.get(nodeId) ?? node.disabled) === true) {
        return { accepted: false, current: currentFocus, previous, status: "not-focusable" };
      }
      currentFocus = nodeId;
      return { accepted: true, current: currentFocus, previous, status: "focused" };
    },
    read(nodeId) {
      const node = nodes.get(nodeId);
      if (node === undefined) {
        return { disabled: false, focusable: false, focused: false, node: nodeId, status: "missing" };
      }
      const rendered = findRenderedNode(root, nodeId);
      const value = values.get(nodeId) ?? rendered?.value ?? rendered?.text ?? node.value ?? node.text ?? node.label;
      return {
        ...(node.action === undefined ? {} : { action: node.action }),
        disabled: disabled.get(nodeId) ?? node.disabled === true,
        focusable: focusable.has(nodeId),
        focused: currentFocus === nodeId,
        kind: node.kind,
        node: nodeId,
        status: "found",
        ...(value === undefined ? {} : { value }),
      };
    },
    recentActions() {
      return recentActions.map((action) => ({ ...action }));
    },
    get root() {
      return root;
    },
    setDisabled(nodeId, nextDisabled) {
      if (!nodes.has(nodeId)) {
        return { accepted: false, disabled: nextDisabled, node: nodeId, status: "missing" };
      }
      disabled.set(nodeId, nextDisabled);
      if (nextDisabled && currentFocus === nodeId) {
        currentFocus = null;
      }
      root = applyState(root, disabled, values);
      return { accepted: true, disabled: nextDisabled, node: nodeId, status: "updated" };
    },
    setValue(nodeId, value) {
      if (!nodes.has(nodeId)) {
        return { accepted: false, node: nodeId, status: "missing", value };
      }
      values.set(nodeId, value);
      root = applyState(root, disabled, values);
      return { accepted: true, node: nodeId, status: "updated", value };
    },
    trigger(nodeId, value) {
      const node = findNode(ui.root, nodeId);
      if (node !== undefined && (disabled.get(nodeId) ?? node.disabled) !== true) {
        dispatchUiAction({ ...node, disabled: false }, (event) => actions.push(event), value);
      }
    },
    update() {
      root = renderNode(ui.root, world);
      root = applyState(root, disabled, values);
    },
  };
}

function applyState(node: IRenderedUiNode, disabled: ReadonlyMap<string, boolean>, values: ReadonlyMap<string, boolean | number | string>): IRenderedUiNode {
  const value = values.get(node.id);
  return {
    ...node,
    children: node.children.map((child) => applyState(child, disabled, values)),
    ...(disabled.has(node.id) ? { disabled: disabled.get(node.id) } : {}),
    ...(typeof value === "number" ? { value } : {}),
    ...(typeof value === "string" ? (node.kind === "textInput" || node.kind === "text" || node.kind === "button" || node.kind === "touchControl" ? { text: value } : { valueText: value }) : {}),
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
    text: typeof bindingValue === "string" || typeof bindingValue === "number" ? String(bindingValue) : node.text,
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

function findRenderedNode(node: IRenderedUiNode, nodeId: string): IRenderedUiNode | undefined {
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children) {
    const found = findRenderedNode(child, nodeId);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function collectNodes(node: IUiNodeIr, nodes: Map<string, IUiNodeIr>): void {
  nodes.set(node.id, node);
  for (const child of node.children ?? []) {
    collectNodes(child, nodes);
  }
}

function isFocusable(node: IUiNodeIr): boolean {
  return node.focusable === true || node.kind === "button" || node.kind === "textInput" || node.kind === "touchControl" || node.kind === "slider" || node.kind === "scrollbar";
}
