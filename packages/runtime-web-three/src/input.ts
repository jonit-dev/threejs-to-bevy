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

function clampAxis(value: number): number {
  return Math.max(-1, Math.min(1, value));
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
