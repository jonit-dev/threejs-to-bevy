import {
  createRuntimeWriteObservation,
  serializeRuntimeWriteAudit,
} from "@threenative/ir/runtimeDiagnostics";
import type {
  IRuntimeDiagnostic,
  IRuntimeWriteObservation,
  RuntimeWriteDisposition,
  RuntimeWriteTargetKind,
  RuntimeWriteWriter,
} from "@threenative/ir";

export interface IRuntimeWriteRecordInput {
  disposition?: RuntimeWriteDisposition;
  newValue?: unknown;
  oldValue?: unknown;
  path: string;
  schedule?: string;
  system?: string;
  targetId: string;
  targetKind: RuntimeWriteTargetKind;
  tick: number;
  writer: RuntimeWriteWriter;
}

export interface IRuntimeWriteLedger {
  beginTick(tick: number): void;
  capturesObservations(): boolean;
  diagnostics(tick?: number): IRuntimeDiagnostic[];
  observations(): IRuntimeWriteObservation[];
  observationsSince(index: number): IRuntimeWriteObservation[];
  record(input: IRuntimeWriteRecordInput): IRuntimeWriteObservation | undefined;
  reset(): void;
}

interface IActiveWrite {
  path: string;
  system?: string;
  targetId: string;
  targetKind: RuntimeWriteTargetKind;
  writer: RuntimeWriteWriter;
}

export interface IRuntimeWriteLedgerOptions {
  captureObservations?: boolean;
}

export function createRuntimeWriteLedger(options: IRuntimeWriteLedgerOptions = {}): IRuntimeWriteLedger {
  const captureObservations = options.captureObservations === true;
  const observations: IRuntimeWriteObservation[] = [];
  const active = new Map<string, IActiveWrite>();
  const activeTargets = new Map<string, IActiveWrite>();
  const writers = new Map<string, string[]>();
  const conflicts: Array<{ diagnostic: IRuntimeDiagnostic; tick: number }> = [];
  let currentTick: number | undefined;

  return {
    beginTick(tick) {
      const normalized = normalizeTick(tick);
      if (currentTick !== normalized) {
        currentTick = normalized;
        active.clear();
        activeTargets.clear();
        writers.clear();
      }
    },
    capturesObservations() {
      return captureObservations;
    },
    diagnostics(tick) {
      const normalized = tick === undefined ? undefined : normalizeTick(tick);
      return conflicts
        .filter((conflict) => normalized === undefined || conflict.tick === normalized)
        .map((conflict) => conflict.diagnostic)
        .filter((diagnostic, index, all) => all.findIndex((candidate) => candidate.path === diagnostic.path && candidate.message === diagnostic.message) === index);
    },
    observations() {
      return serializeRuntimeWriteAudit(observations).observations;
    },
    observationsSince(index) {
      return serializeRuntimeWriteAudit(observations.slice(Math.max(0, index))).observations;
    },
    record(input) {
      const tick = normalizeTick(input.tick);
      if (currentTick !== tick) {
        currentTick = tick;
        active.clear();
        activeTargets.clear();
        writers.clear();
      }
      const key = `${input.targetKind}:${input.targetId}:${input.path}`;
      const targetKey = `${input.targetKind}:${input.targetId}`;
      const previous = active.get(key);
      const previousTarget = activeTargets.get(targetKey);
      const disposition = input.disposition ?? classifyDisposition(previous, previousTarget, input);
      const activeWrite: IActiveWrite = {
        path: input.path,
        ...(input.system === undefined ? {} : { system: input.system }),
        targetId: input.targetId,
        targetKind: input.targetKind,
        writer: input.writer,
      };
      const writeLabels = writers.get(key) ?? [];
      writeLabels.push(writeLabel(activeWrite));
      writers.set(key, writeLabels);
      active.set(key, activeWrite);
      activeTargets.set(targetKey, activeWrite);
      if (disposition === "conflict") {
        conflicts.push({ diagnostic: conflictDiagnostic(activeWrite, writeLabels, tick), tick });
        if (conflicts.length > 2000) {
          conflicts.splice(0, conflicts.length - 2000);
        }
      }
      if (!captureObservations) {
        return undefined;
      }
      const observation = createRuntimeWriteObservation({ ...input, disposition, tick });
      observations.push(observation);
      if (observations.length > 2000) {
        observations.splice(0, observations.length - 2000);
      }
      return observation;
    },
    reset() {
      observations.length = 0;
      active.clear();
      activeTargets.clear();
      writers.clear();
      conflicts.length = 0;
      currentTick = undefined;
    },
  };
}

function classifyDisposition(previous: IActiveWrite | undefined, previousTarget: IActiveWrite | undefined, input: IRuntimeWriteRecordInput): RuntimeWriteDisposition {
  if (previous === undefined) {
    if (input.targetKind === "resource" && previousTarget !== undefined && previousTarget.path !== input.path) {
      return "composed";
    }
    return "accepted";
  }
  if (input.targetKind === "resource" && previous.targetId === input.targetId && previous.path !== input.path) {
    return "composed";
  }
  if (isTransformPath(input.path) && previous.writer !== input.writer && isTransformWriterPair(previous.writer, input.writer)) {
    return "conflict";
  }
  return "overwritten";
}

function conflictDiagnostic(write: IActiveWrite, writes: readonly string[], tick: number): IRuntimeDiagnostic {
  const writers = [...new Set(writes)].sort();
  const writerText = writers.length > 0 ? writers.join(" and ") : write.writer;
  const winning = writes.at(-1) ?? write.writer;
  return {
    code: "TN_RUNTIME_WRITE_CONFLICT",
    message: `Runtime write conflict: ${write.targetKind} '${write.targetId}' field '${write.path}' was written by ${writerText} in fixed tick ${tick}; winning write: ${winning}.`,
    path: `${write.targetKind}/${write.targetId}/${write.path}`,
    severity: "warning",
    suggestion: "Choose one authoritative owner for this transform field, or move the write into an explicit ordered composition step; the later write currently wins.",
  };
}

function writeLabel(write: IActiveWrite): string {
  return `${write.writer}${write.system === undefined ? "" : ` (${write.system})`}`;
}

function isTransformPath(path: string): boolean {
  return path === "Transform" || path.startsWith("Transform/");
}

function isTransformWriterPair(left: RuntimeWriteWriter, right: RuntimeWriteWriter): boolean {
  return (left === "physics" && right === "script") || (left === "script" && right === "physics");
}

function normalizeTick(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}
