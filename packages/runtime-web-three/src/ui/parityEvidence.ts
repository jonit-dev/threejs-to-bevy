import type { IUiIr, IWorldIr, UiTargetProfileClass } from "@threenative/ir";

import { traceUiNavigation } from "./navigation.js";
import { renderUi } from "./renderUi.js";
import { traceWebUiTextEdit } from "./textInputTrace.js";

export interface IUiParityBehaviorReport {
  actions: Array<{ action: string; node: string; value?: boolean | number | string }>;
  adapter: "web";
  diagnostics: Array<{ code: string; message: string }>;
  focus: ReturnType<typeof traceUiNavigation>;
  ok: boolean;
  regions: Array<{ root: { height: number | null; id: string; width: number | null }; target: UiTargetProfileClass; widgets: Array<{ height: number | null; id: string; kind: string; width: number | null }> }>;
  responsive: Array<{ rootHeight?: number; rootWidth?: number; target: UiTargetProfileClass }>;
  schema: "threenative.ui-parity-behavior";
  state: {
    disabledActivation: string;
    disabledUpdate: boolean;
    textValue?: boolean | number | string;
    valueUpdate?: boolean | number | string;
  };
  textEdit: ReturnType<typeof traceWebUiTextEdit>;
  version: "0.1.0";
}

export function reportWebUiParityBehavior(ui: IUiIr, world: IWorldIr): IUiParityBehaviorReport {
  const rendered = renderUi(ui, world, { target: "desktop" });
  const button = findNode(ui.root, (node) => node.kind === "button" && node.disabled !== true && node.action !== undefined);
  const slider = findNode(ui.root, (node) => node.kind === "slider" && node.action !== undefined);
  const textInput = findNode(ui.root, (node) => node.kind === "textInput" && node.action !== undefined);
  const touchControl = findNode(ui.root, (node) => node.kind === "touchControl" && node.action !== undefined);
  const diagnostics: IUiParityBehaviorReport["diagnostics"] = [];
  if (button === undefined || slider === undefined || textInput === undefined || touchControl === undefined) diagnostics.push({ code: "TN_WEB_UI_PARITY_WIDGET_MISSING", message: "UI parity fixture must contain an actionable button, slider, text input, and touch control." });

  if (button !== undefined) rendered.activate(button.id);
  if (slider !== undefined) rendered.trigger(slider.id, 0.75);
  if (textInput !== undefined) rendered.trigger(textInput.id, "Nora");
  if (touchControl !== undefined) rendered.activate(touchControl.id);
  const actions = rendered.drainActions();
  let disabledActivation = "not-exercised";
  let disabledUpdate = false;
  if (button !== undefined) {
    disabledUpdate = rendered.setDisabled(button.id, true).accepted;
    disabledActivation = rendered.activate(button.id).status;
    rendered.setDisabled(button.id, false);
  }
  if (slider !== undefined) rendered.setValue(slider.id, 0.6);
  if (textInput !== undefined) rendered.setValue(textInput.id, "Nora");

  const responsive = (["desktop", "mobile"] as const).map((target) => {
    rendered.setTarget(target);
    return { rootHeight: rendered.root.layout?.height, rootWidth: rendered.root.layout?.width, target };
  });
  const regions = (["desktop", "mobile"] as const).map((target) => {
    rendered.setTarget(target);
    const widgets: IUiParityBehaviorReport["regions"][number]["widgets"] = [];
    for (const child of rendered.root.children) visitRendered(child, (node) => widgets.push({
        height: node.layout?.height ?? null,
        id: node.id,
        kind: node.kind,
        width: node.layout?.width ?? null,
      }));
    widgets.sort((left, right) => left.id.localeCompare(right.id));
    return {
      root: { height: rendered.root.layout?.height ?? null, id: rendered.root.id, width: rendered.root.layout?.width ?? null },
      target,
      widgets,
    };
  });
  const textInitial = textInput?.text ?? "Nova";
  const textEdit = traceWebUiTextEdit(textInitial, [{ kind: "move", offset: -1 }, { kind: "insert", text: "r" }, { kind: "backspace" }]);
  const focusEvents = ui.focusOrder === undefined ? ["tab", "activate"] as const : ["tab", "right", "activate"] as const;
  const focus = traceUiNavigation(ui, { events: [...focusEvents] });
  const valueUpdate = slider === undefined ? undefined : rendered.read(slider.id).value;
  const textValue = textInput === undefined ? undefined : rendered.read(textInput.id).value;
  const ok = diagnostics.length === 0
    && disabledActivation === "disabled"
    && disabledUpdate
    && actions.some((event) => event.node === button?.id)
    && actions.some((event) => event.node === slider?.id && event.value === 0.75)
    && actions.some((event) => event.node === textInput?.id && event.value === "Nora")
    && actions.some((event) => event.node === touchControl?.id)
    && valueUpdate === 0.6
    && textValue === "Nora";
  return {
    actions,
    adapter: "web",
    diagnostics,
    focus,
    ok,
    regions,
    responsive,
    schema: "threenative.ui-parity-behavior",
    state: { disabledActivation, disabledUpdate, ...(textValue === undefined ? {} : { textValue }), ...(valueUpdate === undefined ? {} : { valueUpdate }) },
    textEdit,
    version: "0.1.0",
  };
}

function visitRendered(node: ReturnType<typeof renderUi>["root"], callback: (node: ReturnType<typeof renderUi>["root"]) => void): void {
  callback(node);
  for (const child of node.children) visitRendered(child, callback);
}

function findNode(node: IUiIr["root"], predicate: (candidate: IUiIr["root"]) => boolean): IUiIr["root"] | undefined {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}
