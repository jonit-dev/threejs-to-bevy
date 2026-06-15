import type { IInputIr, InputBinding } from "@threenative/ir";

export interface IWebInputState {
  action(name: string): boolean;
  axis(name: string): number;
  beginFrame(): void;
  handleGamepadButton(control: string, pressed: boolean): void;
  handleGamepadAxis(control: string, value: number): void;
  handleKeyDown(event: { code: string }): void;
  handleKeyUp(event: { code: string }): void;
  handlePointerDown(event: { button: number }): void;
  handlePointerMove(event: { clientX?: number; clientY?: number; movementX?: number; movementY?: number }, bounds?: { height: number; width: number }): void;
  handlePointerUp(event: { button: number }): void;
  handleTouchControl(control: string, active: boolean): void;
  handleTouchAxis(control: string, axis: "x" | "y", value: number): void;
  pressed(name: string): boolean;
  released(name: string): boolean;
}

export interface IPointerLockState {
  diagnostics: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  locked: boolean;
  status: "denied" | "locked" | "unlocked";
}

export interface IGamepadCapabilityReport {
  connected: Array<{
    axes: number;
    buttons: number;
    id: string;
    index: number;
    mapping: string;
  }>;
  declaredControls: Array<{
    control: string;
    kind: "axis" | "button" | "unknown";
    required: boolean;
  }>;
  diagnostics: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  supported: boolean;
}

export interface ITouchGesturePoint {
  id: number;
  x: number;
  y: number;
}

export interface ITouchGestureFrame {
  timeMs: number;
  touches: ITouchGesturePoint[];
}

export type ITouchGestureEvent =
  | {
      durationMs: number;
      id: number;
      kind: "tap";
      x: number;
      y: number;
    }
  | {
      deltaX: number;
      deltaY: number;
      direction: "down" | "left" | "right" | "up";
      durationMs: number;
      id: number;
      kind: "swipe";
    }
  | {
      centerX: number;
      centerY: number;
      distance: number;
      durationMs: number;
      kind: "pinch";
      scale: number;
    };

export interface ITouchGestureRecognizer {
  update(frame: ITouchGestureFrame): ITouchGestureEvent[];
}

export interface IDragPickingFrame {
  buttonDown: boolean;
  pickedEntity?: string;
  pointer: [number, number];
  timeMs: number;
}

export type IDragPickingEvent =
  | {
      entity: string;
      kind: "start";
      pointer: [number, number];
      timeMs: number;
    }
  | {
      delta: [number, number];
      entity: string;
      kind: "move";
      pointer: [number, number];
      timeMs: number;
    }
  | {
      delta: [number, number];
      entity: string;
      kind: "drop";
      pointer: [number, number];
      target?: string;
      timeMs: number;
    }
  | {
      entity: string;
      kind: "cancel";
      pointer: [number, number];
      timeMs: number;
    };

export interface IDragPickingRecognizer {
  update(frame: IDragPickingFrame): IDragPickingEvent[];
}

export interface IInputRebindDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export type InputRebindTarget =
  | { id: string; kind: "action"; bindingIndex?: number }
  | { id: string; kind: "axis"; slot: "negative" | "positive" | "value"; bindingIndex?: number };

export interface IInputRebindResult {
  diagnostics: IInputRebindDiagnostic[];
  input: IInputIr;
}

