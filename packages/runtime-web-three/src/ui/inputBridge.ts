import type { IUiNodeIr } from "@threenative/ir";

export interface IUiActionEvent {
  action: string;
  node: string;
  value?: number | string;
}

export function dispatchUiAction(node: IUiNodeIr, emit: (event: IUiActionEvent) => void, value?: number | string): void {
  if (node.disabled === true) {
    return;
  }
  if ((node.kind === "button" || node.kind === "textInput" || node.kind === "touchControl" || node.kind === "slider" || node.kind === "scrollbar") && node.action !== undefined) {
    emit({ action: node.action, node: node.id, ...(value === undefined ? {} : { value }) });
  }
}
