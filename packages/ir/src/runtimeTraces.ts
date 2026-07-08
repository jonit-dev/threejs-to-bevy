import type { IConformanceReport, IConformanceUiNodeReport } from "./conformanceReport.js";
import type { Quat, Vec3 } from "./types.js";

export interface IRuntimeTraceDiagnostic {
  code: string;
  message: string;
  path: string;
}

export interface IRuntimeTraceBundle {
  schema: "threenative.runtime-traces";
  version: "0.1.0";
  slices: {
    animationState: IRuntimeAnimationStateTrace;
    physicsContacts: IRuntimePhysicsContactsTrace;
    renderObservation: IRuntimeRenderObservationTrace;
    transformSnapshot: IRuntimeTransformSnapshotTrace;
    uiTree: IRuntimeUiTreeTrace;
  };
}

export interface IRuntimeTraceFrame {
  frame: number;
}

export interface IRuntimeTransformSnapshotTrace extends IRuntimeTraceFrame {
  entities: IRuntimeTransformTraceEntity[];
}

export interface IRuntimeTransformTraceEntity {
  components: string[];
  entityId: string;
  parentId?: string;
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export interface IRuntimePhysicsContactsTrace extends IRuntimeTraceFrame {
  contacts: IRuntimePhysicsContactTrace[];
}

export interface IRuntimePhysicsContactTrace {
  a: string;
  b: string;
  kind: "collision" | "trigger";
}

export interface IRuntimeUiTreeTrace extends IRuntimeTraceFrame {
  root?: IConformanceUiNodeReport;
}

export interface IRuntimeAnimationStateTrace extends IRuntimeTraceFrame {
  clips: Array<{ assetId: string; clip: string; state: "available" | "playing"; weight: number }>;
}

export interface IRuntimeRenderObservationTrace extends IRuntimeTraceFrame {
  activeCamera?: string;
  cameraViews: Array<{ cameraId: string; targetKind: string }>;
  visibleEntities: string[];
}

export interface IRuntimeTraceValidationResult {
  diagnostics: IRuntimeTraceDiagnostic[];
  ok: boolean;
}

const stableIdPattern = /^[A-Za-z0-9_.:-]+$/u;

export function buildRuntimeTraceBundleFromConformanceReport(report: IConformanceReport): IRuntimeTraceBundle {
  return {
    schema: "threenative.runtime-traces",
    version: "0.1.0",
    slices: {
      animationState: {
        frame: 0,
        clips: report.assets
          .flatMap((asset) => (asset.animations ?? []).map((animation) => ({ assetId: asset.id, clip: animation.id, state: "available" as const, weight: 0 })))
          .sort((left, right) => `${left.assetId}:${left.clip}`.localeCompare(`${right.assetId}:${right.clip}`)),
      },
      physicsContacts: {
        frame: 0,
        contacts: report.events.flatMap((event) => physicsContactsFromEvent(event.id, event.values)),
      },
      renderObservation: {
        activeCamera: report.activeCamera,
        cameraViews: (report.cameraViews ?? []).map((view) => ({ cameraId: view.cameraId, targetKind: view.targetKind })).sort((left, right) => left.cameraId.localeCompare(right.cameraId)),
        frame: 0,
        visibleEntities: report.entities
          .filter((entity) => entity.visibility?.runtimeVisible !== false && entity.visibility?.meshRendererVisible !== false && entity.visibility?.visible !== false)
          .map((entity) => entity.id)
          .sort(),
      },
      transformSnapshot: {
        frame: 0,
        entities: report.entities
          .filter((entity) => entity.transform !== undefined)
          .map((entity) => ({
            components: [...entity.components].sort(),
            entityId: entity.id,
            parentId: entity.parent,
            position: entity.transform!.position,
            rotation: entity.transform!.rotation,
            scale: entity.transform!.scale,
          }))
          .sort((left, right) => left.entityId.localeCompare(right.entityId)),
      },
      uiTree: {
        frame: 0,
        root: report.ui?.root,
      },
    },
  };
}

export function validateRuntimeTraceBundle(value: unknown): IRuntimeTraceValidationResult {
  const diagnostics: IRuntimeTraceDiagnostic[] = [];
  if (!isRecord(value)) {
    return { diagnostics: [diagnostic("$", "TN_RUNTIME_TRACE_INVALID", "runtime trace bundle must be an object.")], ok: false };
  }
  if (value.schema !== "threenative.runtime-traces") {
    diagnostics.push(diagnostic("$.schema", "TN_RUNTIME_TRACE_SCHEMA_INVALID", "runtime trace bundle schema must be 'threenative.runtime-traces'."));
  }
  if (value.version !== "0.1.0") {
    diagnostics.push(diagnostic("$.version", "TN_RUNTIME_TRACE_VERSION_INVALID", "runtime trace bundle version must be '0.1.0'."));
  }
  const slices = value.slices;
  if (!isRecord(slices)) {
    diagnostics.push(diagnostic("$.slices", "TN_RUNTIME_TRACE_SLICES_INVALID", "runtime trace bundle slices must be an object."));
    return { diagnostics, ok: diagnostics.length === 0 };
  }
  validateFrame(diagnostics, "$.slices.transformSnapshot", slices.transformSnapshot);
  validateFrame(diagnostics, "$.slices.physicsContacts", slices.physicsContacts);
  validateFrame(diagnostics, "$.slices.uiTree", slices.uiTree);
  validateFrame(diagnostics, "$.slices.animationState", slices.animationState);
  validateFrame(diagnostics, "$.slices.renderObservation", slices.renderObservation);
  validateTransformSnapshot(diagnostics, slices.transformSnapshot);
  validatePhysicsContacts(diagnostics, slices.physicsContacts);
  return { diagnostics, ok: diagnostics.length === 0 };
}

export function compareRuntimeTraceBundles(left: IRuntimeTraceBundle, right: IRuntimeTraceBundle, tolerance = 0.001): IRuntimeTraceDiagnostic[] {
  const diagnostics: IRuntimeTraceDiagnostic[] = [];
  compareTransformSnapshots(diagnostics, left.slices.transformSnapshot, right.slices.transformSnapshot, tolerance);
  compareJson(diagnostics, "$.slices.physicsContacts", left.slices.physicsContacts, right.slices.physicsContacts);
  compareJson(diagnostics, "$.slices.uiTree", left.slices.uiTree, right.slices.uiTree);
  compareJson(diagnostics, "$.slices.animationState", left.slices.animationState, right.slices.animationState);
  compareJson(diagnostics, "$.slices.renderObservation", left.slices.renderObservation, right.slices.renderObservation);
  return diagnostics;
}

function validateFrame(diagnostics: IRuntimeTraceDiagnostic[], path: string, value: unknown): void {
  const frame = isRecord(value) ? value.frame : undefined;
  if (!Number.isInteger(frame) || typeof frame !== "number" || frame < 0) {
    diagnostics.push(diagnostic(`${path}.frame`, "TN_RUNTIME_TRACE_FRAME_INVALID", "runtime trace slice frame must be a non-negative integer."));
  }
}

function validateTransformSnapshot(diagnostics: IRuntimeTraceDiagnostic[], value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value.entities)) {
    diagnostics.push(diagnostic("$.slices.transformSnapshot.entities", "TN_RUNTIME_TRACE_TRANSFORMS_INVALID", "transformSnapshot entities must be an array."));
    return;
  }
  value.entities.forEach((entity, index) => {
    if (!isRecord(entity)) {
      diagnostics.push(diagnostic(`$.slices.transformSnapshot.entities/${index}`, "TN_RUNTIME_TRACE_TRANSFORM_INVALID", "transform trace entity must be an object."));
      return;
    }
    validateStableId(diagnostics, `$.slices.transformSnapshot.entities/${index}/entityId`, entity.entityId, "entity id");
    if (entity.parentId !== undefined) {
      validateStableId(diagnostics, `$.slices.transformSnapshot.entities/${index}/parentId`, entity.parentId, "parent entity id");
    }
  });
}