export function createInputState(input?: IInputIr): IWebInputState {
  const currentActions = new Set<string>();
  const previousActions = new Set<string>();
  const keys = new Set<string>();
  const pointerButtons = new Set<number>();
  const pointerAxes = new Map<string, number>();
  const gamepadButtons = new Set<string>();
  const gamepadAxes = new Map<string, number>();
  const touchControls = new Set<string>();
  const touchAxes = new Map<string, number>();

  function readAction(id: string): boolean {
    const action = input?.actions.find((item) => item.id === id);
    return action?.bindings.some(bindingActive) ?? false;
  }

  function readAxis(id: string): number {
    const axis = input?.axes.find((item) => item.id === id);
    if (axis === undefined) {
      return 0;
    }
    if (axis.value !== undefined) {
      return bindingValue(axis.value);
    }
    const positive = axis.positive.some(bindingActive) ? 1 : 0;
    const negative = axis.negative.some(bindingActive) ? 1 : 0;
    return positive - negative;
  }

  function bindingActive(binding: InputBinding): boolean {
    if (binding.device === "keyboard") {
      return keys.has(binding.code);
    }
    if (binding.device === "pointer" && "button" in binding) {
      return pointerButtons.has(binding.button);
    }
    if (binding.device === "gamepad") {
      return gamepadButtons.has(binding.control) || Math.abs(gamepadAxes.get(binding.control) ?? 0) > 0.5;
    }
    if (binding.device === "touch") {
      return touchControls.has(binding.control) || Math.abs(touchAxisValue(binding)) > 0.5;
    }
    return bindingValue(binding) !== 0;
  }

  function bindingValue(binding: InputBinding): number {
    if (binding.device === "pointer" && "axis" in binding) {
      return pointerAxes.get(binding.axis) ?? 0;
    }
    if (binding.device === "gamepad") {
      return gamepadAxes.get(binding.control) ?? 0;
    }
    if (binding.device === "touch") {
      return touchAxisValue(binding);
    }
    return 0;
  }

  function touchAxisValue(binding: Extract<InputBinding, { device: "touch" }>): number {
    if (binding.axis === undefined) {
      return touchControls.has(binding.control) ? 1 : 0;
    }
    return touchAxes.get(`${binding.control}:${binding.axis}`) ?? 0;
  }

  function refreshActions(): void {
    currentActions.clear();
    for (const action of input?.actions ?? []) {
      if (readAction(action.id)) {
        currentActions.add(action.id);
      }
    }
  }

  return {
    action(name) {
      refreshActions();
      return currentActions.has(name);
    },
    axis: readAxis,
    beginFrame() {
      previousActions.clear();
      for (const action of currentActions) {
        previousActions.add(action);
      }
      refreshActions();
      pointerAxes.set("deltaX", 0);
      pointerAxes.set("deltaY", 0);
    },
    handleGamepadButton(control, pressed) {
      if (pressed) {
        gamepadButtons.add(control);
      } else {
        gamepadButtons.delete(control);
      }
      refreshActions();
    },
    handleGamepadAxis(control, value) {
      gamepadAxes.set(control, clampAxis(value));
      refreshActions();
    },
    handleKeyDown(event) {
      keys.add(event.code);
      refreshActions();
    },
    handleKeyUp(event) {
      keys.delete(event.code);
      refreshActions();
    },
    handlePointerDown(event) {
      pointerButtons.add(event.button);
      refreshActions();
    },
    handlePointerMove(event, bounds) {
      const width = Math.max(1, bounds?.width ?? 1);
      const height = Math.max(1, bounds?.height ?? 1);
      if (event.clientX !== undefined) {
        pointerAxes.set("x", Math.max(0, Math.min(1, event.clientX / width)));
      }
      if (event.clientY !== undefined) {
        pointerAxes.set("y", Math.max(0, Math.min(1, event.clientY / height)));
      }
      pointerAxes.set("deltaX", event.movementX ?? 0);
      pointerAxes.set("deltaY", event.movementY ?? 0);
    },
    handlePointerUp(event) {
      pointerButtons.delete(event.button);
      refreshActions();
    },
    handleTouchControl(control, active) {
      if (active) {
        touchControls.add(control);
      } else {
        touchControls.delete(control);
      }
      refreshActions();
    },
    handleTouchAxis(control, axis, value) {
      touchAxes.set(`${control}:${axis}`, clampAxis(value));
      refreshActions();
    },
    pressed(name) {
      refreshActions();
      return currentActions.has(name) && !previousActions.has(name);
    },
    released(name) {
      refreshActions();
      return !currentActions.has(name) && previousActions.has(name);
    },
  };
}

