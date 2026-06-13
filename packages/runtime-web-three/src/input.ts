import type { IInputIr, InputBinding } from "@threenative/ir";

export interface IWebInputState {
  action(name: string): boolean;
  axis(name: string): number;
  beginFrame(): void;
  handleKeyDown(event: { code: string }): void;
  handleKeyUp(event: { code: string }): void;
  handlePointerDown(event: { button: number }): void;
  handlePointerMove(event: { clientX?: number; clientY?: number; movementX?: number; movementY?: number }, bounds?: { height: number; width: number }): void;
  handlePointerUp(event: { button: number }): void;
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
    return bindingValue(binding) !== 0;
  }

  function bindingValue(binding: InputBinding): number {
    if (binding.device === "pointer" && "axis" in binding) {
      return pointerAxes.get(binding.axis) ?? 0;
    }
    return 0;
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
