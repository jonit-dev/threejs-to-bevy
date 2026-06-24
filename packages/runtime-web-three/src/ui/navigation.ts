import type { IUiIr, IUiNodeIr } from "@threenative/ir";

export interface IUiNavigationTraceInput {
  events?: Array<"activate" | "down" | "left" | "next" | "previous" | "right" | "shiftTab" | "tab" | "up">;
}

export interface IUiNavigationTrace {
  events: Array<{ action?: string; focus: string; kind: "activate" | "focus"; input: string }>;
  finalFocus?: string;
  focusOrder: string[];
  initialFocus?: string;
  safeArea?: IUiIr["safeArea"];
}

export function traceUiNavigation(ui: IUiIr, input: IUiNavigationTraceInput = {}): IUiNavigationTrace {
  const nodes = nodesById(ui.root);
  const focusOrder = (ui.focusOrder ?? [...nodes.values()].filter((node) => isFocusable(node)).map((node) => node.id))
    .filter((id) => isFocusable(nodes.get(id)));
  let focus = focusOrder[0];
  const events: IUiNavigationTrace["events"] = [];

  for (const event of input.events ?? []) {
    if (focus === undefined) {
      break;
    }
    if (event === "activate") {
      const action = nodes.get(focus)?.action;
      events.push({ ...(action === undefined ? {} : { action }), focus, input: event, kind: "activate" });
      continue;
    }
    const next = navigationTarget(nodes.get(focus), event) ?? sequentialTarget(focusOrder, focus, event);
    if (next !== undefined && next !== focus) {
      focus = next;
      events.push({ focus, input: event, kind: "focus" });
    }
  }

  return {
    events,
    finalFocus: focus,
    focusOrder,
    initialFocus: focusOrder[0],
    ...(ui.safeArea === undefined ? {} : { safeArea: ui.safeArea }),
  };
}

function nodesById(root: IUiNodeIr): Map<string, IUiNodeIr> {
  const nodes = new Map<string, IUiNodeIr>();
  visit(root, (node) => nodes.set(node.id, node));
  return nodes;
}

function visit(node: IUiNodeIr, callback: (node: IUiNodeIr) => void): void {
  callback(node);
  for (const child of node.children ?? []) {
    visit(child, callback);
  }
}

function isFocusable(node: IUiNodeIr | undefined): boolean {
  return node !== undefined && (node.focusable === true || node.kind === "button" || node.kind === "textInput" || node.kind === "touchControl");
}

function navigationTarget(node: IUiNodeIr | undefined, input: string): string | undefined {
  if (input === "up" || input === "right" || input === "down" || input === "left") {
    return node?.navigation?.[input];
  }
  return undefined;
}

function sequentialTarget(order: readonly string[], current: string, input: string): string | undefined {
  const index = order.indexOf(current);
  if (index < 0) {
    return undefined;
  }
  if (input === "next" || input === "tab" || input === "down" || input === "right") {
    return order[Math.min(order.length - 1, index + 1)];
  }
  if (input === "previous" || input === "shiftTab" || input === "up" || input === "left") {
    return order[Math.max(0, index - 1)];
  }
  return undefined;
}