export function rebindInput(input: IInputIr, target: InputRebindTarget, binding: InputBinding): IInputRebindResult {
  const next: IInputIr = {
    schema: input.schema,
    version: input.version,
    actions: input.actions.map((action) => ({ ...action, bindings: action.bindings.map((item) => ({ ...item })) })),
    axes: input.axes.map((axis) => ({
      ...axis,
      negative: axis.negative.map((item) => ({ ...item })),
      positive: axis.positive.map((item) => ({ ...item })),
      ...(axis.value === undefined ? {} : { value: { ...axis.value } }),
    })),
  };
  const diagnostics: IInputRebindDiagnostic[] = [];

  if (target.kind === "action") {
    const action = next.actions.find((item) => item.id === target.id);
    if (action === undefined) {
      diagnostics.push({ code: "TN_INPUT_REBIND_ACTION_MISSING", message: `Input action '${target.id}' does not exist.`, severity: "error" });
      return { diagnostics, input: next };
    }
    replaceBinding(action.bindings, target.bindingIndex ?? 0, binding, diagnostics, `actions/${target.id}`);
  } else {
    const axis = next.axes.find((item) => item.id === target.id);
    if (axis === undefined) {
      diagnostics.push({ code: "TN_INPUT_REBIND_AXIS_MISSING", message: `Input axis '${target.id}' does not exist.`, severity: "error" });
      return { diagnostics, input: next };
    }
    if (target.slot === "value") {
      axis.value = { ...binding };
    } else {
      replaceBinding(axis[target.slot], target.bindingIndex ?? 0, binding, diagnostics, `axes/${target.id}/${target.slot}`);
    }
  }

  diagnostics.push(...validateReboundInput(next));
  return { diagnostics, input: next };
}

export function createDragPickingRecognizer(options: { moveThreshold?: number } = {}): IDragPickingRecognizer {
  const moveThreshold = options.moveThreshold ?? 0.005;
  let active: { entity: string; pointer: [number, number]; started: boolean; start: [number, number] } | undefined;

  return {
    update(frame) {
      const events: IDragPickingEvent[] = [];
      if (frame.buttonDown) {
        if (active === undefined && frame.pickedEntity !== undefined) {
          active = { entity: frame.pickedEntity, pointer: frame.pointer, started: false, start: frame.pointer };
        }
        if (active !== undefined) {
          const delta: [number, number] = [
            round(frame.pointer[0] - active.pointer[0]),
            round(frame.pointer[1] - active.pointer[1]),
          ];
          const totalDistance = distance(frame.pointer, active.start);
          if (!active.started && totalDistance >= moveThreshold) {
            active.started = true;
            events.push({ entity: active.entity, kind: "start", pointer: active.start, timeMs: frame.timeMs });
          }
          if (active.started && (delta[0] !== 0 || delta[1] !== 0)) {
            events.push({ delta, entity: active.entity, kind: "move", pointer: frame.pointer, timeMs: frame.timeMs });
          }
          active.pointer = frame.pointer;
        }
        return events;
      }

      if (active === undefined) {
        return events;
      }
      if (active.started) {
        events.push({
          delta: [round(frame.pointer[0] - active.start[0]), round(frame.pointer[1] - active.start[1])],
          entity: active.entity,
          kind: "drop",
          pointer: frame.pointer,
          ...(frame.pickedEntity === undefined ? {} : { target: frame.pickedEntity }),
          timeMs: frame.timeMs,
        });
      } else {
        events.push({ entity: active.entity, kind: "cancel", pointer: frame.pointer, timeMs: frame.timeMs });
      }
      active = undefined;
      return events;
    },
  };
}

