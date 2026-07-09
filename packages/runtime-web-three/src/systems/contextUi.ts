import type { IUiIr, IUiNodeIr } from "@threenative/ir";
import type { IUiActionEvent } from "../ui/inputBridge.js";
import type { IUiActivateResult, IUiDisabledResult, IUiFocusResult, IUiReadResult, IUiValueResult } from "./contextTypes.js";

export function createScriptUiState(ui: IUiIr | undefined): {
  activate(nodeId: string): IUiActivateResult;
  actions(): IUiActionEvent[];
  focus(nodeId: string): IUiFocusResult;
  read(nodeId: string): IUiReadResult;
  recentActions(): IUiActionEvent[];
  setDisabled(nodeId: string, disabled: boolean): IUiDisabledResult;
  setValue(nodeId: string, value: boolean | number | string): IUiValueResult;
} {
  const nodes = new Map<string, IUiNodeIr>();
  if (ui !== undefined) {
    collectUiNodes(ui.root, nodes);
  }
  const focusable = new Set((ui?.focusOrder ?? [...nodes.values()].filter(isUiFocusable).map((node) => node.id)).filter((id) => nodes.has(id) && isUiFocusable(nodes.get(id)!)));
  const disabled = new Map<string, boolean>();
  const values = new Map<string, boolean | number | string>();
  let currentFocus = [...focusable].sort()[0] ?? null;

  return {
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
      return { accepted: true, action: node.action, node: nodeId, status: "activated" };
    },
    actions() {
      return [];
    },
    recentActions() {
      return [];
    },
    focus(nodeId) {
      const previous = currentFocus;
      if (!nodes.has(nodeId)) {
        return { accepted: false, current: currentFocus, previous, status: "missing" };
      }
      if (!focusable.has(nodeId) || (disabled.get(nodeId) ?? nodes.get(nodeId)?.disabled) === true) {
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
      const value = values.get(nodeId) ?? node.value ?? node.text ?? node.label;
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
    setDisabled(nodeId, nextDisabled) {
      if (!nodes.has(nodeId)) {
        return { accepted: false, disabled: nextDisabled, node: nodeId, status: "missing" };
      }
      disabled.set(nodeId, nextDisabled);
      if (nextDisabled && currentFocus === nodeId) {
        currentFocus = null;
      }
      return { accepted: true, disabled: nextDisabled, node: nodeId, status: "updated" };
    },
    setValue(nodeId, value) {
      if (!nodes.has(nodeId)) {
        return { accepted: false, node: nodeId, status: "missing", value };
      }
      values.set(nodeId, value);
      return { accepted: true, node: nodeId, status: "updated", value };
    },
  };
}

function collectUiNodes(node: IUiNodeIr, nodes: Map<string, IUiNodeIr>): void {
  nodes.set(node.id, node);
  for (const child of node.children ?? []) {
    collectUiNodes(child, nodes);
  }
}

function isUiFocusable(node: IUiNodeIr): boolean {
  return node.focusable === true || node.kind === "button" || node.kind === "touchControl";
}
