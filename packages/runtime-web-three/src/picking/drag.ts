import type { PickingDragPhase, PickingPointerEvents, PickingTargetKind } from "@threenative/ir";

export interface IWebPickingVec2 {
  x: number;
  y: number;
}

export interface IWebPickingVec3 {
  x: number;
  y: number;
  z: number;
}

export interface IWebPickingTarget {
  disabled?: boolean;
  draggable?: boolean;
  dropZone?: boolean;
  id: string;
  payloadKinds?: string[];
  pointerEvents?: PickingPointerEvents;
  targetKind: PickingTargetKind;
  zIndex?: number;
}

export interface IWebDragPickingFrame {
  buttonDown: boolean;
  cameraId?: string;
  cancel?: "disabled-target" | "escape" | "lost-capture" | "missing-device" | "target-removed";
  candidates?: IWebPickingTarget[];
  modifiers?: string[];
  payload?: Record<string, unknown>;
  pointerId: number;
  screen: IWebPickingVec2;
  timeMs: number;
  worldHit?: IWebPickingVec3;
  worldRay?: {
    direction: IWebPickingVec3;
    origin: IWebPickingVec3;
  };
}

export interface IWebDragPickingEvent {
  cameraId?: string;
  currentTargetId?: string;
  delta: IWebPickingVec2;
  kind: PickingDragPhase;
  modifiers: string[];
  payload?: Record<string, unknown>;
  pointerId: number;
  screen: IWebPickingVec2;
  sourceTargetId?: string;
  timeMs: number;
  worldHit?: IWebPickingVec3;
  worldRay?: {
    direction: IWebPickingVec3;
    origin: IWebPickingVec3;
  };
}

export interface IWebPickingDebugOverlayReport {
  captureOwner?: string;
  connectedDevices: Array<{ id: string; kind: string; status: string }>;
  deviceDiagnostics: Array<{ code: string; message: string; repairHint: string; severity: "error" | "warning" }>;
  dragPath: IWebPickingVec2[];
  eventLog: IWebDragPickingEvent[];
  hoveredTarget?: string;
  meshBounds: Array<{ id: string }>;
  pointerRays: Array<{ direction: IWebPickingVec3; origin: IWebPickingVec3; pointerId: number }>;
  uiBounds: Array<{ id: string; zIndex: number }>;
}

export interface IWebDragPickingRecognizer {
  debugReport(): IWebPickingDebugOverlayReport;
  update(frame: IWebDragPickingFrame): IWebDragPickingEvent[];
}

interface IActiveDrag {
  enteredTargetId?: string;
  lastScreen: IWebPickingVec2;
  path: IWebPickingVec2[];
  sourceTargetId: string;
  started: boolean;
  startScreen: IWebPickingVec2;
}