function replaceBinding(bindings: InputBinding[], index: number, binding: InputBinding, diagnostics: IInputRebindDiagnostic[], path: string): void {
  if (!Number.isInteger(index) || index < 0) {
    diagnostics.push({ code: "TN_INPUT_REBIND_INDEX_INVALID", message: `Input rebind index for '${path}' must be a non-negative integer.`, severity: "error" });
    return;
  }
  if (index > bindings.length) {
    diagnostics.push({ code: "TN_INPUT_REBIND_INDEX_INVALID", message: `Input rebind index ${index} is outside '${path}'.`, severity: "error" });
    return;
  }
  bindings[index] = { ...binding };
}

function validateReboundInput(input: IInputIr): IInputRebindDiagnostic[] {
  const diagnostics: IInputRebindDiagnostic[] = [];
  const seen = new Map<string, string>();
  for (const [path, binding] of inputBindings(input)) {
    const key = inputBindingKey(binding);
    if (seen.has(key)) {
      diagnostics.push({
        code: "TN_INPUT_REBIND_DUPLICATE",
        message: `Input binding '${key}' is already used by '${seen.get(key)}'.`,
        severity: "error",
      });
    } else {
      seen.set(key, path);
    }
    if (binding.device === "gamepad" && binding.required !== false) {
      diagnostics.push({
        code: "TN_INPUT_REBIND_GAMEPAD_REQUIRED",
        message: "Gamepad bindings must be optional for portable rebinding diagnostics.",
        severity: "warning",
      });
    }
  }
  return diagnostics;
}

function inputBindings(input: IInputIr): Array<[string, InputBinding]> {
  return [
    ...input.actions.flatMap((action) => action.bindings.map((binding, index): [string, InputBinding] => [`action:${action.id}/${index}`, binding])),
    ...input.axes.flatMap((axis) => [
      ...axis.negative.map((binding, index): [string, InputBinding] => [`axis:${axis.id}/negative/${index}`, binding]),
      ...axis.positive.map((binding, index): [string, InputBinding] => [`axis:${axis.id}/positive/${index}`, binding]),
      ...(axis.value === undefined ? [] : [[`axis:${axis.id}/value`, axis.value] as [string, InputBinding]]),
    ]),
  ];
}

function inputBindingKey(binding: InputBinding): string {
  if (binding.device === "keyboard") {
    return `keyboard:${binding.code}`;
  }
  if (binding.device === "pointer" && "button" in binding) {
    return `pointer:button:${binding.button}`;
  }
  if (binding.device === "pointer") {
    return `pointer:axis:${binding.axis}`;
  }
  if (binding.device === "touch") {
    return `touch:${binding.control}:${binding.axis ?? ""}`;
  }
  return `gamepad:${binding.control}`;
}

export function createTouchGestureRecognizer(): ITouchGestureRecognizer {
  let activeSingle: { id: number; startTimeMs: number; startX: number; startY: number; x: number; y: number } | undefined;
  let activePinch: { centerX: number; centerY: number; distance: number; startDistance: number; startTimeMs: number } | undefined;
  let previousTouchCount = 0;
  return {
    update(frame) {
      const events: ITouchGestureEvent[] = [];
      const touches = frame.touches;
      if (touches.length === 1) {
        const touch = touches[0]!;
        if (previousTouchCount !== 1 || activeSingle?.id !== touch.id) {
          activeSingle = { id: touch.id, startTimeMs: frame.timeMs, startX: touch.x, startY: touch.y, x: touch.x, y: touch.y };
        } else {
          activeSingle = { ...activeSingle, x: touch.x, y: touch.y };
        }
        activePinch = undefined;
      } else if (touches.length >= 2) {
        const pinch = pinchState(touches[0]!, touches[1]!);
        if (previousTouchCount < 2 || activePinch === undefined) {
          activePinch = { ...pinch, startDistance: pinch.distance, startTimeMs: frame.timeMs };
        } else {
          activePinch = { ...activePinch, centerX: pinch.centerX, centerY: pinch.centerY, distance: pinch.distance };
        }
        activeSingle = undefined;
      } else {
        if (previousTouchCount === 1 && activeSingle !== undefined) {
          const event = classifySingleTouch(activeSingle, frame.timeMs);
          if (event !== undefined) {
            events.push(event);
          }
        }
        if (previousTouchCount >= 2 && activePinch !== undefined) {
          const event = classifyPinch(activePinch, frame.timeMs);
          if (event !== undefined) {
            events.push(event);
          }
        }
        activeSingle = undefined;
        activePinch = undefined;
      }
      previousTouchCount = touches.length;
      return events;
    },
  };
}

