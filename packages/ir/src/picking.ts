import type { SchemaVersion } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

export type PickingDragPhase = "dragStart" | "dragMove" | "dragEnter" | "dragLeave" | "drop" | "dragCancel" | "dragEnd";

export type PickingTargetKind = "mesh" | "ui";

export type PickingPointerEvents = "auto" | "pass-through";

export type PickingAxisConstraint = "x" | "y";

export interface IPickMeshRequest {
  direction: [number, number, number];
  ignore?: string[];
  layer?: string;
  layers?: string[];
  mask?: string[];
  maxDistance: number;
  origin: [number, number, number];
}

export type IPickMeshResult =
  | { hit: false }
  | {
      distance: number;
      entity: string | null;
      hit: true;
      normal: [number, number, number];
      point: [number, number, number];
    };

export interface IPointerRayRequest {
  aspect?: number;
  camera?: string;
  maxDistance?: number;
  pointer: [number, number];
}

export type IPointerRayResult =
  | { hit: false }
  | {
      direction: [number, number, number];
      hit: true;
      maxDistance: number;
      origin: [number, number, number];
    };

export type PickingCancelPolicy = "disabled-target" | "escape" | "lost-capture" | "missing-device" | "target-removed";

export interface IPickingDragTargetIr {
  acceptedPayloadKinds?: string[];
  axisConstraint?: PickingAxisConstraint;
  cancelOn?: PickingCancelPolicy[];
  draggable?: boolean;
  dropZone?: boolean;
  id: string;
  payloadKinds?: string[];
  pointerEvents?: PickingPointerEvents;
  targetKind: PickingTargetKind;
  zIndex?: number;
}

export interface IPickingDebugOverlayIr {
  deviceDiagnostics?: boolean;
  enabled?: boolean;
  eventLog?: boolean;
  meshBounds?: boolean;
  pointerRays?: boolean;
  uiBounds?: boolean;
}

export interface IPickingIr {
  debugOverlay?: IPickingDebugOverlayIr;
  dragTargets: IPickingDragTargetIr[];
  schema: "threenative.picking";
  version: SchemaVersion;
}

export function validatePickingIr(picking: IPickingIr, path = "picking.ir.json"): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  if (picking.schema !== "threenative.picking" || picking.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_PICKING_VERSION_UNSUPPORTED",
      message: "Picking IR must use threenative.picking version 0.1.0.",
      path,
      suggestion: "Emit picking.ir.json with schema 'threenative.picking' and version '0.1.0'.",
    });
  }

  const ids = new Set<string>();
  const draggablePayloadKinds = new Set<string>();
  picking.dragTargets.forEach((target, index) => {
    const targetPath = `${path}/dragTargets/${index}`;
    if (target.id.trim() === "") {
      diagnostics.push({
        code: "TN_PICKING_TARGET_ID_INVALID",
        message: "Picking drag target id must not be empty.",
        path: `${targetPath}/id`,
        suggestion: "Use the retained UI node id or mesh entity id as the picking target id.",
      });
    }
    if (ids.has(target.id)) {
      diagnostics.push({
        code: "TN_PICKING_TARGET_DUPLICATE",
        message: `Picking drag target '${target.id}' is declared more than once.`,
        path: targetPath,
        suggestion: "Keep one drag target record per retained UI node or mesh entity.",
      });
    }
    ids.add(target.id);

    if (target.zIndex !== undefined && (!Number.isInteger(target.zIndex) || !Number.isFinite(target.zIndex))) {
      diagnostics.push({
        code: "TN_PICKING_Z_INDEX_INVALID",
        message: "Picking drag target zIndex must be a finite integer.",
        path: `${targetPath}/zIndex`,
        suggestion: "Use an integer zIndex so overlapping UI and mesh targets sort deterministically.",
      });
    }
    if (target.pointerEvents !== undefined && target.pointerEvents !== "auto" && target.pointerEvents !== "pass-through") {
      diagnostics.push({
        code: "TN_PICKING_POINTER_EVENTS_INVALID",
        message: "Picking pointerEvents must be 'auto' or 'pass-through'.",
        path: `${targetPath}/pointerEvents`,
        suggestion: "Use 'pass-through' only for retained UI nodes that should not capture pointer picking.",
      });
    }
    collectPayloadKinds(target.payloadKinds, `${targetPath}/payloadKinds`, diagnostics, draggablePayloadKinds);
    collectPayloadKinds(target.acceptedPayloadKinds, `${targetPath}/acceptedPayloadKinds`, diagnostics);
  });

  picking.dragTargets.forEach((target, index) => {
    if (!target.dropZone || target.acceptedPayloadKinds === undefined || target.acceptedPayloadKinds.length === 0) {
      return;
    }
    const supported = target.acceptedPayloadKinds.some((kind) => draggablePayloadKinds.has(kind));
    if (!supported) {
      diagnostics.push({
        code: "TN_PICKING_DROP_PAYLOAD_UNSUPPORTED",
        message: `Drop zone '${target.id}' does not accept any declared draggable payload kind.`,
        path: `${path}/dragTargets/${index}/acceptedPayloadKinds`,
        suggestion: "Add a draggable target with a matching payloadKinds entry, or update acceptedPayloadKinds.",
      });
    }
  });

  return diagnostics;
}

function collectPayloadKinds(
  kinds: string[] | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
  sink?: Set<string>,
): void {
  kinds?.forEach((kind, index) => {
    if (kind.trim() === "") {
      diagnostics.push({
        code: "TN_PICKING_PAYLOAD_KIND_INVALID",
        message: "Picking payload kind must not be empty.",
        path: `${path}/${index}`,
        suggestion: "Use a stable payload kind such as 'inventory.item'.",
      });
      return;
    }
    sink?.add(kind);
  });
}