function validatePhysicsContacts(diagnostics: IRuntimeTraceDiagnostic[], value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value.contacts)) {
    diagnostics.push(diagnostic("$.slices.physicsContacts.contacts", "TN_RUNTIME_TRACE_CONTACTS_INVALID", "physicsContacts contacts must be an array."));
    return;
  }
  value.contacts.forEach((contact, index) => {
    if (!isRecord(contact)) {
      diagnostics.push(diagnostic(`$.slices.physicsContacts.contacts/${index}`, "TN_RUNTIME_TRACE_CONTACT_INVALID", "physics contact trace must be an object."));
      return;
    }
    validateStableId(diagnostics, `$.slices.physicsContacts.contacts/${index}/a`, contact.a, "contact entity id");
    validateStableId(diagnostics, `$.slices.physicsContacts.contacts/${index}/b`, contact.b, "contact entity id");
  });
}

function validateStableId(diagnostics: IRuntimeTraceDiagnostic[], path: string, value: unknown, label: string): void {
  if (typeof value !== "string" || !stableIdPattern.test(value)) {
    diagnostics.push(diagnostic(path, "TN_RUNTIME_TRACE_ID_UNSTABLE", `runtime trace ${label} must be a stable non-empty id using letters, numbers, '.', ':', '_' or '-'.`));
  }
}