function classifySingleTouch(
  touch: { id: number; startTimeMs: number; startX: number; startY: number; x: number; y: number },
  endTimeMs: number,
): ITouchGestureEvent | undefined {
  const deltaX = touch.x - touch.startX;
  const deltaY = touch.y - touch.startY;
  const distance = Math.hypot(deltaX, deltaY);
  const durationMs = Math.max(0, endTimeMs - touch.startTimeMs);
  if (distance <= 10 && durationMs <= 300) {
    return { durationMs, id: touch.id, kind: "tap", x: touch.x, y: touch.y };
  }
  if (distance >= 40 && durationMs <= 700) {
    return {
      deltaX,
      deltaY,
      direction: Math.abs(deltaX) >= Math.abs(deltaY) ? (deltaX >= 0 ? "right" : "left") : deltaY >= 0 ? "down" : "up",
      durationMs,
      id: touch.id,
      kind: "swipe",
    };
  }
  return undefined;
}

function pinchState(left: ITouchGesturePoint, right: ITouchGesturePoint): { centerX: number; centerY: number; distance: number } {
  return {
    centerX: (left.x + right.x) / 2,
    centerY: (left.y + right.y) / 2,
    distance: Math.hypot(right.x - left.x, right.y - left.y),
  };
}

function classifyPinch(
  pinch: { centerX: number; centerY: number; distance: number; startDistance: number; startTimeMs: number },
  endTimeMs: number,
): ITouchGestureEvent | undefined {
  if (pinch.startDistance <= 0) {
    return undefined;
  }
  const scale = pinch.distance / pinch.startDistance;
  if (Math.abs(scale - 1) < 0.1) {
    return undefined;
  }
  return {
    centerX: pinch.centerX,
    centerY: pinch.centerY,
    distance: pinch.distance,
    durationMs: Math.max(0, endTimeMs - pinch.startTimeMs),
    kind: "pinch",
    scale,
  };
}

