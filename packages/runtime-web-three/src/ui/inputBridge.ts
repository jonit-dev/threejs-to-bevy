import type { IUiNodeIr } from "@threenative/ir";

export interface IUiActionEvent {
  action: string;
  node: string;
}

export function dispatchUiAction(node: IUiNodeIr, emit: (event: IUiActionEvent) => void): void {
  if ((node.kind === "button" || node.kind === "touchControl") && node.action !== undefined) {
    emit({ action: node.action, node: node.id });
  }
}
