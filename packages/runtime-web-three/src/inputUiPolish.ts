import type { IInputIr } from "@threenative/ir/input";
import type { IUiIr, IUiNodeIr, IWorldIr } from "@threenative/ir";

import { createInputState, createTouchGestureRecognizer, reportGamepadCapabilities, type IGamepadCapabilityReport, type ITouchGestureEvent } from "./input.js";
import { traceUiNavigation } from "./ui/navigation.js";

export interface IInputUiPolishReport {
  diagnostics: IInputUiPolishDiagnostic[];
  input: {
    gamepad: IInputUiPolishGamepadReport;
    gestures: ITouchGestureEvent[];
    touchStream: IInputUiPolishTouchEvent[];
  };
  schema: "threenative.input-ui-polish";
  ui: {
    disabledUpdate: IInputUiPolishDisabledUpdate[];
    focusNarration: IInputUiPolishNarration[];
    navigation: ReturnType<typeof traceUiNavigation>;
    richText: IInputUiPolishRichText[];
    scroll: IInputUiPolishScrollObservation[];
    virtualKeyboard: IInputUiPolishVirtualKeyboard;
  };
  version: "0.1.0";
}

export interface IInputUiPolishDiagnostic {
  code: string;
  message: string;
  path: string;
  severity: "error" | "warning";
  suggestion?: string;
}

export interface IInputUiPolishTouchEvent {
  actionStates: Record<string, boolean>;
  axisStates: Record<string, number>;
  control: string;
  phase: "end" | "move" | "start";
  value: number;
}

export interface IInputUiPolishGamepadReport extends IGamepadCapabilityReport {
  repairHints: Array<{ code: string; hint: string }>;
}

export interface IInputUiPolishNarration {
  node: string;
  text: string;
}

export interface IInputUiPolishScrollObservation {
  axis: "x" | "y";
  delta: number;
  node: string;
  parent?: string;
}

export interface IInputUiPolishDisabledUpdate {
  after: boolean;
  before: boolean;
  node: string;
  status: "reconciled";
}

export interface IInputUiPolishRichText {
  italicSpans: number;
  node: string;
  status: "metadata-preserved" | "native-diagnostic";
}

export interface IInputUiPolishVirtualKeyboard {
  node?: string;
  status: "diagnostic-only" | "not-requested";
}

export function traceInputUiPolish(input: IInputIr | undefined, ui: IUiIr, world: IWorldIr): IInputUiPolishReport {
  const polish = readPolishResource(world);
  return {
    diagnostics: diagnostics(ui, polish),
    input: {
      gamepad: gamepadReport(input),
      gestures: gestureTrace(),
      touchStream: touchTrace(input, polish),
    },
    schema: "threenative.input-ui-polish",
    ui: {
      disabledUpdate: disabledUpdates(ui, polish),
      focusNarration: focusNarration(ui),
      navigation: traceUiNavigation(ui, { events: polish.navigationEvents }),
      richText: richText(ui),
      scroll: scrollTrace(ui),
      virtualKeyboard: virtualKeyboard(polish),
    },
    version: "0.1.0",
  };
}

function touchTrace(input: IInputIr | undefined, polish: PolishResource): IInputUiPolishTouchEvent[] {
  const state = createInputState(input);
  const actions = input?.actions.map((action) => action.id).sort() ?? [];
  const axes = input?.axes.map((axis) => axis.id).sort() ?? [];
  return polish.touchEvents.map((event) => {
    if (event.axis === undefined) {
      state.handleTouchControl(event.control, event.phase !== "end");
    } else {
      state.handleTouchAxis(event.control, event.axis, event.value);
    }
    return {
      actionStates: Object.fromEntries(actions.map((action) => [action, state.action(action)])),
      axisStates: Object.fromEntries(axes.map((axis) => [axis, state.axis(axis)])),
      control: event.control,
      phase: event.phase,
      value: event.value,
    };
  });
}

function gestureTrace(): ITouchGestureEvent[] {
  const recognizer = createTouchGestureRecognizer();
  return [
    ...recognizer.update({ timeMs: 0, touches: [{ id: 1, x: 12, y: 12 }] }),
    ...recognizer.update({ timeMs: 80, touches: [] }),
    ...recognizer.update({ timeMs: 100, touches: [{ id: 2, x: 10, y: 10 }] }),
    ...recognizer.update({ timeMs: 220, touches: [{ id: 2, x: 82, y: 10 }] }),
    ...recognizer.update({ timeMs: 260, touches: [] }),
    ...recognizer.update({ timeMs: 300, touches: [{ id: 3, x: 40, y: 40 }, { id: 4, x: 80, y: 40 }] }),
    ...recognizer.update({ timeMs: 420, touches: [{ id: 3, x: 25, y: 40 }, { id: 4, x: 95, y: 40 }] }),
    ...recognizer.update({ timeMs: 480, touches: [] }),
  ];
}

function gamepadReport(input: IInputIr | undefined): IInputUiPolishGamepadReport {
  const gamepad = {
    axes: [0, 0],
    buttons: [{ pressed: false, touched: false, value: 0 }, { pressed: true, touched: true, value: 1 }],
    connected: true,
    id: "ThreeNative deterministic gamepad",
    index: 0,
    mapping: "standard",
    timestamp: 1,
    vibrationActuator: undefined,
  } as unknown as Gamepad;
  const report = reportGamepadCapabilities(input, { getGamepads: () => [gamepad] });
  return {
    ...report,
    repairHints: report.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      hint: diagnostic.code === "TN_WEB_GAMEPAD_CONTROL_UNKNOWN"
        ? "Use a portable standard-gamepad control id such as buttonSouth, dpadUp, or leftStickX."
        : "Connect a standard-mapping gamepad before opening the controls inspector.",
    })),
  };
}