function clampAxis(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function distance(left: [number, number], right: [number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

export function attachInputListeners(target: HTMLElement | Window, input: IWebInputState): () => void {
  const keyDown: EventListener = (event) => input.handleKeyDown(event as KeyboardEvent);
  const keyUp: EventListener = (event) => input.handleKeyUp(event as KeyboardEvent);
  const pointerDown: EventListener = (event) => input.handlePointerDown(event as PointerEvent);
  const pointerUp: EventListener = (event) => input.handlePointerUp(event as PointerEvent);
  const pointerMove: EventListener = (event) => {
    const pointerEvent = event as PointerEvent;
    input.handlePointerMove(pointerEvent, "innerWidth" in target ? { height: target.innerHeight, width: target.innerWidth } : target.getBoundingClientRect());
  };

  target.addEventListener("keydown", keyDown);
  target.addEventListener("keyup", keyUp);
  target.addEventListener("pointerdown", pointerDown);
  target.addEventListener("pointerup", pointerUp);
  target.addEventListener("pointermove", pointerMove);

  return () => {
    target.removeEventListener("keydown", keyDown);
    target.removeEventListener("keyup", keyUp);
    target.removeEventListener("pointerdown", pointerDown);
    target.removeEventListener("pointerup", pointerUp);
    target.removeEventListener("pointermove", pointerMove);
  };
}

export async function requestPointerLock(target: { requestPointerLock(): Promise<void> | void }): Promise<IPointerLockState> {
  try {
    await target.requestPointerLock();
    return { diagnostics: [], locked: true, status: "locked" };
  } catch {
    return {
      diagnostics: [
        {
          code: "TN_WEB_POINTER_LOCK_DENIED",
          message: "Pointer lock request was denied by the browser.",
          severity: "warning",
        },
      ],
      locked: false,
      status: "denied",
    };
  }
}

export function reportGamepadCapabilities(
  input?: IInputIr,
  navigatorLike: { getGamepads?: () => Array<Gamepad | null> | readonly (Gamepad | null)[] } = globalThis.navigator,
): IGamepadCapabilityReport {
  const declaredControls = declaredGamepadControls(input);
  const diagnostics: IGamepadCapabilityReport["diagnostics"] = [];
  collectGamepadControlDiagnostics(declaredControls, diagnostics, "TN_WEB_GAMEPAD_CONTROL_UNKNOWN");
  const getGamepads = navigatorLike.getGamepads;
  if (typeof getGamepads !== "function") {
    diagnostics.push({
      code: "TN_WEB_GAMEPAD_API_UNAVAILABLE",
      message: "Browser Gamepad API is unavailable.",
      severity: "warning",
    });
    return { connected: [], declaredControls, diagnostics, supported: false };
  }
  const connected = [...getGamepads.call(navigatorLike)]
    .filter((gamepad): gamepad is Gamepad => gamepad !== null)
    .map((gamepad) => ({
      axes: gamepad.axes.length,
      buttons: gamepad.buttons.length,
      id: gamepad.id,
      index: gamepad.index,
      mapping: gamepad.mapping,
    }));
  if (declaredControls.length > 0 && connected.length === 0) {
    diagnostics.push({
      code: "TN_WEB_GAMEPAD_NONE_CONNECTED",
      message: "Input map declares gamepad controls, but no gamepad is connected.",
      severity: "warning",
    });
  }
  return { connected, declaredControls, diagnostics, supported: true };
}

function collectGamepadControlDiagnostics(
  declaredControls: IGamepadCapabilityReport["declaredControls"],
  diagnostics: IGamepadCapabilityReport["diagnostics"],
  code: string,
): void {
  for (const control of declaredControls) {
    if (control.kind === "unknown") {
      diagnostics.push({
        code,
        message: `Gamepad control '${control.control}' is not a recognized portable control.`,
        severity: control.required ? "error" : "warning",
      });
    }
  }
}

function declaredGamepadControls(input?: IInputIr): IGamepadCapabilityReport["declaredControls"] {
  const controls = new Map<string, IGamepadCapabilityReport["declaredControls"][number]>();
  for (const binding of [
    ...(input?.actions.flatMap((action) => action.bindings) ?? []),
    ...(input?.axes.flatMap((axis) => [...axis.negative, ...axis.positive, ...(axis.value === undefined ? [] : [axis.value])]) ?? []),
  ]) {
    if (binding.device === "gamepad") {
      controls.set(binding.control, {
        control: binding.control,
        kind: gamepadControlKind(binding.control),
        required: binding.required ?? true,
      });
    }
  }
  return [...controls.values()].sort((left, right) => left.control.localeCompare(right.control));
}

function gamepadControlKind(control: string): "axis" | "button" | "unknown" {
  if (["buttonSouth", "south", "buttonEast", "east", "buttonNorth", "north", "buttonWest", "west", "leftTrigger", "leftTrigger2", "rightTrigger", "rightTrigger2", "select", "start", "mode", "leftThumb", "rightThumb", "dpadUp", "dpadDown", "dpadLeft", "dpadRight"].includes(control)) {
    return "button";
  }
  if (["leftStickX", "leftStickY", "leftZ", "rightStickX", "rightStickY", "rightZ"].includes(control)) {
    return "axis";
  }
  return "unknown";
}