function compareTransformSnapshots(diagnostics: IRuntimeTraceDiagnostic[], left: IRuntimeTransformSnapshotTrace, right: IRuntimeTransformSnapshotTrace, tolerance: number): void {
  const rightById = new Map(right.entities.map((entity) => [entity.entityId, entity]));
  for (const leftEntity of left.entities) {
    const rightEntity = rightById.get(leftEntity.entityId);
    if (rightEntity === undefined) {
      diagnostics.push(diagnostic(`$.slices.transformSnapshot.entities[${JSON.stringify(leftEntity.entityId)}]`, "TN_RUNTIME_TRACE_TRANSFORM_MISSING", "runtime trace transform entity is missing."));
      continue;
    }
    compareJson(diagnostics, `$.slices.transformSnapshot.entities[${JSON.stringify(leftEntity.entityId)}].components`, leftEntity.components, rightEntity.components);
    compareJson(diagnostics, `$.slices.transformSnapshot.entities[${JSON.stringify(leftEntity.entityId)}].parentId`, leftEntity.parentId, rightEntity.parentId);
    compareNumberArray(diagnostics, `$.slices.transformSnapshot.entities[${JSON.stringify(leftEntity.entityId)}].position`, leftEntity.position, rightEntity.position, tolerance);
    compareNumberArray(diagnostics, `$.slices.transformSnapshot.entities[${JSON.stringify(leftEntity.entityId)}].rotation`, leftEntity.rotation, rightEntity.rotation, tolerance);
    compareNumberArray(diagnostics, `$.slices.transformSnapshot.entities[${JSON.stringify(leftEntity.entityId)}].scale`, leftEntity.scale, rightEntity.scale, tolerance);
    rightById.delete(leftEntity.entityId);
  }
  for (const rightEntity of rightById.values()) {
    diagnostics.push(diagnostic(`$.slices.transformSnapshot.entities[${JSON.stringify(rightEntity.entityId)}]`, "TN_RUNTIME_TRACE_TRANSFORM_EXTRA", "runtime trace transform entity is unexpected."));
  }
}

function compareNumberArray(diagnostics: IRuntimeTraceDiagnostic[], path: string, left: readonly number[], right: readonly number[], tolerance: number): void {
  if (left.length !== right.length) {
    diagnostics.push(diagnostic(path, "TN_RUNTIME_TRACE_VALUE_MISMATCH", "runtime trace numeric tuple lengths differ."));
    return;
  }
  left.forEach((leftValue, index) => {
    if (Math.abs(leftValue - right[index]!) > tolerance) {
      diagnostics.push(diagnostic(`${path}/${index}`, "TN_RUNTIME_TRACE_VALUE_MISMATCH", `runtime trace values differ by more than ${tolerance}.`));
    }
  });
}

function compareJson(diagnostics: IRuntimeTraceDiagnostic[], path: string, left: unknown, right: unknown): void {
  if (JSON.stringify(normalize(left)) !== JSON.stringify(normalize(right))) {
    diagnostics.push(diagnostic(path, "TN_RUNTIME_TRACE_VALUE_MISMATCH", "runtime trace values differ."));
  }
}

function physicsContactsFromEvent(id: string, values: unknown[]): IRuntimePhysicsContactTrace[] {
  if (!id.toLowerCase().includes("collision") && !id.toLowerCase().includes("trigger")) {
    return [];
  }
  return values.flatMap((value) => {
    if (!isRecord(value) || typeof value.a !== "string" || typeof value.b !== "string") {
      return [];
    }
    return [{ a: value.a, b: value.b, kind: id.toLowerCase().includes("trigger") ? "trigger" : "collision" }];
  });
}

function diagnostic(path: string, code: string, message: string): IRuntimeTraceDiagnostic {
  return { code, message, path };
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