function focusNarration(ui: IUiIr): IInputUiPolishNarration[] {
  const nodes = new Map<string, IUiNodeIr>();
  visit(ui.root, (node) => nodes.set(node.id, node));
  return (ui.focusOrder ?? [...nodes.values()].filter(isFocusable).map((node) => node.id))
    .map((id) => nodes.get(id))
    .filter((node): node is IUiNodeIr => node !== undefined && isFocusable(node) && node.disabled !== true)
    .map((node) => ({ node: node.id, text: accessibleText(node) }));
}

function disabledUpdates(ui: IUiIr, polish: PolishResource): IInputUiPolishDisabledUpdate[] {
  const toggles = new Set(polish.disabledToggles);
  const updates: IInputUiPolishDisabledUpdate[] = [];
  visit(ui.root, (node) => {
    if (toggles.has(node.id)) {
      updates.push({ after: false, before: node.disabled === true, node: node.id, status: "reconciled" });
    }
  });
  return updates.sort((left, right) => left.node.localeCompare(right.node));
}

function scrollTrace(ui: IUiIr): IInputUiPolishScrollObservation[] {
  const observations: IInputUiPolishScrollObservation[] = [];
  function walk(node: IUiNodeIr, parent?: IUiNodeIr): void {
    if (node.layout?.overflow === "scroll") {
      observations.push({ axis: node.orientation === "horizontal" ? "x" : "y", delta: node.orientation === "horizontal" ? 18 : 24, node: node.id, ...(parent === undefined ? {} : { parent: parent.id }) });
    }
    node.children?.forEach((child) => walk(child, node));
  }
  walk(ui.root);
  return observations.sort((left, right) => left.node.localeCompare(right.node));
}

function richText(ui: IUiIr): IInputUiPolishRichText[] {
  const rows: IInputUiPolishRichText[] = [];
  visit(ui.root, (node) => {
    const italicSpans = node.spans?.filter((span) => span.italic === true).length ?? 0;
    if (italicSpans > 0) {
      rows.push({ italicSpans, node: node.id, status: "native-diagnostic" });
    }
  });
  return rows.sort((left, right) => left.node.localeCompare(right.node));
}

function virtualKeyboard(polish: PolishResource): IInputUiPolishVirtualKeyboard {
  return polish.virtualKeyboardNode === undefined ? { status: "not-requested" } : { node: polish.virtualKeyboardNode, status: "diagnostic-only" };
}

function diagnostics(ui: IUiIr, polish: PolishResource): IInputUiPolishDiagnostic[] {
  const output: IInputUiPolishDiagnostic[] = [];
  if (polish.virtualKeyboardNode !== undefined) {
    output.push({
      code: "TN_INPUT_UI_VIRTUAL_KEYBOARD_DIAGNOSTIC_ONLY",
      message: "Platform virtual keyboard requests are reported but not promoted as a portable runtime behavior.",
      path: `ui.ir.json/${polish.virtualKeyboardNode}`,
      severity: "warning",
      suggestion: "Keep text input inside overlay/webview UI until native virtual keyboard behavior is promoted.",
    });
  }
  if (richText(ui).some((entry) => entry.italicSpans > 0)) {
    output.push({
      code: "TN_INPUT_UI_NATIVE_ITALIC_DIAGNOSTIC_ONLY",
      message: "Native italic rich text remains diagnostic-only; span metadata is preserved for future renderer promotion.",
      path: "ui.ir.json/root",
      severity: "warning",
      suggestion: "Provide an italic font asset or avoid relying on native synthesized italic rendering.",
    });
  }
  return output;
}

interface PolishResource {
  disabledToggles: string[];
  navigationEvents: Array<"activate" | "down" | "left" | "next" | "previous" | "right" | "shiftTab" | "tab" | "up">;
  touchEvents: Array<{ axis?: "x" | "y"; control: string; phase: "end" | "move" | "start"; value: number }>;
  virtualKeyboardNode?: string;
}

function readPolishResource(world: IWorldIr): PolishResource {
  const value = world.resources?.InputUiPolish as Partial<PolishResource> | undefined;
  return {
    disabledToggles: value?.disabledToggles ?? ["ui.apply"],
    navigationEvents: value?.navigationEvents ?? ["tab", "down", "right", "activate"],
    touchEvents: value?.touchEvents ?? [
      { control: "confirm", phase: "start", value: 1 },
      { axis: "x", control: "look", phase: "move", value: 0.5 },
      { axis: "y", control: "look", phase: "move", value: -0.25 },
      { control: "confirm", phase: "end", value: 0 },
    ],
    ...(value?.virtualKeyboardNode === undefined ? {} : { virtualKeyboardNode: value.virtualKeyboardNode }),
  };
}

function isFocusable(node: IUiNodeIr): boolean {
  return node.focusable === true || node.kind === "button" || node.kind === "touchControl" || node.kind === "slider" || node.kind === "scrollbar";
}

function accessibleText(node: IUiNodeIr): string {
  return node.accessibilityLabel ?? node.label ?? node.text ?? node.spans?.map((span) => span.accessibilityText ?? span.text).join("") ?? node.id;
}

function visit(node: IUiNodeIr, callback: (node: IUiNodeIr) => void): void {
  callback(node);
  node.children?.forEach((child) => visit(child, callback));
}