export function createWebDragPickingRecognizer(options: { moveThreshold?: number } = {}): IWebDragPickingRecognizer {
  const moveThreshold = options.moveThreshold ?? 0.005;
  const eventLog: IWebDragPickingEvent[] = [];
  const pointerRays: IWebPickingDebugOverlayReport["pointerRays"] = [];
  const uiBounds = new Map<string, { id: string; zIndex: number }>();
  const meshBounds = new Map<string, { id: string }>();
  let active: IActiveDrag | undefined;
  let hoveredTarget: string | undefined;

  function push(event: IWebDragPickingEvent, events: IWebDragPickingEvent[]): void {
    events.push(event);
    eventLog.push(event);
  }

  function event(kind: PickingDragPhase, frame: IWebDragPickingFrame, currentTargetId: string | undefined, delta: IWebPickingVec2): IWebDragPickingEvent {
    return {
      cameraId: frame.cameraId,
      currentTargetId,
      delta,
      kind,
      modifiers: [...(frame.modifiers ?? [])].sort(),
      payload: frame.payload,
      pointerId: frame.pointerId,
      screen: frame.screen,
      sourceTargetId: active?.sourceTargetId,
      timeMs: frame.timeMs,
      worldHit: frame.worldHit,
      worldRay: frame.worldRay,
    };
  }

  return {
    debugReport() {
      return {
        captureOwner: active?.sourceTargetId,
        connectedDevices: [{ id: "pointer", kind: "pointer", status: "observed" }],
        deviceDiagnostics: [],
        dragPath: active?.path ?? [],
        eventLog: [...eventLog],
        hoveredTarget,
        meshBounds: [...meshBounds.values()],
        pointerRays: [...pointerRays],
        uiBounds: [...uiBounds.values()].sort((left, right) => right.zIndex - left.zIndex || left.id.localeCompare(right.id)),
      };
    },
    update(frame) {
      const events: IWebDragPickingEvent[] = [];
      const target = resolveTopPickingTarget(frame.candidates ?? []);
      hoveredTarget = target?.id;
      observeDebug(frame, uiBounds, meshBounds, pointerRays);

      if (active !== undefined && frame.cancel !== undefined) {
        push(event("dragCancel", frame, active.enteredTargetId, delta(active.lastScreen, frame.screen)), events);
        push(event("dragEnd", frame, active.enteredTargetId, delta(active.startScreen, frame.screen)), events);
        active = undefined;
        return events;
      }

      if (frame.buttonDown) {
        if (active === undefined && target !== undefined && target.draggable !== false && target.disabled !== true) {
          active = {
            enteredTargetId: undefined,
            lastScreen: frame.screen,
            path: [frame.screen],
            sourceTargetId: target.id,
            started: false,
            startScreen: frame.screen,
          };
        }
        if (active === undefined) {
          return events;
        }

        active.path.push(frame.screen);
        const frameDelta = delta(active.lastScreen, frame.screen);
        const totalDistance = distance(active.startScreen, frame.screen);
        if (!active.started && totalDistance >= moveThreshold) {
          active.started = true;
          push(event("dragStart", frame, active.sourceTargetId, delta(active.startScreen, frame.screen)), events);
        }
        if (active.started) {
          const currentTargetId = target?.id;
          if (currentTargetId !== active.enteredTargetId) {
            if (active.enteredTargetId !== undefined) {
              push(event("dragLeave", frame, active.enteredTargetId, frameDelta), events);
            }
            if (currentTargetId !== undefined) {
              push(event("dragEnter", frame, currentTargetId, frameDelta), events);
            }
            active.enteredTargetId = currentTargetId;
          }
          push(event("dragMove", frame, currentTargetId, frameDelta), events);
        }
        active.lastScreen = frame.screen;
        return events;
      }

      if (active === undefined) {
        return events;
      }
      if (active.started) {
        const releaseDelta = delta(active.lastScreen, frame.screen);
        if (target?.dropZone === true) {
          push(event("drop", frame, target.id, releaseDelta), events);
        } else {
          push(event("dragCancel", frame, active.enteredTargetId, releaseDelta), events);
        }
        push(event("dragEnd", frame, target?.id ?? active.enteredTargetId, delta(active.startScreen, frame.screen)), events);
      } else {
        push(event("dragCancel", frame, active.sourceTargetId, delta(active.startScreen, frame.screen)), events);
        push(event("dragEnd", frame, active.sourceTargetId, delta(active.startScreen, frame.screen)), events);
      }
      active = undefined;
      return events;
    },
  };
}

export function resolveTopPickingTarget(candidates: readonly IWebPickingTarget[]): IWebPickingTarget | undefined {
  return [...candidates]
    .filter((candidate) => candidate.disabled !== true && candidate.pointerEvents !== "pass-through")
    .sort((left, right) => {
      if (left.targetKind !== right.targetKind) {
        return left.targetKind === "ui" ? -1 : 1;
      }
      const zIndex = (right.zIndex ?? 0) - (left.zIndex ?? 0);
      return zIndex === 0 ? left.id.localeCompare(right.id) : zIndex;
    })[0];
}

function observeDebug(
  frame: IWebDragPickingFrame,
  uiBounds: Map<string, { id: string; zIndex: number }>,
  meshBounds: Map<string, { id: string }>,
  pointerRays: IWebPickingDebugOverlayReport["pointerRays"],
): void {
  if (frame.worldRay !== undefined) {
    pointerRays.push({ ...frame.worldRay, pointerId: frame.pointerId });
  }
  for (const candidate of frame.candidates ?? []) {
    if (candidate.targetKind === "ui") {
      uiBounds.set(candidate.id, { id: candidate.id, zIndex: candidate.zIndex ?? 0 });
    } else {
      meshBounds.set(candidate.id, { id: candidate.id });
    }
  }
}

function delta(left: IWebPickingVec2, right: IWebPickingVec2): IWebPickingVec2 {
  return { x: round(right.x - left.x), y: round(right.y - left.y) };
}

function distance(left: IWebPickingVec2, right: IWebPickingVec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
